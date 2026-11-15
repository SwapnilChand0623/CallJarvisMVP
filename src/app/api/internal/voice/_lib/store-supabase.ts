// Supabase store over PostgREST with the service role key. The key bypasses RLS, so every query here carries an
// explicit owner filter. It uses fetch directly: no client library, and the key never leaves the server.
//
// Table and column names follow the README's shared contracts. The names marked "proposed" are not fixed by the
// README; align them with src/types/database.ts when the database branch (codex/database) merges.
import type { Attempt, Device, HomeEvent, Memory, Profile, Reminder, ReminderPatch, Store } from "./types";

export const SCHEMA = {
  profiles: { table: "profiles", id: "id", displayName: "display_name" /* proposed */, timeZone: "time_zone" /* proposed */ },
  reminders: { table: "reminders" }, // id, user_id, title, due_at, priority, status, acknowledged_at
  devices: { table: "devices", on: "is_on" /* proposed */ }, // id, user_id, name
  deviceActions: { table: "device_actions" /* proposed */ }, // user_id, device_id, requested_on, outcome, source, origin
  homeEvents: { table: "home_events", occurredAt: "occurred_at" /* proposed */ }, // id, user_id, type, severity, description, source
  attempts: { table: "notification_attempts" }, // id, user_id, reminder_id
  memories: { table: "memories" /* proposed */ }, // id, user_id, content, created_at
  checkIns: { table: "check_ins" /* proposed */ }, // id, user_id, due_at, topic
} as const;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped until database.ts lands

const eq = (value: string) => `eq.${encodeURIComponent(value)}`;

export function supabaseStore(url: string, serviceRoleKey: string, fetcher: typeof fetch = fetch): Store {
  const base = `${url.replace(/\/+$/, "")}/rest/v1`;

  async function rest(method: string, table: string, query: string, body?: unknown): Promise<Row[]> {
    const response = await fetcher(`${base}/${table}?${query}`, {
      method,
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        ...(method === "GET" ? {} : { prefer: "return=representation" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as { code?: string } | null;
      throw new Error(`${method} ${table} failed with HTTP ${response.status}${detail?.code ? ` (${detail.code})` : ""}`);
    }
    const rows = response.status === 204 ? [] : await response.json();
    return Array.isArray(rows) ? rows : [];
  }

  const reminder = (row: Row): Reminder => ({
    id: row.id, userId: row.user_id, title: row.title, dueAt: new Date(row.due_at).toISOString(),
    priority: row.priority, status: row.status, acknowledgedAt: row.acknowledged_at ?? null,
  });
  const device = (row: Row): Device => ({ id: row.id, userId: row.user_id, name: row.name, on: row[SCHEMA.devices.on] === true });
  const reminderColumns = (patch: ReminderPatch): Row => ({
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.dueAt !== undefined && { due_at: patch.dueAt }),
    ...(patch.priority !== undefined && { priority: patch.priority }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.acknowledgedAt !== undefined && { acknowledged_at: patch.acknowledgedAt }),
  });

  return {
    async getProfile(userId) {
      const p = SCHEMA.profiles;
      const [row] = await rest("GET", p.table, `${p.id}=${eq(userId)}&limit=1`);
      return row ? ({ id: row[p.id], displayName: row[p.displayName] ?? null, timeZone: row[p.timeZone] ?? null } satisfies Profile) : null;
    },
    async getAttempt(attemptId) {
      const [row] = await rest("GET", SCHEMA.attempts.table, `id=${eq(attemptId)}&select=id,user_id,reminder_id&limit=1`);
      return row ? ({ id: row.id, userId: row.user_id, reminderId: row.reminder_id ?? null } satisfies Attempt) : null;
    },
    async listReminders(userId, statuses, limit) {
      const rows = await rest("GET", SCHEMA.reminders.table,
        `user_id=${eq(userId)}&status=in.(${statuses.join(",")})&order=due_at.asc&limit=${limit}`);
      return rows.map(reminder);
    },
    async getReminder(userId, id) {
      const [row] = await rest("GET", SCHEMA.reminders.table, `user_id=${eq(userId)}&id=${eq(id)}&limit=1`);
      return row ? reminder(row) : null;
    },
    async insertReminder(userId, input) {
      const [row] = await rest("POST", SCHEMA.reminders.table, "select=*",
        { user_id: userId, title: input.title, due_at: input.dueAt, priority: input.priority, status: "pending" });
      if (!row) throw new Error("insert returned no row");
      return reminder(row);
    },
    async updateReminder(userId, id, patch) {
      const [row] = await rest("PATCH", SCHEMA.reminders.table, `user_id=${eq(userId)}&id=${eq(id)}&select=*`, reminderColumns(patch));
      return row ? reminder(row) : null;
    },
    async listDevices(userId) {
      return (await rest("GET", SCHEMA.devices.table, `user_id=${eq(userId)}&order=name.asc&limit=50`)).map(device);
    },
    async setDeviceState(userId, deviceId, on) {
      const [row] = await rest("PATCH", SCHEMA.devices.table, `user_id=${eq(userId)}&id=${eq(deviceId)}&select=*`, { [SCHEMA.devices.on]: on });
      return row ? device(row) : null;
    },
    async recordDeviceAction(userId, action) {
      await rest("POST", SCHEMA.deviceActions.table, "select=id",
        { user_id: userId, device_id: action.deviceId, requested_on: action.on, outcome: action.outcome, source: action.source, origin: action.origin });
    },
    async listHomeEvents(userId, limit) {
      const when = SCHEMA.homeEvents.occurredAt;
      const rows = await rest("GET", SCHEMA.homeEvents.table, `user_id=${eq(userId)}&order=${when}.desc&limit=${limit}`);
      return rows.map((row): HomeEvent => ({
        id: row.id, type: row.type, severity: row.severity, description: row.description,
        occurredAt: new Date(row[when]).toISOString(), source: row.source,
      }));
    },
    async listMemories(userId, limit) {
      const rows = await rest("GET", SCHEMA.memories.table, `user_id=${eq(userId)}&order=created_at.desc&limit=${limit}`);
      return rows.map((row): Memory => ({ id: row.id, content: row.content, createdAt: row.created_at }));
    },
    async insertMemory(userId, content) {
      const [row] = await rest("POST", SCHEMA.memories.table, "select=*", { user_id: userId, content });
      if (!row) throw new Error("insert returned no row");
      return { id: row.id, content: row.content, createdAt: row.created_at };
    },
    async insertCheckIn(userId, input) {
      const [row] = await rest("POST", SCHEMA.checkIns.table, "select=id", { user_id: userId, due_at: input.dueAt, topic: input.topic });
      if (!row) throw new Error("insert returned no row");
      return { id: row.id };
    },
  };
}
