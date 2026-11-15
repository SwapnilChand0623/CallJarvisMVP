"use client";
import { useState } from "react";
import { useDemo } from "@/components/demo-provider";
import { Button } from "@/components/ui/button";
import { CallDemo } from "@/components/call-demo";
import { formatTime } from "@/lib/mockData";
export default function Talks() {
  const { state, update } = useDemo();
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const p = state.preferences;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE SPACE TO TALK</span>
          <h1>
            JarvisTalks<span className="accent">.</span>
          </h1>
          <p>Set the pace. Choose what Jarvis remembers.</p>
        </div>
        <CallDemo />
      </div>
      <div className="notice">
        Conversation preferences and check-ins are simulated here. Jarvis offers
        supportive, non-clinical conversation. No recording is enabled.
      </div>
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>Conversation preferences</h2>
        </div>
        <form
          className="reminder-form"
          key={JSON.stringify(p)}
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            const memory = d.get("memory") === "on";
            const checkins = d.get("checkins") === "on";
            update((s) => ({
              ...s,
              preferences: {
                ...s.preferences,
                talkStyle: d.get("style") as typeof p.talkStyle,
                memoryConsent: memory,
                checkInConsent: checkins,
              },
              memories: memory ? s.memories : [],
              checkIns: checkins
                ? s.checkIns
                : s.checkIns.map((c) => ({ ...c, status: "canceled" })),
            }));
            setNotice(
              "Preferences saved. Disabling memory deletes saved context; disabling check-ins cancels pending check-ins.",
            );
          }}
        >
          <label>
            Conversation style
            <select name="style" defaultValue={p.talkStyle}>
              <option value="brief">Brief and practical</option>
              <option value="warm">Warm and conversational</option>
              <option value="reflective">Room to reflect</option>
            </select>
          </label>
          <label className="toggle-row">
            <span>
              <strong>Approve saved context</strong>
              <small>
                Only text you explicitly save below is retained. Turning this
                off deletes it.
              </small>
            </span>
            <input
              type="checkbox"
              name="memory"
              defaultChecked={p.memoryConsent}
            />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Allow one-off check-ins</strong>
              <small>
                Opt in before scheduling. Turning this off cancels pending
                check-ins.
              </small>
            </span>
            <input
              type="checkbox"
              name="checkins"
              defaultChecked={p.checkInConsent}
            />
          </label>
          <Button type="submit">Save conversation preferences</Button>
        </form>
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Approved context</h2>
              <p>You decide what stays, and can delete it at any time.</p>
            </div>
          </div>
          <form
            className="reminder-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const text = String(new FormData(form).get("context")).trim();
              if (!text) return;
              update((s) =>
                s.preferences.memoryConsent
                  ? {
                      ...s,
                      memories: [
                        ...s.memories,
                        {
                          id: crypto.randomUUID(),
                          text,
                          approvedAt: new Date().toISOString(),
                        },
                      ],
                    }
                  : s,
              );
              form.reset();
              setNotice("Context approved and saved locally.");
            }}
          >
            <label>
              Context to remember
              <input
                name="context"
                placeholder="e.g. Keep calls short on weekdays"
                maxLength={300}
                required
                disabled={!p.memoryConsent}
              />
            </label>
            <Button type="submit" disabled={!p.memoryConsent}>
              Approve and save context
            </Button>
            {!p.memoryConsent && (
              <p className="muted small">
                Opt in to saved context above to enable this.
              </p>
            )}
          </form>
          {state.memories.length ? (
            state.memories.map((m) => (
              <div className="activity-row" key={m.id}>
                <div>
                  <strong>{m.text}</strong>
                  <p>Approved {formatTime(m.approvedAt, p.timeZone)}</p>
                </div>
                {deleting === m.id ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      update((s) => ({
                        ...s,
                        memories: s.memories.filter((x) => x.id !== m.id),
                      }));
                      setDeleting(null);
                      setNotice("Saved context deleted.");
                    }}
                  >
                    Confirm deletion
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={() => setDeleting(m.id)}>
                    Delete
                  </Button>
                )}
              </div>
            ))
          ) : (
            <div className="empty">
              No saved context. Nothing is remembered automatically.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>A one-off check-in</h2>
              <p>Scheduled locally; no live call will be placed.</p>
            </div>
          </div>
          <form
            className="reminder-form"
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(new FormData(e.currentTarget).get("when"));
              if (Date.parse(value) <= Date.now()) {
                setNotice("Choose a future time for your check-in.");
                return;
              }
              update((s) =>
                s.preferences.checkInConsent
                  ? {
                      ...s,
                      checkIns: [
                        ...s.checkIns,
                        {
                          id: crypto.randomUUID(),
                          dueAt: new Date(value).toISOString(),
                          status: "scheduled",
                        },
                      ],
                    }
                  : s,
              );
              setNotice("One-off simulated check-in scheduled.");
            }}
          >
            <label>
              When (browser local time)
              <input
                type="datetime-local"
                name="when"
                required
                disabled={!p.checkInConsent}
              />
            </label>
            <Button disabled={!p.checkInConsent} type="submit">
              Schedule simulated check-in
            </Button>
            {!p.checkInConsent && (
              <p className="muted small">
                Enable one-off check-ins above first.
              </p>
            )}
          </form>
          {state.checkIns.map((c) => (
            <div className="activity-row" key={c.id}>
              <div>
                <strong>{formatTime(c.dueAt, p.timeZone)}</strong>
                <p>Simulated · {c.status}</p>
              </div>
              {c.status === "scheduled" && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    update((s) => ({
                      ...s,
                      checkIns: s.checkIns.map((x) =>
                        x.id === c.id ? { ...x, status: "canceled" } : x,
                      ),
                    }))
                  }
                >
                  Cancel check-in
                </Button>
              )}
            </div>
          ))}
        </section>
      </div>
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
    </>
  );
}
