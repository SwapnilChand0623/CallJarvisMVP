import { normalizeHandle } from "./status.mjs";

function clone(value) {
  return structuredClone(value);
}

export function createMemoryStore({ attempts = [], profiles = [], reminders = [] } = {}) {
  const byId = new Map(attempts.map((attempt) => [attempt.id, clone(attempt)]));
  const people = profiles.map((profile) => clone(profile));
  const tasks = new Map(reminders.map((reminder) => [reminder.id, clone(reminder)]));
  const events = new Set();

  return {
    async getAttempt(id) {
      const attempt = byId.get(id);
      return attempt ? clone(attempt) : null;
    },
    async save(attempt) {
      byId.set(attempt.id, { ...clone(attempt), updatedAt: new Date().toISOString() });
      return clone(byId.get(attempt.id));
    },
    async claimEvent(eventId) {
      if (!eventId || events.has(eventId)) return false;
      events.add(eventId);
      return true;
    },
    releaseEvent(eventId) {
      events.delete(eventId);
    },
    async findByProvider(channel, providerId) {
      for (const attempt of byId.values()) {
        if (attempt.channel === channel && attempt.providerId === providerId) return clone(attempt);
      }
      return null;
    },
    async findUserByHandle(handle) {
      const key = normalizeHandle(handle);
      const matches = people.filter((profile) => normalizeHandle(profile.destination) === key);
      if (matches.length !== 1) return null;
      return clone(matches[0]);
    },
    async latestOpenReminder(userId) {
      const candidates = [...byId.values()]
        .filter((attempt) => attempt.userId === userId && attempt.channel === "imessage" && attempt.sourceKind === "reminder" && attempt.providerId)
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      for (const attempt of candidates) {
        const reminder = tasks.get(attempt.sourceId);
        if (reminder && reminder.userId === userId && !reminder.acknowledgedAt) return clone(reminder);
      }
      return null;
    },
    async acknowledgeReminder(userId, reminderId) {
      const reminder = tasks.get(reminderId);
      if (!reminder || reminder.userId !== userId) return false;
      if (!reminder.acknowledgedAt) reminder.acknowledgedAt = new Date().toISOString();
      for (const attempt of byId.values()) {
        if (attempt.userId === userId && attempt.sourceId === reminderId) attempt.acknowledged = true;
      }
      return true;
    },
  };
}

function sourceKind(row) {
  if (row.reminder_id) return "reminder";
  if (row.home_event_id) return "home_event";
  return "check_in";
}

function sourceId(row) {
  return row.reminder_id || row.home_event_id || row.check_in_id;
}

function activeSource(kind, row, now) {
  if (!row) return false;
  if (row.acknowledged_at) return false;
  const status = row.status;
  if (status === "completed" || status === "canceled" || status === "cancelled") return false;
  if (kind === "reminder" && row.snoozed_until && Date.parse(row.snoozed_until) > now) return false;
  return true;
}

async function rest(env, fetchImpl, path, { method = "GET", body, prefer } = {}) {
  const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer || "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  if (response.status === 404) {
    const error = new Error("schema_unavailable");
    error.code = "schema_unavailable";
    throw error;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("store_failed");
    error.code = payload?.code === "42P01" ? "schema_unavailable" : "store_failed";
    throw error;
  }
  return payload;
}

export function createSupabaseStore(env = process.env, fetchImpl = fetch) {
  return {
    async getAttempt(id) {
      const rows = await rest(env, fetchImpl, `notification_attempts?id=eq.${encodeURIComponent(id)}&select=*`);
      const row = rows?.[0];
      if (!row) return null;
      const profiles = await rest(env, fetchImpl, `profiles?user_id=eq.${encodeURIComponent(row.user_id)}&select=user_id,verified_destination,outreach_enabled,channels&limit=1`);
      const profile = profiles?.[0];
      const kind = sourceKind(row);
      const table = kind === "reminder" ? "reminders" : kind === "home_event" ? "home_events" : "check_ins";
      const sources = await rest(env, fetchImpl, `${table}?id=eq.${encodeURIComponent(sourceId(row))}&select=*`);
      const source = sources?.[0];
      const now = Date.now();
      return {
        id: row.id,
        userId: row.user_id,
        sourceKind: kind,
        sourceId: sourceId(row),
        revision: row.revision,
        channel: row.channel,
        stage: row.stage,
        status: row.status,
        idempotencyKey: row.idempotency_key ?? null,
        providerId: row.provider_id ?? null,
        errorCode: row.error_code ?? null,
        simulated: row.simulated === true,
        destination: profile?.verified_destination ?? null,
        active: activeSource(kind, source, now),
        acknowledged: Boolean(source?.acknowledged_at),
        outreachEnabled: profile?.outreach_enabled !== false,
        channels: Array.isArray(profile?.channels) ? profile.channels : null,
        title: source?.title || source?.description || "CallJarvis alert",
        snoozedUntil: source?.snoozed_until ?? null,
        leaseUntil: row.lease_until ?? null,
        roomName: row.room_name ?? null,
        greetingActivated: row.greeting_activated === true,
        updatedAt: row.updated_at ?? null,
      };
    },
    async save(attempt) {
      const rows = await rest(env, fetchImpl, `notification_attempts?id=eq.${encodeURIComponent(attempt.id)}`, {
        method: "PATCH",
        body: {
          status: attempt.status,
          idempotency_key: attempt.idempotencyKey,
          provider_id: attempt.providerId,
          error_code: attempt.errorCode,
          simulated: attempt.simulated === true || attempt.status === "simulated",
          lease_until: attempt.leaseUntil,
          room_name: attempt.roomName,
          greeting_activated: attempt.greetingActivated === true,
          outcome_at: new Date().toISOString(),
        },
      });
      return rows?.[0] ? this.getAttempt(attempt.id) : null;
    },
    async claimEvent(eventId) {
      const inserted = await rest(env, fetchImpl, "provider_events", {
        method: "POST",
        prefer: "return=representation,resolution=ignore-duplicates",
        body: { id: eventId },
      }).catch((error) => {
        if (String(error.message).includes("duplicate") || error.code === "23505") return [];
        throw error;
      });
      return Array.isArray(inserted) ? inserted.length > 0 : Boolean(inserted);
    },
    releaseEvent(eventId) {
      void rest(env, fetchImpl, `provider_events?id=eq.${encodeURIComponent(eventId)}`, { method: "DELETE" }).catch(() => {});
    },
    async findByProvider(channel, providerId) {
      const rows = await rest(env, fetchImpl, `notification_attempts?channel=eq.${encodeURIComponent(channel)}&provider_id=eq.${encodeURIComponent(providerId)}&select=id&limit=1`);
      if (!rows?.[0]) return null;
      return this.getAttempt(rows[0].id);
    },
    async findUserByHandle(handle) {
      const key = normalizeHandle(handle);
      const rows = await rest(env, fetchImpl, `profiles?verified_destination=eq.${encodeURIComponent(key)}&select=user_id,verified_destination,outreach_enabled,channels`);
      if (!Array.isArray(rows) || rows.length !== 1) return null;
      return { userId: rows[0].user_id, destination: rows[0].verified_destination, outreachEnabled: rows[0].outreach_enabled !== false, channels: rows[0].channels ?? null };
    },
    async latestOpenReminder(userId) {
      const rows = await rest(env, fetchImpl, `notification_attempts?user_id=eq.${encodeURIComponent(userId)}&channel=eq.imessage&reminder_id=not.is.null&provider_id=not.is.null&order=updated_at.desc&select=reminder_id&limit=5`);
      for (const row of rows ?? []) {
        const reminders = await rest(env, fetchImpl, `reminders?id=eq.${encodeURIComponent(row.reminder_id)}&user_id=eq.${encodeURIComponent(userId)}&acknowledged_at=is.null&select=id,user_id&limit=1`);
        if (reminders?.[0]) return { id: reminders[0].id, userId };
      }
      return null;
    },
    async acknowledgeReminder(userId, reminderId) {
      const rows = await rest(env, fetchImpl, `reminders?id=eq.${encodeURIComponent(reminderId)}&user_id=eq.${encodeURIComponent(userId)}&acknowledged_at=is.null`, {
        method: "PATCH",
        body: { acknowledged_at: new Date().toISOString() },
      });
      const updated = Array.isArray(rows) && rows.length > 0;
      const existing = updated ? true : (await rest(env, fetchImpl, `reminders?id=eq.${encodeURIComponent(reminderId)}&user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`))?.length > 0;
      if (!existing) return false;
      await rest(env, fetchImpl, `notification_attempts?user_id=eq.${encodeURIComponent(userId)}&reminder_id=eq.${encodeURIComponent(reminderId)}`, {
        method: "PATCH",
        body: { error_code: null },
      }).catch(() => {});
      return true;
    },
  };
}

let singleton;
export function defaultStore(env = process.env) {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) return createSupabaseStore(env);
  singleton ??= createMemoryStore();
  return singleton;
}
