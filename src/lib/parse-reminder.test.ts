import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReminderRequest } from "./parse-reminder";
const now = new Date("2026-11-14T12:00:00Z");
test("relative language resolves minutes, hours, and days with punctuation", () => {
  for (const [request, title, dueAt] of [
    [
      "Remind me to call Mom in 30 minutes.",
      "call Mom",
      "2026-11-14T12:30:00.000Z",
    ],
    [
      "remind me to check in with Sam in 2 hours",
      "check in with Sam",
      "2026-11-14T14:00:00.000Z",
    ],
    ["Remind me to pay rent in 1 day!", "pay rent", "2026-11-15T12:00:00.000Z"],
  ])
    assert.deepEqual(parseReminderRequest(request, now), { title, dueAt });
});
test("ambiguous, zero, negative, excessive and fractional times need clarification", () => {
  for (const request of [
    "Call Mom tomorrow",
    "Remind me to call Mom in 0 minutes",
    "Remind me to call Mom in -1 hour",
    "Remind me to call Mom in 31 days",
    "Remind me to call Mom in 1.5 hours",
  ])
    assert.throws(() => parseReminderRequest(request, now));
});
