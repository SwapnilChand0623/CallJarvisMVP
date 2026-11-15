"use client";
import { useState } from "react";
import { useDemo } from "@/components/demo-provider";
import { Button } from "@/components/ui/button";
export default function Settings() {
  const { state, update, reset } = useDemo();
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>
            Your Jarvis, your way<span className="accent">.</span>
          </h1>
          <p>A few preferences for a more thoughtful assistant.</p>
        </div>
      </div>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>The personal touches</h2>
            <p>Preferences are saved in this browser for the demo.</p>
          </div>
        </div>
        <form
          key={JSON.stringify(state.preferences)}
          className="reminder-form"
          onChange={() => setSaved(false)}
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            update((s) => ({
              ...s,
              preferences: {
                name: String(d.get("name")).trim(),
                channel:
                  d.get("channel") === "iMessage" ? "iMessage" : "FaceTime",
                escalation: d.get("escalation") === "on",
                homeAlerts: d.get("homeAlerts") === "on",
              },
            }));
            setSaved(true);
          }}
        >
          <label>
            What should Jarvis call you?
            <input
              name="name"
              defaultValue={state.preferences.name}
              required
              maxLength={60}
            />
          </label>
          <label>
            Preferred reminder channel
            <select name="channel" defaultValue={state.preferences.channel}>
              <option>FaceTime</option>
              <option>iMessage</option>
            </select>
          </label>
          <label className="toggle-row">
            <span>
              <strong>Escalation calls</strong>
              <small>
                Preference for calling when a high-priority reminder is missed.
              </small>
            </span>
            <input
              type="checkbox"
              name="escalation"
              defaultChecked={state.preferences.escalation}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Home activity alerts</strong>
              <small>Enable simulated home events in your dashboard.</small>
            </span>
            <input
              type="checkbox"
              name="homeAlerts"
              defaultChecked={state.preferences.homeAlerts}
            />
          </label>
          <p className="notice">
            Demo mode: these preferences do not connect to Chert, LiveKit, or
            Supabase. No real messages or calls are sent.
          </p>
          <div className="save-row">
            <Button type="submit">Save preferences</Button>
            {saved && (
              <span className="success" role="status">
                All saved.
              </span>
            )}
          </div>
        </form>
      </section>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <h2>A fresh start</h2>
            <p>Restore sample reminders and preferences for your next demo.</p>
          </div>
        </div>
        {confirm ? (
          <div className="reset-confirm">
            <p>
              Replace your local reminders, activity, and preferences with
              sample data?
            </p>
            <Button
              onClick={() => {
                reset();
                setConfirm(false);
                setSaved(false);
              }}
            >
              Reset demo
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep my changes
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setConfirm(true)}>
            Reset demo data
          </Button>
        )}
      </section>
    </>
  );
}
