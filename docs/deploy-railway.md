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

Then test both directions:

1. **You call Jarvis.** Inbound calls still need the Chert connector. On your
   machine, in `agent/`, run only
   `npx --yes @trychert/facetime@0.1.0-beta.21 dev --agent calljarvis --env-file .env.local`.
   Call the line and create a critical reminder due in two minutes.
2. **Jarvis calls you.** End the call and stop `chert dev` so the line is free.
   The `scheduler` log shows the attempt, your phone rings, and the `web` log
   shows `call … is ready; greeting started`.

## Limits of this setup

- Inbound calls depend on `chert dev` running on your machine, and it holds
  the line. Receiving a call and being called cannot both be live until inbound
  calls are accepted through Chert's webhook.
- Railway restarts a service on each deploy. A call in progress during a
  `web` or `worker` redeploy is dropped.
- Keep the Supabase Edge Function and Cron job off while `scheduler` runs.
  Running both is safe, but it doubles the outreach requests.
