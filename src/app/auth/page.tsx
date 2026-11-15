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
export default function Auth() {
  const [client] = useState(getSupabaseClient);
  const [user, setUser] = useState<string | null>(null);
  const [rows, setRows] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(!!client);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
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
      setNotice("Change confirmed by the database.");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONNECTED REMINDER WORKSPACE</span>
          <h1>
            Your account<span className="accent">.</span>
          </h1>
          <p>
            Authenticated Supabase records, kept separate from the local demo.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Back to simulation</Link>
        </Button>
      </div>
      {!client ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Connection isn’t configured</h2>
              <p>
                Use the five demo sections while the database setup is
                completed.
              </p>
            </div>
          </div>
          <p className="section-body muted">
            A developer must configure the public Supabase URL and publishable
            key, apply the agreed reminder schema and owner-based RLS, and
            provision a test account. No service-role key belongs in this app’s
            browser environment.
          </p>
        </section>
      ) : !user ? (
        <section className="panel settings-panel">
          <div className="panel-heading">
            <h2>{creatingAccount ? "Create your account" : "Sign in to your existing account"}</h2>
          </div>
          <form
            className="reminder-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              setNotice("");
              try {
                const credentials = {
                  email: String(d.get("email")).trim(),
                  password: String(d.get("password")),
                };
                if (creatingAccount) {
                  const { data, error } = await client.auth.signUp(credentials);
                  if (error) throw error;
                  setNotice(data.session
                    ? "Account created. You’re signed in."
                    : "Check your email to confirm your account, then return here to sign in.");
                } else {
                  const { error } = await client.auth.signInWithPassword(credentials);
                  if (error) throw error;
                  setNotice("Signed in.");
                }
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Email
              <input
                type="email"
                name="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                name="password"
                autoComplete={creatingAccount ? "new-password" : "current-password"}
                minLength={creatingAccount ? 6 : undefined}
                required
              />
            </label>
            <Button disabled={busy} type="submit">
              {busy ? (creatingAccount ? "Creating account…" : "Signing in…") : (creatingAccount ? "Create account" : "Sign in")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => {
              setCreatingAccount(!creatingAccount);
              setError("");
              setNotice("");
            }}>
              {creatingAccount ? "Already have an account? Sign in" : "New here? Create an account"}
            </Button>
          </form>
        </section>
      ) : (
        <>
          <div className="notice">
            Connected data · Only reminder records are wired to Supabase. Home,
            Talks, preferences, and outreach previews remain labeled local
            simulations until their server contracts land.
          </div>
          <div className="save-row workspace-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void reload()}
            >
              Refresh reminders
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                void client.auth.signOut().then(({ error }) => {
                  if (error) setError(error.message);
                  else {
                    setUser(null);
                    setRows([]);
                    setNotice("Signed out.");
                  }
                });
              }}
            >
              Sign out
            </Button>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h2>
                {editing
                  ? "Edit connected reminder"
                  : "Create a connected reminder"}
              </h2>
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
                              new Date(editing.dueAt).getTimezoneOffset() *
                                60000,
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
                  {busy
                    ? "Saving…"
                    : editing
                      ? "Save connected changes"
                      : "Create connected reminder"}
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
              <h2>Your connected reminders</h2>
              {loading && <span role="status">Refreshing…</span>}
            </div>
            <div className="connected-list">
              {rows.length
                ? rows.map((r) => (
                    <div className="connected-row" key={r.id}>
                      <div>
                        <strong>{r.title}</strong>
                        <p>
                          {new Date(r.dueAt).toLocaleString()} · {r.priority} ·{" "}
                          {r.status} ·{" "}
                          {r.acknowledgedAt
                            ? "Acknowledged"
                            : "Not acknowledged"}
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
                                  dueAt: new Date(
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
                    <div className="empty">No connected reminders yet.</div>
                  )}
            </div>
          </section>
        </>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <p>
            {user
              ? "Could not load or save your reminders. Please retry. Local demo data is never uploaded automatically."
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
