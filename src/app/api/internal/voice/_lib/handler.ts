// POST /api/internal/voice. The LiveKit worker is the only client. It authenticates with a bearer token and sends
// the call's identifiers; this handler decides which user the call belongs to. The model never supplies a user id.
//
//   { "action": "session.start", "call": { "callId": "…", "attemptId": "…" } }
//   { "action": "createReminder", "args": { … }, "call": { … } }
//   { "action": "inboundMessage", "args": { "text": "snooze 30 min" }, "call": { "attemptId": "…" } }   (iMessage webhook)
//
// 200 { ok: true, result } · 422 { ok: false, error } for a refused action · 400/401/403/503 for request problems.
import { buildContext, runAction } from "./actions";
import { ACTIONS } from "./contract";
import { handleMessage } from "./message";
import { validTimeZone } from "./time";
import type { Actor, Deps, Store } from "./types";

export type VoiceConfig = {
  /** Shared secret for the worker (VOICE_TOOL_TOKEN). An empty value rejects every request. */
  token: string;
  /** The verified demo caller for inbound calls (VOICE_DEMO_USER_ID). Empty disables inbound tools. */
  demoUserId: string;
  /** Used when a profile has no time zone (VOICE_DEFAULT_TIME_ZONE). */
  defaultTimeZone: string;
  /** Null when storage is not configured. */
  deps: Deps | null;
};

async function sameSecret(actual: string, expected: string) {
  const digest = (value: string) => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = (await Promise.all([digest(actual), digest(expected)])).map((buffer) => new Uint8Array(buffer));
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

const fail = (status: number, code: string, message: string) => Response.json({ ok: false, error: { code, message } }, { status });
const id = (value: unknown) => (typeof value === "string" && /^[\w-]{1,100}$/.test(value) ? value : null);

/**
 * Resolves the owner of a contact from trusted records. An outbound call carries the notification attempt the
 * server created, which names its owner and reminder. An inbound call belongs to the verified demo caller.
 */
export async function resolveActor(store: Store, call: unknown, config: Pick<VoiceConfig, "demoUserId" | "defaultTimeZone">, origin = "voice"): Promise<Actor | null> {
  const fields = call && typeof call === "object" ? (call as Record<string, unknown>) : {};
  let userId = config.demoUserId;
  let focusReminderId: string | null = null;
  let focusEventId: string | null = null;
  if (fields.attemptId !== undefined && fields.attemptId !== null) {
    const attemptId = id(fields.attemptId);
    const attempt = attemptId ? await store.getAttempt(attemptId) : null;
    if (!attempt) return null; // an unknown attempt never falls back to the demo user
    userId = attempt.userId;
    focusReminderId = attempt.reminderId;
    focusEventId = attempt.homeEventId;
  }
  if (!userId) return null;
  const profile = await store.getProfile(userId);
  if (!profile) return null;
  const timeZone = validTimeZone(profile.timeZone) ? profile.timeZone : validTimeZone(config.defaultTimeZone) ? config.defaultTimeZone : "UTC";
  return { userId, timeZone, displayName: profile.displayName, focusReminderId, focusEventId, origin };
}

export function createVoiceHandler(config: VoiceConfig) {
  return async (request: Request): Promise<Response> => {
    if (!config.token || !(await sameSecret(request.headers.get("authorization") ?? "", `Bearer ${config.token}`))) {
      return fail(401, "unauthorized", "Missing or wrong bearer token.");
    }
    let body: Record<string, unknown>;
    try {
      const parsed = await request.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      body = parsed;
    } catch {
      return fail(400, "invalid_request", "Send a JSON object with action, args and call.");
    }
    if (typeof body.action !== "string") return fail(400, "invalid_request", "action is required.");
    if (!config.deps) return fail(503, "store_unavailable", "Voice storage is not configured on the server.");

    let actor: Actor | null;
    try {
      actor = await resolveActor(config.deps.store, body.call, config);
    } catch (error) {
      console.error("[voice] caller lookup failed", error instanceof Error ? error.message : error);
      return fail(503, "store_unavailable", "The caller could not be looked up.");
    }
    if (!actor) return fail(403, "caller_not_verified", "This call is not linked to a verified user.");

    if (body.action === "session.start") {
      try {
        return Response.json({ ok: true, result: { ...(await buildContext(config.deps, actor)), tools: ACTIONS } });
      } catch (error) {
        console.error("[voice] context lookup failed", error instanceof Error ? error.message : error);
        return fail(503, "store_unavailable", "The user's context could not be loaded.");
      }
    }
    if (body.action === "inboundMessage") {
      // A message must reply to an outreach attempt: text never falls back to the demo caller.
      const call = body.call as Record<string, unknown> | null | undefined;
      if (!call || call.attemptId === undefined || call.attemptId === null) return fail(403, "caller_not_verified", "A message needs the attempt it replies to.");
      const args = body.args && typeof body.args === "object" ? (body.args as Record<string, unknown>) : {};
      return Response.json({ ok: true, result: await handleMessage(config.deps, actor, args.text) });
    }
    const outcome = await runAction(config.deps, actor, body.action, body.args);
    return Response.json(outcome, { status: outcome.ok ? 200 : outcome.error.code === "write_failed" ? 502 : 422 });
  };
}
