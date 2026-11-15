// Turns one inbound iMessage into a contract action. Deterministic on purpose: a text that is not clearly one of
// these commands changes nothing and gets a short help reply. Times are never guessed.
import { runAction } from "./actions";
import type { ActionResult, Actor, Deps } from "./types";

type Intent = { action: string; args: Record<string, unknown> } | null;

const UNITS: Record<string, number> = { m: 1, min: 1, mins: 1, minute: 1, minutes: 1, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, d: 1440, day: 1440, days: 1440 };
const DURATION = /(\d{1,4})\s*(minutes?|mins?|m|hours?|hrs?|h|days?|d)\b/;

function minutes(text: string): number | null {
  const match = DURATION.exec(text);
  if (!match) return /\ban hour\b/.test(text) ? 60 : /\bhalf an hour\b/.test(text) ? 30 : null;
  return Number(match[1]) * UNITS[match[2]];
}

/** The reminder a command names after its verb, or undefined to mean the one the message thread is about. */
const named = (rest: string) => rest.replace(/^(the|my|it|that|this)\b/, "").replace(/\b(please|thanks|thank you)\b/g, "").replace(/[.!]+$/, "").trim() || undefined;

export function parseMessage(raw: string): Intent {
  const text = raw.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
  if (!text) return null;
  let match: RegExpExecArray | null;

  // Matched on the original text so the title keeps the user's capitalization. The last " in <duration>" is the time.
  if ((match = /^remind me (?:to )?(.+) in (\d.*|an hour|half an hour)[.!]?$/i.exec(raw.replace(/\s+/g, " ").trim().slice(0, 500)))) {
    const due = minutes(match[2].toLowerCase());
    return due ? { action: "createReminder", args: { title: match[1], dueInMinutes: due } } : null;
  }
  if (text.startsWith("remind me to ")) return null; // a new reminder without a clear duration is never guessed
  if ((match = /^(?:snooze|later|remind me (?:again )?(?:in|later))\b(.*)$/.exec(text))) {
    const due = minutes(match[1]);
    if (!due) return null;
    const rest = match[1].replace(DURATION, "").replace(/\b(for|in|an hour|half an hour)\b/g, "").trim();
    return { action: "snoozeReminder", args: { reminder: named(rest), dueInMinutes: due } };
  }
  if ((match = /^(?:done|did it|finished|complete|completed|mark (?:it )?done)\b(.*)$/.exec(text))) {
    return { action: "completeReminder", args: { reminder: named(match[1].replace(/^ ?(with|:)/, "").trim()) } };
  }
  if (/^(?:list|reminders|what'?s due|what is due|what do i have|what reminders do i have)\b/.test(text)) return { action: "listReminders", args: {} };
  if ((match = /^turn (on|off) (?:the )?(.+?)[.!]?$/.exec(text)) || (match = /^turn (?:the )?(.+?) (on|off)[.!]?$/.exec(text))) {
    const [first, second] = [match[1], match[2]];
    const on = first === "on" || second === "on";
    return { action: "controlDevice", args: { device: first === "on" || first === "off" ? second : first, on } };
  }
  return null;
}

const HELP = "I can take: DONE, SNOOZE 30 MIN, LIST, TURN ON <light>, or REMIND ME TO <task> IN <n> MINUTES.";

function reply(action: string, outcome: ActionResult): string {
  if (!outcome.ok) {
    if (outcome.error.code === "reminder_ambiguous") return `Which one? ${(outcome.error.candidates ?? []).map((item) => item.title).join(", ")}. Reply with DONE or SNOOZE and its name.`;
    if (outcome.error.code === "reminder_required" || outcome.error.code === "reminder_not_found") return "I couldn't tell which reminder you mean. Reply LIST to see them.";
    return "That didn't go through, so nothing changed.";
  }
  const result = outcome.result as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- shaped by the action
  switch (action) {
    case "createReminder": return `Saved: ${result.reminder.title}, ${result.reminder.due}.`;
    case "snoozeReminder": return `Snoozed ${result.reminder.title} until ${result.reminder.due}.`;
    case "completeReminder": return `Marked done: ${result.reminder.title}.`;
    case "controlDevice": return `${result.device.name} is ${result.device.on ? "on" : "off"}${result.simulated ? " (simulated)" : ""}.`;
    case "listReminders": return result.reminders.length
      ? result.reminders.map((item: { title: string; due: string }) => `${item.title}, ${item.due}`).join("\n")
      : "You have no open reminders.";
    default: return "Done.";
  }
}

/** Runs the message for the actor and returns a short text the transport may send back. */
export async function handleMessage(deps: Deps, actor: Actor, raw: unknown) {
  const intent = typeof raw === "string" ? parseMessage(raw) : null;
  if (!intent) return { understood: false, action: null, changed: false, reply: HELP };
  const outcome = await runAction(deps, { ...actor, origin: "imessage" }, intent.action, intent.args);
  return { understood: true, action: intent.action, changed: outcome.ok && intent.action !== "listReminders", reply: reply(intent.action, outcome), outcome };
}
