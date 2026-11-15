export type Channel = "imessage" | "facetime";
export type Stage = "initial" | "follow_up" | "escalation" | "fallback";
export type Candidate = {
  kind: "reminder" | "home_event" | "check_in";
  id: string;
  revision: string;
  priority: "low" | "medium" | "high" | "critical";
  dueAt: string;
  active: boolean;
  acknowledgedAt: string | null;
  policy: {
    enabled: boolean;
    channels: Channel[]; // Intersection of consent, verified destination and transport capability.
    timezone: string;
    quietHours: { start: string; end: string } | null;
    callsRemaining: number;
    graceSeconds: number;
    lowMessage: boolean;
    mediumFollowUpSeconds: number | null;
    highCallSeconds: number;
    criticalChannel: Channel;
    criticalFallback: { channel: Channel; delaySeconds: number } | null;
  };
  attempts: {
    channel: Channel;
    stage: Stage;
    status: "pending" | "sending" | "unknown" | "accepted" | "answered" |
      "completed" | "unanswered" | "failed" | "simulated";
    outcomeAt: string | null;
  }[];
};

function quiet(now: Date, zone: string, hours: NonNullable<Candidate["policy"]["quietHours"]>) {
  if (![hours.start, hours.end].every((time) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) return true;
  try {
    const local = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(now);
    if (hours.start === hours.end) return false;
    return hours.start < hours.end
      ? local >= hours.start && local < hours.end
      : local >= hours.start || local < hours.end;
  } catch {
    return true;
  }
}

export function decide(item: Candidate, now: Date): { channel: Channel; stage: Stage }[] {
  const p = item.policy;
  const elapsed = (now.getTime() - Date.parse(item.dueAt)) / 1000;
  if (!item.active || item.acknowledgedAt || !p.enabled || !(elapsed >= 0) ||
    (p.quietHours && quiet(now, p.timezone, p.quietHours)) ||
    (item.priority !== "critical" && !(elapsed >= p.graceSeconds))) return [];

  const result: { channel: Channel; stage: Stage }[] = [];
  const add = (channel: Channel, stage: Stage) => {
    const existing = item.attempts.find((a) => a.channel === channel && a.stage === stage);
    if (!p.channels.includes(channel) ||
      (channel === "facetime" && !(p.callsRemaining > 0) && !existing)) return;
    if (existing && !["pending", "sending", "unknown"].includes(existing.status)) return;
    result.push({ channel, stage });
  };
  const initial = (channel: Channel) => item.attempts.find((a) =>
    a.channel === channel && a.stage === "initial");
  const since = (at: string | null) => at === null ? -Infinity :
    (now.getTime() - Date.parse(at)) / 1000;

  switch (item.priority) {
    case "low":
      if (p.lowMessage) add("imessage", "initial");
      break;
    case "medium": {
      add("imessage", "initial");
      const message = initial("imessage");
      if (message && ["accepted", "completed", "simulated"].includes(message.status) &&
        p.mediumFollowUpSeconds !== null && since(message.outcomeAt) >= p.mediumFollowUpSeconds) {
        add("imessage", "follow_up");
      }
      break;
    }
    case "high": {
      add("imessage", "initial");
      const message = initial("imessage");
      if (message && ["accepted", "completed", "simulated"].includes(message.status) &&
        since(message.outcomeAt) >= p.highCallSeconds) {
        add("facetime", "escalation");
      }
      break;
    }
    case "critical": {
      add(p.criticalChannel, "initial");
      const alert = initial(p.criticalChannel);
      const fallback = p.criticalFallback;
      if (fallback && alert?.status === "unanswered" &&
        since(alert.outcomeAt) >= fallback.delaySeconds) {
        add(fallback.channel, "fallback");
      }
      break;
    }
  }
  return result;
}
