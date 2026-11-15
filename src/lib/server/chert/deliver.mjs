import { channelLive } from "./capabilities.mjs";
import {
  applyObserved,
  eligible,
  idempotencyKey,
  leaseOpen,
  messageBody,
  normalizeHandle,
  publicResult,
  roomNameFor,
  suppress,
} from "./status.mjs";

function offlineCapabilities(reason) {
  return {
    checkedAt: new Date().toISOString(),
    simulatedLabel: "simulated",
    facetime: { live: false, reason, lineId: null, audioReady: false, integrationAssigned: false },
    imessage: { live: false, reason },
  };
}

function providerIdForSimulation(attempt) {
  return `sim-${attempt.channel}-${attempt.id}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
}

/** Map a Calls API record onto the attempt outcome. `active` is allocated media, not bridge_ready. */
export function interpretCall(call, attempt) {
  const status = String(call?.status || "").toLowerCase();
  const reason = call?.terminal_reason || call?.reason || null;
  const ready = call?.bridge_ready === true || status === "bridge_ready" || status === "answered";
  // A call that rang out or was declined is unanswered, whichever status the provider files it under, so that
  // the missed-call fallback applies. Only a call that could not be placed is a failure.
  const notAnswered = /declin|reject|no[_ -]?answer|unanswered|missed|busy|ring|timeout|timed[_ -]?out|cancel/i.test(String(reason ?? ""));
  if (["failed", "error"].includes(status)) {
    return notAnswered && !ready
      ? { kind: "unanswered", providerId: call.id, errorCode: reason }
      : { kind: "failed", providerId: call.id, errorCode: reason || "call_failed" };
  }
  if (["declined", "missed", "no_answer", "unanswered", "busy"].includes(status)) {
    return { kind: "unanswered", providerId: call.id, errorCode: reason || status };
  }
  if (["ended", "completed", "complete"].includes(status)) {
    const answered = attempt.status === "answered" || attempt.status === "completed" || ready;
    return answered
      ? { kind: "completed", providerId: call.id }
      : { kind: "unanswered", providerId: call.id, errorCode: reason || "ended" };
  }
  if (ready) return { kind: "answered", providerId: call.id };
  if (call?.id) return { kind: "accepted", providerId: call.id };
  return { kind: "unknown", providerId: null };
}

function interpretMessage(status, providerId) {
  if (status === "delivered") return { kind: "completed", providerId };
  if (status === "sent" || status === "duplicate") return { kind: "accepted", providerId };
  if (status === "failed") return { kind: "failed", providerId, errorCode: "send_failed" };
  return { kind: "unknown", providerId };
}

function needsReconcile(attempt, now) {
  if (attempt.providerId) return true;
  if (attempt.status === "unknown") return true;
  if (attempt.status === "sending" && !leaseOpen(attempt, now)) return true;
  return false;
}

function settled(attempt) {
  return attempt.status === "accepted"
    || attempt.status === "answered"
    || attempt.status === "completed"
    || attempt.status === "simulated"
    || attempt.status === "unanswered"
    || attempt.status === "failed"
    || attempt.status === "canceled";
}

async function remember(store, attempt, kind, errorCode, providerId) {
  const next = applyObserved(attempt, kind, errorCode, providerId);
  await store.save(next);
  return next;
}

/**
 * One authorized outreach pass.
 * A live provider is contacted only after the attempt is claimed and its idempotency key is stored.
 * An uncertain FaceTime create is retried with that same key. An uncertain iMessage send is not repeated.
 */
export function createDeliver({ store, livekit, facetime, imessage, capabilities, watch }) {
  return async function deliver(attemptId, now = Date.now()) {
    const attempt = await store.getAttempt(attemptId);
    if (!attempt) return { http: 404, body: { error: "attempt_not_found" } };

    let caps;
    try {
      caps = await capabilities();
    } catch {
      caps = offlineCapabilities("probe_failed");
    }
    const finish = (current) => ({ http: 200, body: publicResult(current, caps) });

    if (settled(attempt)) return finish(attempt);
    if (leaseOpen(attempt, now)) return finish(attempt);
    if (store.canReplayUnconfirmedCall === false && attempt.status === "sending" && !attempt.providerId) {
      // The sender may still be running. Only that execution or a verified callback can settle it.
      return finish(attempt);
    }

    if (needsReconcile(attempt, now)) {
      if (!attempt.idempotencyKey && !attempt.providerId) {
        return finish(await remember(store, attempt, "unknown", "delivery_unconfirmed"));
      }
      return finish(await reconcile(attempt));
    }

    if (!eligible(attempt, now) || !normalizeHandle(attempt.destination)) {
      const suppressed = suppress(attempt);
      await store.save(suppressed);
      return finish(suppressed);
    }

    const key = attempt.idempotencyKey || idempotencyKey(attempt);
    const claimed = await store.claimSend(attempt.id, {
      idempotencyKey: key,
      leaseUntil: new Date(now + 45_000).toISOString(),
      roomName: attempt.channel === "facetime" ? roomNameFor(attempt) : attempt.roomName ?? null,
    });
    if (!claimed) {
      const current = await store.getAttempt(attempt.id);
      return finish(current || attempt);
    }

    const fresh = await store.getAttempt(attempt.id);
    if (!fresh || settled(fresh)) return finish(fresh || attempt);
    if (!eligible(fresh, now)) {
      const suppressed = suppress(fresh || claimed);
      await store.save(suppressed);
      return finish(suppressed);
    }

    if (claimed.destination !== fresh.destination || claimed.channel !== fresh.channel ||
      claimed.userId !== fresh.userId) return finish(fresh);
    const outbound = {
      ...fresh,
      simulated: false,
      destination: normalizeHandle(claimed.destination),
      idempotencyKey: claimed.idempotencyKey,
    };
    if (!channelLive(caps, outbound.channel)) {
      const reason = caps[outbound.channel]?.reason;
      const temporary = ["audio_not_ready", "line_unavailable", "probe_failed"].includes(reason)
        || /^facetime_http_(429|5\d\d)$/.test(reason ?? "");
      if (temporary) {
        const pending = { ...outbound, status: "pending", providerId: null,
          errorCode: reason, leaseUntil: null };
        await store.save(pending);
        return finish(pending);
      }
      const simulated = {
        ...outbound,
        status: "simulated",
        simulated: true,
        providerId: providerIdForSimulation(outbound),
        errorCode: null,
        leaseUntil: null,
      };
      await store.save(simulated);
      return finish(simulated);
    }

    if (outbound.channel === "facetime") return finish(await placeCall(outbound));
    if (outbound.channel === "imessage") return finish(await placeMessage(outbound));
    return finish(await remember(store, outbound, "failed", "channel_unsupported"));
  };

  async function placeCall(attempt) {
    let placed = false;
    try {
      const prepared = await livekit.prepare(attempt);
      placed = true;
      const result = await facetime.create(attempt, { agentIdentity: prepared?.agentIdentity });
      const saved = await remember(store, attempt, result.kind, result.errorCode ?? null, result.providerId);
      if (result.kind !== "failed") await store.logEvent?.(saved, "call_placed", "Jarvis started a FaceTime Audio call to you.");
      // Without a webhook, nothing else would tell the agent when FaceTime is ready to hear the greeting.
      if (watch && saved.providerId && result.kind !== "failed") watch(saved);
      return saved;
    } catch (error) {
      const code = error?.code || "provider_timeout";
      if (!placed) {
        await livekit.deleteRoom(roomNameFor(attempt)).catch(() => {});
        const retryable = { ...attempt, status: "pending", errorCode: code, leaseUntil: null };
        await store.save(retryable);
        return retryable;
      }
      return remember(store, attempt, "unknown", code, attempt.providerId);
    }
  }

  async function placeMessage(attempt) {
    try {
      const result = await imessage.send(attempt, messageBody(attempt));
      return remember(store, attempt, result.kind, result.errorCode ?? null, result.providerId);
    } catch (error) {
      return remember(store, attempt, "unknown", error?.code || "provider_timeout", attempt.providerId);
    }
  }

  async function reconcile(attempt) {
    if (attempt.channel === "facetime") return reconcileCall(attempt);
    if (attempt.channel === "imessage") return reconcileMessage(attempt);
    return remember(store, attempt, "unknown", "delivery_unconfirmed");
  }

  async function reconcileCall(attempt) {
    if (attempt.providerId) {
      const read = await facetime.read(attempt.providerId);
      if (!read?.call) return remember(store, attempt, "unknown", "delivery_unconfirmed", attempt.providerId);
      const observed = interpretCall(read.call, attempt);
      return remember(store, attempt, observed.kind, observed.errorCode ?? null, observed.providerId);
    }
    if (store.canReplayUnconfirmedCall === false) {
      return remember(store, attempt, "unknown", "delivery_unconfirmed");
    }
    try {
      const result = await facetime.create(attempt);
      return remember(store, attempt, result.kind, result.errorCode ?? null, result.providerId);
    } catch (error) {
      return remember(store, attempt, "unknown", error?.code || "provider_timeout");
    }
  }

  async function reconcileMessage(attempt) {
    if (!attempt.providerId) return remember(store, attempt, "unknown", "delivery_unconfirmed");
    const read = await imessage.read(attempt.providerId);
    if (!read || read.status == null) return remember(store, attempt, "unknown", "delivery_unconfirmed", attempt.providerId);
    const observed = interpretMessage(read.status, read.providerId || attempt.providerId);
    return remember(store, attempt, observed.kind, observed.errorCode ?? null, observed.providerId);
  }
}
