"use client";
import { useState } from "react";
import Link from "next/link";
import { useDemo } from "@/components/demo-provider";
import { Button } from "@/components/ui/button";
export default function Settings() {
  const { state, update, reset } = useDemo();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"reset" | "history" | null>(null);
  const p = state.preferences;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>
            Your Jarvis, your way<span className="accent">.</span>
          </h1>
          <p>Your choices, clearly defined. Every channel starts disabled.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/auth">Connect Supabase account</Link>
        </Button>
      </div>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>Personal and communication preferences</h2>
            <p>
              These settings control the local policy preview. Live outreach is
              server-managed.
            </p>
          </div>
        </div>
        <form
          className="reminder-form"
          key={JSON.stringify(p)}
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            const zone = String(d.get("zone"));
            try {
              new Intl.DateTimeFormat("en", { timeZone: zone }).format();
            } catch {
              setError(
                "Enter a valid IANA time zone, such as America/Chicago.",
              );
              return;
            }
            update((s) => ({
              ...s,
              preferences: {
                ...s.preferences,
                name: String(d.get("name")).trim(),
                timeZone: zone,
                channel:
                  d.get("channel") === "FaceTime" ? "FaceTime" : "iMessage",
                outreach: d.get("outreach") === "on",
                escalation: d.get("escalation") === "on",
                faceTime: d.get("faceTime") === "on",
                iMessage: d.get("iMessage") === "on",
                homeAlerts: d.get("homeAlerts") === "on",
                quietStart: String(d.get("quietStart")),
                quietEnd: String(d.get("quietEnd")),
                delayMinutes: Number(d.get("delay")),
                maxCalls: Number(d.get("maxCalls")),
              },
            }));
            setError("");
            setNotice(
              "Preferences saved in this browser. No live destination or provider has been changed.",
            );
          }}
        >
          <div className="form-row">
            <label>
              Display name
              <input
                name="name"
                defaultValue={p.name}
                maxLength={60}
                required
              />
            </label>
            <label>
              Display time zone
              <input
                name="zone"
                defaultValue={p.timeZone}
                placeholder="America/Chicago"
                required
              />
            </label>
          </div>
          <label>
            Preferred reminder channel
            <select name="channel" defaultValue={p.channel}>
              <option>FaceTime</option>
              <option>iMessage</option>
            </select>
          </label>
          {[
            {
              name: "outreach",
              title: "Outreach opt-in",
              description:
                "Enable local policy previews. This does not authorize live calls.",
              checked: p.outreach,
            },
            {
              name: "iMessage",
              title: "iMessage integration",
              description: "Enable the simulated message channel.",
              checked: p.iMessage,
            },
            {
              name: "faceTime",
              title: "FaceTime Audio integration",
              description:
                "Enable the simulated call channel. Real outbound access requires provisioning.",
              checked: p.faceTime,
            },
            {
              name: "escalation",
              title: "Escalation after grace period",
              description:
                "Allow a high-priority reminder to request a simulated call after the delay.",
              checked: p.escalation,
            },
            {
              name: "homeAlerts",
              title: "Home simulator",
              description:
                "Enable fixture home events and explicit light commands.",
              checked: p.homeAlerts,
            },
          ].map((t) => (
            <label key={t.name} className="toggle-row">
              <span>
                <strong>{t.title}</strong>
                <small>{t.description}</small>
              </span>
              <input type="checkbox" name={t.name} defaultChecked={t.checked} />
            </label>
          ))}
          <div className="form-row">
            <label>
              Quiet hours begin
              <input
                type="time"
                name="quietStart"
                defaultValue={p.quietStart}
                required
              />
            </label>
            <label>
              Quiet hours end
              <input
                type="time"
                name="quietEnd"
                defaultValue={p.quietEnd}
                required
              />
            </label>
          </div>
          <p className="muted small">
            Uses your chosen time zone, including daylight saving time. Equal
            start/end disables quiet hours.
          </p>
          <div className="form-row">
            <label>
              Escalation delay (minutes)
              <input
                type="number"
                name="delay"
                min={1}
                max={1440}
                defaultValue={p.delayMinutes}
                required
              />
            </label>
            <label>
              Maximum calls per rolling hour
              <input
                type="number"
                name="maxCalls"
                min={1}
                max={24}
                defaultValue={p.maxCalls}
                required
              />
            </label>
          </div>
          <p className="notice">
            A live destination must be verified server-side. This page cannot
            edit verified contacts, bypass quiet hours, or grant access to real
            devices.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Button type="submit">Save preferences</Button>
        </form>
      </section>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>Your local data</h2>
            <p>
              Reset fixtures or delete applicable local event and outreach
              history.
            </p>
          </div>
        </div>
        <div className="section-body">
          {confirm ? (
            <>
              <p>
                {confirm === "reset"
                  ? "Replace all reminders, preferences, and saved context with fresh sample data?"
                  : "Delete local activity, home observations, and outreach attempts? Reminder records stay in place."}
              </p>
              <div className="save-row">
                <Button
                  onClick={() => {
                    if (confirm === "reset") reset();
                    else
                      update((s) => ({
                        ...s,
                        activities: [],
                        homeEvents: [],
                        deliveries: [],
                      }));
                    setConfirm(null);
                    setNotice("Local data updated.");
                  }}
                >
                  Confirm {confirm === "reset" ? "reset" : "history deletion"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(null)}>
                  Keep my data
                </Button>
              </div>
            </>
          ) : (
            <div className="save-row">
              <Button variant="outline" onClick={() => setConfirm("history")}>
                Delete local history
              </Button>
              <Button variant="outline" onClick={() => setConfirm("reset")}>
                Reset demo data
              </Button>
            </div>
          )}
        </div>
      </section>
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
    </>
  );
}
