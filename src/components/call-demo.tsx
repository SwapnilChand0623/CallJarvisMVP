"use client";
import { useRef, useState } from "react";
import { AudioLines, Phone, X, Check } from "lucide-react";
import { Button } from "./ui/button";
import { useDemo } from "./demo-provider";
import { makeReminder, formatTime } from "@/lib/mockData";
import {
  parseConversation,
  type ConversationChange,
} from "@/features/conversation";
import { changeReminder } from "@/features/demo-actions";
export function CallDemo() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [stage, setStage] = useState<"intro" | "reply" | "confirm" | "done">(
    "intro",
  );
  const [request, setRequest] = useState(
    "Remind me to pick up my prescription in 30 minutes",
  );
  const [parsed, setParsed] = useState<ConversationChange | null>(null);
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
          Typed simulation with a limited parser. No call, microphone,
          recording, or AI service is used.
        </p>
        <div className="chat-bubble">
          {stage === "done"
            ? "Your confirmed change is saved in the local demo."
            : stage === "intro"
              ? "Hey! It’s Jarvis. What can I take off your mind?"
              : stage === "confirm"
                ? "Here’s what I understood. Does this look right?"
                : "Create a reminder or ask me to acknowledge, complete, snooze, or reschedule one by its exact title."}
        </div>
        {stage === "intro" && (
          <Button onClick={() => setStage("reply")}>
            I’d like help with a reminder
          </Button>
        )}
        {stage === "reply" && (
          <form
            className="reminder-form"
            onSubmit={(e) => {
              e.preventDefault();
              try {
                setParsed(
                  parseConversation(request, state.reminders, new Date()),
                );
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
              Examples: “Remind me to call Mom in 30 minutes,” “acknowledge Call
              Mom,” “complete Call Mom,” or “snooze Call Mom for 15 minutes.”
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Button type="submit">Review change</Button>
          </form>
        )}
        {stage === "confirm" && parsed && (
          <section aria-label="Review reminder" className="confirmation">
            <h3>{parsed.title}</h3>
            <p>
              {parsed.kind === "create"
                ? "Create reminder"
                : parsed.description}{" "}
              · {formatTime(parsed.dueAt, state.preferences.timeZone)}
            </p>
            <p className="muted small">
              {parsed.kind === "create"
                ? `${state.preferences.channel} · Medium priority`
                : "Update selected reminder"}{" "}
              · Local demo
            </p>
            <div className="save-row">
              <Button
                onClick={() => {
                  if (parsed.kind === "create") {
                    const r = makeReminder(
                      parsed.title,
                      parsed.dueAt,
                      "medium",
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
                          reminderId: r.id,
                        },
                        ...s.activities,
                      ],
                    }));
                  } else
                    update((s) => changeReminder(s, parsed.id, parsed.action));
                  setStage("done");
                }}
              >
                Confirm change
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
