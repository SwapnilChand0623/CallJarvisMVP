import { z } from "zod";
export const priorities = ["low", "medium", "high", "critical"] as const;
export const reminderSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(160),
  dueAt: z.string().datetime(),
  priority: z.enum(priorities),
  status: z.enum(["pending", "snoozed", "completed", "canceled"]),
  acknowledgedAt: z.string().datetime().nullable().default(null),
  snoozedUntil: z.string().datetime().optional(),
  channel: z.enum(["FaceTime", "iMessage"]),
});
export type Reminder = z.infer<typeof reminderSchema>;
const activitySchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  time: z.string().datetime(),
  kind: z.enum(["reminder", "home", "call"]),
  reminderId: z.string().optional(),
});
export type Activity = z.infer<typeof activitySchema>;
const preferencesSchema = z.object({
  name: z.string().max(60),
  channel: z.enum(["FaceTime", "iMessage"]),
  escalation: z.boolean(),
  homeAlerts: z.boolean(),
  timeZone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }),
  outreach: z.boolean(),
  iMessage: z.boolean(),
  faceTime: z.boolean(),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  delayMinutes: z.number().min(1).max(1440),
  maxCalls: z.number().min(1).max(24),
  memoryConsent: z.boolean(),
  checkInConsent: z.boolean(),
  talkStyle: z.enum(["brief", "warm", "reflective"]),
});
export type Preferences = z.infer<typeof preferencesSchema>;
const homeSchema = z.object({
  id: z.string(),
  type: z.enum(["motion", "camera"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string(),
  occurredAt: z.string().datetime(),
  source: z.literal("simulated"),
});
const deliverySchema = z.object({
  id: z.string(),
  eventId: z.string(),
  revision: z.string(),
  channel: z.enum(["FaceTime", "iMessage"]),
  stage: z.enum(["requested", "accepted", "answered", "completed"]),
  status: z.enum(["simulated", "blocked"]),
  reason: z.string(),
  time: z.string().datetime(),
});
export type Delivery = z.infer<typeof deliverySchema>;
export const demoSchema = z.object({
  reminders: z.array(reminderSchema),
  activities: z.array(activitySchema),
  preferences: preferencesSchema,
  homeEvents: z.array(homeSchema),
  light: z.object({
    id: z.string(),
    name: z.string(),
    on: z.boolean(),
    enabled: z.boolean(),
  }),
  memories: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      approvedAt: z.string().datetime(),
    }),
  ),
  checkIns: z.array(
    z.object({
      id: z.string(),
      dueAt: z.string().datetime(),
      status: z.enum(["scheduled", "canceled"]),
    }),
  ),
  deliveries: z.array(deliverySchema),
});
export type DemoState = z.infer<typeof demoSchema>;
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
        acknowledgedAt: null,
        channel: "FaceTime",
      },
      {
        id: "r2",
        title: "Pick up the grocery order",
        dueAt: at(45),
        priority: "medium",
        status: "pending",
        acknowledgedAt: null,
        channel: "iMessage",
      },
      {
        id: "r3",
        title: "Call Mom",
        dueAt: at(120),
        priority: "low",
        status: "pending",
        acknowledgedAt: null,
        channel: "FaceTime",
      },
      {
        id: "r4",
        title: "Water the balcony plants",
        dueAt: at(-90),
        priority: "low",
        status: "completed",
        acknowledgedAt: at(-100),
        channel: "iMessage",
      },
    ],
    activities: [
      {
        id: "a1",
        title: "Reminder awaiting acknowledgment",
        detail:
          "Medication reminder is overdue. No real outreach has been sent.",
        time: at(-15),
        kind: "reminder",
        reminderId: "r1",
      },
    ],
    preferences: {
      name: "Shishir",
      channel: "FaceTime",
      escalation: false,
      homeAlerts: true,
      timeZone: "America/Chicago",
      outreach: false,
      iMessage: false,
      faceTime: false,
      quietStart: "22:00",
      quietEnd: "08:00",
      delayMinutes: 10,
      maxCalls: 2,
      memoryConsent: false,
      checkInConsent: false,
      talkStyle: "warm",
    },
    homeEvents: [
      {
        id: "h1",
        type: "motion",
        severity: "low",
        description:
          "Motion observed near the front door. This label is an observation.",
        occurredAt: at(-28),
        source: "simulated",
      },
    ],
    light: {
      id: "demo-light",
      name: "Living room light",
      on: false,
      enabled: true,
    },
    memories: [],
    checkIns: [],
    deliveries: [],
  };
}
export function isOverdue(r: Reminder, now: number) {
  return ["pending", "snoozed"].includes(r.status) && Date.parse(r.dueAt) < now;
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
  return reminderSchema.parse({
    id: crypto.randomUUID(),
    title: title.trim(),
    dueAt: new Date(dueAt).toISOString(),
    priority,
    channel,
    status: "pending",
    acknowledgedAt: null,
  });
}
export function isDemoState(value: unknown): value is DemoState {
  return demoSchema.safeParse(value).success;
}
export function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
