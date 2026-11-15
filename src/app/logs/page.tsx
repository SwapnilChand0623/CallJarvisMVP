"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PhoneIncoming, PhoneOutgoing } from "lucide-react";
import { useAccount } from "@/components/account-provider";
import "./logs.css";

type Entry = { at: string; text: string };
type Call = {
  id: string; direction: "inbound" | "outbound"; startedAt: string; why: string;
  outcome: { label: string; tone: "good" | "bad" | "neutral" }; critical: boolean; simulated: boolean; timeline: Entry[];
};

const day = (value: string) => new Date(value).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const clock = (value: string) => new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

export default function Logs() {
  const { client, user } = useAccount();
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const token = (await client?.auth.getSession())?.data.session?.access_token ?? "";
      const response = await fetch("/api/logs", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      setCalls(payload.calls);
      setError("");
    } catch (err) {
      setError(err instanceof Error && err.message === "store_unavailable" ? "The call log is not connected to the database." : "We couldn’t load the call log. Retrying…");
    }
  }, [client]);

  // A call in progress adds lines as it goes, so the page keeps itself current.
  useEffect(() => {
    if (!client || !user) return;
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 4000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [client, user, refresh]);

  return (
    <section className="logs">
      <header className="logs-head">
        <h1>Logs</h1>
        <p>Every FaceTime call with Jarvis: why it happened and what was done on it. Calls are not recorded or transcribed.</p>
      </header>
      {error && <p className="logs-error" role="status">{error}</p>}
      {calls === null && !error && <p className="logs-empty" role="status">Loading…</p>}
      {calls?.length === 0 && (
        <p className="logs-empty">No calls yet. Jarvis calls you about critical reminders and about home alerts while the home is set to Away.</p>
      )}
      {calls?.map((call) => {
        const Icon = call.direction === "outbound" ? PhoneOutgoing : PhoneIncoming;
        return (
          <article key={`${call.direction}-${call.id}`} className={call.critical ? "log-card critical" : "log-card"}>
            <div className="log-top">
              <span className="log-title"><Icon size={17} aria-hidden />{call.direction === "outbound" ? "Jarvis called you" : "You called Jarvis"}</span>
              <span className={`log-badge ${call.outcome.tone}`}>{call.outcome.label}</span>
            </div>
            <p className="log-when">{day(call.startedAt)} · {clock(call.startedAt)}{call.simulated ? " · simulated" : ""}</p>
            <p className="log-why"><span>Why</span>{call.why}</p>
            <ol className="log-timeline">
              {call.timeline.map((entry, index) => (
                <li key={index}><time dateTime={entry.at}>{clock(entry.at)}</time><span>{entry.text}</span></li>
              ))}
            </ol>
          </article>
        );
      })}
      <p className="logs-foot"><Link href="/reminders">See your reminders</Link></p>
    </section>
  );
}
