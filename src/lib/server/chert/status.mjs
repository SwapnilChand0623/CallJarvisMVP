/** Delivery states from the shared attempt contract. Terminal states never move backward. */
export const TERMINAL = new Set(["completed", "simulated", "unanswered", "failed"]);

const RANK = {
  pending: 0,
  sending: 1,
  unknown: 2,
  accepted: 3,
  answered: 4,
  completed: 5,
  simulated: 5,
  unanswered: 5,
  failed: 5,
};

export function idempotencyKey(attempt) {
  const raw = `cj-${attempt.channel}-${attempt.id}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);
  return raw.length >= 8 ? raw : raw.padEnd(8, "0");
}

export function roomNameFor(attempt) {
  if (attempt.roomName) return attempt.roomName;
  const safe = String(attempt.id).replace(/[^A-Za-z0-9]/g, "").slice(0, 48);
  return `cj-${safe || "attempt"}`;
}

/**
 * Move to `next` only when it is strictly further along.
 * A terminal attempt stays put so a late or repeated provider event cannot regress it.
 */
export function advance(attempt, next, errorCode = undefined) {
  const current = attempt.status;
  if (TERMINAL.has(current)) return attempt;
  if ((RANK[next] ?? -1) <= (RANK[current] ?? -1)) return attempt;
  return {
    ...attempt,
    status: next,
    errorCode: errorCode === undefined ? attempt.errorCode ?? null : errorCode,
  };
}

export function isGreetingSignal(event) {
  const type = event?.type || event?.event_type || "";
  if (type === "call.started" || type === "bridge_ready" || type === "call.bridge_ready") return true;
  return event?.data?.bridge_ready === true;
}

/** Map a FaceTime lifecycle event onto the attempt without regressing status. */
export function applyCallEvent(attempt, event) {
  const type = event?.type || event?.event_type || "";
  const reason = event?.data?.terminal_reason || event?.data?.reason || null;
  if (isGreetingSignal(event)) return advance(attempt, "answered");
  if (type === "call.ended") {
    if (attempt.status === "answered" || attempt.status === "completed") return advance(attempt, "completed");
    if (TERMINAL.has(attempt.status)) return attempt;
    return advance(attempt, "unanswered", reason || "ended");
  }
  if (type === "call.failed") {
    if (attempt.status === "answered" || attempt.status === "completed") return attempt;
    return advance(attempt, "failed", reason || "call_failed");
  }
  return attempt;
}

export function outcomeOf(attempt) {
  if (attempt.status === "failed" && attempt.errorCode === "suppressed") return "suppressed";
  if (attempt.status === "pending" || attempt.status === "sending" || attempt.status === "unknown") return "unknown";
  return attempt.status;
}

export function publicResult(attempt, capabilities) {
  return {
    attemptId: attempt.id,
    outcome: outcomeOf(attempt),
    channel: attempt.channel,
    stage: attempt.stage,
    status: attempt.status,
    simulated: attempt.status === "simulated" || attempt.simulated === true,
    providerId: attempt.providerId ?? null,
    errorCode: attempt.errorCode ?? null,
    capabilities,
  };
}

const ACK = /^(?:yes|y|yeah|yep|ok|okay|acknowledged|ack|got it|confirmed|on it)\.?$/i;

export function isAcknowledgement(text) {
  return ACK.test(String(text ?? "").trim());
}

export function normalizeHandle(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? `+${digits.slice(1).replace(/\D/g, "")}` : digits.replace(/\D/g, "");
}

export function messageBody(attempt) {
  const title = String(attempt.title || "A reminder").replace(/\s+/g, " ").slice(0, 120);
  return `CallJarvis: "${title}" needs you. Reply YES to acknowledge.`;
}

export function eligible(attempt, now = Date.now()) {
  if (!attempt || attempt.active === false || attempt.acknowledged) return false;
  if (attempt.outreachEnabled === false) return false;
  if (!attempt.destination) return false;
  if (Array.isArray(attempt.channels) && !attempt.channels.includes(attempt.channel)) return false;
  if (attempt.snoozedUntil && Date.parse(attempt.snoozedUntil) > now) return false;
  return true;
}

export function leaseOpen(attempt, now = Date.now()) {
  if (attempt.status !== "sending") return false;
  const until = Date.parse(attempt.leaseUntil || "");
  return Number.isFinite(until) && until > now;
}
