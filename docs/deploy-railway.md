# Deploy to Railway

One Railway project runs CallJarvis as three always-on services built from this
repository. The database stays on Supabase.

| Service | Root directory | Start command | Public domain |
| --- | --- | --- | --- |
| `web` | `/` | `npm start` | Yes |
| `worker` | `/agent` | `npm start` | No |
| `scheduler` | `/` | `npm run scheduler` | No |

`web` serves the dashboard, the voice actions, outreach and the Chert webhooks.
It also follows each outbound call until it ends, so it must not sleep.
`worker` is the Jarvis voice agent. `scheduler` finds due reminders every 20
seconds and hands them to `web`.

## 1. Create the project and the web service

1. In Railway, create a project from the GitHub repository and pick the
   `codex/live-calls` branch.
2. Name the service `web`. Leave the root directory as `/`. Railway detects
   Next.js and runs `npm run build` then `npm start`.
3. Under Networking, generate a public domain. The rest of this guide calls it
   `https://WEB_DOMAIN`.
4. Set the health check path to `/api/health`.
5. Turn off any sleep or serverless option for this service.

Add these variables to `web`. They are the same values as your local
`.env.local`.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Needed at build time. Redeploy after changing them. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | |
| `VOICE_TOOL_TOKEN`, `VOICE_DEMO_USER_ID` | |
| `OUTREACH_TOKEN` | |
| `CHERT_FACETIME_API_KEY`, `CHERT_PROJECT_ID`, `CHERT_LINE_ID` | |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | |
| `AGENT_NAME` | `calljarvis` |

Open `https://WEB_DOMAIN/api/health`. Every entry under `configured` should be
`true`.

## 2. Add the worker

1. Add a second service from the same repository and branch. Name it `worker`.
2. Set its root directory to `/agent`. Set the start command to `npm start`.
3. Give it no public domain.

| Variable | Notes |
| --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | The same project as `web`. |
| `GEMINI_API_KEY` | |
| `AGENT_NAME` | `calljarvis` |
| `VOICE_API_URL` | `https://WEB_DOMAIN` |
| `VOICE_TOOL_TOKEN` | The same value as `web`. |
| `JARVIS_VIDEO` | Optional. `1` publishes the avatar on inbound video calls. |

The deploy log should end with the worker registered with LiveKit.

**Stop the agent on your own machine once this service is running.** Two
workers with the same `AGENT_NAME` share calls at random, and the one on your
machine would send tool calls to `localhost`.

## 3. Add the scheduler

1. Add a third service from the same repository and branch. Name it
   `scheduler`.
2. Leave the root directory as `/`. Set the start command to
   `npm run scheduler`.
3. Give it no public domain.

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The same values as `web`. |
| `OUTREACH_TOKEN` | The same value as `web`. |
| `OUTREACH_ORIGIN` | `https://WEB_DOMAIN` |

Its log prints `Scheduler running every 20 s` and then one line whenever the
count of due reminders changes.

Railway's shared variables let you define the values used by more than one
service once and reference them from each.

## 4. Check it

From your machine, point the doctor at the deployment:

```sh
OUTREACH_ORIGIN=https://WEB_DOMAIN npm run doctor
```

It uses your local `.env.local` for the tokens, so those must match the
deployed values.

## 5. Accept inbound calls without `chert dev`

Chert asks a webhook whether to accept each incoming call. Pointing that
webhook at `web` lets the line take calls with nothing running on your machine,
and leaves it free for Jarvis to call you between calls.

1. Generate a key: `openssl rand -hex 24`.
2. Add it to the `web` service as `CHERT_WEBHOOK_KEY` and let it redeploy.
   `/api/health` then shows `inboundCalls: true`.
3. In the Chert dashboard, open Lines, choose the line, and under Webhook set
   the integration URL to
   `https://WEB_DOMAIN/api/webhooks/chert/facetime?key=YOUR_KEY`.
   Leave webhook signing off.
4. Stop `chert dev` everywhere. Call the line with FaceTime Audio.

The `web` log shows `[inbound] accepted call …`, then `call … is ready;
greeting started`, then `call … ended`. A call that cannot be served is
declined and the log gives the reason.

How it works: `web` creates a LiveKit room for the call, dispatches the
`calljarvis` worker into it and returns a one-call bridge token to Chert, all
inside Chert's five-second limit. It then polls the call and cues the greeting
when FaceTime is ready. If that cue is lost, the worker greets on its own six
seconds after it starts.

To go back to `chert dev`, run its `setup` command again; it re-points the
line at the local connector.

## Limits of this setup

- The line handles one call at a time. A reminder that comes due while you are
  on a call with Jarvis waits and is retried after the call ends.
- Every inbound caller acts as the account in `VOICE_DEMO_USER_ID`. Chert sends
  only a hash of the caller's number.
- Railway restarts a service on each deploy. A call in progress during a
  `web` or `worker` redeploy is dropped.
- Keep the Supabase Edge Function and Cron job off while `scheduler` runs.
  Running both is safe, but it doubles the outreach requests.
