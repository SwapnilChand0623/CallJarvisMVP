// Builds the Logs page from what is already recorded: each FaceTime attempt (why Jarvis called and how it ended)
// and the call log lines written during calls. No audio and no transcript exists to show.
import type { CallAttempt, CallEvent } from "../../app/api/internal/voice/_lib/types";

export type LogEntry = { at: string; text: string };
export type LogCall = {
  id: string;
  direction: "inbound" | "outbound";
  startedAt: string;
  why: string;
  outcome: { label: string; tone: "good" | "bad" | "neutral" };
  critical: boolean;
  simulated: boolean;
  timeline: LogEntry[];
};

const OUTCOMES: Record<string, LogCall["outcome"]> = {
  pending: { label: "Starting", tone: "neutral" },
  sending: { label: "Calling", tone: "neutral" },
  unknown: { label: "Outcome unknown", tone: "neutral" },
  accepted: { label: "Ringing", tone: "neutral" },
  answered: { label: "Answered", tone: "good" },
  completed: { label: "Completed", tone: "good" },
  unanswered: { label: "Not answered", tone: "bad" },
  failed: { label: "Failed", tone: "bad" },
  simulated: { label: "Simulated", tone: "neutral" },
  canceled: { label: "Canceled", tone: "neutral" },
};
const STAGES: Record<string, string> = {
  initial: "Jarvis decided to call you.",
  follow_up: "No response yet, so Jarvis called again.",
  escalation: "No response to the message, so Jarvis escalated to a call.",
  fallback: "The earlier call was not answered, so Jarvis called again.",
};

function reason(about: CallAttempt["about"]): { why: string; first: LogEntry | null } {
  if (!about) return { why: "Jarvis placed this call.", first: null };
  if (about.kind === "reminder") return {
    why: `Your ${about.priority ?? ""} reminder “${about.text}” was due.`.replace("  ", " "),
    first: about.at ? { at: about.at, text: `Reminder “${about.text}” came due.` } : null,
  };
  if (about.kind === "home_event") return {
    why: `${about.text}.`,
    first: about.at ? { at: about.at, text: `Home alert recorded: ${about.text}.` } : null,
  };
  return { why: "You asked Jarvis to call you back.", first: about.at ? { at: about.at, text: "The call back you asked for came due." } : null };
}

/** One closing line per call: the specific one from the call watcher wins over the worker's generic one. */
function closing(events: CallEvent[]) {
  const ended = events.filter((event) => event.event === "call_ended");
  return ended.find((event) => event.summary !== "The call ended.") ?? ended[0] ?? null;
}

const byTime = (a: LogEntry, b: LogEntry) => Date.parse(a.at) - Date.parse(b.at);
const iso = (value: string) => new Date(value).toISOString();

export function buildCallLog(attempts: CallAttempt[], events: CallEvent[]): LogCall[] {
  const calls: LogCall[] = [];

  for (const attempt of attempts) {
    const mine = events.filter((event) => event.attemptId === attempt.id);
    const { why, first } = reason(attempt.about);
    const end = closing(mine);
    const timeline: LogEntry[] = [
      ...(first ? [{ at: iso(first.at), text: first.text }] : []),
      { at: attempt.createdAt, text: STAGES[attempt.stage] ?? STAGES.initial },
      // The reason is shown above the timeline, so the session's opening line is not repeated here.
      ...mine.filter((event) => event.event !== "call_started" && event.event !== "call_ended").map((event) => ({ at: event.at, text: event.summary })),
      ...(end ? [{ at: end.at, text: end.summary }] : []),
    ].sort(byTime);
    if (attempt.status === "failed" && !end) {
      timeline.push({ at: attempt.outcomeAt ?? attempt.createdAt, text: `The call could not be placed${attempt.errorCode ? ` (${attempt.errorCode.replace(/_/g, " ")})` : ""}.` });
    }
    calls.push({
      id: attempt.id, direction: "outbound", startedAt: attempt.createdAt, why,
      outcome: OUTCOMES[attempt.status] ?? { label: attempt.status, tone: "neutral" },
      critical: attempt.about?.priority === "critical", simulated: attempt.simulated, timeline,
    });
  }

  // Calls the user placed have no attempt: their lines are grouped by the call they belong to.
  const inbound = new Map<string, CallEvent[]>();
  for (const event of events) {
    if (event.attemptId || !event.callId) continue;
    inbound.set(event.callId, [...(inbound.get(event.callId) ?? []), event]);
  }
  for (const [callId, group] of inbound) {
    const ordered = [...group].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const end = closing(ordered);
    calls.push({
      id: callId, direction: "inbound", startedAt: ordered[0].at, why: "You called Jarvis.",
      outcome: end ? { label: "Completed", tone: "good" } : { label: "Answered", tone: "good" },
      critical: false, simulated: false,
      timeline: [
        ...ordered.filter((event) => event.event !== "call_ended").map((event) => ({ at: event.at, text: event.event === "call_started" ? "Jarvis answered." : event.summary })),
        ...(end ? [{ at: end.at, text: end.summary }] : []),
      ],
    });
  }

  return calls.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
