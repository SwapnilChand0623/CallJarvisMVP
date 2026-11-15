// Supabase store over PostgREST with the service role key. The key bypasses RLS, so every query here carries an
// explicit owner filter. It uses fetch directly: no client library, and the key never leaves the server.
//
// Tables and columns follow docs/data-contract.md and the migration on codex/database. Revision bumps, reminder
// history and cancellation of stale pending attempts are done by database triggers, never from here.
import type { Attempt, CallAttempt, CallEvent, Device, HomeEvent, HomeMode, Memory, Profile, Reminder, ReminderPatch, Store } from "./types";

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
    snoozedUntil: row.snoozed_until ? new Date(row.snoozed_until).toISOString() : null,
  });
  const device = (row: Row): Device => ({
    id: row.id, userId: row.user_id, name: row.name, kind: row.kind === "stove" ? "stove" : "light", entityId: row.entity_id,
    on: row.is_on === true, simulated: row.source !== "real",
  });
  const permitted = "permitted=is.true";
  const homeEvent = (row: Row): HomeEvent => ({
    id: row.id, type: row.type, severity: row.severity, description: row.description,
    occurredAt: new Date(row.occurred_at).toISOString(), source: row.source,
    outreachEligible: row.outreach_eligible === true, acknowledgedAt: row.acknowledged_at ?? null,
  });
  const reminderColumns = (patch: ReminderPatch): Row => ({
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.dueAt !== undefined && { due_at: patch.dueAt }),
    ...(patch.priority !== undefined && { priority: patch.priority }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.acknowledgedAt !== undefined && { acknowledged_at: patch.acknowledgedAt }),
    ...(patch.snoozedUntil !== undefined && { snoozed_until: patch.snoozedUntil }),
  });

  return {
    async getProfile(userId) {
      // profiles has no name column; the dashboard owner can add one without changing this contract.
      const [row] = await rest("GET", "profiles", `user_id=${eq(userId)}&select=user_id,timezone&limit=1`);
      return row ? ({ id: row.user_id, displayName: null, timeZone: row.timezone ?? null } satisfies Profile) : null;
    },
    async getAttempt(attemptId) {
      const [row] = await rest("GET", "notification_attempts", `id=${eq(attemptId)}&select=id,user_id,reminder_id,home_event_id&limit=1`);
      return row ? ({ id: row.id, userId: row.user_id, reminderId: row.reminder_id ?? null, homeEventId: row.home_event_id ?? null } satisfies Attempt) : null;
    },
    async listReminders(userId, statuses, limit) {
      const rows = await rest("GET", "reminders",
        `user_id=${eq(userId)}&status=in.(${statuses.join(",")})&order=due_at.asc&limit=${limit}`);
      return rows.map(reminder);
    },
    async getReminder(userId, id) {
      const [row] = await rest("GET", "reminders", `user_id=${eq(userId)}&id=${eq(id)}&limit=1`);
      return row ? reminder(row) : null;
    },
    async insertReminder(userId, input) {
      const [row] = await rest("POST", "reminders", "select=*",
        { user_id: userId, title: input.title, due_at: input.dueAt, priority: input.priority, status: "pending" });
      if (!row) throw new Error("insert returned no row");
      return reminder(row);
    },
    async updateReminder(userId, id, patch) {
      const [row] = await rest("PATCH", "reminders", `user_id=${eq(userId)}&id=${eq(id)}&select=*`, reminderColumns(patch));
      return row ? reminder(row) : null;
    },
    async listDevices(userId) {
      return (await rest("GET", "devices", `user_id=${eq(userId)}&${permitted}&order=name.asc&limit=50`)).map(device);
    },
    async ensureDemoHome(userId) {
      const existing = await rest("GET", "devices", `user_id=${eq(userId)}&select=id&limit=1`);
      if (existing.length) return;
      const [integration] = await rest("POST", "home_assistant_integrations", "select=id", { user_id: userId, name: "Demo home", source: "simulated" });
      if (!integration) throw new Error("insert returned no row");
      const base = { user_id: userId, integration_id: integration.id, permitted: true, is_on: false, source: "simulated" };
      await rest("POST", "devices", "select=id", [
        { ...base, name: "Kitchen stove", entity_id: "stove.kitchen", kind: "stove" },
        { ...base, name: "Porch light", entity_id: "light.porch", kind: "light" },
      ]);
    },
    async getHomeMode(userId) {
      const [row] = await rest("GET", "home_modes", `user_id=${eq(userId)}&select=mode&limit=1`);
      return (row?.mode === "away" ? "away" : "home") satisfies HomeMode;
    },
    async setHomeMode(userId, mode) {
      // Upsert on the primary key.
      const response = await fetcher(`${base}/home_modes?on_conflict=user_id&select=mode`, {
        method: "POST",
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json", prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: userId, mode, updated_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`POST home_modes failed with HTTP ${response.status}`);
      return mode;
    },
    async getHomeEvent(userId, id) {
      const [row] = await rest("GET", "home_events", `user_id=${eq(userId)}&id=${eq(id)}&limit=1`);
      return row ? homeEvent(row) : null;
    },
    async insertHomeEvent(userId, event) {
      const [row] = await rest("POST", "home_events", "select=*", {
        user_id: userId, type: event.type, severity: event.severity, description: event.description,
        source: "simulated", outreach_eligible: event.outreachEligible,
      });
      if (!row) throw new Error("insert returned no row");
      return homeEvent(row);
    },
    async acknowledgeHomeEvent(userId, id) {
      const [row] = await rest("PATCH", "home_events", `user_id=${eq(userId)}&id=${eq(id)}&select=*`, { acknowledged_at: new Date().toISOString() });
      return row ? homeEvent(row) : null;
    },
    async insertCallEvent(userId, event) {
      await rest("POST", "communication_metadata", "select=id", {
        user_id: userId, attempt_id: event.attemptId, channel: "facetime", provider_id: event.callId, event: event.event,
        metadata: { summary: event.summary, direction: event.direction },
      });
    },
    async listCallEvents(userId, limit) {
      const rows = await rest("GET", "communication_metadata", `user_id=${eq(userId)}&channel=eq.facetime&order=occurred_at.desc&limit=${limit}`);
      return rows.map((row): CallEvent => ({
        at: new Date(row.occurred_at).toISOString(), attemptId: row.attempt_id ?? null, callId: row.provider_id ?? null, event: row.event,
        summary: typeof row.metadata?.summary === "string" ? row.metadata.summary : "", direction: row.metadata?.direction === "outbound" ? "outbound" : "inbound",
      }));
    },
    async listCallAttempts(userId, limit) {
      const rows = await rest("GET", "notification_attempts",
        `user_id=${eq(userId)}&channel=eq.facetime&order=created_at.desc&limit=${limit}&select=id,stage,status,error_code,simulated,created_at,outcome_at,reminder_id,home_event_id,check_in_id`);
      // What each attempt was about, looked up per table and always scoped to the owner.
      const lookup = async (table: string, column: string, select: string) => {
        const ids = [...new Set(rows.map((row) => row[column]).filter(Boolean))];
        if (!ids.length) return new Map<string, Row>();
        const found = await rest("GET", table, `user_id=${eq(userId)}&id=in.(${ids.map(encodeURIComponent).join(",")})&select=id,${select}`);
        return new Map(found.map((row) => [row.id as string, row]));
      };
      const [reminders, events, checkIns] = await Promise.all([
        lookup("reminders", "reminder_id", "title,due_at,priority"),
        lookup("home_events", "home_event_id", "description,occurred_at,severity"),
        lookup("check_ins", "check_in_id", "due_at"),
      ]);
      return rows.map((row): CallAttempt => {
        const reminder = reminders.get(row.reminder_id);
        const event = events.get(row.home_event_id);
        const checkIn = checkIns.get(row.check_in_id);
        return {
          id: row.id, stage: row.stage, status: row.status, errorCode: row.error_code ?? null, simulated: row.simulated === true,
          createdAt: new Date(row.created_at).toISOString(), outcomeAt: row.outcome_at ? new Date(row.outcome_at).toISOString() : null,
          about: reminder ? { kind: "reminder", text: reminder.title, at: reminder.due_at, priority: reminder.priority }
            : event ? { kind: "home_event", text: event.description, at: event.occurred_at, priority: event.severity }
            : checkIn ? { kind: "check_in", text: "", at: checkIn.due_at, priority: null } : null,
        };
      });
    },
    async setDeviceState(userId, deviceId, on) {
      const [row] = await rest("PATCH", "devices", `user_id=${eq(userId)}&id=${eq(deviceId)}&${permitted}&select=*`, { is_on: on });
      return row ? device(row) : null;
    },
    async recordDeviceAction(userId, action) {
      await rest("POST", "device_action_logs", "select=id",
        { user_id: userId, device_id: action.deviceId, requested_on: action.on, status: action.status, confirmed_at: action.status === "failed" ? null : new Date().toISOString() });
    },
    async listHomeEvents(userId, limit) {
      const rows = await rest("GET", "home_events", `user_id=${eq(userId)}&order=occurred_at.desc&limit=${limit}`);
      return rows.map(homeEvent);
    },
    async listMemories(userId, limit) {
      // Voice notes are structured_memory rows keyed "note:<uuid>" with value {"text": …}. Expired rows are never read.
      const rows = await rest("GET", "structured_memory",
        `user_id=${eq(userId)}&key=like.note:*&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(`"${new Date().toISOString()}"`)})&order=created_at.desc&limit=${limit}`);
      return rows.filter((row) => typeof row.value?.text === "string")
        .map((row): Memory => ({ id: row.id, content: row.value.text, createdAt: row.created_at }));
    },
    async insertMemory(userId, content) {
      const [row] = await rest("POST", "structured_memory", "select=*",
        { user_id: userId, key: `note:${crypto.randomUUID()}`, value: { text: content }, approved_at: new Date().toISOString() });
      if (!row) throw new Error("insert returned no row");
      return { id: row.id, content, createdAt: row.created_at };
    },
    async insertCheckIn(userId, input) {
      const [row] = await rest("POST", "check_ins", "select=id",
        // Critical so the scheduler places a call. The default priority, low, sends nothing at all.
        { user_id: userId, due_at: input.dueAt, enabled: true, consented_at: new Date().toISOString(), priority: "critical" });
      if (!row) throw new Error("insert returned no row");
      return { id: row.id };
    },
  };
}
