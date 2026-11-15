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

### Start here

1. **Swapnil** reviews and shares the existing `agent/` code and this README as a
   common baseline. Keep private environment files and provider credentials local.
2. Each teammate opens a separate branch or worktree from that baseline. Copy the
   corresponding assignment below into each AI chat and ask it to implement its
   owned paths, run the acceptance check, and report its branch and any blockers.
3. **Shishir's Cursor** creates the Next.js app and root package files first.
   **Swapnil's Gemini** publishes the database contract and fixture shapes in
   parallel. Share both early so the other chats can use the same foundation.
4. **Swapnil's Cursor** checks which live channels the chosen Chert project and
   verified demo recipient can use. Have it investigate outbound FaceTime Audio
   and proactive iMessage first. Start parallel development using simulated
   delivery until a live channel is verified.

### Shared contracts

Agree on these shapes before wiring branches together. If a path or field
changes, tell its consumers in the PR.

| Contract | Fields and behavior |
| --- | --- |
| Reminders | `id`, `user_id`, `title`, `due_at`, `priority`, `status`, `acknowledged_at`. Store timestamps in UTC and display them in the user's time zone. Use `normal` or `high` priority and `pending` or `completed` status. Acknowledging a reminder suppresses escalation while it remains pending. |
| Home events and devices | `home_events` stores the owner, type, severity, description, occurrence time, and simulated source. `devices` stores the owner's simulated lights and their on/off state. A test event is visible in the dashboard. Only the explicitly seeded urgent event triggers outreach. |
| Contact and preferences | `profiles` stores the user's time zone, verified demo destination, opted-in channel, and outreach enabled flag. The server resolves the destination and ownership from trusted records. |
| Delivery history | `notification_attempts` records the owner, reminder or home event, channel, stable idempotency key, provider ID, status, and error code. Show simulated attempts as simulated. Model delivery acceptance, answer, and completion as separate events. |
| Escalation handoff | The scheduler atomically claims an eligible record and creates or reuses its attempt. It sends `POST /api/internal/outreach` with `attemptId` and server-side authentication. The transport resolves the pending attempt, starts delivery once, and returns the attempt ID and outcome. Use a stable key across retries. |
| Voice tools | `createReminder` takes a title, a resolved due time, and priority. Clarify ambiguous times before saving. `controlLight` takes a known simulated device and explicit on/off state. `acknowledgeReminder` uses the reminder ID from authenticated call context. Only confirm a change after a successful write. |

### 1. Swapnil's Gemini — Database and shared types

**Own** `supabase/migrations/`, `supabase/seed.sql`,
`src/types/database.ts`, and `docs/data-contract.md`. Coordinate migration
ordering with Swapnil's Codex.

- Implement the shared schema, relationships, constraints, and indexes for due
  reminders and notification lookups. Set owner-based RLS and minimal grants.
  Keep privileged claim and delivery operations server-only.
- Seed two demo users with representative reminders, a light, and a home-event
  fixture. Add an atomic claim mechanism that prevents overlapping scheduler runs
  from creating multiple attempts for the same event and channel.
- Publish generated TypeScript types, the claim contract, and instructions for
  starting and seeding the local database.
- **Done when** a clean local database applies the migrations, each user sees
  only their own data, and two claims for the same record produce one attempt.

### 2. Swapnil's Claude Code — FaceTime agent and voice actions

**Own** `agent/` and `src/app/api/internal/voice/`.

- Extend the working inbound Gemini Live worker. Attach validated reminder and
  simulated light tools to a trusted user or verified demo caller. Keep the model
  from choosing a user ID or accessing another user's records.
- Build the server-side voice tool endpoints and persist writes via the shared
  database contract. Return explicit success or failure so Jarvis can report
  what happened.
- Pair with Swapnil's Cursor on outbound dispatch metadata, audio preflight,
  and the `bridge_ready` greeting. Keep the inbound call working and support
  acknowledgment of the reminder referenced by the outbound call.
- **Done when** a call can create a reminder that appears in the dashboard, change
  a simulated light's state, and acknowledge the reminder the agent called about.

### 3. Swapnil's Codex — Cron, escalation, and integration

**Own** `supabase/functions/escalate/`, the Cron job wiring, and
`docs/integration-runbook.md`. Route SQL additions through the database owner.

- Have Cron invoke the Edge Function. Filter for due, high-priority, pending,
  unacknowledged reminders and the eligible seeded urgent home event. Claim
  them through the database contract and call the authenticated outreach route.
- Respect opt-in and avoid duplicate alerts across concurrent runs and retries.
  Reconcile uncertain provider outcomes before issuing another delivery. Support
  a manually triggered run for the demo using the same scheduling logic.
- Merge the workstreams in dependency order, configure the shared demo
  environment, and lead the end-to-end rehearsal with Shishir's Codex.
- **Done when** repeated scheduler runs create a single delivery attempt for an
  eligible record, acknowledged reminders produce no attempt, and an urgent
  simulated event takes the same verified path.

### 4. Swapnil's Cursor — Chert outbound, iMessage, and callbacks

**Own** `src/app/api/internal/outreach/`, `src/app/api/webhooks/chert/`,
`src/lib/server/chert/`, and `docs/chert-setup.md`.

- Verify line permissions, recipient restrictions, messaging capabilities, and
  available trial minutes early. Record which channels can run live in the demo.
- Implement outbound FaceTime Audio with a call-scoped LiveKit token, named
  dispatch, a ready audio publication, and the Chert Calls API. Enable the
  agent's greeting on the bridge-ready signal. Coordinate room cleanup and the
  trusted user/reminder metadata with Claude Code.
- Add iMessage sending and inbound reply handling where the project's Chert
  capabilities support them. A recognized acknowledgment should update only the
  matching user's reminder. Verify webhook authenticity and handle repeated or
  out-of-order provider events without regressing status.
- Implement a simulated delivery adapter for local development and unavailable
  channels. Feed provider IDs and status updates back to the attempt record.
- **Done when** an authorized request produces one attempt and dashboard-visible
  status updates, and an eligible verified recipient receives at least one live
  proactive contact. If provisioning blocks both channels, report that gap and
  demo the simulated path with a visible label.

### 5. Shishir's Cursor — Dashboard and UI

**Own** the root Next.js scaffold, route layouts and pages, shared UI
components, and styling in `src/app/` and `src/components/`. The backend
owners own their `src/app/api/` routes.

- Ship **Overview** for upcoming reminders, recent home events, and outreach
  history. Ship **JarvisRemind** for creating, editing, acknowledging, and
  completing reminders. Ship **Settings** for time zone, contact preferences,
  outreach opt-in, and simulation controls.
- Start from agreed fixtures and component props while the database is being
  built. Cover loading, empty, error, and success states and make simulated
  actions visible.
- **Done when** the three screens work at desktop and phone sizes, the core
  flows are usable with fixtures, and Shishir's Codex can wire the server data
  through the agreed props and actions.

### 6. Shishir's Codex — Dashboard data, simulation, and demo QA

**Own** `src/lib/supabase/`, `src/features/`, auth routes under
`src/app/auth/`, `src/app/api/demo/`, `tests/e2e/`, and
`docs/demo-runbook.md`. Coordinate page-level wiring with Shishir's Cursor.

- Implement sign-in, session handling, typed reminder CRUD, profile updates,
  and ownership-scoped dashboard reads. Subscribe to reminder, home event,
  device, and delivery changes or refetch reliably after mutations.
- Implement authenticated controls to inject the demo home event and inspect or
  toggle the simulated light. Wire the pages to live Supabase data and include
  a reproducible fixture setup.
- Run browser smoke tests and write a three-minute demo script. Rehearse
  creating a reminder over FaceTime, showing it in the dashboard, triggering
  outreach, and acknowledging it. Show the urgent home-event flow and the
  simulated light state.
- **Done when** updates made in a call appear in the same user's dashboard, a
  second user cannot see them, and the demo can be reproduced from a clean seed.

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

1. The dashboard displays persisted reminders, simulated home events, and
   outreach history for the signed-in user.
2. Spoken instructions on FaceTime create a reminder in the database and the
   dashboard reflects it. A simulated light action also updates stored state.
3. Supabase Cron detects an overdue, unacknowledged priority reminder and
   records exactly one outreach attempt across repeated runs.
4. A verified recipient receives a proactive FaceTime Audio call or iMessage.
   An acknowledgment updates the dashboard and suppresses further outreach for
   that reminder. A simulated delivery can demonstrate orchestration if provider
   access is unavailable. The live delivery criterion stays open in that case.
