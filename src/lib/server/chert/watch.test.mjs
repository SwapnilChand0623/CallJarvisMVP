import assert from "node:assert/strict";
import test from "node:test";
import { createDeliver } from "./deliver.mjs";
import { createFaceTime, createLiveKit } from "./providers.mjs";
import { bridgeIsReady, createCallWatcher, pollingEnabled } from "./watch.mjs";

function memory(attempt) {
  let row = { ...attempt };
  return {
    saves: [],
    async getAttempt() { return { ...row, greetingActivated: row.status === "answered" || row.status === "completed" }; },
    async save(next) { row = { ...row, status: next.status, errorCode: next.errorCode ?? null, providerId: next.providerId }; this.saves.push(row.status); return row; },
  };
}

const attempt = { id: "att-1", channel: "facetime", status: "accepted", providerId: "call-1", roomName: null };

function watcher(store, script) {
  const seen = { greeted: [], deleted: [], logs: [] };
  let tick = 0;
  const step = () => script[Math.min(tick, script.length - 1)];
  const watch = createCallWatcher({
    store,
    livekit: {
      async activateGreeting(room, callId) { seen.greeted.push([room, callId]); },
      async deleteRoom(room) { seen.deleted.push(room); },
    },
    facetime: {
      async events() { return step().events ?? []; },
      async read() { return { call: step().call ?? { id: "call-1", status: "ringing" } }; },
    },
    sleep: async () => { tick += 1; },
    maxMs: 60_000,
    log: (line) => seen.logs.push(line),
  });
  return { watch, seen };
}

test("polling is the default only when no webhook secret is set", () => {
  assert.equal(pollingEnabled({}), true);
  assert.equal(pollingEnabled({ CHERT_FACETIME_WEBHOOK_SECRET: "s" }), false);
  assert.equal(pollingEnabled({ CHERT_FACETIME_WEBHOOK_SECRET: "s", CHERT_FACETIME_POLL: "1" }), true);
  assert.equal(pollingEnabled({ CHERT_FACETIME_POLL: "0" }), false);
});

test("readiness is recognized from events or the call record, never from allocation", () => {
  assert.equal(bridgeIsReady([{ type: "bridge_ready" }], null), true);
  assert.equal(bridgeIsReady([{ event: "call.started" }], null), true);
  assert.equal(bridgeIsReady([], { bridge_ready: true }), true);
  assert.equal(bridgeIsReady([{ type: "call.allocated" }, { type: "ringing" }], { status: "active" }), false);
  assert.equal(bridgeIsReady([], null), false);
});

test("the greeting starts once on bridge_ready and the call is recorded as completed", async () => {
  const store = memory(attempt);
  const { watch, seen } = watcher(store, [
    {},
    { events: [{ type: "ringing" }] },
    { events: [{ type: "ringing" }, { type: "bridge_ready" }] },
    { call: { id: "call-1", status: "active" } },
    { call: { id: "call-1", status: "active" } },
    { call: { id: "call-1", status: "ended" } },
  ]);
  const running = watch(attempt);
  assert.equal(watch(attempt), undefined, "one watcher per attempt");
  await running;
  assert.deepEqual(seen.greeted, [["cj-att1", "call-1"]]);
  assert.deepEqual(store.saves, ["answered", "completed"]);
  assert.deepEqual(seen.deleted, ["cj-att1"]);
});

test("a call that is never answered is recorded as unanswered with no greeting", async () => {
  const store = memory(attempt);
  const { watch, seen } = watcher(store, [{}, { call: { id: "call-1", status: "missed" } }]);
  await watch(attempt);
  assert.deepEqual(seen.greeted, []);
  assert.deepEqual(store.saves, ["unanswered"]);
});

test("a webhook that already settled the attempt stops the watcher", async () => {
  const store = memory({ ...attempt, status: "completed" });
  const { watch, seen } = watcher(store, [{ events: [{ type: "bridge_ready" }] }]);
  await watch(attempt);
  assert.deepEqual([seen.greeted, store.saves], [[], []]);
});

test("the call is created against the agent's real participant identity and then watched", async () => {
  const env = { LIVEKIT_URL: "wss://x.livekit.cloud", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s", AGENT_NAME: "calljarvis",
    CHERT_FACETIME_API_KEY: "c", CHERT_PROJECT_ID: "p", CHERT_LINE_ID: "l" };
  const bodies = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes("ListParticipants")) {
      return Response.json({ participants: [
        { identity: "chert-bridge-att-1", tracks: [{ type: "AUDIO", muted: false }] },
        { identity: "agent-AJ_k3", tracks: [{ type: "AUDIO", muted: false }] },
      ] });
    }
    if (String(url).endsWith("/v1/calls")) { bodies.push(JSON.parse(options.body)); return Response.json({ data: { id: "call-9" } }, { status: 201 }); }
    return Response.json({});
  };
  const livekit = createLiveKit(env, fetchImpl);
  const row = { id: "att-1", userId: "u", channel: "facetime", status: "pending", destination: "+15551234567", active: true,
    acknowledged: false, outreachEnabled: true, channels: ["facetime"], sourceKind: "reminder", sourceId: "r", revision: 1 };
  let saved = { ...row };
  const watched = [];
  const deliver = createDeliver({
    store: {
      async getAttempt() { return { ...saved }; },
      async save(next) { saved = { ...saved, ...next }; return saved; },
      async claimSend() { saved.status = "sending"; return { id: "att-1", idempotencyKey: "key-12345", destination: row.destination, channel: "facetime", userId: "u" }; },
    },
    livekit,
    facetime: createFaceTime(env, fetchImpl, livekit),
    imessage: {},
    capabilities: async () => ({ facetime: { live: true }, imessage: { live: false } }),
    watch: (attemptRow) => watched.push(attemptRow.providerId),
  });
  const result = await deliver("att-1");
  assert.equal(result.body.outcome, "accepted");
  assert.equal(bodies[0].remote_participant_identity, "agent-AJ_k3");
  assert.deepEqual(watched, ["call-9"]);
});
