# 📱 CallJarvis MVP
**Your AI Assistant That Calls When It Matters**

CallJarvis is a proactive, AI-powered personal assistant designed to manage tasks, monitor smart-home events, and ensure you never miss critical information. Instead of passively waiting for you to check an app, Jarvis will send you an iMessage or proactively call you via FaceTime to help resolve pending tasks or alert you to home security events.

Built during a 24-hour hackathon, this MVP demonstrates the core event-to-conversation-to-action pipeline.

## Tech stack

- **Frontend** — Next.js App Router, Tailwind CSS, shadcn/ui
- **Backend** — Supabase Auth, PostgreSQL, Realtime, Edge Functions, and Cron
- **Voice** — LiveKit Agents (Node.js) and Gemini Live
- **Communications** — Chert FaceTime Audio and iMessage

## Current state (Sunday 15 November 2026)

Everything below is deployed from `main` and has been used on a real phone unless it says otherwise.

| Feature | State |
| --- | --- |
| Call Jarvis on FaceTime Audio or Video and manage reminders by voice | Working |
| Jarvis calls you about a **critical** reminder, with a retry after a missed call | Working; the retry after a declined call has not been re-tested since it was fixed |
| "Call me back in N minutes" | Working |
| Avatar on FaceTime Video calls (the dashboard's wooden horse mark; turns red for critical) | Working |
| Home simulator at `/simulator`: Home/Away, stove, porch light, prop map, camera | Working |
| Camera prop recognition through Gemini (Red Bull can, black box) | Unconfirmed since the model was changed in PR #12; the Trigger buttons always work |
| Stove on while Away raises a critical alert and a call within seconds | Deployed in PR #15; confirmed by the user's video alert test |
| Critical home alerts are FaceTime **Video** calls showing the live camera | Working (user confirmed "it works") |
| "Show me the camera" on a video call the user places | Deployed in PR #17; **not yet tried on a real call** |
| Logs page at `/logs`: why each call happened and a timeline | Working |
| iMessage | Not available on the Chert trial (it cannot send first); code exists |
| New user sign-up | Blocked at phone verification: no SMS provider is configured in Supabase |

**Read [the handoff](#handoff-for-the-next-ai) before changing anything.** The sections after it are the original
hackathon plan, kept for reference; parts of it are out of date.

See the [home-security product architecture](docs/architecture/DATA_FLOW.md): Call Jarvis bridges the home camera system and the homeowner through Chert and FaceTime.

## Handoff for the next AI

### How the system fits together

```
iPhone FaceTime <-> Chert line <-> LiveKit room <-> worker (agent/, Gemini Live)
                                                        |  POST /api/internal/voice (bearer VOICE_TOOL_TOKEN)
scheduler (scripts/local-scheduler.mjs) --POST /api/internal/outreach--> web (Next.js) <-> Supabase Postgres
laptop browser (/simulator camera) --publish-only token--> LiveKit room --> worker relays video to FaceTime
```

Three Railway services are built from this repository; the database is Supabase. See
[docs/deploy-railway.md](docs/deploy-railway.md).

| Service | Root | Start | What it does |
| --- | --- | --- | --- |
| `web` | `/` | `npm start` | Dashboard, voice actions, outreach, call watching, camera tokens |
| `worker` | `/agent` | `npm start` | The Jarvis voice agent (LiveKit Agents, Node) |
| `scheduler` | `/` | `npm run scheduler` | Finds due reminders, check-ins and home alerts; `SCHEDULER_INTERVAL_SECONDS=5` |

One more process is required and is **not** on Railway: `chert dev --agent calljarvis --env-file .env.local --no-prewarm`
running on the owner's laptop. The trial line refuses a custom webhook URL, so this is what routes inbound calls
to the worker, and `--no-prewarm` leaves the line free for outbound calls. Without it, calls to Jarvis are not answered.

### Where things live

| Path | Contents |
| --- | --- |
| `agent/agent.mjs` | Worker entry: joins the room, loads context and tools from the server, opens the Gemini Live session |
| `agent/feed.mjs`, `agent/avatar.mjs` | The worker's video track: avatar frames, and the relayed home camera |
| `agent/prompt.mjs`, `tools.mjs`, `voice-api.mjs`, `greet.mjs`, `reply-guard.mjs`, `call-context.mjs` | Wording, tool registration, server client, greeting timing, silence guard, job metadata parsing |
| `src/app/api/internal/voice/_lib/` | Voice actions. `contract.ts` is the tool list sent to the model, `actions.ts` implements them, `handler.ts` authenticates and resolves the user, `store-supabase.ts` and `store-memory.ts` are the two stores, `call-log.ts` writes Logs lines |
| `src/lib/server/chert/` | Outbound calls: `providers.mjs` (LiveKit and Chert HTTP), `deliver.mjs` (place a call once), `watch.mjs` (poll Chert until the call ends), `store.mjs` |
| `src/lib/server/home/` | Simulator: `service.ts` (modes, devices, alerts), `vision.ts` (Gemini prop recognition), `camera.ts` (camera tokens) |
| `src/lib/server/logs.ts`, `src/app/logs/` | Logs page data and UI |
| `src/app/simulator/` | Simulator page, including the camera stream into calls |
| `supabase/migrations/` | Schema. All migrations are applied to the hosted project |
| `docs/` | `live-setup.md`, `deploy-railway.md`, `home-simulator.md`, `chert-setup.md`, `data-contract.md` |

### Rules the code depends on

- **The model never chooses the user.** The server resolves the user from the notification attempt (outbound) or
  `VOICE_DEMO_USER_ID` (inbound). Do not add a user id to any tool.
- **Only critical priority places a call.** Other priorities start with iMessage, which the trial cannot send.
  Check-ins ("call me back") are stored as critical for that reason.
- **Outbound audio must be published before Chert dials.** The worker pre-sets its audio output for outbound
  calls, and passes its real participant identity to Chert. Jarvis greets on `chert_bridge_ready` in the room
  metadata, which `watch.mjs` sets by polling Chert.
- **FaceTime shows only the worker's video.** A camera feed has to be relayed through the worker's track
  (`agent/feed.mjs`). The browser's token can publish a camera into one room and cannot subscribe.
- **Alerts:** an event is critical and call-worthy only while the home is Away. An unacknowledged alert of the
  same type is not raised again for two minutes; Reset acknowledges everything.
- **Nothing is recorded.** No audio, video or transcript is stored. The Logs page is built from action
  summaries in `communication_metadata` and from `notification_attempts`.
- **Jarvis cannot see video** and is told not to describe it. It answers questions about the home from the
  simulator's device state.
- **The avatar is the project's own wooden horse mark** (the dashboard is branded Sir Jarvis, PRs #11 and #14).
  Do not replace it with the film's J.A.R.V.I.S. or arc reactor artwork, or clone the film's voice.

### How to work on it

```
npm ci && (cd agent && npm ci)
npm run typecheck && npm run lint && npm run build
npm test                                             # dashboard, home, logs (37)
node --test src/lib/server/chert/*.test.mjs          # outreach (29)
node --import ./src/app/api/internal/voice/_tests/resolve-ts.mjs --test src/app/api/internal/voice/_tests/voice.test.mjs   # voice actions (20)
(cd agent && npm test)                               # worker (17)
```

- `next build` and `next dev` modify `next-env.d.ts`; run `git checkout -- next-env.d.ts` before committing.
- Work on a branch, open a PR to `main`, merge it. PRs #7 to #17 follow this pattern and their descriptions
  say what each changed and what was left unverified.
- **Railway does not redeploy on push.** After merging, redeploy `web` and `worker` (and `scheduler` if
  `scripts/` changed) from `main`, then check that each deployment reports success.
- Secrets live only in Railway variables and local `.env.local` files. Never commit them, paste them in chat,
  or print them in logs. `.env.example` lists the names.
- Useful switches: `ALERT_VIDEO=0` on `web` puts alert calls back on audio; `JARVIS_VIDEO=1` on `worker`
  publishes video on inbound calls; `CHERT_FACETIME_POLL=0` turns call watching off.

### Open items, most useful first

1. **Try "show me the camera" on a real FaceTime Video call** (PR #17). Start the camera on the laptop's
   Simulator, call from the iPhone, ask for the camera, then ask to hide it. If the avatar stays, the worker log
   lines starting `[jarvis] camera feed` and the `web` log for `/api/home/camera` show where it stopped.
2. **Confirm camera prop recognition** (PR #12 moved it to `gemini-flash-lite-latest` with a 20 second timeout).
   The `web` log prints one line per look.
3. **Confirm the silence guard** (PR #13): Jarvis once went quiet for 50 seconds after a successful tool call.
   The guard prompts it once after 5 seconds. Cause unknown.
4. **First-call stall:** one FaceTime Video call took about 30 seconds before Jarvis spoke. Opening the voice
   session as soon as an inbound call arrives would avoid it. Proposed, not approved by the owner.
5. **Any caller is treated as the demo user.** Chert does not pass the caller's number to the worker. This now
   includes asking to see the camera while the Simulator's camera is on.
6. **`chert dev` still needs the owner's laptop.** Moving it to Railway was deferred by the owner.
7. **Sign-up** needs a Supabase phone provider, or a way to skip phone verification for the demo.
8. **Re-test the missed-call retry** with a declined call (`critical_fallback_seconds` is 120).

### Constraints

- The Chert trial ends around 5:30 PM Central on Monday 16 November 2026 and allows 50 FaceTime minutes a day.
  Test calls spend that budget.
- The demo camera must run on a different device from the phone that takes the call: a phone pauses its camera
  when FaceTime rings.
- ElevenLabs was tried and dropped by the owner (PR #9 closed). Do not bring it back unasked.

## Original hackathon plan (historical)

The workstreams below are finished and merged. Treat this section as background, not as a to-do list.

### Pull your assignment

Give each AI this prompt with its name from the table.

> Pull the latest changes from `main` in `SwapnilChand0623/CallJarvisMVP`.
> Read the README and my assignment for **[AI name]**. Create the assignment
> branch, implement the owned scope, run its acceptance checks, and publish the
> branch and PR to GitHub.

| AI | Assignment |
| --- | --- |
| Swapnil's Gemini | [Database and shared types](docs/workstreams/swapnil-gemini.md) |
| Swapnil's Claude Code | [FaceTime agent and voice actions](docs/workstreams/swapnil-claude-code.md) |
| Swapnil's Codex | [Cron, escalation, and integration](docs/workstreams/swapnil-codex.md) |
| Swapnil's Cursor | [Chert outbound, iMessage, and callbacks](docs/workstreams/swapnil-cursor.md) |
| Shishir's Cursor | [Dashboard and UI](docs/workstreams/shishir-cursor.md) |
| Shishir's Codex | [Dashboard data, simulation, and demo QA](docs/workstreams/shishir-codex.md) |

Start the app scaffold, database contract, and Chert capability checks in
parallel. Use the shared contract for fixture-based work until dependencies land.

### MVP scope

- **JarvisRemind** covers reminder CRUD, natural-language creation and updates,
  four priority levels, scheduling and follow-up, distinct acknowledgment and
  completion, snooze, and rescheduling.
- **JarvisHome** demonstrates one camera or motion event and one authorized light
  action. Use Home Assistant where available and label simulations. Event
  classifications are observations. Certified safety alarms operate independently.
- **JarvisTalks** covers natural conversation, supportive non-clinical dialogue,
  and using authorized task context across calls. Add a consent-based one-off
  check-in when the core flow works. Recurring check-ins are optional.
- **CallJarvis Core** links reminders and home events to FaceTime Audio or iMessage
  through deterministic policy, user consent, verified contacts, quiet hours,
  grace periods, and call caps. Outbound FaceTime depends on Chert provisioning.
- **Dashboard** has Overview, JarvisRemind, JarvisHome, JarvisTalks, and Settings.
  Users can review activity, manage preferences, disable integrations, and delete
  saved context or applicable history.
- Keep provider credentials server-side. Scope user records and device commands
  to the authenticated owner. Audit device actions and obtain confirmation for
  consequential actions. Voice and video recording require explicit consent.
  Store optional conversational memory only with user approval.

Real camera footage, Frigate analysis, recurring reminders and check-ins, calendar
integration, avatars, and household accounts are stretch work. Emergency dispatch,
autonomous lock actions, and clinical assessment are outside the MVP.

### Shared contracts

Agree on these shapes before wiring branches together. If a path or field
changes, tell its consumers in the PR.

| Contract | Fields and behavior |
| --- | --- |
| Reminders | `id`, `user_id`, `title`, `due_at`, `priority`, `status`, `acknowledged_at`. Store timestamps in UTC and display them in the user's time zone. Use `low`, `medium`, `high`, or `critical` priority. Store `pending`, `snoozed`, `completed`, or `canceled`; derive overdue from time and track acknowledgment independently. |
| Home events and devices | `home_events` stores the owner, type, severity, description, occurrence time, and real or simulated source. `devices` stores the owner's authorized lights and their on/off state. A test event is visible in the dashboard. Only policy-eligible events trigger outreach. |
| Contact and preferences | `profiles` stores the user's time zone, verified demo destination, opted-in channels, and outreach enabled flag. Communication rules define delays, quiet hours, and maximum call frequency. The server resolves the destination and ownership from trusted records. |
| Delivery history | `notification_attempts` records the owner, reminder, home event, or check-in, channel, stage, stable idempotency key, provider ID, status, and error code. Show simulated attempts as simulated. Model delivery acceptance, answer, and completion as separate events. |
| Escalation handoff | The scheduler atomically claims an eligible record and creates or reuses its attempt. It sends `POST /api/internal/outreach` with `attemptId` and server-side authentication. The transport resolves the pending attempt, starts delivery once, and returns the attempt ID and outcome. Use a stable key across retries. |
| Voice tools | `createReminder` takes a title, a resolved due time, and priority. Clarify ambiguous times before saving. `controlLight` takes a known simulated device and explicit on/off state. `acknowledgeReminder` uses the reminder ID from authenticated call context. Only confirm a change after a successful write. |

### Default outreach rules

| Priority | Default behavior |
| --- | --- |
| Low | Log the event or send an iMessage according to the user's preference. |
| Medium | Send an iMessage and follow up when configured. |
| High | Send an iMessage, then request FaceTime Audio after the configured delay if still unacknowledged. |
| Critical | Alert immediately through the enabled channels and follow the configured fallback if unanswered. |

### Merge and demo timeline

| Time | Target |
| --- | --- |
| Hours 0–2 | Share the baseline. Land the app scaffold and shared contracts. Check Chert's outbound and messaging eligibility. |
| Hours 2–8 | Work in parallel on the schema, fixture-based dashboard, voice tools, scheduler, and Chert adapters. |
| Hours 8–15 | Merge the schema and types. Connect dashboard reads and actions, enable real voice writes, and run the scheduler with simulated delivery. |
| Hours 15–20 | Connect the live Chert channel. Verify a voice-created reminder, an overdue escalation, a call or message outcome, and acknowledgment. Check that repeated runs create no duplicate contact. |
| Hours 20–24 | Rehearse on the verified phone and demo account, fix integration blockers, and record which paths are live or simulated. |

## Local development

Clone [CallJarvisMVP](https://github.com/SwapnilChand0623/CallJarvisMVP).
Once the frontend scaffold lands, run `npm ci` and `npm run dev` from
the repository root. Follow the [agent setup guide](agent/README.md) to
start the LiveKit worker and Chert in separate terminals.

Provider references for implementers include [Supabase Cron](https://supabase.com/docs/guides/cron),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[LiveKit agent dispatch](https://docs.livekit.io/agents/server/agent-dispatch/),
and [Chert outbound FaceTime](https://docs.trychert.com/facetime/outbound).

## Hackathon success criteria

1. A verified user calls Jarvis on FaceTime and creates a reminder through
   natural speech. The reminder appears on their authenticated dashboard.
2. A due reminder triggers its configured workflow. The history distinguishes
   notification attempts and outcomes, and repeated runs create no duplicate
   attempt for the same stage.
3. The user can acknowledge, complete, snooze, or reschedule the reminder
   conversationally. A later call can retrieve permitted task context.
4. One real or labeled simulated camera or motion event triggers the configured
   notification. An authorized light action updates the state and records the
   result.
5. The demo shows two-way iMessage when provisioned and a proactive FaceTime call
   when outbound access is enabled. If outbound FaceTime is unavailable, show
   the same call-request workflow with an explicit simulation label and report
   which channels ran live.

## Frontend notes

See [frontend handoff](docs/FRONTEND_HANDOFF.md), [demo runbook](docs/demo-runbook.md), and [pitch](docs/PITCH.md). The dashboard reads live data from Supabase; the navigation is Home, Logs, Simulator and Account, and `/reminders` is linked from Home and Logs.
