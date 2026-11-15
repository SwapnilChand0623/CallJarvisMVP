import { type DemoState, type Reminder, type Delivery } from "@/lib/mockData";
export type ReminderAction =
  | { type: "acknowledge" | "complete" | "reopen" | "cancel" }
  | { type: "snooze"; minutes: number }
  | {
      type: "edit";
      title: string;
      dueAt: string;
      priority: Reminder["priority"];
    };
export function changeReminder(
  state: DemoState,
  id: string,
  action: ReminderAction,
  now = new Date(),
): DemoState {
  const existing = state.reminders.find((r) => r.id === id);
  if (!existing) throw new Error("Reminder no longer exists.");
  const r = { ...existing };
  if (action.type === "acknowledge") r.acknowledgedAt = now.toISOString();
  if (action.type === "complete") r.status = "completed";
  if (action.type === "reopen") {
    r.status = "pending";
    r.acknowledgedAt = null;
  }
  if (action.type === "cancel") r.status = "canceled";
  if (action.type === "snooze") {
    if (!Number.isInteger(action.minutes) || action.minutes < 1)
      throw new Error("Choose a valid snooze duration.");
    r.status = "snoozed";
    r.dueAt = new Date(now.getTime() + action.minutes * 60000).toISOString();
  }
  if (action.type === "edit") {
    if (
      !action.title.trim() ||
      action.title.trim().length > 160 ||
      !Number.isFinite(Date.parse(action.dueAt))
    )
      throw new Error("Enter a task and valid date.");
    r.title = action.title.trim();
    r.dueAt = new Date(action.dueAt).toISOString();
    r.priority = action.priority;
    if (r.dueAt !== existing.dueAt) {
      r.status = "pending";
      r.acknowledgedAt = null;
    }
  }
  return {
    ...state,
    reminders: state.reminders.map((item) => (item.id === id ? r : item)),
    activities: [
      {
        id: crypto.randomUUID(),
        title: `Reminder: ${action.type}`,
        detail: r.title,
        time: now.toISOString(),
        kind: "reminder",
        reminderId: id,
      },
      ...state.activities,
    ],
  };
}
export function isQuietTime(p: DemoState["preferences"], now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: p.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const current = `${parts.find((x) => x.type === "hour")?.value}:${parts.find((x) => x.type === "minute")?.value}`;
  if (p.quietStart === p.quietEnd) return false;
  return p.quietStart < p.quietEnd
    ? current >= p.quietStart && current < p.quietEnd
    : current >= p.quietStart || current < p.quietEnd;
}
/** Preview only. The backend remains the sole authority for real delivery. */
export function previewOutreach(
  state: DemoState,
  eventId: string,
  now = new Date(),
): DemoState {
  const reminder = state.reminders.find((r) => r.id === eventId);
  const home = state.homeEvents.find((e) => e.id === eventId);
  if (!reminder && !home) throw new Error("Event not found.");
  const p = state.preferences;
  let reason = "Simulation only. No provider was contacted.";
  let blocked = false;
  if (!p.outreach) {
    blocked = true;
    reason = "Outreach is disabled.";
  } else if (
    reminder &&
    (!["pending", "snoozed"].includes(reminder.status) ||
      reminder.acknowledgedAt ||
      Date.parse(reminder.dueAt) > now.getTime())
  ) {
    blocked = true;
    reason = "Reminder is not due or already acknowledged.";
  } else if (
    home &&
    (!p.homeAlerts || !["high", "critical"].includes(home.severity))
  ) {
    blocked = true;
    reason = "Home event is not eligible for outreach.";
  } else if (isQuietTime(p, now)) {
    blocked = true;
    reason = "Quiet hours are active.";
  }
  const priority = reminder?.priority ?? home?.severity;
  const revision = reminder?.dueAt ?? home!.occurredAt;
  const hasMessage = state.deliveries.some(
    (d) =>
      d.eventId === eventId &&
      d.revision === revision &&
      d.channel === "iMessage" &&
      d.status === "simulated",
  );
  const escalation =
    priority === "high" &&
    p.escalation &&
    hasMessage &&
    reminder &&
    now.getTime() - Date.parse(reminder.dueAt) >= p.delayMinutes * 60000;
  const channel: Delivery["channel"] =
    (priority === "critical" && p.faceTime) || escalation
      ? "FaceTime"
      : "iMessage";
  if (!blocked && !(channel === "FaceTime" ? p.faceTime : p.iMessage)) {
    blocked = true;
    reason = `${channel} is disabled.`;
  }
  if (
    state.deliveries.some(
      (d) =>
        d.eventId === eventId &&
        d.revision === revision &&
        d.channel === channel &&
        d.status === "simulated",
    )
  )
    return state;
  if (
    !blocked &&
    channel === "FaceTime" &&
    state.deliveries.filter(
      (d) =>
        d.channel === "FaceTime" &&
        d.status === "simulated" &&
        now.getTime() - Date.parse(d.time) < 3600000,
    ).length >= p.maxCalls
  ) {
    blocked = true;
    reason = "Hourly call cap reached.";
  }
  const delivery: Delivery = {
    id: crypto.randomUUID(),
    eventId,
    revision,
    channel,
    stage: "requested",
    status: blocked ? "blocked" : "simulated",
    reason,
    time: now.toISOString(),
  };
  return { ...state, deliveries: [delivery, ...state.deliveries] };
}
