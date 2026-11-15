import { createHash, timingSafeEqual } from "node:crypto";
import { verifyFaceTimeSignature, verifyMessagingSignature } from "./providers.mjs";
import {
  applyCallEvent,
  applyObserved,
  isAcknowledgement,
  isGreetingSignal,
  publicResult,
  roomNameFor,
  TERMINAL,
} from "./status.mjs";
import { json } from "./auth.mjs";

export function inboundText(event) {
  const parts = event?.data?.message?.parts;
  if (Array.isArray(parts)) {
    return parts
      .filter((part) => part?.type === "text" && typeof part.value === "string")
      .map((part) => part.value)
      .join("\n")
      .trim();
  }
  return typeof event?.text === "string" ? event.text.trim() : "";
}

function eventId(request, event, raw) {
  return request.headers.get("x-webhook-event-id")
    || request.headers.get("x-chert-event-id")
    || event?.event_id
    || event?.id
    || createHash("sha256").update(raw).digest("hex");
}

function callFields(event) {
  const data = event?.data && typeof event.data === "object" ? event.data : {};
  const call = data.call && typeof data.call === "object" ? data.call : data;
  return {
    providerId: call.id || data.call_id || event.call_id || null,
    idempotencyKey: call.idempotency_key || data.idempotency_key || null,
  };
}

async function findCallAttempt(store, fields) {
  if (fields.providerId) {
    const byProvider = await store.findByProvider("facetime", fields.providerId);
    if (byProvider) return byProvider;
  }
  if (fields.idempotencyKey) {
    const byKey = await store.findByKey(fields.idempotencyKey);
    if (byKey?.channel === "facetime") return byKey;
  }
  return null;
}

function messageKind(type, event) {
  const status = String(event?.data?.status || event?.data?.message?.status || "").toLowerCase();
  if (type.endsWith("delivered") || status === "delivered") return "completed";
  if (type.endsWith("failed") || status === "failed") return "failed";
  if (type.endsWith("sent") || status === "sent" || status === "duplicate") return "accepted";
  if (status === "queued") return "unknown";
  return null;
}

/** Constant-time comparison of the key carried in the URL with the configured webhook key. */
function urlKeyMatches(request, key) {
  if (!key) return false;
  // The key may be the `key` query parameter or the last path segment (…/facetime/<key>), for dashboards that
  // do not keep a query string.
  let candidates = [];
  try {
    const url = new URL(request.url);
    candidates = [url.searchParams.get("key") || "", decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "")];
  } catch { return false; }
  const digest = (value) => createHash("sha256").update(value).digest();
  return candidates.some((given) => timingSafeEqual(digest(given), digest(key)));
}

/**
 * FaceTime webhook. A request is trusted when it carries a valid signature (signing enabled in Chert) or the
 * URL key (an unsigned integration whose webhook URL ends in ?key=<CHERT_WEBHOOK_KEY>). With neither configured,
 * every request is refused.
 */
export function createFaceTimeWebhook({ store, livekit, secret, urlKey, inbound }) {
  return async function facetimeWebhook(request) {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const raw = await request.text();
    const signed = verifyFaceTimeSignature(raw, request.headers.get("x-chert-signature") || "", secret);
    if (!signed && !urlKeyMatches(request, urlKey)) return json({ error: "unauthorized" }, 401);
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if ((event?.type || event?.event_type) === "call.incoming") {
      // The decision is the response body. Declining is the safe answer when inbound calls are not set up.
      if (!inbound) return json({ action: "decline" });
      return json((await inbound(event)).decision);
    }
    const id = eventId(request, event, raw);
    if (!await store.claimEvent(id)) return json({ duplicate: true });
    try {
      const fields = callFields(event);
      const found = await findCallAttempt(store, fields);
      if (!found) return json({ ignored: true });
      if (fields.providerId && found.providerId && fields.providerId !== found.providerId) return json({ ignored: true });

      const room = found.roomName || roomNameFor(found);
      let next = {
        ...found,
        roomName: room,
        providerId: found.providerId || fields.providerId || null,
      };
      if (isGreetingSignal(event) && !TERMINAL.has(next.status) && !next.greetingActivated) {
        await livekit.activateGreeting(room, next.providerId || next.id);
        next = { ...next, greetingActivated: true };
      }
      next = applyCallEvent(next, event);
      const saved = await store.save(next);
      const type = event.type || event.event_type || "";
      if (type === "call.ended" || type === "call.failed") await livekit.deleteRoom(room).catch(() => {});
      return json(publicResult(saved || next, null));
    } catch {
      store.releaseEvent(id);
      return json({ error: "webhook_failed" }, 500);
    }
  };
}

export function createIMessageWebhook({ store, domain, secret, handleVerifiedText, sendReply }) {
  return async function imessageWebhook(request) {
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const raw = await request.text();
    const header = request.headers.get("x-webhook-signature") || request.headers.get("x-chert-signature") || "";
    if (!verifyMessagingSignature(raw, header, secret)) return json({ error: "unauthorized" }, 401);
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const id = eventId(request, event, raw);
    let acquired = false;
    try {
      acquired = await store.claimEvent(id);
      if (!acquired) return json({ duplicate: true });
      const type = event.event_type || event.type || "";
      if (type === "message.received") return json(await receive(event, id));
      const providerId = event?.data?.message_id || event?.data?.id || null;
      if (!providerId) return json({ ignored: true });
      const attempt = await store.findByProvider("imessage", providerId);
      if (!attempt) return json({ ignored: true });
      const kind = messageKind(type, event);
      if (!kind) return json({ ignored: true });
      const saved = await store.save(applyObserved(attempt, kind, null, providerId));
      return json(publicResult(saved || attempt, null));
    } catch {
      if (acquired) await store.releaseEvent(id);
      return json({ error: "webhook_failed" }, 500);
    }
  };

  async function receive(event, id) {
    if (event?.data?.chat?.is_group === true || event?.data?.message?.is_from_me === true) return { ignored: true };
    const handle = event?.data?.message?.sender_handle?.handle || event?.from || "";
    const profile = await store.findUserByHandle(handle);
    if (!profile?.userId || profile.outreachEnabled === false ||
      (Array.isArray(profile.channels) && !profile.channels.includes("imessage"))) return { ignored: true };
    const text = inboundText(event);
    async function reply(message) {
      if (!sendReply || !message) return "disabled";
      const key = `cj-text-${createHash("sha256").update(id).digest("hex")}`;
      try {
        const delivery = await sendReply(profile.destination, key, message);
        return delivery.kind;
      } catch {
        // The command has already run and the send may have reached Chert.
        return "unknown";
      }
    }
    if (isAcknowledgement(text)) {
      const reminder = await store.latestOpenReminder(profile.userId);
      if (!reminder) return { acknowledged: false, replyStatus: await reply("There is no reminder waiting for acknowledgment.") };
      const updated = await store.acknowledgeReminder(profile.userId, reminder.id);
      return { acknowledged: updated === true, reminderId: updated ? reminder.id : null, replyStatus: await reply(updated ? "Reminder acknowledged." : "I couldn’t acknowledge that reminder.") };
    }
    if (!text) return { ignored: true };
    const attempt = await store.latestOutboundAttempt(profile.userId, "imessage");
    if (handleVerifiedText) {
      const result = await handleVerifiedText({ userId: profile.userId, attemptId: attempt?.id, text });
      return { forwarded: true, replyStatus: await reply(result) };
    }
    if (!attempt || !domain) return { forwarded: false };
    await domain.handle({
      action: "inboundMessage",
      args: { text },
      call: { attemptId: attempt.id },
    });
    return { forwarded: true, attemptId: attempt.id };
  }
}
