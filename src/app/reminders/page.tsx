"use client";
import { useState } from "react";
import { BellRing } from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { ReminderForm } from "@/components/reminder-form";
import { ReminderList } from "@/components/reminder-list";
import { CallDemo } from "@/components/call-demo";
export default function Reminders() {
  const { state } = useDemo();
  const [filter, setFilter] = useState("pending");
  const [notice, setNotice] = useState("");
  const reminders = state.reminders
    .filter(
      (r) =>
        filter === "all" ||
        (filter === "pending"
          ? ["pending", "snoozed"].includes(r.status)
          : r.status === filter),
    )
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LESS TO REMEMBER. MORE ROOM TO LIVE.</span>
          <h1>
            JarvisRemind<span className="accent">.</span>
          </h1>
          <p>The things that matter, remembered.</p>
        </div>
        <CallDemo />
      </div>
      <section className="panel form-panel">
        <div className="panel-heading">
          <div>
            <h2>
              <BellRing size={20} />
              Leave it with Jarvis
            </h2>
            <p>Add a reminder and get back to your day.</p>
          </div>
        </div>
        <ReminderForm
          onCreated={() =>
            setNotice("Your reminder is on the list. Jarvis has it from here.")
          }
        />
        {notice && (
          <p className="success" role="status">
            {notice}
          </p>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your reminders</h2>
          <div className="filters" aria-label="Filter reminders">
            {["pending", "completed", "canceled", "all"].map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === "pending"
                  ? "Upcoming"
                  : f === "completed"
                    ? "Completed"
                    : f === "canceled"
                      ? "Canceled"
                      : "All"}
              </button>
            ))}
          </div>
        </div>
        <ReminderList reminders={reminders} />
      </section>
    </>
  );
}
