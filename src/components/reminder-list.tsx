"use client";
import { useRef, useState } from "react";
import { Check, X } from "lucide-react";
import {
  isOverdue,
  formatTime,
  priorities,
  type Reminder,
} from "@/lib/mockData";
import {
  changeReminder,
  previewOutreach,
  type ReminderAction,
} from "@/features/demo-actions";
import { useDemo } from "./demo-provider";
import { Button } from "./ui/button";
export function ReminderList({ reminders }: { reminders: Reminder[] }) {
  const { state, update, now } = useDemo();
  const [selected, setSelected] = useState<Reminder | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const act = (r: Reminder, a: ReminderAction) => {
    update((s) => changeReminder(s, r.id, a));
    setNotice(`${r.title}: ${a.type}.`);
  };
  return (
    <>
      <div className="reminder-list">
        {reminders.length ? (
          reminders.map((r) => (
            <div
              className={`reminder-row ${r.status === "completed" ? "completed" : ""}`}
              key={r.id}
            >
              <button
                className="check-button"
                aria-label={`${r.status === "completed" ? "Reopen" : "Complete"} ${r.title}`}
                aria-pressed={r.status === "completed"}
                onClick={() =>
                  act(r, {
                    type: r.status === "completed" ? "reopen" : "complete",
                  })
                }
              >
                {r.status === "completed" && <Check size={14} />}
              </button>
              <div className="reminder-info">
                <strong>{r.title}</strong>
                <span className={isOverdue(r, now) ? "overdue" : ""}>
                  {formatTime(r.dueAt, state.preferences.timeZone)}
                  {isOverdue(r, now) ? " · Overdue" : ""}
                </span>
                <span>
                  {r.status} ·{" "}
                  {r.acknowledgedAt ? "Acknowledged" : "Not acknowledged"} ·{" "}
                  {r.channel}
                </span>
              </div>
              <span className={`priority ${r.priority}`}>{r.priority}</span>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(r);
                  setError("");
                  dialog.current?.showModal();
                }}
                aria-label={`Manage ${r.title}`}
              >
                Manage
              </Button>
            </div>
          ))
        ) : (
          <div className="empty">
            No reminders in this view. Add one above or change the filter.
          </div>
        )}
      </div>
      {notice && (
        <p role="status" className="inline-status">
          {notice}
        </p>
      )}
      <dialog
        ref={dialog}
        className="call-dialog manage-dialog"
        aria-labelledby="manage-title"
      >
        <button
          className="close"
          aria-label="Close reminder"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} />
        </button>
        {selected && (
          <>
            <h2 id="manage-title">Manage reminder</h2>
            <form
              key={selected.id}
              className="reminder-form"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                try {
                  act(selected, {
                    type: "edit",
                    title: String(d.get("title")),
                    dueAt: String(d.get("due")),
                    priority: d.get("priority") as Reminder["priority"],
                  });
                  dialog.current?.close();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            >
              <label>
                Task
                <input
                  name="title"
                  defaultValue={selected.title}
                  required
                  maxLength={160}
                />
              </label>
              <label>
                Reschedule (your browser’s local time)
                <input
                  name="due"
                  type="datetime-local"
                  defaultValue={new Date(
                    Date.parse(selected.dueAt) -
                      new Date(selected.dueAt).getTimezoneOffset() * 60000,
                  )
                    .toISOString()
                    .slice(0, 16)}
                  required
                />
              </label>
              <label>
                Priority
                <select name="priority" defaultValue={selected.priority}>
                  {priorities.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <Button type="submit">Save changes</Button>
            </form>
            <div className="action-grid">
              <Button
                variant="outline"
                onClick={() => {
                  act(selected, { type: "acknowledge" });
                  dialog.current?.close();
                }}
              >
                Acknowledge
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  act(selected, { type: "snooze", minutes: 15 });
                  dialog.current?.close();
                }}
              >
                Snooze 15 minutes
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  update((s) => previewOutreach(s, selected.id));
                  dialog.current?.close();
                }}
              >
                Preview outreach
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  act(selected, { type: "cancel" });
                  dialog.current?.close();
                }}
              >
                Cancel reminder
              </Button>
            </div>
            <details>
              <summary>Reminder history</summary>
              <div className="history-list">
                {state.activities
                  .filter((a) => a.reminderId === selected.id)
                  .map((a) => (
                    <p key={a.id}>
                      {a.title} ·{" "}
                      {formatTime(a.time, state.preferences.timeZone)}
                    </p>
                  ))}
                {!state.activities.some(
                  (a) => a.reminderId === selected.id,
                ) && <p>No changes recorded yet.</p>}
              </div>
            </details>
          </>
        )}
      </dialog>
    </>
  );
}
