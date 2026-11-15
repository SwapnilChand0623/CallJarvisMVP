import assert from "node:assert/strict";
import test from "node:test";
import { createInbound, inboundRoomName } from "./inbound.mjs";
import { createLiveKit } from "./providers.mjs";
import { createFaceTimeWebhook } from "./webhooks.mjs";

const env = { LIVEKIT_URL: "wss://x.livekit.cloud", LIVEKIT_API_KEY: "APIkey", LIVEKIT_API_SECRET: "secret", AGENT_NAME: "calljarvis", CHERT_LINE_ID: "line-1" };
const incoming = (overrides = {}) => ({
  event_id: "evt-1", type: "call.incoming", created_at: "2026-11-15T09:00:00Z",
  data: { call_id: "c7161775-cd89-44e4-b1b1-93cc9c346b21", line_id: "line-1", media: { audio: true, video: false }, from_handle_hash: null, ...overrides },
});

function setup(script = [{}]) {
  const seen = { twirp: [], greeted: [], logs: [] };
  const fetchImpl = async (url, options) => {
    seen.twirp.push({ method: String(url).split("/").pop(), body: JSON.parse(options.body) });
    return Response.json({});
  };
  const real = createLiveKit(env, fetchImpl);
  let tick = 0;
  const step = () => script[Math.min(tick, script.length - 1)];
  const inbound = createInbound({
    env,
    livekit: { ...real, activateGreeting: async (room, id) => { seen.greeted.push([room, id]); } },
    facetime: { async events() { return step().events ?? []; }, async read() { return { call: step().call ?? { id: "c", status: "ringing" } }; } },
    sleep: async () => { tick += 1; },
    maxMs: 60_000,
    log: (line) => seen.logs.push(line),
  });
  return { inbound, seen };
}

test("an incoming call is accepted into a new room with the worker dispatched", async () => {
  const { inbound, seen } = setup([{}, { events: [{ type: "bridge_ready" }] }, { call: { id: "c", status: "ended" } }]);
  const { decision, followed } = await inbound(incoming());
  const room = inboundRoomName(incoming().data.call_id);
  assert.equal(room, "cj-in-c7161775cd8944e4b1b193cc9c346b21");
  assert.deepEqual({ ...decision, participant_token: "x" },
    { action: "accept", livekit_url: env.LIVEKIT_URL, participant_token: "x", remote_participant_identity: "calljarvis" });

  const claims = JSON.parse(Buffer.from(decision.participant_token.split(".")[1], "base64url").toString());
  assert.equal(claims.video.room, room);
  assert.deepEqual([claims.video.roomJoin, claims.video.canPublish, claims.video.canSubscribe], [true, true, true]);
  assert.notEqual(claims.sub, decision.remote_participant_identity);
  assert.ok(claims.exp - claims.nbf <= 7200 && Number.isInteger(claims.exp) && Number.isInteger(claims.nbf));

  assert.deepEqual(seen.twirp.slice(0, 2).map((call) => call.method), ["CreateRoom", "CreateDispatch"]);
  assert.equal(seen.twirp[1].body.agent_name, "calljarvis");
  assert.deepEqual(JSON.parse(seen.twirp[1].body.metadata), { chert_call: incoming().data.call_id, inbound: true });

  await followed;
  assert.deepEqual(seen.greeted, [[room, incoming().data.call_id]], "greeting cued once, on bridge_ready");
  assert.equal(seen.twirp.at(-1).method, "DeleteRoom");
});

test("a repeated event for a live call does not dispatch a second worker", async () => {
  const { inbound, seen } = setup([{}, {}, { call: { id: "c", status: "ended" } }]);
  const first = await inbound(incoming());
  const second = await inbound(incoming());
  assert.equal(second.decision.action, "accept");
  assert.equal(second.followed, undefined);
  await first.followed;
  assert.equal(seen.twirp.filter((call) => call.method === "CreateDispatch").length, 1);
});

test("calls that cannot be served are declined", async () => {
  const { inbound, seen } = setup();
  assert.deepEqual((await inbound(incoming({ line_id: "someone-elses-line" }))).decision, { action: "decline" });
  assert.deepEqual((await inbound(incoming({ call_id: "" }))).decision, { action: "decline" });
  assert.deepEqual((await inbound({ type: "call.incoming" })).decision, { action: "decline" });
  assert.deepEqual((await inbound(incoming({ media: { audio: false, video: true } }))).decision, { action: "decline" });
  assert.equal(seen.twirp.length, 0);

  const failing = createInbound({ env, livekit: { agentName: "a", openRoom: async () => { throw Object.assign(new Error("x"), { code: "livekit_failed" }); }, deleteRoom: async () => {} }, facetime: {}, log: () => {} });
  assert.deepEqual((await failing(incoming())).decision, { action: "decline" });
  const unconfigured = createInbound({ env: { CHERT_LINE_ID: "line-1" }, livekit: {}, facetime: {}, log: () => {} });
  assert.deepEqual((await unconfigured(incoming())).decision, { action: "decline" });
});

function webhook(options) {
  const decisions = [];
  const handler = createFaceTimeWebhook({
    store: { claimEvent: async () => { throw new Error("call.incoming must not touch the store"); } },
    livekit: {},
    inbound: async (event) => { decisions.push(event.data.call_id); return { decision: { action: "accept" } }; },
    ...options,
  });
  const post = (url) => handler(new Request(url, { method: "POST", body: JSON.stringify(incoming()) }));
  return { post, decisions };
}

test("the webhook answers call.incoming only for a caller that holds the URL key", async () => {
  const { post, decisions } = webhook({ urlKey: "k-123" });
  assert.equal((await post("https://x/api/webhooks/chert/facetime")).status, 401);
  assert.equal((await post("https://x/api/webhooks/chert/facetime?key=wrong")).status, 401);
  const accepted = await post("https://x/api/webhooks/chert/facetime?key=k-123");
  assert.deepEqual([accepted.status, await accepted.json()], [200, { action: "accept" }]);
  assert.equal((await post("https://x/api/webhooks/chert/facetime/k-123")).status, 200, "key as the last path segment");
  assert.equal((await post("https://x/api/webhooks/chert/facetime/nope")).status, 401);
  assert.equal(decisions.length, 2);
  assert.equal((await webhook({}).post("https://x/api/webhooks/chert/facetime?key=")).status, 401, "no key configured refuses everything");
  const off = createFaceTimeWebhook({ store: {}, livekit: {}, urlKey: "k" });
  const declined = await off(new Request("https://x/?key=k", { method: "POST", body: JSON.stringify(incoming()) }));
  assert.deepEqual(await declined.json(), { action: "decline" });
});
