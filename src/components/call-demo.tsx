"use client";
import { useRef, useState } from "react";
import { AudioLines, Phone, X, Check } from "lucide-react";
import { Button } from "./ui/button";
import { useDemo } from "./demo-provider";
import { parseReminderRequest } from "@/lib/parse-reminder";
import { makeReminder } from "@/lib/mockData";
export function CallDemo() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<"intro" | "reply" | "confirm" | "done">(
    "intro",
  );
  const [request, setRequest] = useState(
    "Remind me to pick up my prescription in 30 minutes",
  );
  const [parsed, setParsed] = useState<ReturnType<
    typeof parseReminderRequest
  > | null>(null);
  const [error, setError] = useState("");
  const { state, update } = useDemo();
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setStage("intro");
          setParsed(null);
          setError("");
          dialog.current?.showModal();
        }}
      >
        <Phone size={16} />
        Try a demo call
      </Button>
      <dialog ref={dialog} className="call-dialog" aria-labelledby="call-title">
        <button
          className="close"
          aria-label="Close demo call"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        <span className="eyebrow">SIMULATED CONVERSATION</span>
        <div className="call-orb">
          <AudioLines size={42} />
        </div>
        <h2 id="call-title">A conversation, not another notification.</h2>
        <p className="muted">
          This guided demo shows the call-to-reminder flow. No call is placed
          and no microphone is used.
        </p>
        <div className="chat-bubble">
          {stage === "done"
            ? "You’re all set. I’ve added that reminder to your dashboard."
            : stage === "intro"
              ? "Hey! It’s Jarvis. What can I take off your mind?"
              : "Got it. Tell me what you need and when you’d like a nudge."}
        </div>
        {stage === "intro" && (
          <Button onClick={() => setStage("reply")}>
            I’d like to set a reminder
          </Button>
        )}
        {stage === "reply" && (
          <form
            className="reminder-form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                setParsed(parseReminderRequest(request, new Date()));
                setError("");
                setStage("confirm");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <label>
              Your request
              <input
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                required
                maxLength={240}
                aria-describedby="request-help"
              />
            </label>
            <p id="request-help" className="muted small">
              Type “Remind me to … in 30 minutes,” “in 2 hours,” or “in 1 day.”
              This demo uses a limited text parser.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Button type="submit">Review reminder</Button>
          </form>
        )}
        {stage === "confirm" && parsed && (
          <section aria-label="Review reminder" className="confirmation">
            <h3>{parsed.title}</h3>
            <p>
              {new Date(parsed.dueAt).toLocaleString([], {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            <p className="muted small">
              {state.preferences.channel} · Normal priority · Local demo
            </p>
            <div className="save-row">
              <Button
                onClick={() => {
                  const r = makeReminder(
                    parsed.title,
                    parsed.dueAt,
                    "normal",
                    state.preferences.channel,
                  );
                  update((s) => ({
                    ...s,
                    reminders: [...s.reminders, r],
                    activities: [
                      {
                        id: crypto.randomUUID(),
                        title: "Demo conversation completed",
                        detail: `Created reminder: ${r.title}`,
                        time: new Date().toISOString(),
                        kind: "call",
                      },
                      ...s.activities,
                    ],
                  }));
                  setStage("done");
                }}
              >
                Confirm reminder
              </Button>
              <Button variant="ghost" onClick={() => setStage("reply")}>
                Edit request
              </Button>
            </div>
          </section>
        )}
        {stage === "done" && (
          <Button onClick={() => dialog.current?.close()}>
            <Check size={16} />
            Back to my day
          </Button>
        )}
      </dialog>
    </>
  );
}
