"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BellRing, Check, Copy, Phone, Plus } from "lucide-react";
import { useAccount } from "@/components/account-provider";
import { Button } from "@/components/ui/button";
import { loadReminders } from "@/lib/supabase/reminders";
import type { Reminder } from "@/lib/mockData";
export default function Home() {
  const { client, user, verified, error: accountError } = useAccount();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const configured = process.env.NEXT_PUBLIC_CHERT_PHONE_NUMBER?.trim() ?? "";
  const dial = configured.replace(/[\s().-]/g, "");
  const number = /^\+[1-9]\d{7,14}$/.test(dial) ? configured : "";
  useEffect(() => {
    if (!client || !user) return;
    let alive = true;
    const refresh = () =>
      void loadReminders(client)
        .then((rows) => {
          if (alive) {
            setReminders(rows);
            setLoading(false);
            setError("");
          }
        })
        .catch(() => {
          if (alive) {
            setError(
              "We couldn’t load your reminders. Please try again in Reminders.",
            );
            setLoading(false);
          }
        });
    refresh();
    const interval = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    const channel = client
      .channel(`home-reminders:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
          filter: `user_id=eq.${user.id}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      void client.removeChannel(channel);
    };
  }, [client, user]);
  const upcoming = reminders
    .filter((r) => r.status === "pending" || r.status === "snoozed")
    .sort(
      (a, b) =>
        Date.parse(a.snoozedUntil ?? a.dueAt) -
        Date.parse(b.snoozedUntil ?? b.dueAt),
    );
  return (
    <div className="home-content">
      <div className="home-heading">
        <div>
          <span className="eyebrow">YOUR DAY, A LITTLE LIGHTER</span>
          <h1>A little less on your mind.</h1>
          <p>Tell Jarvis what to remember. Get on with your day.</p>
        </div>
        <Button asChild>
          <Link href="/reminders">
            <Plus size={17} /> Add a reminder
          </Link>
        </Button>
      </div>
      <section className="call-card" aria-labelledby="call-title">
        <div className="call-copy">
          <span className="call-label">
            <Phone size={15} /> A CONVERSATION AWAY
          </span>
          <h2 id="call-title">Just call Jarvis.</h2>
          <p>
            Add a reminder, ask what’s next,
            <br />
            or change your plans. Simply say it.
          </p>
          <div className="call-number">{number || "Number coming soon"}</div>
          <div className="call-actions">
            {number ? (
              <>
                <Button asChild>
                  <a href={`facetime-audio:${dial}`}>
                    <Phone size={17} /> Call on FaceTime
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(dial);
                      setCopied(true);
                      setCopyError("");
                    } catch {
                      setCopyError("Select the number above to copy it.");
                    }
                  }}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy number"}
                </Button>
              </>
            ) : (
              <p className="call-unavailable">
                Your Jarvis line is being connected. You can still manage
                reminders below.
              </p>
            )}
          </div>
          <p className="call-caption">
            {number
              ? "FaceTime access needs to be enabled for your number."
              : "We’ll show the number here when it’s ready."}
          </p>
          {copyError && <p role="status">{copyError}</p>}
        </div>
        <div className="call-art" aria-hidden="true">
          <div className="call-orbit" />
          <div className="call-orbit inner" />
          <div className="call-orb">
            <Phone size={43} strokeWidth={1.3} />
          </div>
          <span className="call-speech">“What do I have coming up?”</span>
        </div>
      </section>
      {(!verified || accountError) && (
        <div className="phone-status">
          <span className="status-dot" />
          <p>
            {accountError ||
              "Your number is saved. Calling access still needs verification."}
          </p>
          <Link href="/account">
            View account <ArrowRight size={14} />
          </Link>
        </div>
      )}
      <section className="upcoming-panel">
        <div className="upcoming-heading">
          <div>
            <span className="eyebrow">ONE THING AT A TIME</span>
            <h2>Coming up</h2>
          </div>
          <Link href="/reminders" className="text-link">
            View reminders <ArrowRight size={15} />
          </Link>
        </div>
        {error ? (
          <p className="flow-error" role="alert">
            {error}
          </p>
        ) : loading ? (
          <p className="quiet-empty" role="status">
            Loading your reminders…
          </p>
        ) : upcoming.length ? (
          <div className="upcoming-list">
            {upcoming.slice(0, 4).map((r) => (
              <Link key={r.id} href="/reminders" className="upcoming-row">
                <span className="reminder-mark">
                  <BellRing size={18} />
                </span>
                <div>
                  <strong>{r.title}</strong>
                  <time dateTime={r.snoozedUntil ?? r.dueAt}>
                    {new Date(r.snoozedUntil ?? r.dueAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <span className={`priority-label ${r.priority}`}>
                  {r.priority}
                </span>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="quiet-empty">
            <span className="empty-symbol">
              <Check size={24} />
            </span>
            <h3>A little breathing room.</h3>
            <p>
              No reminders yet. Add your first, and leave the remembering here.
            </p>
            <Button asChild variant="outline">
              <Link href="/reminders">
                <Plus size={16} /> Create a reminder
              </Link>
            </Button>
          </div>
        )}
      </section>
      <p className="home-tip">
        Try saying: “Remind me to water the plants tomorrow at nine.”
      </p>
    </div>
  );
}
