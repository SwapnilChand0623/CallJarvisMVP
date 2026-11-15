# Sir Jarvis

**Your personal assistant that calls when it matters.**

Sir Jarvis turns reminders and home events into conversations. Talk to Jarvis over FaceTime to create a reminder, mark a task complete, or ask for a callback. When a critical reminder is due, Jarvis can call you instead of waiting for you to open an app.

Built as a hackathon MVP, the project combines a web dashboard, a conversational voice agent, and a smart-home simulator. Its parchment-and-ink interface takes inspiration from the Odyssey: a steady guide for your everyday voyage.

[Open the web app](https://web-production-08d2160a.up.railway.app/auth)

## What you can do

- **Manage reminders by voice.** Create, review, complete, snooze, and reschedule reminders during a FaceTime conversation.
- **Receive critical reminder calls.** A background scheduler checks for due items and starts eligible outreach. Callback requests let you continue later.
- **Talk face to face.** FaceTime Video displays Jarvis’s animated wooden-horse avatar.
- **Explore a simulated home.** Switch between Home and Away, change simulated device states, and trigger events such as a stove left on while you are away.
- **View a home camera during alert calls.** The demo can relay a browser camera feed into FaceTime Video when the camera is enabled.
- **See what happened.** The dashboard brings together reminders, home state, and an activity timeline explaining notification attempts and actions.

## How it works

1. **Give Jarvis something to act on.** Create a reminder in the dashboard or during a call, request a callback, or trigger a home event in the simulator.
2. **Jarvis checks the timing and priority.** The scheduler evaluates pending items against the configured outreach preferences. In the current demo, only critical-priority items trigger calls.
3. **Have a conversation.** Chert connects FaceTime to a LiveKit room, where the voice agent uses Gemini Live to listen and respond.
4. **Choose the next action.** Ask Jarvis to complete a reminder, snooze it, or call back later. Server-side actions save the change, and the dashboard reflects the result.

For example:

> “Remind me to check the oven in ten minutes. Make it critical.”
>
> When Jarvis calls: “Call me back in five minutes.”
>
> On the callback: “I’ve done it. Mark it complete.”

## Inside the app

| Area | Purpose |
| --- | --- |
| **Overview** | A summary of reminders and recent activity. |
| **Reminders** | Create and manage tasks, due times, priorities, and status. |
| **Home** | Explore simulated accessories, Home/Away modes, alerts, and the demo camera. |
| **Logs** | Review why outreach happened and what actions followed. |
| **Account** | Manage your profile and contact setup. |

The Home page also previews **Add Home with Apple** and **manual accessory connections using API keys or Wi-Fi**. These are interface concepts only: they do not sign in to Apple, sync accessories, scan networks, or save credentials.

## Architecture

```text
FaceTime ↔ Chert ↔ LiveKit ↔ Voice agent (Gemini Live)
                                  ↕
Web dashboard ↔ Next.js API ↔ Supabase
                      ↑
                  Scheduler

Browser camera → LiveKit → Voice agent → FaceTime Video
```

| Component | Role |
| --- | --- |
| **Next.js, React, and TypeScript** | Web interface and server-side application actions. |
| **Supabase** | Authentication, PostgreSQL storage, and realtime dashboard updates. |
| **Gemini Live** | Conversational audio and voice-tool requests. |
| **LiveKit** | Realtime audio and video transport. |
| **Chert** | The connection between FaceTime and the voice agent. |
| **Railway** | Hosts the web app, voice worker, and background scheduler as separate services. |

The server resolves the account and applies changes through defined actions; the conversational model does not select the user whose records it modifies.

## Demo scope

Sir Jarvis is a prototype, not a general-purpose public service. Live calls depend on configured providers and an enabled demo account.

- **Account setup:** new-user phone verification requires an SMS provider. The current voice demo maps inbound calls to a configured demo account rather than identifying each caller.
- **Communications:** FaceTime is the demonstrated live channel. iMessage support exists in the code but is unavailable with the current trial setup. Missed-call retry behavior still needs end-to-end revalidation.
- **Home integrations:** device controls and events are simulated. Apple Home sync and direct accessory connections are not implemented.
- **Camera:** a browser on a separate device supplies the demo feed. The voice agent answers from device state rather than interpreting the video. Camera prop recognition and switching to the camera on an inbound call remain experimental.
- **Hosting:** the current inbound-call setup also depends on a local Chert bridge; the Railway services alone do not provide the entire call path.
- **Stored activity:** the application keeps task data and action summaries for its activity log. It does not implement audio, video, or transcript recording.

## Explore the code

- [`src/app/`](src/app/) — dashboard pages and API routes.
- [`src/lib/server/`](src/lib/server/) — home events, outreach, and activity logging.
- [`agent/`](agent/) — conversational worker, voice tools, avatar, and camera relay.
- [`scripts/`](scripts/) — scheduler and local setup utilities.
- [`supabase/migrations/`](supabase/migrations/) — database schema and migrations.

For technical setup, see the [local setup guide](docs/live-setup.md), [voice agent guide](agent/README.md), [Railway deployment guide](docs/deploy-railway.md), and [home simulator guide](docs/home-simulator.md).
