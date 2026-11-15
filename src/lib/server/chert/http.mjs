import { authorized, json } from "./auth.mjs";
import { resolveCapabilities } from "./capabilities.mjs";
import { createDeliver } from "./deliver.mjs";
import { createDomain, createFaceTime, createIMessage, createLiveKit } from "./providers.mjs";
import { defaultStore } from "./store.mjs";
import { createCallWatcher, pollingEnabled } from "./watch.mjs";
import { createFaceTimeWebhook, createIMessageWebhook } from "./webhooks.mjs";

export function createServices(env = process.env, fetchImpl = fetch, store = defaultStore(env)) {
  const livekit = createLiveKit(env, fetchImpl);
  return {
    env,
    store,
    livekit,
    facetime: createFaceTime(env, fetchImpl, livekit),
    imessage: createIMessage(env, fetchImpl),
    domain: createDomain(env, fetchImpl),
    capabilities: () => resolveCapabilities(env, fetchImpl),
  };
}

export function createOutreachHandler({ env, store, livekit, facetime, imessage, capabilities }) {
  const watch = pollingEnabled(env) ? createCallWatcher({ store, livekit, facetime }) : undefined;
  const deliver = createDeliver({ store, livekit, facetime, imessage, capabilities, watch });
  return async function outreach(request) {
    if (!authorized(request.headers.get("authorization"), env.OUTREACH_TOKEN)) return json({ error: "unauthorized" }, 401);
    if (request.method === "GET") {
      try {
        return json({ capabilities: await capabilities() });
      } catch {
        return json({ error: "capability_probe_failed" }, 502);
      }
    }
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    if (typeof body?.attemptId !== "string" || body.attemptId.length === 0) return json({ error: "attempt_id_required" }, 400);
    try {
      const result = await deliver(body.attemptId);
      return json(result.body, result.http);
    } catch (error) {
      const unavailable = error?.code === "schema_unavailable";
      return json({ error: unavailable ? "schema_unavailable" : "outreach_failed" }, unavailable ? 503 : 502);
    }
  };
}

export function facetimeWebhookHandler(services) {
  return createFaceTimeWebhook({
    store: services.store,
    livekit: services.livekit,
    secret: services.env.CHERT_FACETIME_WEBHOOK_SECRET,
  });
}

export function imessageWebhookHandler(services, handleVerifiedText) {
  return createIMessageWebhook({
    store: services.store,
    domain: services.domain,
    handleVerifiedText,
    sendReply: services.env.CHERT_MESSAGING_TOKEN && services.env.CHERT_IMESSAGE_MODE !== "simulate"
      ? (destination, id, text) => services.imessage.send({ destination, id, idempotencyKey: id }, text)
      : undefined,
    secret: services.env.CHERT_WEBHOOK_SECRET,
  });
}
