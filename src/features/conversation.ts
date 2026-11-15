import { type Reminder } from "@/lib/mockData";
import { parseReminderRequest } from "@/lib/parse-reminder";
import { type ReminderAction } from "./demo-actions";
export type ConversationChange =
  | { kind: "create"; title: string; dueAt: string }
  | {
      kind: "update";
      id: string;
      title: string;
      dueAt: string;
      action: ReminderAction;
      description: string;
    };
export function parseConversation(
  request: string,
  reminders: Reminder[],
  now: Date,
): ConversationChange {
  if (/^remind me to /i.test(request.trim()))
    return { kind: "create", ...parseReminderRequest(request, now) };
  const match = request
    .trim()
    .match(
      /^(acknowledge|complete|snooze|reschedule)\s+(.+?)(?:\s+(?:for|in)\s+(\d+\s+(?:minutes?|hours?|days?)))?[.!]?$/i,
    );
  if (!match)
    throw new Error(
      "Try “Remind me to call Mom in 30 minutes,” “acknowledge Call Mom,” or “snooze Call Mom for 15 minutes.”",
    );
  const matches = reminders.filter(
    (r) =>
      r.title.toLowerCase() === match[2].trim().toLowerCase() &&
      !["completed", "canceled"].includes(r.status),
  );
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "More than one reminder matches. Use the dashboard to choose the right one."
        : "No active reminder matches that exact title. Use the title shown in JarvisRemind.",
    );
  const r = matches[0];
  const intent = match[1].toLowerCase();
  let action: ReminderAction;
  let dueAt = r.dueAt;
  if (intent === "acknowledge" || intent === "complete") {
    if (match[3])
      throw new Error("Acknowledgment and completion do not take a time.");
    action = { type: intent };
  } else {
    if (!match[3])
      throw new Error("Include a relative time, such as “in 30 minutes.”");
    dueAt = parseReminderRequest(
      `Remind me to ${r.title} in ${match[3]}`,
      now,
    ).dueAt;
    action =
      intent === "snooze"
        ? {
            type: "snooze",
            minutes: (Date.parse(dueAt) - now.getTime()) / 60000,
          }
        : { type: "edit", title: r.title, dueAt, priority: r.priority };
  }
  return {
    kind: "update",
    id: r.id,
    title: r.title,
    dueAt,
    action,
    description: intent,
  };
}
