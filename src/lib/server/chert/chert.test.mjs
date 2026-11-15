import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { summarizeLine, summarizeMessaging, resolveCapabilities } from "./capabilities.mjs";
import { createDeliver, interpretCall } from "./deliver.mjs";
import { createOutreachHandler } from "./http.mjs";
import { createFaceTime, createIMessage, createLiveKit, participantHasAudio } from "./providers.mjs";
import { createMemoryStore, createSupabaseStore } from "./store.mjs";
import { createFaceTimeWebhook, createIMessageWebhook } from "./webhooks.mjs";

function attempt(overrides = {}) {
  return {
    id: "att-1",
    userId: "user-1",
    sourceKind: "reminder",
    sourceId: "rem-1",
    revision: "1",
    channel: "facetime",
    stage: "initial",
    status: "pending",
    destination: "+15551230000",
    title: "Take medicine",
    active: true,
    acknowledged: false,
    outreachEnabled: true,
    channels: ["facetime", "imessage"],
    ...overrides,
  };
}

function storeWith(overrides, extras = {}) {
  return createMemoryStore({
    attempts: [attempt(overrides)],
    profiles: extras.profiles ?? [{ userId: "user-1", destination: "+15551230000" }],
    reminders: extras.reminders ?? [{ id: "rem-1", userId: "user-1", acknowledgedAt: null }],
  });
}

function caps(live = false) {
  return {
    checkedAt: "2026-11-14T00:00:00.000Z",
    simulatedLabel: "simulated",
    facetime: { live, reason: live ? "ready" : "credential_missing" },
    imessage: { live, reason: live ? "ready" : "credential_missing" },
  };
}

function harness(store, { live = false, facetime, imessage, livekit } = {}) {
  const calls = { prepare: 0, create: 0, send: 0, read: 0 };
  const services = {
    store,
    capabilities: async () => caps(live),
    livekit: livekit ?? {
      async prepare() { calls.prepare += 1; },
      async activateGreeting() {},
      async deleteRoom() {},
    },
    facetime: facetime ?? {
      async create() { calls.create += 1; return { kind: "accepted", providerId: "call-1" }; },
      async read() { calls.read += 1; return { provenAbsent: false, call: null }; },
    },
    imessage: imessage ?? {
      async send() { calls.send += 1; return { kind: "accepted", providerId: "msg-1" }; },
      async read() { calls.read += 1; return { provenAbsent: false, status: null, providerId: "msg-1" }; },
    },
  };
  return { deliver: createDeliver(services), calls, services };
}

test("an unprovisioned channel is labeled simulated and is not dialed twice", async () => {
  const store = storeWith();
  const { deliver, calls } = harness(store, { live: false });
  const first = await deliver("att-1");
  const second = await deliver("att-1");
  assert.equal(first.body.outcome, "simulated");
  assert.equal(first.body.simulated, true);
  assert.equal(first.body.providerId, second.body.providerId);
  assert.equal(first.body.capabilities.simulatedLabel, "simulated");
  assert.equal(calls.create, 0);
  assert.equal(calls.prepare, 0);
  assert.equal((await store.getAttempt("att-1")).status, "simulated");
});

test("a live FaceTime attempt is claimed once and keeps its idempotency key", async () => {
  const store = storeWith();
  let created = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { deliver } = harness(store, {
    live: true,
    facetime: {
      async create(current) {
        created += 1;
        const stored = await store.getAttempt(current.id);
        assert.equal(stored.status, "sending");
        assert.equal(stored.idempotencyKey, current.idempotencyKey);
        await gate;
        return { kind: "accepted", providerId: "call-1" };
      },
      async read() { throw new Error("should reconcile by id, not while creating"); },
    },
  });
  const first = deliver("att-1");
  const second = deliver("att-1");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(created, 1);
  release();
  await Promise.all([first, second]);
  const final = await store.getAttempt("att-1");
  assert.equal(final.status, "accepted");
  assert.equal(final.providerId, "call-1");
  assert.equal(final.idempotencyKey.startsWith("cj-facetime-"), true);
});

test("audio is required before a FaceTime call, and a lost call is reconciled with the same key", async () => {
  const store = storeWith();
  const creates = [];
  const { deliver } = harness(store, {
    live: true,
    livekit: {
      async prepare() {
        const error = new Error("audio_not_ready");
        error.code = "audio_not_ready";
        throw error;
      },
      async deleteRoom() {},
      async activateGreeting() {},
    },
    facetime: {
      async create(current) {
        creates.push(current.idempotencyKey);
        return { kind: "unknown", providerId: null, errorCode: "missing_call_id" };
      },
      async read() { return { provenAbsent: false, call: null }; },
    },
  });
  const blocked = await deliver("att-1");
  assert.equal(blocked.body.status, "pending");
  assert.equal(blocked.body.errorCode, "audio_not_ready");
  assert.equal(creates.length, 0);

  const { deliver: retry } = harness(store, {
    live: true,
    facetime: {
      async create(current) {
        creates.push(current.idempotencyKey);
        return { kind: "unknown", providerId: "call-9" };
      },
      async read(id) {
        assert.equal(id, "call-9");
        return { provenAbsent: false, call: { id, status: "active" } };
      },
    },
  });
  const pending = await retry("att-1");
  assert.equal(pending.body.outcome, "unknown");
  const reconciled = await retry("att-1");
  assert.equal(reconciled.body.outcome, "accepted");
  assert.equal(creates.length, 1);
  assert.equal(interpretCall({ id: "call-9", status: "active" }, attempt()).kind, "accepted");
});

test("an uncertain iMessage send is not repeated", async () => {
  const store = storeWith({ channel: "imessage", status: "unknown", idempotencyKey: "cj-imessage-att-1", providerId: null });
  let sent = 0;
  const { deliver } = harness(store, {
    live: true,
    imessage: {
      async send() { sent += 1; return { kind: "accepted", providerId: "msg-1" }; },
      async read() { return { provenAbsent: true, status: null, providerId: null }; },
    },
  });
  const result = await deliver("att-1");
  assert.equal(sent, 0);
  assert.equal(result.body.outcome, "unknown");
  assert.equal(result.body.errorCode, "delivery_unconfirmed");
});

test("an acknowledged reminder is suppressed and not contacted", async () => {
  const store = storeWith({ acknowledged: true });
  const { deliver, calls } = harness(store, { live: true });
  const result = await deliver("att-1");
  assert.equal(result.body.outcome, "suppressed");
  assert.equal(calls.create, 0);
  assert.equal(calls.send, 0);
});

test("outreach requires the scheduler token and returns the attempt outcome", async () => {
  const store = storeWith();
  const { services } = harness(store, { live: false });
  const handler = createOutreachHandler({ ...services, env: { OUTREACH_TOKEN: "secret" } });
  const denied = await handler(new Request("http://local/outreach", { method: "POST", body: "{}" }));
  assert.equal(denied.status, 401);
  const accepted = await handler(new Request("http://local/outreach", {
    method: "POST",
    headers: { authorization: "Bearer secret", "content-type": "application/json" },
    body: JSON.stringify({ attemptId: "att-1" }),
  }));
  assert.equal(accepted.status, 200);
  const body = await accepted.json();
  assert.equal(body.attemptId, "att-1");
  assert.equal(body.simulated, true);
  const missing = await handler(new Request("http://local/outreach", {
    method: "POST",
    headers: { authorization: "Bearer secret", "content-type": "application/json" },
    body: JSON.stringify({ attemptId: "missing" }),
  }));
  assert.equal(missing.status, 404);
});

test("FaceTime callbacks greet once, ignore repeats, and do not regress a finished attempt", async () => {
  const store = storeWith({ status: "accepted", providerId: "call-1", idempotencyKey: "cj-facetime-att-1", roomName: "cj-att1" });
  const greeted = [];
  const removed = [];
  const saved = [];
  const innerSave = store.save.bind(store);
  store.save = async (value) => {
    saved.push(JSON.stringify(value));
    return innerSave(value);
  };
  const webhook = createFaceTimeWebhook({
    store,
    secret: "ft-secret",
    livekit: {
      async activateGreeting(room, callId) { greeted.push([room, callId]); },
      async deleteRoom(room) { removed.push(room); },
    },
  });
  const started = JSON.stringify({
    id: "evt-start",
    type: "call.started",
    data: { id: "call-1", transcript: "SECRET-TRANSCRIPT" },
  });
  const first = await webhook(signedFaceTime(started));
  assert.equal(first.status, 200);
  assert.deepEqual(greeted, [["cj-att1", "call-1"]]);
  assert.equal((await first.json()).status, "answered");
  const repeat = await webhook(signedFaceTime(started));
  assert.equal((await repeat.json()).duplicate, true);
  assert.equal(greeted.length, 1);

  const ended = await webhook(signedFaceTime(JSON.stringify({
    id: "evt-end",
    type: "call.ended",
    data: { id: "call-1", terminal_reason: "hangup" },
  })));
  assert.equal((await ended.json()).status, "completed");
  assert.deepEqual(removed, ["cj-att1"]);

  const late = await webhook(signedFaceTime(JSON.stringify({
    id: "evt-late",
    type: "call.failed",
    data: { id: "call-1" },
  })));
  assert.equal((await late.json()).status, "completed");
  assert.equal(saved.every((entry) => !entry.includes("SECRET-TRANSCRIPT")), true);
});

test("an ended call that arrives before bridge_ready stays unanswered", async () => {
  const store = storeWith({ status: "accepted", providerId: "call-1" });
  let greeted = 0;
  const webhook = createFaceTimeWebhook({
    store,
    secret: "ft-secret",
    livekit: {
      async activateGreeting() { greeted += 1; },
      async deleteRoom() {},
    },
  });
  await webhook(signedFaceTime(JSON.stringify({ id: "evt-end", type: "call.ended", data: { id: "call-1" } })));
  await webhook(signedFaceTime(JSON.stringify({ id: "evt-ready", type: "call.started", data: { id: "call-1" } })));
  assert.equal((await store.getAttempt("att-1")).status, "unanswered");
  assert.equal(greeted, 0);
});

test("iMessage YES acknowledges only that user's matching reminder", async () => {
  const store = createMemoryStore({
    attempts: [
      attempt({ id: "old", channel: "imessage", sourceId: "rem-1", providerId: "m1", status: "accepted", updatedAt: "2026-01-01T00:00:00.000Z" }),
      attempt({ id: "new", channel: "imessage", sourceId: "rem-2", providerId: "m2", status: "accepted", updatedAt: "2026-01-02T00:00:00.000Z" }),
      attempt({ id: "other", userId: "user-2", channel: "imessage", sourceId: "rem-9", providerId: "m9", status: "accepted", destination: "+15552220000" }),
    ],
    profiles: [
      { userId: "user-1", destination: "+1 (555) 123-0000" },
      { userId: "user-2", destination: "+15552220000" },
    ],
    reminders: [
      { id: "rem-1", userId: "user-1", acknowledgedAt: null },
      { id: "rem-2", userId: "user-1", acknowledgedAt: null },
      { id: "rem-9", userId: "user-2", acknowledgedAt: null },
    ],
  });
  const webhook = createIMessageWebhook({ store, domain: { async handle() { throw new Error("ack is local"); } }, secret: "msg-secret" });
  const response = await webhook(signedMessage(messageEvent("evt-yes", "+15551230000", "YES")));
  assert.equal((await response.json()).reminderId, "rem-2");
  assert.equal((await webhook(signedMessage(messageEvent("evt-yes", "+15551230000", "YES")))).status, 200);
  assert.equal((await store.latestOpenReminder("user-1")).id, "rem-1");
  assert.equal((await store.latestOpenReminder("user-2")).id, "rem-9");
});

test("other inbound text is forwarded with the attempt id and is not stored", async () => {
  const store = storeWith({
    channel: "imessage",
    status: "accepted",
    providerId: "msg-1",
  });
  const saved = [];
  const inner = store.save.bind(store);
  store.save = async (value) => {
    saved.push(JSON.stringify(value));
    return inner(value);
  };
  const forwarded = [];
  const webhook = createIMessageWebhook({
    store,
    secret: "msg-secret",
    domain: { async handle(payload) { forwarded.push(payload); } },
  });
  const response = await webhook(signedMessage(messageEvent("evt-text", "+15551230000", "UNIQUE-REPLY-TEXT")));
  assert.equal((await response.json()).attemptId, "att-1");
  assert.equal(forwarded[0].call.attemptId, "att-1");
  assert.equal(forwarded[0].args.text, "UNIQUE-REPLY-TEXT");
  assert.equal(forwarded[0].call.userId, undefined);
  assert.equal(saved.some((entry) => entry.includes("UNIQUE-REPLY-TEXT")), false);
  const rejected = await webhook(signedMessage(messageEvent("evt-stranger", "+19998887777", "yes"), "bad"));
  assert.equal(rejected.status, 401);
});

test("line and messaging probes report whether a channel can run live", async () => {
  assert.equal(summarizeLine({
    id: "line-1",
    supports_audio: true,
    operational_status: "available",
    session_health: { readiness: { audio_ready: true }, capabilities: { outbound_audio_protocol: 1 } },
  }).live, true);
  assert.equal(summarizeLine({ id: "line-1", supports_audio: true, operational_status: "available" }).reason, "outbound_audio_disabled");
  assert.equal(summarizeMessaging(200, { data: { items: [{ id: "n1" }] } }).live, true);
  assert.equal(summarizeMessaging(404, { error: { code: 2001 } }).reason, "messaging_tenant_inactive");
  let called = 0;
  const simulated = await resolveCapabilities({
    CHERT_FACETIME_MODE: "simulate",
    CHERT_IMESSAGE_MODE: "simulate",
    CHERT_FACETIME_API_KEY: "present",
    CHERT_PROJECT_ID: "present",
  }, () => { called += 1; throw new Error("network"); });
  assert.equal(called, 0);
  assert.equal(simulated.facetime.live, false);
  assert.equal(simulated.facetime.reason, "forced_simulation");
  assert.equal(simulated.imessage.reason, "forced_simulation");
});

test("the Calls API body is audio-only, room-scoped, and dispatched to the named agent", async () => {
  const calls = [];
  const env = {
    LIVEKIT_URL: "wss://example.livekit.cloud",
    LIVEKIT_API_KEY: "key",
    LIVEKIT_API_SECRET: "secret",
    AGENT_NAME: "calljarvis",
    CHERT_FACETIME_API_KEY: "ft",
    CHERT_PROJECT_ID: "proj",
    CHERT_LINE_ID: "line-1",
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("ListParticipants")) {
      return Response.json({ participants: [{ identity: "agent", tracks: [{ type: "AUDIO", muted: false }] }] });
    }
    if (String(url).endsWith("/v1/calls")) return Response.json({ data: { id: "call-9" } }, { status: 201 });
    return Response.json({});
  };
  const current = attempt({ idempotencyKey: "cj-facetime-att-1", destination: "person@icloud.com" });
  const livekit = createLiveKit(env, fetchImpl);
  const created = await createFaceTime(env, fetchImpl, livekit).create({
    ...(await livekit.prepare(current)),
    ...current,
  });
  assert.equal(created.kind, "accepted");
  const post = calls.find((call) => call.url.endsWith("/v1/calls"));
  const body = JSON.parse(post.options.body);
  assert.equal(body.media.video, false);
  assert.equal(body.media.audio, true);
  assert.equal(body.destination_type, "email");
  assert.equal(body.mode, "customer_managed");
  assert.equal(post.options.headers["Idempotency-Key"], "cj-facetime-att-1");
  assert.equal(body.participant_token.split(".").length, 3);
  const dispatch = calls.find((call) => call.url.includes("CreateDispatch"));
  const metadata = JSON.parse(JSON.parse(dispatch.options.body).metadata);
  assert.equal(metadata.agentName ?? metadata.greeting, "bridge_ready");
  assert.equal(metadata.reminderId, "rem-1");
  assert.equal(metadata.userId, "user-1");
  assert.equal(participantHasAudio({ tracks: [{ type: "AUDIO", muted: true }] }), false);

  const sent = [];
  const imessage = createIMessage({ CHERT_MESSAGING_TOKEN: "token" }, async (url, options) => {
    sent.push(JSON.parse(options.body));
    return Response.json({ status: "sent", message_id: "msg-7" });
  });
  const message = await imessage.send(attempt({ channel: "imessage", idempotencyKey: "cj-imessage-att-1" }), "CallJarvis: hello");
  assert.equal(message.providerId, "msg-7");
  assert.equal(sent[0].idempotency_key, "cj-imessage-att-1");
  assert.equal(sent[0].body.includes("SECRET"), false);
});

function signedFaceTime(raw) {
  const hex = createHmac("sha256", "ft-secret").update(raw).digest("hex");
  return new Request("http://local/facetime", {
    method: "POST",
    headers: { "x-chert-signature": `sha256=${hex}` },
    body: raw,
  });
}

function signedMessage(raw, secret = "msg-secret") {
  const ts = Math.floor(Date.now() / 1000);
  const hex = createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return new Request("http://local/imessage", {
    method: "POST",
    headers: { "x-webhook-signature": `t=${ts},v1=${hex}` },
    body: raw,
  });
}

function messageEvent(id, handle, text) {
  return JSON.stringify({
    event_id: id,
    event_type: "message.received",
    data: {
      chat: { is_group: false },
      message: { sender_handle: { handle }, parts: [{ type: "text", value: text }] },
    },
  });
}

test("Supabase outreach uses deployed columns and simulates only after atomic authorization", async () => {
  const row = {
    id: "attempt", user_id: "user", reminder_id: "reminder", revision: 1,
    channel: "facetime", stage: "initial", status: "pending", idempotency_key: "database-key",
  };
  const profile = {
    destination: "+15551230000", verified_at: "2026-11-14T10:00:00Z",
    outreach_enabled: true, opted_in_channels: ["facetime"],
  };
  let authorizations = 0;
  let writes = 0;
  let allowDelivery = false;
  const store = createSupabaseStore({
    SUPABASE_URL: "https://database.test",
    SUPABASE_SERVICE_ROLE_KEY: "fixture",
  }, async (url, options) => {
    const parsed = new URL(url);
    switch (parsed.pathname) {
      case "/rest/v1/profiles":
        assert.equal(parsed.searchParams.get("select"), "user_id,destination,verified_at,outreach_enabled,opted_in_channels");
        return Response.json([profile]);
      case "/rest/v1/reminders":
        return Response.json([{ title: "Test reminder", status: "pending" }]);
      case "/rest/v1/rpc/begin_notification_delivery":
        assert.equal(options.method, "POST");
        assert.deepEqual(JSON.parse(options.body), { p_attempt_id: row.id });
        authorizations++;
        if (!allowDelivery || row.status !== "pending") return Response.json(null);
        row.status = "sending";
        return Response.json({
          attemptId: row.id, userId: row.user_id, channel: row.channel,
          destination: profile.destination, idempotencyKey: row.idempotency_key,
        });
      case "/rest/v1/notification_attempts":
        if (options.method === "PATCH") {
          assert.equal(row.status, "sending");
          const patch = JSON.parse(options.body);
          assert.deepEqual(Object.keys(patch).sort(), [
            "error_code", "outcome_at", "provider_id", "simulated", "status",
          ]);
          Object.assign(row, patch);
          writes++;
        }
        return Response.json([row]);
      default:
        assert.fail(`Unexpected PostgREST request: ${parsed.pathname}`);
    }
  });
  const deliver = createDeliver({
    store,
    capabilities: async () => ({ facetime: { live: false } }),
    facetime: { create: async () => assert.fail("Simulation must not dial") },
  });
  assert.equal((await deliver(row.id)).body.outcome, "unknown");
  assert.equal(authorizations, 1);
  assert.equal(writes, 0);

  allowDelivery = true;
  const overlapping = await Promise.all([deliver(row.id), deliver(row.id)]);
  assert.ok(overlapping.some(({ body }) => body.outcome === "simulated"));
  assert.equal(writes, 1);
  assert.equal((await deliver(row.id)).body.outcome, "simulated");
  assert.equal(writes, 1);
});
