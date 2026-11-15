# 📱 CallJarvis MVP
**Your AI Assistant That Calls When It Matters**

CallJarvis is a proactive, AI-powered personal assistant designed to manage tasks, monitor smart-home events, and ensure you never miss critical information. Instead of passively waiting for you to check an app, Jarvis will send you an iMessage or proactively call you via FaceTime to help resolve pending tasks or alert you to home security events.

Built during a 24-hour hackathon, this MVP demonstrates the core event-to-conversation-to-action pipeline.

## Tech stack

- **Frontend** — Next.js App Router, Tailwind CSS, shadcn/ui
- **Backend** — Supabase Auth, PostgreSQL, Realtime, Edge Functions, and Cron
- **Voice** — LiveKit Agents (Node.js) and Gemini Live
- **Communications** — Chert FaceTime Audio and iMessage

## Starting point

The LiveKit worker in [`agent/`](agent/) answers inbound FaceTime Audio through
Chert. Swapnil confirmed a conversation on his phone. The [agent setup
guide](agent/README.md) covers local startup and the separate Gemini Interactions
API check. The dashboard, persistent reminders, escalation, and simulated
smart-home flows still need implementation.

## 24-hour MVP work plan

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

## Frontend implementation status

The frontend branch supplies Overview, JarvisRemind, JarvisHome, JarvisTalks, and Settings with labeled browser-local fixtures, four reminder priorities, separate acknowledgment, snooze/rescheduling, light simulation, communication rules, and opt-in context/check-ins. Run `npm ci && npm run dev` (Node 22.13+).

`/auth` provides an optional connected reminder workspace against the shared README contract. Configure public Supabase values from `.env.example` only after the backend schema, owner-scoped RLS, and test account are deployed. The connected adapter is implemented but has not been tested against a live project. Other integrations remain explicitly simulated pending backend contracts.

See [frontend handoff](docs/FRONTEND_HANDOFF.md), [demo runbook](docs/demo-runbook.md), and [pitch](docs/PITCH.md). Validate with `npm run lint`, `npm test`, `npm run build -- --webpack`, and `npm run typecheck`.
