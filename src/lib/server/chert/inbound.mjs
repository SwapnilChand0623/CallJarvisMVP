// Answers Chert's call.incoming webhook: the decision that lets someone call Jarvis without `chert dev`.
//
// Chert asks whether to accept each incoming FaceTime call and allows five seconds for the answer. Accepting
// means naming a LiveKit room for Chert's bridge to join. This handler creates that room, dispatches the voice
// worker into it, and replies. It then follows the call the same way outbound calls are followed: it cues the
// greeting on bridge_ready and deletes the room when the call ends. Any failure declines the call.
import { interpretCall } from "./deliver.mjs";
import { bridgeIsReady } from "./watch.mjs";

const clean = (value) => String(value ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 48);

export function inboundRoomName(callId) {
  return `cj-in-${clean(callId)}`;
}

const following = new Set();

/**
 * @param {{ env: Record<string, string | undefined>, livekit: any, facetime: any, intervalMs?: number, maxMs?: number,
 *   sleep?: (ms: number) => Promise<void>, log?: (message: string) => void }} deps
 * @returns {(event: any) => Promise<{ decision: object, followed?: Promise<void> }>}
 */
export function createInbound({ env, livekit, facetime, intervalMs = 1000, maxMs = 7 * 60_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = (message) => console.log(`[inbound] ${message}`) }) {
  const decline = (reason) => {
    log(`declined: ${reason}`);
    return { decision: { action: "decline" } };
  };

  /** Cues the greeting when FaceTime is ready, then cleans up when the call is over. */
  async function follow(callId, room) {
    let greeted = false;
    let seenTypes = "";
    const started = Date.now();
    for (let tick = 0; Date.now() - started < maxMs; tick++) {
      await sleep(intervalMs);
      const events = greeted ? [] : await facetime.events(callId).catch(() => []);
      const read = greeted && tick % 3 !== 0 ? null : await facetime.read(callId).catch(() => null);
      const call = read?.call ?? null;
      if (!greeted) {
        const types = events.map((event) => event?.type || event?.event_type || event?.event || event?.name || "?").join(",");
        if (types && types !== seenTypes) { seenTypes = types; log(`call ${callId} events: ${types}`); }
        if (bridgeIsReady(events, call)) {
          await livekit.activateGreeting(room, callId);
          greeted = true;
          log(`call ${callId} is ready; greeting started`);
          continue;
        }
      }
      if (call) {
        const observed = interpretCall(call, { status: greeted ? "answered" : "accepted" });
        if (["completed", "unanswered", "failed"].includes(observed.kind)) {
          log(`call ${callId} ended: ${observed.kind}${observed.errorCode ? ` (${observed.errorCode})` : ""}`);
          break;
        }
      }
    }
    await livekit.deleteRoom(room).catch(() => {});
  }

  return async function decide(event) {
    const data = event?.data && typeof event.data === "object" ? event.data : {};
    const callId = typeof data.call_id === "string" ? data.call_id : "";
    if (!clean(callId)) return decline("the event has no call id");
    if (env.CHERT_LINE_ID && data.line_id !== env.CHERT_LINE_ID) return decline("the call is for another line");
    if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return decline("LiveKit is not configured");
    if (data.media && data.media.audio === false) return decline("the call has no audio");

    const room = inboundRoomName(callId);
    try {
      // A repeated event for the same call reuses the room and must not dispatch a second worker.
      if (!following.has(callId)) {
        await livekit.openRoom(room, { chert_call: callId, inbound: true });
      }
      const decision = {
        action: "accept",
        livekit_url: env.LIVEKIT_URL,
        participant_token: livekit.tokenFor(`chert-bridge-in-${clean(callId)}`, room),
        remote_participant_identity: livekit.agentName,
      };
      let followed;
      if (!following.has(callId)) {
        following.add(callId);
        followed = follow(callId, room)
          .catch((error) => log(`following call ${callId} failed: ${error?.code || error?.message || "error"}`))
          .finally(() => following.delete(callId));
      }
      log(`accepted call ${callId} into ${room}`);
      return { decision, followed };
    } catch (error) {
      await livekit.deleteRoom(room).catch(() => {});
      return decline(`room setup failed (${error?.code || error?.message || "error"})`);
    }
  };
}
