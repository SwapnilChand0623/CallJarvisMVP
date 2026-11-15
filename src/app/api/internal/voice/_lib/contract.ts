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
    description: "Postpone a reminder the user wants to be nudged about again later. It keeps its original due time. Pass exactly one of dueLocal or dueInMinutes for when to nudge again.",
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
    description: "Read whether the home is set to Home or Away, the user's authorized devices and recent home events. Event labels are observations, not confirmed facts.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "controlDevice",
    description: "Turn one of the user's authorized devices on or off, such as a light or the stove. Requires an explicit on or off request.",
    parameters: { type: "object", properties: { device: { type: "string", description: "The device's id or name from getHomeStatus, for example 'porch light' or 'stove'." }, on: { type: "boolean" } }, required: ["device", "on"] },
  },
  {
    name: "setHomeMode",
    description: "Set the home to Away when the user is leaving, or Home when they are back. While Away, home events place a call.",
    parameters: { type: "object", properties: { mode: { type: "string", enum: ["home", "away"] } }, required: ["mode"] },
  },
  {
    name: "showCamera",
    description: "Put the live home camera on this FaceTime Video call, or take it off again. Use it when the user asks to see the camera, the kitchen or the house. The picture appears a few seconds later if the home camera is switched on. You cannot see the video yourself.",
    parameters: { type: "object", properties: { show: { type: "boolean", description: "true to show the camera, false to go back to your avatar." } }, required: ["show"] },
  },
  {
    name: "acknowledgeHomeEvent",
    description: "Record that the user has heard about a home event. With no arguments it applies to the event this call is about, or the newest unacknowledged one. This stops follow-up contact about it.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "saveMemory",
    description: "Save a short note for future calls. Only after the user has explicitly agreed, in this conversation, to save this specific note.",
    parameters: { type: "object", properties: { content: { type: "string", description: "The note, under 300 characters, as agreed with the user." }, userConsented: { type: "boolean", description: "True only if the user said yes to saving this note." } }, required: ["content", "userConsented"] },
  },
  {
    name: "scheduleCheckIn",
    description: "Schedule a one-off call back from Jarvis at a set time, for requests such as 'call me back in ten minutes' or 'check in on me tonight'. Jarvis calls the user then. Only after the user has explicitly asked for or agreed to it. Pass exactly one of dueLocal or dueInMinutes. To be reminded about a task, use createReminder instead, and never call both for one request: a critical reminder already makes Jarvis call.",
    parameters: { type: "object", properties: { dueLocal, dueInMinutes, userConsented: { type: "boolean", description: "True only if the user asked for or said yes to this call back." } }, required: ["userConsented"] },
  },
];

export const ACTION_NAMES = ACTIONS.map((action) => action.name);
