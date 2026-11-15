import assert from "node:assert/strict";
import test from "node:test";
import { buildCallLog } from "./server/logs";
import type { CallAttempt, CallEvent } from "../app/api/internal/voice/_lib/types";

const at = (minute: number, second = 0) => new Date(Date.UTC(2026, 10, 15, 18, minute, second)).toISOString();
const attempt = (patch: Partial<CallAttempt>): CallAttempt =>
  ({ id: "a1", stage: "initial", status: "completed", errorCode: null, simulated: false, createdAt: at(1), outcomeAt: at(4), about: null, ...patch });
const line = (patch: Partial<CallEvent>): CallEvent =>
  ({ at: at(2), attemptId: null, callId: null, event: "action", summary: "", direction: "inbound", ...patch });

test("logs: a call Jarvis placed shows why, the outcome and an ordered timeline", () => {
  const [call] = buildCallLog(
    [attempt({ about: { kind: "home_event", text: "The gas stove appears to be on while the home is set to Away", at: at(0, 55), priority: "critical" } })],
    [
      line({ attemptId: "a1", event: "call_ended", summary: "The call ended.", at: at(3, 59), direction: "outbound" }),
      line({ attemptId: "a1", event: "call_ended", summary: "The call ended.", at: at(4), direction: "outbound" }),
      line({ attemptId: "a1", event: "action", summary: "Turned the Kitchen stove off (simulated).", at: at(3), direction: "outbound" }),
      line({ attemptId: "a1", event: "answered", summary: "You answered.", at: at(2), direction: "outbound" }),
      line({ attemptId: "a1", event: "call_started", summary: "repeat of the reason", at: at(1, 5), direction: "outbound" }),
      line({ attemptId: "a1", event: "call_placed", summary: "Jarvis started a FaceTime Audio call to you.", at: at(1, 10), direction: "outbound" }),
    ]);
  assert.equal(call.direction, "outbound");
  assert.equal(call.why, "The gas stove appears to be on while the home is set to Away.");
  assert.deepEqual(call.outcome, { label: "Completed", tone: "good" });
  assert.equal(call.critical, true);
  assert.deepEqual(call.timeline.map((entry) => entry.text), [
    "Home alert recorded: The gas stove appears to be on while the home is set to Away.",
    "Jarvis decided to call you.",
    "Jarvis started a FaceTime Audio call to you.",
    "You answered.",
    "Turned the Kitchen stove off (simulated).",
    "The call ended.",
  ]);
});

test("logs: reminders, call backs, missed and failed calls each read plainly", () => {
  const calls = buildCallLog([
    attempt({ id: "r", createdAt: at(10), status: "unanswered", about: { kind: "reminder", text: "Take meds", at: at(10), priority: "critical" } }),
    attempt({ id: "f", createdAt: at(12), stage: "fallback", status: "answered", about: { kind: "reminder", text: "Take meds", at: at(10), priority: "critical" } }),
    attempt({ id: "c", createdAt: at(20), status: "failed", errorCode: "provider_rejected", about: { kind: "check_in", text: "", at: at(20), priority: null } }),
  ], [
    line({ attemptId: "r", event: "call_ended", summary: "The call ended.", at: at(10, 40), direction: "outbound" }),
    line({ attemptId: "r", event: "call_ended", summary: "You did not answer.", at: at(10, 45), direction: "outbound" }),
  ]);
  assert.deepEqual(calls.map((call) => call.id), ["c", "f", "r"], "newest first");
  const [callBack, retry, missed] = calls;
  assert.equal(callBack.why, "You asked Jarvis to call you back.");
  assert.equal(callBack.outcome.label, "Failed");
  assert.equal(callBack.timeline.at(-1)?.text, "The call could not be placed (provider rejected).");
  assert.equal(retry.timeline.some((entry) => entry.text === "The earlier call was not answered, so Jarvis called again."), true);
  assert.equal(missed.why, "Your critical reminder “Take meds” was due.");
  assert.deepEqual(missed.outcome, { label: "Not answered", tone: "bad" });
  assert.equal(missed.timeline.at(-1)?.text, "You did not answer.");
  assert.equal(missed.timeline.filter((entry) => /ended|answer/.test(entry.text)).length, 1, "one closing line");
});

test("logs: calls the user placed are grouped by call", () => {
  const calls = buildCallLog([], [
    line({ callId: "room-b", event: "call_started", summary: "You called Jarvis.", at: at(30) }),
    line({ callId: "room-a", event: "call_started", summary: "You called Jarvis.", at: at(5) }),
    line({ callId: "room-a", event: "action", summary: "Asked about the home (set to Away).", at: at(6) }),
    line({ callId: "room-a", event: "call_ended", summary: "The call ended.", at: at(7) }),
  ]);
  assert.deepEqual(calls.map((call) => [call.id, call.direction, call.why, call.outcome.label]),
    [["room-b", "inbound", "You called Jarvis.", "Answered"], ["room-a", "inbound", "You called Jarvis.", "Completed"]]);
  assert.deepEqual(calls[1].timeline.map((entry) => entry.text), ["Jarvis answered.", "Asked about the home (set to Away).", "The call ended."]);
});
