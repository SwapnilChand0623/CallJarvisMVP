// Shapes shared by the voice endpoint and the domain actions. Field names follow the README's shared contracts.

export type Priority = "low" | "medium" | "high" | "critical";
export type ReminderStatus = "pending" | "snoozed" | "completed" | "canceled";

export type Reminder = {
  id: string;
  userId: string;
  title: string;
  dueAt: string; // UTC ISO timestamp
  /** Set exactly when status is "snoozed": the time outreach resumes. dueAt keeps the original time. */
  snoozedUntil: string | null;
  priority: Priority;
  status: ReminderStatus;
  acknowledgedAt: string | null;
};

export type Profile = { id: string; displayName: string | null; timeZone: string | null };
export type Device = { id: string; userId: string; name: string; on: boolean; simulated: boolean };
export type HomeEvent = {
  id: string;
  type: string;
  severity: string;
  description: string;
  occurredAt: string;
  source: string; // "simulated" or the real integration's name
};
export type Memory = { id: string; content: string; createdAt: string };
export type Attempt = { id: string; userId: string; reminderId: string | null };

export type ReminderPatch = Partial<Pick<Reminder, "title" | "dueAt" | "priority" | "status" | "acknowledgedAt" | "snoozedUntil">>;

/** Every method is scoped to one owner. Implementations must filter by userId on reads and writes. */
export type Store = {
  getProfile(userId: string): Promise<Profile | null>;
  getAttempt(attemptId: string): Promise<Attempt | null>;
  listReminders(userId: string, statuses: ReminderStatus[], limit: number): Promise<Reminder[]>;
  getReminder(userId: string, id: string): Promise<Reminder | null>;
  insertReminder(userId: string, input: Pick<Reminder, "title" | "dueAt" | "priority">): Promise<Reminder>;
  /** Returns null when the reminder does not exist for this owner. */
  updateReminder(userId: string, id: string, patch: ReminderPatch): Promise<Reminder | null>;
  /** Only lights the owner has permitted. */
  listDevices(userId: string): Promise<Device[]>;
  setDeviceState(userId: string, deviceId: string, on: boolean): Promise<Device | null>;
  recordDeviceAction(userId: string, action: { deviceId: string; on: boolean; status: "succeeded" | "failed" | "simulated" }): Promise<void>;
  listHomeEvents(userId: string, limit: number): Promise<HomeEvent[]>;
  listMemories(userId: string, limit: number): Promise<Memory[]>;
  insertMemory(userId: string, content: string): Promise<Memory>;
  /** A one-off, enabled check-in with consent recorded now. */
  insertCheckIn(userId: string, input: { dueAt: string }): Promise<{ id: string }>;
};

/** The device boundary owned by Shishir's Codex (src/lib/server/home). The action reports only what this returns. */
export type HomeService = {
  setLight(input: { userId: string; deviceId: string; on: boolean; origin: string }): Promise<
    { ok: true; on: boolean; simulated: boolean } | { ok: false; reason: string }
  >;
};

/** Who an action runs for. Built by trusted server code, never from model output. */
export type Actor = {
  userId: string;
  timeZone: string;
  displayName: string | null;
  /** Reminder the call or message is about, from the notification attempt. */
  focusReminderId: string | null;
  /** "voice" or "imessage". */
  origin: string;
};

export type ActionError = { code: string; message: string; candidates?: { id: string; title: string; due: string }[] };
export type ActionResult = { ok: true; result: Record<string, unknown> } | { ok: false; error: ActionError };
export type Deps = { store: Store; home: HomeService; now?: () => Date };
