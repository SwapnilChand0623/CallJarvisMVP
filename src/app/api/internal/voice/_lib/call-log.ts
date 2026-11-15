// Turns what happens on a call into short lines for the Logs page. Lines describe actions and outcomes only:
// no audio and no transcript is recorded, and a saved note's content is never repeated here.
import type { ActionResult } from "./types";

type Result = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- shaped by each action

const ATTEMPTED: Record<string, string> = {
  listReminders: "list reminders", createReminder: "create a reminder", updateReminder: "change a reminder", snoozeReminder: "snooze a reminder",
  acknowledgeReminder: "acknowledge a reminder", completeReminder: "complete a reminder", cancelReminder: "cancel a reminder",
  getHomeStatus: "check the home", controlDevice: "switch a device", setHomeMode: "change the home mode",
  acknowledgeHomeEvent: "acknowledge a home alert", saveMemory: "save a note", scheduleCheckIn: "schedule a call back",
};

/** One line for the timeline, or null for an action that is not worth a line. */
export function describeAction(name: string, outcome: ActionResult): string | null {
  if (!outcome.ok) {
    const what = ATTEMPTED[name];
    if (!what) return null;
    // A question back to the caller is part of the conversation, not a failure worth logging.
    if (["time_required", "reminder_required", "reminder_ambiguous", "consent_required"].includes(outcome.error.code)) return null;
    return `Tried to ${what}, but it did not go through (${outcome.error.code.replace(/_/g, " ")}).`;
  }
  const r = outcome.result as Result;
  switch (name) {
    case "listReminders": return `Asked what reminders are ${r.filter} (${r.total}).`;
    case "createReminder": return `Created the reminder “${r.reminder.title}”, due ${r.reminder.due}, ${r.reminder.priority} priority.`;
    case "updateReminder": return `Changed the reminder “${r.reminder.title}”: now due ${r.reminder.due}, ${r.reminder.priority} priority.`;
    case "snoozeReminder": return `Snoozed “${r.reminder.title}” until ${r.reminder.due}.`;
    case "acknowledgeReminder": return r.alreadyAcknowledged ? null : `Acknowledged “${r.reminder.title}”.`;
    case "completeReminder": return r.alreadyCompleted ? null : `Marked “${r.reminder.title}” done.`;
    case "cancelReminder": return `Canceled “${r.reminder.title}”.`;
    case "getHomeStatus": return `Asked about the home (set to ${r.mode === "away" ? "Away" : "Home"}).`;
    case "controlDevice": return `Turned the ${r.device.name} ${r.device.on ? "on" : "off"}${r.simulated ? " (simulated)" : ""}.`;
    case "setHomeMode": return `Set the home to ${r.mode === "away" ? "Away" : "Home"}.`;
    case "acknowledgeHomeEvent": return r.alreadyAcknowledged ? null : `Acknowledged the alert: ${r.event.description}.`;
    case "saveMemory": return "Saved a note for future calls.";
    case "scheduleCheckIn": return `Asked for a call back, ${r.checkIn.due}.`;
    default: return null;
  }
}

/** Why Jarvis placed a call, from the session context. */
export function describeReason(context: { focusReminder?: { title: string; due: string; priority: string } | null; focusEvent?: { description: string } | null }): string {
  if (context.focusReminder) return `The ${context.focusReminder.priority} reminder “${context.focusReminder.title}” was due ${context.focusReminder.due}.`;
  if (context.focusEvent) return `${context.focusEvent.description}.`;
  return "You asked Jarvis to call you back.";
}
