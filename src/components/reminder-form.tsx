"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "./ui/button";
import { useDemo } from "./demo-provider";
import { makeReminder, priorities, type Reminder } from "@/lib/mockData";
export function ReminderForm({ onCreated }: { onCreated?: () => void }) {
  const { state, update } = useDemo();
  const [error, setError] = useState("");
  return (
    <form
      className="reminder-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        try {
          const reminder = makeReminder(
            String(data.get("title")),
            String(data.get("due")),
            data.get("priority") as Reminder["priority"],
            state.preferences.channel,
          );
          update((s) => ({
            ...s,
            reminders: [...s.reminders, reminder],
            activities: [
              {
                id: crypto.randomUUID(),
                title: "A new reminder, taken care of",
                detail: reminder.title,
                time: new Date().toISOString(),
                kind: "reminder",
                reminderId: reminder.id,
              },
              ...s.activities,
            ],
          }));
          form.reset();
          setError("");
          onCreated?.();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <label>
        What’s on your mind?
        <input
          name="title"
          placeholder="e.g. Pick up my prescription"
          required
          maxLength={160}
        />
      </label>
      <div className="form-row">
        <label>
          When should Jarvis remind you?
          <input name="due" type="datetime-local" required />
        </label>
        <label>
          Priority
          <select name="priority" defaultValue="medium">
            {priorities.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        Uses your preferred channel: {state.preferences.channel}. Saved locally
        for this demo.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Button type="submit">
        <Plus size={16} />
        Create reminder
      </Button>
    </form>
  );
}
