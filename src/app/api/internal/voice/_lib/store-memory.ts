// In-memory fixture store for local development and tests, used when VOICE_STORE=memory. Data is lost on restart.
import type { Attempt, CallAttempt, CallEvent, Device, HomeEvent, HomeMode, Memory, Profile, Reminder, Store } from "./types";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
export const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";

export type MemoryData = {
  profiles: Profile[];
  reminders: Reminder[];
  homeEvents: (HomeEvent & { userId: string })[];
  memories: (Memory & { userId: string })[];
  checkIns: { id: string; userId: string; dueAt: string; enabled: boolean; consentedAt: string }[];
  devices: (Device & { permitted: boolean })[];
  deviceActions: { userId: string; deviceId: string; on: boolean; status: string }[];
  attempts: Attempt[];
  homeModes: Record<string, HomeMode>;
  callEvents: (CallEvent & { userId: string })[];
  callAttempts: (CallAttempt & { userId: string })[];
};

export function demoData(now = new Date()): MemoryData {
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
  const reminder = (id: string, userId: string, title: string, minutes: number, priority: Reminder["priority"]): Reminder =>
    ({ id, userId, title, dueAt: at(minutes), priority, status: "pending", acknowledgedAt: null, snoozedUntil: null });
  return {
    profiles: [
      { id: DEMO_USER_ID, displayName: "Demo User", timeZone: "America/Chicago" },
      { id: OTHER_USER_ID, displayName: "Second User", timeZone: "America/New_York" },
    ],
    reminders: [
      reminder("10000000-0000-4000-8000-000000000001", DEMO_USER_ID, "Take evening medication", -15, "high"),
      reminder("10000000-0000-4000-8000-000000000002", DEMO_USER_ID, "Pick up the grocery order", 45, "medium"),
      reminder("10000000-0000-4000-8000-000000000003", OTHER_USER_ID, "Renew passport", 60, "medium"),
    ],
    devices: [
      { id: "20000000-0000-4000-8000-000000000001", userId: DEMO_USER_ID, name: "Living room lamp", kind: "light", entityId: "light.living_room", on: false, simulated: true, permitted: true },
      { id: "20000000-0000-4000-8000-000000000002", userId: OTHER_USER_ID, name: "Porch light", kind: "light", entityId: "light.porch", on: false, simulated: true, permitted: true },
      { id: "20000000-0000-4000-8000-000000000003", userId: DEMO_USER_ID, name: "Garage light", kind: "light", entityId: "light.garage", on: false, simulated: true, permitted: false },
    ],
    homeEvents: [{
      id: "30000000-0000-4000-8000-000000000001", userId: DEMO_USER_ID, type: "motion", severity: "low",
      description: "Motion detected at the front door", occurredAt: at(-30), source: "simulated", outreachEligible: false, acknowledgedAt: null,
    }],
    memories: [],
    checkIns: [],
    deviceActions: [],
    attempts: [{ id: "40000000-0000-4000-8000-000000000001", userId: DEMO_USER_ID, reminderId: "10000000-0000-4000-8000-000000000001", homeEventId: null }],
    homeModes: {},
    callEvents: [],
    callAttempts: [],
  };
}

/** A stored home event without its owner column. */
function publicEvent(row: HomeEvent & { userId: string }): HomeEvent {
  return { id: row.id, type: row.type, severity: row.severity, description: row.description, occurredAt: row.occurredAt,
    source: row.source, outreachEligible: row.outreachEligible, acknowledgedAt: row.acknowledgedAt };
}
/** A stored device without its permission flag. */
function publicDevice(row: Device & { permitted: boolean }): Device {
  return { id: row.id, userId: row.userId, name: row.name, kind: row.kind, entityId: row.entityId, on: row.on, simulated: row.simulated };
}

export function memoryStore(data: MemoryData = demoData()): Store & { data: MemoryData } {
  const copy = <T>(value: T): T => structuredClone(value);
  return {
    data,
    async getProfile(userId) { return copy(data.profiles.find((row) => row.id === userId) ?? null); },
    async getAttempt(attemptId) { return copy(data.attempts.find((row) => row.id === attemptId) ?? null); },
    async listReminders(userId, statuses, limit) {
      return copy(data.reminders.filter((row) => row.userId === userId && statuses.includes(row.status)).slice(0, limit));
    },
    async getReminder(userId, id) { return copy(data.reminders.find((row) => row.userId === userId && row.id === id) ?? null); },
    async insertReminder(userId, input) {
      const row: Reminder = { id: crypto.randomUUID(), userId, ...input, status: "pending", acknowledgedAt: null, snoozedUntil: null };
      data.reminders.push(row);
      return copy(row);
    },
    async updateReminder(userId, id, patch) {
      const row = data.reminders.find((item) => item.userId === userId && item.id === id);
      if (!row) return null;
      const next = { ...row, ...patch };
      // Same rule as the database check constraint on reminders.
      if ((next.status === "snoozed") !== (next.snoozedUntil !== null)) throw new Error("snoozed_until must be set exactly when status is snoozed");
      Object.assign(row, next);
      return copy(row);
    },
    async listDevices(userId) {
      return data.devices.filter((row) => row.userId === userId && row.permitted)
        .map(publicDevice);
    },
    async ensureDemoHome(userId) {
      if (data.devices.some((row) => row.userId === userId)) return;
      const base = { userId, on: false, simulated: true, permitted: true };
      data.devices.push(
        { ...base, id: crypto.randomUUID(), name: "Kitchen stove", kind: "stove", entityId: "stove.kitchen" },
        { ...base, id: crypto.randomUUID(), name: "Porch light", kind: "light", entityId: "light.porch" },
      );
    },
    async getHomeMode(userId) { return data.homeModes[userId] ?? "home"; },
    async setHomeMode(userId, mode) { data.homeModes[userId] = mode; return mode; },
    async getHomeEvent(userId, id) {
      const row = data.homeEvents.find((item) => item.userId === userId && item.id === id);
      if (!row) return null;
      return publicEvent(row);
    },
    async insertHomeEvent(userId, event) {
      const row = { id: crypto.randomUUID(), userId, ...event, occurredAt: new Date().toISOString(), source: "simulated", acknowledgedAt: null };
      data.homeEvents.push(row);
      return publicEvent(row);
    },
    async acknowledgeHomeEvent(userId, id) {
      const row = data.homeEvents.find((item) => item.userId === userId && item.id === id);
      if (!row) return null;
      row.acknowledgedAt = new Date().toISOString();
      return publicEvent(row);
    },
    async insertCallEvent(userId, event) { data.callEvents.push({ userId, at: new Date().toISOString(), ...event }); },
    async listCallEvents(userId, limit) {
      return data.callEvents.filter((row) => row.userId === userId).slice(-limit).reverse()
        .map((row): CallEvent => ({ at: row.at, attemptId: row.attemptId, callId: row.callId, event: row.event, summary: row.summary, direction: row.direction }));
    },
    async listCallAttempts(userId, limit) {
      return copy(data.callAttempts.filter((row) => row.userId === userId).slice(-limit).reverse().map(({ userId: owner, ...attempt }) => (void owner, attempt)));
    },
    async setDeviceState(userId, deviceId, on) {
      const row = data.devices.find((item) => item.userId === userId && item.id === deviceId && item.permitted);
      if (!row) return null;
      row.on = on;
      return publicDevice(row);
    },
    async recordDeviceAction(userId, action) { data.deviceActions.push({ userId, ...action }); },
    async listHomeEvents(userId, limit) {
      return copy(data.homeEvents.filter((row) => row.userId === userId)
        .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, limit)
        .map(publicEvent));
    },
    async listMemories(userId, limit) {
      return copy(data.memories.filter((row) => row.userId === userId).slice(-limit)
        .map((row): Memory => ({ id: row.id, content: row.content, createdAt: row.createdAt })));
    },
    async insertMemory(userId, content) {
      const row = { id: crypto.randomUUID(), userId, content, createdAt: new Date().toISOString() };
      data.memories.push(row);
      return { id: row.id, content, createdAt: row.createdAt };
    },
    async insertCheckIn(userId, input) {
      const row = { id: crypto.randomUUID(), userId, ...input, enabled: true, consentedAt: new Date().toISOString() };
      data.checkIns.push(row);
      return { id: row.id };
    },
  };
}
