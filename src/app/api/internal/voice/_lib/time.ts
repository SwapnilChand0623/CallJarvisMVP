// Wall-clock <-> UTC conversion in the user's time zone. The model supplies a local time or an offset in minutes;
// the server does the arithmetic so daylight-saving changes are handled in one place.

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/;

export function validTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); return true; } catch { return false; }
}

/** "2026-11-15T09:00" for an instant, as seen in the zone. */
export function toLocal(at: Date, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** "Sunday, November 15 at 9:00 AM": what Jarvis reads back. */
export function toSpoken(at: Date, zone: string): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "long", month: "long", day: "numeric" }).format(at);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(at);
  return `${day} at ${time}`;
}

/** The instant for a wall-clock time in the zone, or null when the text is malformed or that time does not exist. */
export function fromLocal(local: string, zone: string): Date | null {
  const match = LOCAL.exec(local.trim());
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const normalized = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
  // Try the offsets in force just before and after; the earlier instant wins when a time occurs twice.
  const offsets = [wall - 86_400_000, wall + 86_400_000].map((probe) => Date.parse(`${toLocal(new Date(probe), zone)}:00Z`) - probe);
  for (const offset of [...new Set(offsets)].sort((a, b) => b - a)) {
    const candidate = new Date(wall - offset);
    if (toLocal(candidate, zone) === normalized) return candidate;
  }
  return null; // skipped by a daylight-saving jump, or not a real calendar date
}

export type DueInput = { dueLocal?: unknown; dueInMinutes?: unknown };
export type DueResult = { ok: true; at: Date } | { ok: false; code: string; message: string };

const MAX_AHEAD_MS = 2 * 366 * 86_400_000;

/** Resolves exactly one of dueLocal or dueInMinutes to a future instant. */
export function resolveDue(input: DueInput, zone: string, now: Date): DueResult {
  const hasLocal = typeof input.dueLocal === "string" && input.dueLocal.trim() !== "";
  const hasMinutes = input.dueInMinutes !== undefined && input.dueInMinutes !== null;
  if (hasLocal === hasMinutes) {
    return { ok: false, code: "time_required", message: "Ask the user for one specific date and time, then pass either dueLocal or dueInMinutes." };
  }
  let at: Date | null;
  if (hasMinutes) {
    const minutes = Number(input.dueInMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) return { ok: false, code: "time_invalid", message: "dueInMinutes must be at least 1." };
    at = new Date(now.getTime() + Math.round(minutes) * 60_000);
  } else {
    at = fromLocal(input.dueLocal as string, zone);
    if (!at) return { ok: false, code: "time_invalid", message: "dueLocal must be a real local time written as YYYY-MM-DDTHH:mm. Ask the user to restate the time." };
  }
  if (at.getTime() <= now.getTime()) return { ok: false, code: "time_in_past", message: `That time has already passed. It is now ${toSpoken(now, zone)}. Ask the user for a future time.` };
  if (at.getTime() - now.getTime() > MAX_AHEAD_MS) return { ok: false, code: "time_invalid", message: "That is more than two years away. Ask the user to confirm the date." };
  return { ok: true, at };
}
