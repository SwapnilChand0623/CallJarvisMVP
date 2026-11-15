import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./policy.ts";
import { createServer } from "node:http";
import { once } from "node:events";

const now = new Date("2026-11-15T06:30:00Z"); // 00:30 in Chicago
const fixture = (patch = {}, policy = {}) => ({
  id: "source", kind: "reminder", revision: "1", priority: "high",
  dueAt: "2026-11-15T06:28:00Z", active: true, acknowledgedAt: null,
  attempts: [], ...patch,
  policy: {
    enabled: true, channels: ["imessage", "facetime"], timezone: "America/Chicago",
    quietHours: null, callsRemaining: 1, graceSeconds: 60, lowMessage: false,
    mediumFollowUpSeconds: null, highCallSeconds: 30, criticalChannel: "facetime",
    criticalFallback: { channel: "imessage", delaySeconds: 30 }, ...policy,
  },
});
const message = { channel: "imessage", stage: "initial" };
const call = { channel: "facetime", stage: "escalation" };
const accepted = { ...message, status: "accepted", outcomeAt: "2026-11-15T06:29:00Z" };

test("policy gates initial messages and delayed follow-ups", () => {
  assert.deepEqual(decide(fixture({ priority: "low" }), now), []);
  assert.deepEqual(decide(fixture({ priority: "low" }, { lowMessage: true }), now), [message]);
  assert.deepEqual(decide(fixture({}, { graceSeconds: 121 }), now), []);
  assert.deepEqual(decide(fixture({}, { enabled: false }), now), []);
  assert.deepEqual(decide(fixture({}, { channels: [] }), now), []);
  assert.deepEqual(decide(fixture({ acknowledgedAt: now.toISOString() }), now), []);
  assert.deepEqual(decide(fixture({}, { quietHours: { start: "23:00", end: "07:00" } }), now), []);
  assert.deepEqual(decide(fixture(), now), [message]);
  assert.deepEqual(decide(fixture({ attempts: [accepted] }, { highCallSeconds: 61 }), now), []);
  assert.deepEqual(decide(fixture({ attempts: [accepted] }, { callsRemaining: 0 }), now), []);
  assert.deepEqual(decide(fixture({ attempts: [accepted] }), now), [call]);
  assert.deepEqual(decide(fixture({ priority: "medium", attempts: [accepted] },
    { mediumFollowUpSeconds: 60 }), now), [{ channel: "imessage", stage: "follow_up" }]);
});

test("critical home event alerts immediately; only definite unanswered triggers fallback", () => {
  const critical = { kind: "home_event", priority: "critical", dueAt: now.toISOString() };
  const initial = { channel: "facetime", stage: "initial" };
  assert.deepEqual(decide(fixture(critical), now), [initial]);
  assert.deepEqual(decide(fixture({ ...critical, attempts: [{ ...initial, status: "unknown" }] }), now), [initial]);
  assert.deepEqual(decide(fixture({ ...critical, attempts: [
    { ...initial, status: "unanswered", outcomeAt: accepted.outcomeAt },
  ] }), now), [{ channel: "imessage", stage: "fallback" }]);
});

test("Edge entry point hands off one attempt across overlapping runs and reconciles a lost response", async (t) => {
  const attemptId = "4f2bbcc3-a9c1-4a19-bbdb-69a1ad9a7320";
  const jobs = new Map();
  const handoffs = [];
  const providerSends = [];
  const failures = [];
  let scans = 0;
  const dueAt = new Date(Date.now() - 120_000).toISOString();
  const candidates = [
    fixture({ kind: "home_event", priority: "critical", dueAt }),
    fixture({ id: "stale", kind: "check_in", dueAt }),
    fixture({ id: "acked", acknowledgedAt: dueAt, dueAt }),
  ];
  const server = createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      const reply = (data) => {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(data));
      };
      assert.equal(request.method, "POST");
      if (request.url === "/api/internal/outreach") {
        assert.equal(request.headers.authorization, "Bearer outreach-fixture");
        assert.equal(request.headers.apikey, undefined);
        assert.deepEqual(payload, { attemptId });
        handoffs.push(payload.attemptId);
        if (providerSends.length === 0) {
          providerSends.push(payload.attemptId);
          jobs.values().next().value.status = "unknown";
          // The provider accepted the send, but the HTTP response never reached Edge.
          response.destroy();
          return;
        }
        jobs.values().next().value.status = "simulated";
        return reply({ attemptId, outcome: "simulated" });
      }

      assert.equal(request.headers.apikey, "db-fixture");
      assert.equal(request.headers.authorization, "Bearer db-fixture");
      if (request.url === "/rest/v1/rpc/list_escalation_candidates") {
        scans++;
        assert.deepEqual(payload, { p_limit: 20 });
        candidates[0].attempts = Array.from(jobs.values()).map(({ status }) => ({
          channel: "facetime", stage: "initial", status, outcomeAt: null,
        }));
        return reply(candidates);
      }

      assert.equal(request.url, "/rest/v1/rpc/claim_escalation_attempt");
      if (payload.p_job.id === "stale") return reply(null);
      assert.deepEqual(payload, { p_job: {
        kind: "home_event", id: "source", revision: "1", channel: "facetime", stage: "initial",
      } });
      const key = JSON.stringify(payload.p_job);
      const existing = jobs.get(key);
      if (existing?.leased) return reply(null);
      if (existing) existing.leased = true;
      else jobs.set(key, { leased: true, status: "pending" });
      return reply({ attemptId });
    } catch (error) {
      failures.push(error);
      response.writeHead(500).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));

  // Supply Deno's environment and serve APIs while exercising index.ts and real fetch.
  const origin = `http://127.0.0.1:${server.address().port}`;
  let handler;
  globalThis.Deno = {
    env: new Map(Object.entries({
      SUPABASE_URL: origin,
      SUPABASE_SERVICE_ROLE_KEY: "db-fixture",
      OUTREACH_ORIGIN: origin,
      OUTREACH_TOKEN: "outreach-fixture",
      ESCALATE_TOKEN: "scheduler-fixture",
    })),
    serve: (run) => { handler = run; },
  };
  t.after(() => { delete globalThis.Deno; });
  await import("./index.ts");

  const run = (token = "scheduler-fixture") => handler(new Request(`${origin}/escalate`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  }));
  assert.equal((await run("invalid")).status, 401);
  assert.equal(scans, 0);
  const overlapping = await Promise.all([run(), run()]);
  assert.deepEqual(overlapping.map((r) => r.status).sort(), [200, 502]);
  assert.equal(jobs.size, 1);
  assert.deepEqual(handoffs, [attemptId]);

  jobs.values().next().value.leased = false;
  const retry = await run();
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { scanned: 3, claimed: 1, handedOff: 1, errors: 0 });
  assert.equal((await run()).status, 200);
  assert.deepEqual(handoffs, [attemptId, attemptId]);
  assert.deepEqual(providerSends, [attemptId]);
  assert.deepEqual(failures, []);
});
