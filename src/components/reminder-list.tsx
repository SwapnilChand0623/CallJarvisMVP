"use client";
import { Check, MessageCircle, Video } from "lucide-react";
import { isOverdue, type Reminder } from "@/lib/mockData";
import { useDemo } from "./demo-provider";
export function ReminderList({ reminders }: { reminders: Reminder[] }) {
  const { update, now } = useDemo();
  return (
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
                update((s) => ({
                  ...s,
                  reminders: s.reminders.map((item) =>
                    item.id === r.id
                      ? {
                          ...item,
                          status:
                            item.status === "completed"
                              ? "pending"
                              : "completed",
                        }
                      : item,
                  ),
                }))
              }
            >
              {r.status === "completed" && <Check size={14} />}
            </button>
            <div className="reminder-info">
              <strong>{r.title}</strong>
              <span className={isOverdue(r, now) ? "overdue" : ""}>
                {new Date(r.dueAt).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                {isOverdue(r, now) ? " · Overdue" : ""}
              </span>
            </div>
            <span className={`priority ${r.priority}`}>
              {r.priority === "high" ? "High priority" : "Normal"}
            </span>
            <span className="channel" title={r.channel}>
              {r.channel === "FaceTime" ? (
                <Video size={16} />
              ) : (
                <MessageCircle size={16} />
              )}
              <span>{r.channel}</span>
            </span>
          </div>
        ))
      ) : (
        <div className="empty">
          All clear. A little breathing room for your day.
        </div>
      )}
    </div>
  );
}
