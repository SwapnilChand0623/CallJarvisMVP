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
export type DeviceKind = "light" | "stove";
export type Device = { id: string; userId: string; name: string; kind: DeviceKind; entityId: string; on: boolean; simulated: boolean };
export type HomeMode = "home" | "away";
export type HomeEvent = {
  id: string;
  type: string;
  severity: string;
  description: string;
  occurredAt: string;
  source: string; // "simulated" or the real integration's name
  /** True when the event was raised while the home was Away, which is what makes it worth a call. */
  outreachEligible: boolean;
  acknowledgedAt: string | null;
};
/** One line of a call's timeline. No audio or transcript is ever stored: only what happened and when. */
export type CallEvent = { at: string; attemptId: string | null; callId: string | null; event: string; summary: string; direction: "inbound" | "outbound" };
export type NewCallEvent = Omit<CallEvent, "at">;
/** A FaceTime outreach attempt with what it was about, for the Logs page. */
export type CallAttempt = {
  id: string; stage: string; status: string; errorCode: string | null; simulated: boolean; createdAt: string; outcomeAt: string | null;
  about: { kind: "reminder" | "home_event" | "check_in"; text: string; at: string | null; priority: string | null } | null;
};
export type NewHomeEvent = Pick<HomeEvent, "type" | "severity" | "description" | "outreachEligible">;
export type Memory = { id: string; content: string; createdAt: string };
export type Attempt = { id: string; userId: string; reminderId: string | null; homeEventId: string | null };

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
  /** Only devices the owner has permitted. */
  listDevices(userId: string): Promise<Device[]>;
  /** Creates the simulated demo home (a stove and a porch light) if the owner has no devices. */
  ensureDemoHome(userId: string): Promise<void>;
  getHomeMode(userId: string): Promise<HomeMode>;
  setHomeMode(userId: string, mode: HomeMode): Promise<HomeMode>;
  getHomeEvent(userId: string, id: string): Promise<HomeEvent | null>;
  insertHomeEvent(userId: string, event: NewHomeEvent): Promise<HomeEvent>;
  /** Appends to the call log (communication_metadata). */
  insertCallEvent(userId: string, event: NewCallEvent): Promise<void>;
  listCallEvents(userId: string, limit: number): Promise<CallEvent[]>;
  /** Recent FaceTime attempts with what each was about, newest first. */
  listCallAttempts(userId: string, limit: number): Promise<CallAttempt[]>;
  /** The id of the user's FaceTime call about a critical home alert that is ringing or in progress, if any. */
  findLiveAlertCall(userId: string): Promise<string | null>;
  /** Marks one event acknowledged. Returns null when it does not exist for this owner. */
  acknowledgeHomeEvent(userId: string, id: string): Promise<HomeEvent | null>;
  setDeviceState(userId: string, deviceId: string, on: boolean): Promise<Device | null>;
  recordDeviceAction(userId: string, action: { deviceId: string; on: boolean; status: "succeeded" | "failed" | "simulated" }): Promise<void>;
  listHomeEvents(userId: string, limit: number): Promise<HomeEvent[]>;
  listMemories(userId: string, limit: number): Promise<Memory[]>;
  insertMemory(userId: string, content: string): Promise<Memory>;
  /** A one-off, enabled check-in with consent recorded now. */
  insertCheckIn(userId: string, input: { dueAt: string }): Promise<{ id: string }>;
};

/** The device boundary. The action reports only what this returns. */
export type HomeService = {
  setDevice(input: { userId: string; deviceId: string; on: boolean; origin: string }): Promise<
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
  /** Home event the call is about, from the notification attempt. */
  focusEventId?: string | null;
  /** "voice" or "imessage". */
  origin: string;
};

export type ActionError = { code: string; message: string; candidates?: { id: string; title: string; due: string }[] };
export type ActionResult = { ok: true; result: Record<string, unknown> } | { ok: false; error: ActionError };
export type Deps = { store: Store; home: HomeService; now?: () => Date };
