import test from "node:test";
import assert from "node:assert/strict";
import { reminderWrite, mapReminderRecord } from "./supabase/reminders";
import { makeReminder } from "./mockData";
test("connected snooze preserves the original due date and clears on completion", () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const reminder = makeReminder(
    "Water plants",
    "2026-11-16T09:00:00Z",
    "medium",
    "iMessage",
  );
  const snoozed = {
    ...reminder,
    status: "snoozed" as const,
    snoozedUntil: "2026-11-16T09:15:00.000Z",
  };
  const row = reminderWrite(snoozed, owner);
  assert.equal(row.due_at, reminder.dueAt);
  assert.equal(row.snoozed_until, snoozed.snoozedUntil);
  assert.equal(
    mapReminderRecord(row, owner).snoozedUntil,
    snoozed.snoozedUntil,
  );
  assert.equal(
    reminderWrite({ ...snoozed, status: "completed" }, owner).snoozed_until,
    null,
  );
});
