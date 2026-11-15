# Live calls on your own machine

This runs the whole reminder loop on one Mac or PC against the hosted CallJarvis
database: you call Jarvis and manage reminders by voice, and Jarvis calls you
when a critical reminder is due. Nothing needs to be deployed.

Four processes run side by side:

| Terminal | Folder | Command | Role |
| --- | --- | --- | --- |
| 1 | repository root | `npm run dev` | Dashboard, voice actions and outreach on `localhost:3000` |
| 2 | `agent/` | `npm start` | The Jarvis voice worker |
| 3 | `agent/` | `npx --yes @trychert/facetime@0.1.0-beta.21 dev --agent calljarvis --env-file .env.local` | Connects your FaceTime line to the worker |
| 4 | repository root | `npm run scheduler` | Finds due reminders and starts outreach |

Terminals 1 to 3 are enough to receive calls. Terminal 4 adds calls to you.

## Set up once

1. Install both packages with Node 22.23.2 or later:
   ```sh
   npm ci && (cd agent && npm ci)
   ```
2. Create the server settings and fill them in privately:
   ```sh
   cp .env.example .env.local && chmod 600 .env.local
   ```
   | Value | Where it comes from |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase, API keys, publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase, API keys, secret key. Server only. |
   | `VOICE_TOOL_TOKEN`, `OUTREACH_TOKEN` | Two different values from `openssl rand -hex 32` |
   | `CHERT_FACETIME_API_KEY` | Chert dashboard, Developer |
   | `CHERT_PROJECT_ID`, `CHERT_LINE_ID` | The `project=` and `line=` IDs in the Chert dashboard address bar |
   | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Copy the three values from `agent/.env.local` |
3. In `agent/.env.local`, set `VOICE_API_URL=http://localhost:3000` and the same
   `VOICE_TOOL_TOKEN` as the server.
4. Start the server (`npm run dev`), open `http://localhost:3000/auth` and sign
   up. That creates your account and profile in the database.
5. Record your own phone and opt in to calls:
   ```sh
   npm run live:user -- --phone +15551234567 --timezone America/Chicago
   ```
   Use the phone you verified with Chert. Add the printed `VOICE_DEMO_USER_ID`
   line to `.env.local` and restart the server.
6. Start terminals 2 and 3, then check everything:
   ```sh
   npm run doctor
   ```
   It lists each missing setting or unreachable service without printing keys.

## Receive a call

Make a FaceTime Audio call to your Chert line. After the greeting, try:

- "What reminders do I have?"
- "Remind me to stretch in two minutes, critical priority."
- "Snooze that for ten minutes." or "Mark it done."

The server log shows each action. The reminder appears in the Supabase
`reminders` table and in the dashboard once you sign in.

Inbound calls act for the one account in `VOICE_DEMO_USER_ID`. Chert does not
pass the caller's number to the worker, so every caller is treated as that
account. Only share the line with people who should manage those reminders.

## Get called

1. Run `npm run scheduler` in terminal 4.
2. Create a reminder with **critical** priority that is due now or in a minute,
   by voice or in the dashboard.
3. When it is due, the scheduler prints the attempt and your phone rings. Jarvis
   names the reminder. "Got it" acknowledges it, "done" completes it, and
   "snooze ten minutes" postpones it.

Only critical reminders call. Other priorities start with an iMessage, and
sending the first message needs a dedicated Chert line, so with FaceTime as the
only opted-in channel they produce no contact.

A reminder is contacted once per revision. To be called again about the same
reminder, snooze or reschedule it. The default limit is three calls a day.

### How the outbound call is wired locally

The outreach route creates a LiveKit room, dispatches the `calljarvis` worker
and waits for its audio. It then asks Chert to call your phone, naming the
worker's participant identity. With no `CHERT_FACETIME_WEBHOOK_SECRET` set, the
server polls the call once a second. When Chert reports `bridge_ready` it
writes `chert_bridge_ready` into the room metadata, which is the worker's cue
to greet. It also records how the call ended. Set
`CHERT_FACETIME_POLL=0` to turn polling off, for example on a hosted deployment
that receives the FaceTime webhook.

Polling needs the long-running server from `npm run dev` or `npm start`. A
serverless deployment stops work once it has responded, so it must use the
webhook.

## When something fails

| What you see | Likely cause |
| --- | --- |
| Jarvis says it cannot save anything | The worker could not reach the server. Check `VOICE_API_URL` and that both `VOICE_TOOL_TOKEN` values match, then run `npm run doctor`. |
| `caller_not_verified` in the worker log | `VOICE_DEMO_USER_ID` is unset or matches no account. |
| Scheduler prints `due 0` | No reminder is due, it is not critical, it is acknowledged, quiet hours apply, or the account is not opted in. Run `npm run live:user` again. |
| Attempt shows `simulated` | The Chert line is not ready to call out. `npm run doctor` prints the reason. |
| Attempt returns to pending with `audio_not_ready` | The worker did not join the room within 8 seconds. Check terminal 2 and that the server and worker use the same LiveKit project and `AGENT_NAME`. |
| Phone rings, then silence and the call drops | Readiness was not detected. The server log line `call … events:` shows the event names Chert reported. |
| Line shows Busy | The trial line handles one call at a time. Wait for the current call to end. |

The Chert free trial allows 50 FaceTime minutes a day across the project and
resets at 00:00 UTC.
