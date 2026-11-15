// Follows one outbound FaceTime call by polling the Calls API. It does the two things the FaceTime webhook does:
// tell the agent to greet when Chert reports bridge_ready, and record how the call ended.
//
// Use it where no webhook can reach the server, such as a laptop running `next dev`. It needs a long-running
// process: a serverless function is frozen once it responds, so a hosted deployment must use the webhook.
import { interpretCall } from "./deliver.mjs";
import { applyObserved, isGreetingSignal, roomNameFor, TERMINAL } from "./status.mjs";

/** Polling is on when no FaceTime webhook secret is set. CHERT_FACETIME_POLL=1 or 0 overrides that. */
export function pollingEnabled(env = process.env) {
  if (env.CHERT_FACETIME_POLL === "1") return true;
  if (env.CHERT_FACETIME_POLL === "0") return false;
  return !env.CHERT_FACETIME_WEBHOOK_SECRET;
}

const READY_NAMES = new Set(["bridge_ready", "call.bridge_ready", "call.started"]);

/** True when any recorded event, or the call record itself, says the bridge is ready. */
export function bridgeIsReady(events, call) {
  const named = (event) => [event?.type, event?.event_type, event?.event, event?.name, event?.kind].some((value) => READY_NAMES.has(value));
  if (events.some((event) => isGreetingSignal(event) || named(event))) return true;
  const status = String(call?.status || "").toLowerCase();
  return call?.bridge_ready === true || Boolean(call?.bridge_ready_at) || status === "bridge_ready" || status === "answered";
}

const watching = new Set();

/**
 * @param {{ store: any, livekit: any, facetime: any, intervalMs?: number, maxMs?: number,
 *   sleep?: (ms: number) => Promise<void>, log?: (message: string) => void }} deps
 * @returns {(attempt: any) => Promise<void> | undefined} starts following; the promise is for tests
 */
export function createCallWatcher({ store, livekit, facetime, intervalMs = 1000, maxMs = 7 * 60_000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), log = (message) => console.log(`[outreach] ${message}`) }) {
  async function follow(attempt) {
    const providerId = attempt.providerId;
    const room = roomNameFor(attempt);
    let greeted = false;
    let seenTypes = "";
    const started = Date.now();
    for (let tick = 0; Date.now() - started < maxMs; tick++) {
      await sleep(intervalMs);
      const current = await store.getAttempt(attempt.id);
      // A webhook or another pass may already have settled it.
      if (!current || TERMINAL.has(current.status) || current.status === "canceled") return;
      if (current.greetingActivated) greeted = true;

      // Before the greeting, poll every tick: the Mac ends the call if it hears nothing within 10 seconds of readiness.
      const events = greeted ? [] : await facetime.events(providerId).catch(() => []);
      const read = greeted && tick % 3 !== 0 ? null : await facetime.read(providerId).catch(() => null);
      const call = read?.call ?? null;

      if (!greeted) {
        const types = events.map((event) => event?.type || event?.event_type || event?.event || event?.name || "?").join(",");
        if (types && types !== seenTypes) { seenTypes = types; log(`call ${providerId} events: ${types}`); }
        if (bridgeIsReady(events, call)) {
          await livekit.activateGreeting(room, providerId);
          greeted = true;
          await store.save(applyObserved({ ...current, greetingActivated: true }, "answered", null, providerId));
          log(`call ${providerId} is ready; greeting started`);
          continue;
        }
      }
      if (call) {
        const observed = interpretCall(call, greeted ? { ...current, status: "answered" } : current);
        if (["completed", "unanswered", "failed"].includes(observed.kind)) {
          await store.save(applyObserved(current, observed.kind, observed.errorCode ?? null, providerId));
          await livekit.deleteRoom(room).catch(() => {});
          log(`call ${providerId} ended: ${observed.kind}${observed.errorCode ? ` (${observed.errorCode})` : ""}`);
          return;
        }
      }
    }
    log(`stopped following call ${providerId} after ${Math.round(maxMs / 1000)} s without a final status`);
  }

  return function watch(attempt) {
    if (!attempt?.providerId || watching.has(attempt.id)) return undefined;
    watching.add(attempt.id);
    return follow(attempt)
      .catch((error) => log(`following call ${attempt.providerId} failed: ${error?.code || error?.message || "error"}`))
      .finally(() => watching.delete(attempt.id));
  };
}
