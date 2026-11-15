# CallJarvis — three-minute demo pitch

## 0:00–0:35 — The problem

We all have a system for remembering things. Usually, it’s a mix of calendar alerts, sticky notes, and telling ourselves, “I’ll do it in a minute.” But a notification is easy to dismiss. And when the thing we forget is medication, an important pickup, or an unexpected event at home, another silent badge isn’t enough.

CallJarvis is our answer: a personal assistant designed to reach out when something needs your attention, and help you do something about it.

## 0:35–1:05 — The dashboard

This is your day at a glance. Here are your reminders, what’s already taken care of, and the things waiting for acknowledgment. The dashboard is intentionally calm. It gives you a place to check in without giving you another feed to manage.

Notice the medication reminder. It’s overdue and high priority. In the complete system, that is the kind of event that would move from a passive notification to an active conversation.

## 1:05–1:55 — The conversation

For today’s frontend demo, we’ve made that conversation a typed simulation. No real call is being placed. The goal is to show the interaction clearly.

[Open Try a demo call.]

Jarvis asks what it can take off your mind. Let’s say: pick up my prescription in thirty minutes.

[Type “Remind me to pick up my prescription in 30 minutes.” Review the interpreted task and time, then confirm. Navigate to JarvisRemind.]

There it is, in the same place as the rest of your day. We can also create a reminder directly, set its priority, acknowledge it without completing it, snooze it, or reschedule it. Settings define your preferred channel, quiet hours, and outreach consent. Once the task is done, one click acknowledges it.

[Complete the new reminder.]

The important idea is that the conversation ends with an action, not just an answer.

## 1:55–2:30 — Beyond reminders

[Open JarvisHome, confirm a simulated light change, and inject a home event.]

We’re also exploring the same pattern for home activity. A simulated motion event appears in the history, and a confirmed light command changes the fixture state. JarvisTalks also lets users approve and delete saved context or opt into one-off simulated check-ins. In the intended backend flow, relevant events can be evaluated and escalated through iMessage or FaceTime. That real event-to-call integration is separate from this local demo and should be shown only once it is connected and verified.

## 2:30–3:00 — The vision

The stack brings together a Next.js dashboard, Supabase for events and scheduling, LiveKit and OpenAI for the conversation, and Chert for communications. Today, this frontend demonstrates the experience. The next integration milestone is completing the real event-to-conversation-to-action loop.

Our goal is simple: less checking, less remembering, and a little more peace of mind. CallJarvis. Your assistant that calls when it matters.
