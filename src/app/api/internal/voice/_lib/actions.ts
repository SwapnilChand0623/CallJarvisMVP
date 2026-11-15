// Authorized domain actions for voice and iMessage. Each runs for an Actor that trusted server code resolved;
// nothing here accepts a user id from the caller's arguments. A result is ok only after the write succeeded.
import { propByEventType } from "../../../../../lib/home/props";
import { ACTION_NAMES } from "./contract";
import { resolveDue, toLocal, toSpoken } from "./time";
import type { ActionError, ActionResult, Actor, Deps, HomeEvent, Priority, Reminder, ReminderPatch, ReminderStatus } from "./types";
import { createHome } from "../../../../../lib/server/home/service";

type Args = Record<string, unknown>;
type Outcome = Record<string, unknown> | Failure;

class Failure {
  error: ActionError;
  constructor(code: string, message: string, candidates?: ActionError["candidates"]) {
    this.error = { code, message, ...(candidates ? { candidates } : {}) };
  }
}

const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];
const OPEN: ReminderStatus[] = ["pending", "snoozed"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** When outreach is next due: the snooze time while snoozed, otherwise the due time. */
const effectiveDue = (reminder: Reminder) => new Date(reminder.status === "snoozed" && reminder.snoozedUntil ? reminder.snoozedUntil : reminder.dueAt);

function view(reminder: Reminder, actor: Actor, now: Date) {
  const due = effectiveDue(reminder);
  return {
    id: reminder.id,
    title: reminder.title,
    due: toSpoken(due, actor.timeZone),
    dueLocal: toLocal(due, actor.timeZone),
    priority: reminder.priority,
    status: reminder.status,
    acknowledged: reminder.acknowledgedAt !== null,
    overdue: OPEN.includes(reminder.status) && due.getTime() < now.getTime(),
  };
}

function eventView(event: HomeEvent, actor: Actor) {
  return {
    id: event.id, type: event.type, severity: event.severity, description: event.description,
    when: toSpoken(new Date(event.occurredAt), actor.timeZone), simulated: event.source === "simulated",
    acknowledged: event.acknowledgedAt !== null,
  };
}

/** Finds one of the actor's open reminders by id, by title words, or from the call's own reminder. */
async function findReminder(deps: Deps, actor: Actor, reference: unknown): Promise<Reminder | Failure> {
  const wanted = text(reference, 200);
  if (!wanted) {
    if (!actor.focusReminderId) return new Failure("reminder_required", "Ask which reminder the user means, then pass its id or title.");
    const focus = await deps.store.getReminder(actor.userId, actor.focusReminderId);
    return focus ?? new Failure("reminder_not_found", "The reminder for this call no longer exists.");
  }
  if (UUID.test(wanted)) {
    const exact = await deps.store.getReminder(actor.userId, wanted);
    return exact ?? new Failure("reminder_not_found", "No reminder with that id belongs to this user.");
  }
  const open = await deps.store.listReminders(actor.userId, OPEN, 100);
  const words = wanted.toLowerCase().split(" ");
  const exactTitle = open.filter((item) => item.title.toLowerCase() === wanted.toLowerCase());
  const matches = exactTitle.length ? exactTitle : open.filter((item) => words.every((word) => item.title.toLowerCase().includes(word)));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) return new Failure("reminder_not_found", `No open reminder matches "${wanted}". Offer to list the open reminders.`);
  return new Failure("reminder_ambiguous", "More than one reminder matches. Ask the user which one, then pass its id.",
    matches.slice(0, 5).map((item) => ({ id: item.id, title: item.title, due: toSpoken(effectiveDue(item), actor.timeZone) })));
}

async function change(deps: Deps, actor: Actor, now: Date, reminder: Reminder, patch: ReminderPatch) {
  const saved = await deps.store.updateReminder(actor.userId, reminder.id, patch);
  return saved ? { reminder: view(saved, actor, now) } : new Failure("reminder_not_found", "The reminder no longer exists, so nothing changed.");
}

const closed = (reminder: Reminder) =>
  OPEN.includes(reminder.status) ? null : new Failure("reminder_closed", `That reminder is already ${reminder.status}, so nothing changed.`);

/** The stove on while Away is a critical alert whichever way it came about. A failed check never fails the action. */
async function stoveCheck(deps: Deps, userId: string) {
  try { await createHome(deps.store, () => (deps.now?.() ?? new Date()).getTime()).checkStove(userId); }
  catch (error) { console.error("[voice] stove check failed", error instanceof Error ? error.message : error); }
}

const handlers: Record<string, (deps: Deps, actor: Actor, args: Args, now: Date) => Promise<Outcome>> = {
  async listReminders(deps, actor, args, now) {
    const filter = text(args.filter, 20) || "open";
    if (!["open", "overdue", "today", "completed"].includes(filter)) return new Failure("invalid_arguments", "filter must be open, overdue, today or completed.");
    const rows = await deps.store.listReminders(actor.userId, filter === "completed" ? ["completed"] : OPEN, 100);
    const today = toLocal(now, actor.timeZone).slice(0, 10);
    const kept = rows.filter((item) =>
      filter === "overdue" ? effectiveDue(item).getTime() < now.getTime() :
      filter === "today" ? toLocal(effectiveDue(item), actor.timeZone).slice(0, 10) === today : true);
    kept.sort((a, b) => effectiveDue(a).getTime() - effectiveDue(b).getTime());
    return { filter, total: kept.length, reminders: kept.slice(0, 10).map((item) => view(item, actor, now)) };
  },

  async createReminder(deps, actor, args, now) {
    const title = text(args.title, 200);
    if (!title) return new Failure("invalid_arguments", "Ask the user what the reminder is for.");
    const priority = args.priority === undefined || args.priority === null ? "medium" : args.priority;
    if (!PRIORITIES.includes(priority as Priority)) return new Failure("invalid_arguments", "priority must be low, medium, high or critical.");
    const due = resolveDue(args, actor.timeZone, now);
    if (!due.ok) return new Failure(due.code, due.message);
    const saved = await deps.store.insertReminder(actor.userId, { title, dueAt: due.at.toISOString(), priority: priority as Priority });
    return { reminder: view(saved, actor, now) };
  },

  async updateReminder(deps, actor, args, now) {
    const reminder = await findReminder(deps, actor, args.reminder);
    if (reminder instanceof Failure) return reminder;
    const patch: ReminderPatch = {};
    if (args.title !== undefined) {
      const title = text(args.title, 200);
      if (!title) return new Failure("invalid_arguments", "The new title is empty.");
      patch.title = title;
    }
    if (args.priority !== undefined) {
      if (!PRIORITIES.includes(args.priority as Priority)) return new Failure("invalid_arguments", "priority must be low, medium, high or critical.");
      patch.priority = args.priority as Priority;
    }
    if (args.dueLocal !== undefined || args.dueInMinutes !== undefined) {
      const due = resolveDue(args, actor.timeZone, now);
      if (!due.ok) return new Failure(due.code, due.message);
      // A new time is a new commitment: it becomes pending again and may notify again.
      Object.assign(patch, { dueAt: due.at.toISOString(), status: "pending", snoozedUntil: null, acknowledgedAt: null });
    }
    if (Object.keys(patch).length === 0) return new Failure("invalid_arguments", "Nothing to change. Pass a title, priority or new time.");
    if (reminder.status === "canceled" || (reminder.status === "completed" && !patch.dueAt)) return closed(reminder)!;
    return change(deps, actor, now, reminder, patch);
  },

  async snoozeReminder(deps, actor, args, now) {
    const reminder = await findReminder(deps, actor, args.reminder);
    if (reminder instanceof Failure) return reminder;
    const due = resolveDue(args, actor.timeZone, now);
    if (!due.ok) return new Failure(due.code, due.message);
    return closed(reminder) ?? change(deps, actor, now, reminder, { status: "snoozed", snoozedUntil: due.at.toISOString(), acknowledgedAt: null });
  },

  async acknowledgeReminder(deps, actor, args, now) {
    const reminder = await findReminder(deps, actor, args.reminder);
    if (reminder instanceof Failure) return reminder;
    if (reminder.acknowledgedAt) return { reminder: view(reminder, actor, now), alreadyAcknowledged: true };
    return closed(reminder) ?? change(deps, actor, now, reminder, { acknowledgedAt: now.toISOString() });
  },

  async completeReminder(deps, actor, args, now) {
    const reminder = await findReminder(deps, actor, args.reminder);
    if (reminder instanceof Failure) return reminder;
    if (reminder.status === "completed") return { reminder: view(reminder, actor, now), alreadyCompleted: true };
    return closed(reminder) ?? change(deps, actor, now, reminder, { status: "completed", snoozedUntil: null });
  },

  async cancelReminder(deps, actor, args, now) {
    // Canceling never falls back to the call's reminder: the user must name it.
    if (!text(args.reminder, 200)) return new Failure("reminder_required", "Ask which reminder to cancel, then pass its id or title.");
    const reminder = await findReminder(deps, actor, args.reminder);
    if (reminder instanceof Failure) return reminder;
    return closed(reminder) ?? change(deps, actor, now, reminder, { status: "canceled", snoozedUntil: null });
  },

  async getHomeStatus(deps, actor) {
    const [devices, events, mode] = await Promise.all([
      deps.store.listDevices(actor.userId), deps.store.listHomeEvents(actor.userId, 5), deps.store.getHomeMode(actor.userId),
    ]);
    return {
      mode,
      devices: devices.map((device) => ({ id: device.id, name: device.name, kind: device.kind, on: device.on, simulated: device.simulated })),
      recentEvents: events.map((event) => eventView(event, actor)),
    };
  },

  async controlDevice(deps, actor, args) {
    if (typeof args.on !== "boolean") return new Failure("invalid_arguments", "Ask whether it should be on or off.");
    const wanted = text(args.device, 100).toLowerCase();
    if (!wanted) return new Failure("invalid_arguments", "Ask which device the user means.");
    const devices = await deps.store.listDevices(actor.userId);
    const byId = devices.filter((device) => device.id.toLowerCase() === wanted);
    const matches = byId.length ? byId : devices.filter((device) =>
      device.name.toLowerCase().includes(wanted) || wanted.includes(device.name.toLowerCase()) || wanted.includes(device.kind));
    if (matches.length === 0) return new Failure("device_not_found", "No authorized device matches. Call getHomeStatus to see the user's devices.");
    if (matches.length > 1) return new Failure("device_ambiguous", `More than one device matches: ${matches.map((device) => device.name).join(", ")}. Ask which one.`);
    const device = matches[0];
    const outcome = await deps.home.setDevice({ userId: actor.userId, deviceId: device.id, on: args.on, origin: actor.origin });
    if (!outcome.ok) return new Failure("device_action_failed", `The ${device.kind} did not change: ${outcome.reason}. Tell the user it failed.`);
    if (device.kind === "stove" && outcome.on) await stoveCheck(deps, actor.userId);
    return { device: { id: device.id, name: device.name, kind: device.kind, on: outcome.on }, simulated: outcome.simulated };
  },

  async setHomeMode(deps, actor, args) {
    if (args.mode !== "home" && args.mode !== "away") return new Failure("invalid_arguments", "mode must be home or away.");
    const mode = await deps.store.setHomeMode(actor.userId, args.mode);
    if (mode === "away") await stoveCheck(deps, actor.userId);
    return { mode };
  },

  async acknowledgeHomeEvent(deps, actor) {
    // The event this call is about, or otherwise the newest one still waiting.
    let event = actor.focusEventId ? await deps.store.getHomeEvent(actor.userId, actor.focusEventId) : null;
    if (!event) event = (await deps.store.listHomeEvents(actor.userId, 10)).find((item) => !item.acknowledgedAt) ?? null;
    if (!event) return new Failure("event_not_found", "There is no home event waiting to be acknowledged.");
    if (event.acknowledgedAt) return { event: eventView(event, actor), alreadyAcknowledged: true };
    const saved = await deps.store.acknowledgeHomeEvent(actor.userId, event.id);
    return saved ? { event: eventView(saved, actor) } : new Failure("event_not_found", "That event no longer exists, so nothing changed.");
  },

  async saveMemory(deps, actor, args) {
    if (args.userConsented !== true) return new Failure("consent_required", "Nothing was saved. Ask the user whether to save this note, and only call again after a yes.");
    const content = text(args.content, 300);
    if (!content) return new Failure("invalid_arguments", "The note is empty.");
    const saved = await deps.store.insertMemory(actor.userId, content);
    return { memory: { id: saved.id, content: saved.content } };
  },

  async scheduleCheckIn(deps, actor, args, now) {
    if (args.userConsented !== true) return new Failure("consent_required", "Nothing was scheduled. Ask the user whether they want this check-in, and only call again after a yes.");
    const due = resolveDue(args, actor.timeZone, now);
    if (!due.ok) return new Failure(due.code, due.message);
    const saved = await deps.store.insertCheckIn(actor.userId, { dueAt: due.at.toISOString() });
    return { checkIn: { id: saved.id, due: toSpoken(due.at, actor.timeZone) } };
  },
};

/** Runs one contract action for the actor. Never throws: storage and provider failures come back as ok:false. */
export async function runAction(deps: Deps, actor: Actor, name: string, args: unknown): Promise<ActionResult> {
  const handler = ACTION_NAMES.includes(name) ? handlers[name] : undefined;
  if (!handler) return { ok: false, error: { code: "unknown_action", message: `There is no action named ${name}.` } };
  if (args !== undefined && args !== null && (typeof args !== "object" || Array.isArray(args))) {
    return { ok: false, error: { code: "invalid_arguments", message: "Arguments must be an object." } };
  }
  try {
    const outcome = await handler(deps, actor, (args ?? {}) as Args, deps.now?.() ?? new Date());
    return outcome instanceof Failure ? { ok: false, error: outcome.error } : { ok: true, result: outcome };
  } catch (error) {
    console.error(`[voice] ${name} failed`, error instanceof Error ? error.message : error);
    return { ok: false, error: { code: "write_failed", message: "The change could not be saved. Tell the user it did not go through and offer to try again." } };
  }
}

/** What Jarvis may know at the start of a contact: the user's name, local time, open reminders and approved notes. */
export async function buildContext(deps: Deps, actor: Actor) {
  const now = deps.now?.() ?? new Date();
  const [open, memories] = await Promise.all([
    deps.store.listReminders(actor.userId, OPEN, 100),
    deps.store.listMemories(actor.userId, 10),
  ]);
  open.sort((a, b) => effectiveDue(a).getTime() - effectiveDue(b).getTime());
  const focus = actor.focusReminderId ? await deps.store.getReminder(actor.userId, actor.focusReminderId) : null;
  const focusEvent = actor.focusEventId ? await deps.store.getHomeEvent(actor.userId, actor.focusEventId) : null;
  const [mode, devices] = await Promise.all([deps.store.getHomeMode(actor.userId), deps.store.listDevices(actor.userId)]);
  return {
    user: { name: actor.displayName, timeZone: actor.timeZone },
    now: { local: toLocal(now, actor.timeZone), spoken: toSpoken(now, actor.timeZone) },
    focusReminder: focus ? view(focus, actor, now) : null,
    // What Jarvis may offer on a call about this event, from the simulator's prop map.
    focusEvent: focusEvent ? { ...eventView(focusEvent, actor), suggestion: propByEventType(focusEvent.type)?.offer ?? null } : null,
    home: { mode, devices: devices.map((device) => ({ name: device.name, kind: device.kind, on: device.on })) },
    openReminders: open.slice(0, 10).map((item) => view(item, actor, now)),
    openReminderCount: open.length,
    savedNotes: memories.map((memory) => memory.content),
  };
}
