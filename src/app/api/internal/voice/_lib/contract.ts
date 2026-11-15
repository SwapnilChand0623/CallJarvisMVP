// The tool contract shared by voice (agent/) and iMessage (src/lib/server/chert). One definition per authorized
// action: the voice worker receives this list from session.start and registers each entry as a model tool.
// Schemas stay within the JSON Schema subset Gemini function declarations accept.

export type ActionSpec = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, Record<string, unknown>>; required?: string[] };
};

const reminderRef = {
  type: "string",
  description: "The reminder's id from listReminders, or a few words of its title. Omit to mean the reminder this call is about.",
};
const dueLocal = {
  type: "string",
  description: "Local date and time in the user's time zone as YYYY-MM-DDTHH:mm (24-hour). Use for clock times such as 'tomorrow at 9'.",
};
const dueInMinutes = { type: "number", description: "Minutes from now. Use for relative times such as 'in two hours'." };
const priority = { type: "string", enum: ["low", "medium", "high", "critical"], description: "Defaults to medium when the user gives none." };

export const ACTIONS: ActionSpec[] = [
  {
    name: "listReminders",
    description: "List the user's reminders. Call this before answering what is due or pending.",
    parameters: { type: "object", properties: { filter: { type: "string", enum: ["open", "overdue", "today", "completed"], description: "Defaults to open." } } },
  },
  {
    name: "createReminder",
    description: "Save a new reminder. Only call once the user has given a specific time; if the time is vague, ask first. Pass exactly one of dueLocal or dueInMinutes.",
    parameters: { type: "object", properties: { title: { type: "string", description: "Short task name in the user's words." }, dueLocal, dueInMinutes, priority }, required: ["title"] },
  },
  {
    name: "updateReminder",
    description: "Edit a reminder: rename it, change its priority, or reschedule it to a new time. Rescheduling clears its acknowledgment so it notifies again.",
    parameters: { type: "object", properties: { reminder: reminderRef, title: { type: "string" }, priority, dueLocal, dueInMinutes } },
  },
  {
    name: "snoozeReminder",
    description: "Postpone a reminder the user wants to be nudged about again later. Pass exactly one of dueLocal or dueInMinutes.",
    parameters: { type: "object", properties: { reminder: reminderRef, dueLocal, dueInMinutes } },
  },
  {
    name: "acknowledgeReminder",
    description: "Record that the user has heard a reminder and will handle it. This stops follow-up contact but does not mark the task done.",
    parameters: { type: "object", properties: { reminder: reminderRef } },
  },
  {
    name: "completeReminder",
    description: "Mark a reminder done because the user says the task is finished.",
    parameters: { type: "object", properties: { reminder: reminderRef } },
  },
  {
    name: "cancelReminder",
    description: "Cancel a reminder the user no longer wants. Confirm with the user before calling.",
    parameters: { type: "object", properties: { reminder: reminderRef } },
  },
  {
    name: "getHomeStatus",
    description: "Read the user's authorized lights and recent home events. Event labels are observations, not confirmed facts.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "controlLight",
    description: "Turn one of the user's authorized lights on or off. Requires an explicit on or off request.",
    parameters: { type: "object", properties: { device: { type: "string", description: "The light's id or name from getHomeStatus." }, on: { type: "boolean" } }, required: ["device", "on"] },
  },
  {
    name: "saveMemory",
    description: "Save a short note for future calls. Only after the user has explicitly agreed, in this conversation, to save this specific note.",
    parameters: { type: "object", properties: { content: { type: "string", description: "The note, under 300 characters, as agreed with the user." }, userConsented: { type: "boolean", description: "True only if the user said yes to saving this note." } }, required: ["content", "userConsented"] },
  },
  {
    name: "scheduleCheckIn",
    description: "Schedule a one-off check-in contact. Only after the user has explicitly asked for or agreed to it. Pass exactly one of dueLocal or dueInMinutes.",
    parameters: { type: "object", properties: { topic: { type: "string", description: "What to check in about." }, dueLocal, dueInMinutes, userConsented: { type: "boolean", description: "True only if the user said yes to this check-in." } }, required: ["userConsented"] },
  },
];

export const ACTION_NAMES = ACTIONS.map((action) => action.name);
