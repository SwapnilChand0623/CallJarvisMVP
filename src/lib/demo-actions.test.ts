import { test } from "node:test";
import assert from "node:assert/strict";
import { createDemoState, isDemoState } from "./mockData";
import {
  changeReminder,
  isQuietTime,
  previewOutreach,
} from "@/features/demo-actions";
import { mapReminderRecord, reminderWrite } from "./supabase/reminders";
const now = new Date("2026-11-14T18:00:00Z");
test("acknowledgment is independent from completion; rescheduling invalidates acknowledgment", () => {
  let s = createDemoState(now);
  s = changeReminder(s, "r1", { type: "acknowledge" }, now);
  assert.equal(s.reminders[0].status, "pending");
  assert.equal(s.reminders[0].acknowledgedAt, now.toISOString());
  s = changeReminder(
    s,
    "r1",
    {
      type: "edit",
      title: "Take medication",
      dueAt: "2026-11-15T18:00:00Z",
      priority: "critical",
    },
    now,
  );
  assert.equal(s.reminders[0].acknowledgedAt, null);
  assert.equal(s.reminders[0].status, "pending");
  assert.equal(s.activities[0].reminderId, "r1");
  assert.ok(isDemoState(s));
});
test("snooze, complete, reopen and cancel preserve lifecycle semantics", () => {
  let s = createDemoState(now);
  s = changeReminder(s, "r1", { type: "snooze", minutes: 15 }, now);
  assert.equal(s.reminders[0].status, "snoozed");
  assert.equal(s.reminders[0].dueAt, "2026-11-14T18:15:00.000Z");
  s = changeReminder(s, "r1", { type: "complete" }, now);
  assert.equal(s.reminders[0].status, "completed");
  s = changeReminder(s, "r1", { type: "reopen" }, now);
  assert.equal(s.reminders[0].status, "pending");
  s = changeReminder(s, "r1", { type: "cancel" }, now);
  assert.equal(s.reminders[0].status, "canceled");
});
test("quiet hours cross midnight in the chosen time zone", () => {
  const p = createDemoState(now).preferences;
  assert.equal(isQuietTime(p, new Date("2026-11-15T05:00:00Z")), true);
  assert.equal(isQuietTime(p, now), false);
  assert.equal(
    isQuietTime({ ...p, quietStart: "08:00", quietEnd: "08:00" }, now),
    false,
  );
});
test("outreach requires consent, suppresses duplicates, honors acknowledgment and call caps", () => {
  let s = createDemoState(now);
  assert.equal(previewOutreach(s, "r1", now).deliveries[0].status, "blocked");
  s.preferences = {
    ...s.preferences,
    outreach: true,
    iMessage: true,
    faceTime: true,
    escalation: true,
    maxCalls: 1,
  };
  s = previewOutreach(s, "r1", now);
  assert.equal(s.deliveries[0].channel, "iMessage");
  assert.equal(previewOutreach(s, "r1", now).deliveries[0].channel, "FaceTime");
  s = previewOutreach(s, "r1", now);
  const count = s.deliveries.length;
  assert.equal(previewOutreach(s, "r1", now).deliveries.length, count);
  const ack = changeReminder(
    createDemoState(now),
    "r1",
    { type: "acknowledge" },
    now,
  );
  ack.preferences = s.preferences;
  assert.equal(previewOutreach(ack, "r1", now).deliveries[0].status, "blocked");
  const next = {
    ...s,
    reminders: [
      ...s.reminders,
      { ...s.reminders[0], id: "other", priority: "critical" as const },
    ],
  };
  assert.match(previewOutreach(next, "other", now).deliveries[0].reason, /cap/);
});
test("Supabase mapping rejects records from another owner and preserves all four priorities", () => {
  const owner = "00000000-0000-4000-8000-000000000001";
  const r = {
    ...createDemoState(now).reminders[0],
    id: "00000000-0000-4000-8000-000000000002",
    priority: "critical" as const,
  };
  const record = reminderWrite(r, owner);
  assert.equal(mapReminderRecord(record, owner).priority, "critical");
  assert.throws(() => mapReminderRecord(record, "different-owner"));
});
test("malformed persisted data never passes validation", () => {
  assert.equal(
    isDemoState({ ...createDemoState(now), preferences: {} }),
    false,
  );
  assert.equal(
    isDemoState({ ...createDemoState(now), homeEvents: [null] }),
    false,
  );
});

import { parseConversation } from "@/features/conversation";
test("simulated conversations clarify ambiguous names and resolve lifecycle requests", () => {
  const s = createDemoState(now);
  const change = parseConversation(
    "snooze Call Mom for 15 minutes",
    s.reminders,
    now,
  );
  assert.equal(change.kind, "update");
  if (change.kind === "update")
    assert.deepEqual(change.action, { type: "snooze", minutes: 15 });
  const ack = parseConversation("acknowledge Call Mom", s.reminders, now);
  if (ack.kind === "update") assert.equal(ack.action.type, "acknowledge");
  assert.throws(() => parseConversation("complete Unknown", s.reminders, now));
  assert.throws(() =>
    parseConversation(
      "complete Call Mom",
      [...s.reminders, { ...s.reminders[2], id: "duplicate" }],
      now,
    ),
  );
});
