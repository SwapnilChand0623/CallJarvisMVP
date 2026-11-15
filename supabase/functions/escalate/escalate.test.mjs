import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./policy.ts";
import { createHandler } from "./handler.ts";

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

test("overlapping ticks and loss after acceptance reuse the database attempt", async () => {
  const jobs = new Map();
  const calls = [];
  let scans = 0;
  let providerSends = 0;
  const handler = createHandler({
    token: "scheduler", now: () => now,
    candidates: async () => {
      scans++;
      return [fixture({ kind: "home_event", priority: "critical" }),
        fixture({ id: "stale", kind: "check_in" }),
        fixture({ id: "acked", acknowledgedAt: now.toISOString() })];
    },
    claim: async (job) => {
      assert.notEqual(job.id, "acked");
      if (job.id === "stale") return null; // Database rejected an outdated snapshot.
      const key = JSON.stringify(job);
      if (jobs.get(key)?.leased) return null;
      jobs.set(key, { leased: true });
      return { attemptId: key };
    },
    outreach: async (attemptId) => {
      calls.push(attemptId);
      if (calls.length === 1) {
        providerSends++;
        // Keep the claim leased until the fixture advances time below.
        throw new Error("lost response after provider acceptance");
      }
      // Transport reconciles the same attempt without contacting the provider again.
    },
  });
  const run = (token = "scheduler") => handler(new Request("http://localhost/escalate", {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  }));
  assert.equal((await run("invalid")).status, 401);
  assert.equal(scans, 0);
  assert.deepEqual((await Promise.all([run(), run()])).map((r) => r.status).sort(), [200, 502]);
  assert.equal(jobs.size, 1);
  assert.equal(calls.length, 1);
  jobs.get(calls[0]).leased = false;
  assert.equal((await run()).status, 200);
  assert.deepEqual(calls, [calls[0], calls[0]]);
  assert.equal(providerSends, 1);
});
