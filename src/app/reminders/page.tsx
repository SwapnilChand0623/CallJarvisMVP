"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  loadReminders,
  saveReminder,
  deleteReminder,
} from "@/lib/supabase/reminders";
import { makeReminder, priorities, type Reminder } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export default function Reminders() {
  const [client] = useState(getSupabaseClient);
  const [user, setUser] = useState<string | null>(null);
  const [rows, setRows] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(!!client);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const generation = useRef(0);
  const activeOwner = useRef<string | null>(null);
  const reload = useCallback(async () => {
    if (!client) return;
    const ticket = generation.current;
    setLoading(true);
    try {
      const records = await loadReminders(client);
      if (ticket === generation.current) {
        setRows(records);
        setError("");
      }
    } catch (err) {
      if (ticket === generation.current) setError((err as Error).message);
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const nextOwner = session?.user.id ?? null;
      if (activeOwner.current !== nextOwner) {
        generation.current += 1;
        activeOwner.current = nextOwner;
        setRows([]);
      }
      setUser(nextOwner);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    if (!client || !user) return;
    let alive = true;
    const refresh = () => {
      if (alive) void reload();
    };
    const timer = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 30000);
    const channel = client
      .channel(`reminders:${user}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
          filter: `user_id=eq.${user}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(interval);
      void client.removeChannel(channel);
    };
  }, [client, user, reload]);
  const mutate = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice("Saved. You’re all set.");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!client) return null;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR REMINDERS</span>
          <h1>
            One less thing to remember<span className="accent">.</span>
          </h1>
          <p>Add it here, or give Jarvis a call.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>{editing ? "Edit reminder" : "Add a reminder"}</h2>
        </div>
        <form
          className="reminder-form"
          key={editing?.id ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const d = new FormData(form);
            void mutate(async () => {
              const r = makeReminder(
                String(d.get("title")),
                String(d.get("due")),
                d.get("priority") as Reminder["priority"],
                "iMessage",
              );
              await saveReminder(
                client,
                editing
                  ? {
                      ...editing,
                      title: r.title,
                      dueAt: r.dueAt,
                      priority: r.priority,
                      ...(r.dueAt !== editing.dueAt
                        ? {
                            status: "pending" as const,
                            acknowledgedAt: null,
                          }
                        : {}),
                    }
                  : r,
                !!editing,
              );
              setEditing(null);
              form.reset();
            });
          }}
        >
          <label>
            Task
            <input
              name="title"
              required
              maxLength={160}
              defaultValue={editing?.title}
            />
          </label>
          <div className="form-row">
            <label>
              When (browser local time)
              <input
                name="due"
                type="datetime-local"
                required
                defaultValue={
                  editing
                    ? new Date(
                        Date.parse(editing.dueAt) -
                          new Date(editing.dueAt).getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
              />
            </label>
            <label>
              Priority
              <select
                name="priority"
                defaultValue={editing?.priority ?? "medium"}
              >
                {priorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="save-row">
            <Button disabled={busy} type="submit">
              {busy ? "Saving…" : editing ? "Save changes" : "Add reminder"}
            </Button>
            {editing && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => setEditing(null)}
              >
                Cancel edit
              </Button>
            )}
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Your reminders</h2>
          {loading && <span role="status">Refreshing…</span>}
        </div>
        <div className="connected-list">
          {rows.length
            ? rows.map((r) => (
                <div className="connected-row" key={r.id}>
                  <div>
                    <strong>{r.title}</strong>
                    <p>
                      {new Date(r.snoozedUntil ?? r.dueAt).toLocaleString()} ·{" "}
                      {r.priority} · {r.status} ·{" "}
                      {r.acknowledgedAt ? "Acknowledged" : "Not acknowledged"}
                    </p>
                  </div>
                  <div className="save-row">
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() => setEditing(r)}
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={busy || !!r.acknowledgedAt}
                      variant="ghost"
                      onClick={() =>
                        void mutate(() =>
                          saveReminder(
                            client,
                            {
                              ...r,
                              acknowledgedAt: new Date().toISOString(),
                            },
                            true,
                          ),
                        )
                      }
                    >
                      Acknowledge
                    </Button>
                    <Button
                      disabled={busy || r.status === "completed"}
                      variant="ghost"
                      onClick={() =>
                        void mutate(() =>
                          saveReminder(
                            client,
                            { ...r, status: "completed" },
                            true,
                          ),
                        )
                      }
                    >
                      Complete
                    </Button>
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() =>
                        void mutate(() =>
                          saveReminder(
                            client,
                            {
                              ...r,
                              status: "snoozed",
                              snoozedUntil: new Date(
                                Date.now() + 15 * 60000,
                              ).toISOString(),
                            },
                            true,
                          ),
                        )
                      }
                    >
                      Snooze 15m
                    </Button>
                    <Button
                      disabled={busy}
                      variant="ghost"
                      onClick={() =>
                        deleting === r.id
                          ? void mutate(async () => {
                              await deleteReminder(client, r.id);
                              setDeleting(null);
                            })
                          : setDeleting(r.id)
                      }
                    >
                      {deleting === r.id ? "Confirm delete" : "Delete"}
                    </Button>
                  </div>
                </div>
              ))
            : !loading && (
                <div className="empty">
                  No reminders yet. Add your first above.
                </div>
              )}
        </div>
      </section>

      {error && (
        <div className="notice error" role="alert">
          {error}
          <p>
            {user
              ? "Could not load or save your reminders. Please retry. "
              : "Check your email and password. If you’re new here, choose Create an account. If you already signed up, confirm your email before signing in."}
          </p>
        </div>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
    </>
  );
}
