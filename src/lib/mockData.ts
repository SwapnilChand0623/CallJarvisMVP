export type Reminder = {
  id: string;
  title: string;
  dueAt: string;
  priority: "high" | "normal";
  status: "pending" | "completed";
  channel: "FaceTime" | "iMessage";
};
export type Activity = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: "reminder" | "home" | "call";
};
export type Preferences = {
  name: string;
  channel: "FaceTime" | "iMessage";
  escalation: boolean;
  homeAlerts: boolean;
};
export type DemoState = {
  reminders: Reminder[];
  activities: Activity[];
  preferences: Preferences;
};
export function createDemoState(now = new Date()): DemoState {
  const at = (minutes: number) =>
    new Date(now.getTime() + minutes * 60000).toISOString();
  return {
    reminders: [
      {
        id: "r1",
        title: "Take evening medication",
        dueAt: at(-15),
        priority: "high",
        status: "pending",
        channel: "FaceTime",
      },
      {
        id: "r2",
        title: "Pick up the grocery order",
        dueAt: at(45),
        priority: "normal",
        status: "pending",
        channel: "iMessage",
      },
      {
        id: "r3",
        title: "Call Mom",
        dueAt: at(120),
        priority: "normal",
        status: "pending",
        channel: "FaceTime",
      },
      {
        id: "r4",
        title: "Water the balcony plants",
        dueAt: at(-90),
        priority: "normal",
        status: "completed",
        channel: "iMessage",
      },
    ],
    activities: [
      {
        id: "a1",
        title: "A little nudge, right on time",
        detail: "Medication reminder is waiting for your acknowledgment.",
        time: at(-15),
        kind: "reminder",
      },
      {
        id: "a2",
        title: "Front door is secure",
        detail: "Simulated sensor event · door locked after arrival.",
        time: at(-28),
        kind: "home",
      },
      {
        id: "a3",
        title: "One less thing on your mind",
        detail: "Water the balcony plants marked complete.",
        time: at(-90),
        kind: "reminder",
      },
    ],
    preferences: {
      name: "Shishir",
      channel: "FaceTime",
      escalation: true,
      homeAlerts: true,
    },
  };
}
export function isOverdue(reminder: Reminder, now: number) {
  return reminder.status === "pending" && Date.parse(reminder.dueAt) < now;
}
export function makeReminder(
  title: string,
  dueAt: string,
  priority: Reminder["priority"],
  channel: Reminder["channel"],
): Reminder {
  if (!title.trim()) throw new Error("Give your reminder a name.");
  if (!Number.isFinite(Date.parse(dueAt)))
    throw new Error("Choose a valid date and time.");
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    dueAt: new Date(dueAt).toISOString(),
    priority,
    channel,
    status: "pending",
  };
}
export function isDemoState(value: unknown): value is DemoState {
  if (!value || typeof value !== "object") return false;
  const s = value as DemoState;
  return (
    Array.isArray(s.reminders) &&
    s.reminders.every(
      (r) =>
        !!r &&
        typeof r === "object" &&
        typeof r.id === "string" &&
        typeof r.title === "string" &&
        Number.isFinite(Date.parse(r.dueAt)) &&
        ["high", "normal"].includes(r.priority) &&
        ["pending", "completed"].includes(r.status) &&
        ["FaceTime", "iMessage"].includes(r.channel),
    ) &&
    Array.isArray(s.activities) &&
    s.activities.every(
      (a) =>
        !!a &&
        typeof a === "object" &&
        typeof a.id === "string" &&
        typeof a.title === "string" &&
        typeof a.detail === "string" &&
        Number.isFinite(Date.parse(a.time)) &&
        ["home", "call", "reminder"].includes(a.kind),
    ) &&
    !!s.preferences &&
    typeof s.preferences.name === "string" &&
    ["FaceTime", "iMessage"].includes(s.preferences.channel) &&
    typeof s.preferences.escalation === "boolean" &&
    typeof s.preferences.homeAlerts === "boolean"
  );
}
