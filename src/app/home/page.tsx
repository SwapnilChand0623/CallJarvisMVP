"use client";
import { useState } from "react";
import { House, Lightbulb, ShieldCheck } from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/mockData";
import { previewOutreach } from "@/features/demo-actions";
export default function Home() {
  const { state, update } = useDemo();
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">AWARENESS WITHOUT THE NOISE</span>
          <h1>
            JarvisHome<span className="accent">.</span>
          </h1>
          <p>See what happened. Choose what happens next.</p>
        </div>
        <span className="demo-badge">SIMULATED DEVICES</span>
      </div>
      <div className="notice">
        Motion and camera labels are observations, not certified safety alarms.
        This workspace does not connect to hardware or emergency services.
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <Lightbulb size={20} />
                {state.light.name}
              </h2>
              <p>Authorized fixture device · simulator</p>
            </div>
            <span className="priority">{state.light.on ? "On" : "Off"}</span>
          </div>
          <div className="section-body">
            <div
              className={`light-preview ${state.light.on ? "illuminated" : ""}`}
            >
              <Lightbulb size={54} />
            </div>
            <p className="muted">
              Explicit on/off commands only. Each change is recorded in your
              activity history.
            </p>
            {confirm ? (
              <div>
                <p>Turn the simulated light {state.light.on ? "off" : "on"}?</p>
                <div className="save-row">
                  <Button
                    onClick={() => {
                      update((s) => ({
                        ...s,
                        light: { ...s.light, on: !s.light.on },
                        activities: [
                          {
                            id: crypto.randomUUID(),
                            title: "Simulated light command succeeded",
                            detail: `${s.light.name}: ${s.light.on ? "off" : "on"}`,
                            time: new Date().toISOString(),
                            kind: "home",
                          },
                          ...s.activities,
                        ],
                      }));
                      setConfirm(false);
                      setMessage("Simulated light state updated.");
                    }}
                  >
                    Confirm light change
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>
                    Keep current state
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                disabled={!state.light.enabled || !state.preferences.homeAlerts}
                onClick={() => setConfirm(true)}
              >
                Turn light {state.light.on ? "off" : "on"}
              </Button>
            )}
            {(!state.light.enabled || !state.preferences.homeAlerts) && (
              <p className="small muted">
                Enable the home simulator in Settings first.
              </p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                <House size={20} />
                Try a home event
              </h2>
              <p>No camera access or hardware needed.</p>
            </div>
          </div>
          <form
            className="reminder-form"
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              const event = {
                id: crypto.randomUUID(),
                type:
                  d.get("type") === "camera"
                    ? ("camera" as const)
                    : ("motion" as const),
                severity:
                  d.get("severity") === "high"
                    ? ("high" as const)
                    : ("low" as const),
                description: String(d.get("description")).trim(),
                occurredAt: new Date().toISOString(),
                source: "simulated" as const,
              };
              update((s) =>
                s.homeEvents.some((x) => x.id === event.id)
                  ? s
                  : {
                      ...s,
                      homeEvents: [event, ...s.homeEvents],
                      activities: [
                        {
                          id: crypto.randomUUID(),
                          title: "Simulated home observation",
                          detail: event.description,
                          time: event.occurredAt,
                          kind: "home",
                        },
                        ...s.activities,
                      ],
                    },
              );
              setMessage("Simulated event added.");
            }}
          >
            <label>
              Observation
              <select name="type">
                <option value="motion">Motion</option>
                <option value="camera">Camera label</option>
              </select>
            </label>
            <label>
              Description
              <input
                name="description"
                defaultValue="Motion observed at the front door"
                maxLength={240}
                required
              />
            </label>
            <label>
              Policy severity
              <select name="severity">
                <option value="low">Low · log only</option>
                <option value="high">High · eligible for policy preview</option>
              </select>
            </label>
            <Button disabled={!state.preferences.homeAlerts} type="submit">
              Inject simulated event
            </Button>
          </form>
        </section>
      </div>
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <ShieldCheck size={20} />
            Home event history
          </h2>
        </div>
        {state.homeEvents.length ? (
          state.homeEvents.map((event) => (
            <div className="activity-row" key={event.id}>
              <div>
                <strong>{event.description}</strong>
                <p>
                  {event.type} · {event.severity} · {event.source} ·{" "}
                  {formatTime(event.occurredAt, state.preferences.timeZone)}
                </p>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  update((s) => previewOutreach(s, event.id));
                  setMessage(
                    "Policy preview recorded in Overview outreach history.",
                  );
                }}
              >
                Preview policy
              </Button>
            </div>
          ))
        ) : (
          <div className="empty">
            No observations. Inject a simulated event to get started.
          </div>
        )}
      </section>
    </>
  );
}
