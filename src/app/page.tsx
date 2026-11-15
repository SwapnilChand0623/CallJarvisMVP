"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  BellRing,
  CheckCheck,
  ShieldCheck,
  AudioLines,
  House,
  Phone,
  Clock3,
} from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { Button } from "@/components/ui/button";
import { ReminderList } from "@/components/reminder-list";
import { DeliveryHistory } from "@/components/delivery-history";
import { CallDemo } from "@/components/call-demo";
import { isOverdue } from "@/lib/mockData";
export default function Overview() {
  const { state, now } = useDemo();
  const pending = state.reminders
    .filter((r) => ["pending", "snoozed"].includes(r.status))
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const overdue = pending.filter((r) => isOverdue(r, now) && !r.acknowledgedAt);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">A LITTLE MORE PEACE OF MIND</span>
          <h1>
            Hey {state.preferences.name || "there"}, you’re in good hands
            <span className="accent">.</span>
          </h1>
          <p>Here’s what’s happening in your world today.</p>
        </div>
        <CallDemo />
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-label">
            <span />
            YOUR PROACTIVE PLUS-ONE
          </span>
          <h2>
            Life gets busy.
            <br />
            Jarvis stays on top of it.
          </h2>
          <p>
            From the small to-dos to the moments that matter,
            <br className="desktop-break" /> a thoughtful nudge is always close
            by.
          </p>
          <Button asChild>
            <Link href="/reminders">
              Give Jarvis something to do <ArrowUpRight size={17} />
            </Link>
          </Button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orb">
            <AudioLines size={72} strokeWidth={1.4} />
          </div>
          <span className="floating-pill pill-one">
            <CheckCheck size={16} />
            One less thing to remember
          </span>
          <span className="floating-pill pill-two">
            <ShieldCheck size={16} />A little peace of mind
          </span>
        </div>
      </section>
      <section className="stats" aria-label="Your day at a glance">
        {[
          {
            label: "On your radar",
            value: pending.length,
            desc: "reminders to keep you moving",
            icon: BellRing,
            tone: "orange",
          },
          {
            label: "Taken care of",
            value: state.reminders.filter((r) => r.status === "completed")
              .length,
            desc: "one less thing on your mind",
            icon: CheckCheck,
            tone: "green",
          },
          {
            label: "Needs a nudge",
            value: overdue.length,
            desc: "waiting for your acknowledgment",
            icon: Clock3,
            tone: "purple",
          },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <span className={`stat-icon ${s.tone}`}>
              <s.icon size={20} />
            </span>
            <span className="stat-label">{s.label}</span>
            <strong>{s.value.toString().padStart(2, "0")}</strong>
            <p>{s.desc}</p>
          </div>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>On your radar</h2>
              <p>A little structure. A lot less mental clutter.</p>
            </div>
            <Link className="text-link" href="/reminders">
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <ReminderList reminders={pending.slice(0, 3)} />
          <div className="panel-foot">
            <span className="soft-dot" />
            Jarvis has your back. You’ve got your day.
          </div>
        </section>
        <section className="panel home-panel">
          <div className="panel-heading">
            <div>
              <h2>Your home, at a glance</h2>
              <p>Simulated observations and explicit light commands.</p>
            </div>
            <House size={21} />
          </div>
          <div className="home-status">
            <span className="home-icon">
              <ShieldCheck size={31} />
            </span>
            <div>
              <strong>
                {state.homeEvents.length
                  ? "Recent observations available"
                  : "No recent observations"}
              </strong>
              <p>Simulated home status</p>
            </div>
          </div>
          <div className="home-metrics">
            <span>
              Observations<strong>{state.homeEvents.length} simulated</strong>
            </span>
            <span>
              Living room
              <strong>{state.light.on ? "Light on" : "Light off"}</strong>
            </span>
          </div>
          <Button asChild variant="outline">
            <Link href="/home">
              Open JarvisHome <ArrowRight size={15} />
            </Link>
          </Button>
          {!state.preferences.homeAlerts && (
            <p className="small muted">
              Enable home alerts in Settings to try this.
            </p>
          )}
        </section>
      </div>
      <DeliveryHistory />
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <h2>The latest from Jarvis</h2>
            <p>Little things handled. All in one place.</p>
          </div>
          <span className="subtle-tag">LOCAL ACTIVITY</span>
        </div>
        <div className="activity-list">
          {state.activities.slice(0, 5).map((a) => (
            <div className="activity-row" key={a.id}>
              <span className={`activity-icon ${a.kind}`}>
                {a.kind === "home" ? (
                  <House size={17} />
                ) : a.kind === "call" ? (
                  <Phone size={17} />
                ) : (
                  <BellRing size={17} />
                )}
              </span>
              <div>
                <strong>{a.title}</strong>
                <p>{a.detail}</p>
              </div>
              <time dateTime={a.time}>
                {new Date(a.time).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
