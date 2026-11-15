import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDemoState,
  isDemoState,
  isOverdue,
  makeReminder,
} from "./mockData";
test("demo data includes a missed priority task and completed reminder", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  const state = createDemoState(now);
  assert.ok(isDemoState(state));
  assert.equal(
    state.reminders.filter((r) => isOverdue(r, now.getTime())).length,
    1,
  );
  assert.equal(
    state.reminders.filter((r) => r.status === "completed").length,
    1,
  );
});
test("completed reminders never appear overdue", () => {
  const r = createDemoState().reminders[0];
  assert.equal(
    isOverdue({ ...r, status: "completed" }, Date.now() + 1e9),
    false,
  );
});
test("creation validates title and date and preserves selected channel", () => {
  assert.throws(() => makeReminder("  ", "invalid", "normal", "FaceTime"));
  assert.throws(() =>
    makeReminder("Call Mom", "invalid", "normal", "FaceTime"),
  );
  const r = makeReminder(
    " Call Mom ",
    "2026-11-15T13:00:00Z",
    "high",
    "iMessage",
  );
  assert.equal(r.title, "Call Mom");
  assert.equal(r.channel, "iMessage");
  assert.equal(r.status, "pending");
});
test("invalid persisted data is rejected", () => {
  assert.equal(isDemoState(null), false);
  assert.equal(
    isDemoState({ ...createDemoState(), reminders: [{ title: "bad" }] }),
    false,
  );
  assert.equal(isDemoState({ ...createDemoState(), preferences: {} }), false);
});
