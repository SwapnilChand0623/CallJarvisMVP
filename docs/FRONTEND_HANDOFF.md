# Frontend handoff

Node 22.13+ is required. Run `npm ci`, then `npm run dev`. The frontend's local fixtures require no credentials. The root package includes a local Node 22 runtime for npm scripts on older development hosts.

## Pages and storage

- `/`: overview, upcoming reminders, home summary, activity, and simulated outreach history.
- `/reminders`: create, edit, acknowledge, complete/reopen, snooze, cancel, reschedule, and inspect reminder history. Four priorities match the README. Acknowledgment is independent from lifecycle state.
- `/home`: labeled camera/motion fixtures and an authorized fixture light with explicit confirmation and action outcome history.
- `/talks`: style preferences, optional user-approved context, context deletion, and consent-based one-off simulated check-ins.
- `/settings`: time zone, channel preferences, outreach opt-in, quiet hours, escalation delay, call cap, simulator disable, local history deletion, and clean-seed reset.
- `/auth`: existing-account Supabase sign-in and a separate connected reminder workspace. Includes owner-filtered reads and mutations, record validation, edit/reschedule, acknowledgment, completion, snooze, deletion, session handling, Realtime subscription, and a polling fallback. Writes are confirmed only after the database returns success.

The five demo sections persist in browser storage under `calljarvis-demo-v2`; old v1 fixtures are not migrated because the shared reminder contract changed. No demo records are uploaded. Dates are stored as ISO UTC timestamps. Demo dates display in the configured IANA time zone; datetime inputs explicitly use the browser's local time.

## Connected data setup and limits

Copy `.env.example` to `.env.local` and set the public Supabase URL and publishable key. Never expose service-role or provider credentials. The adapter in `src/lib/supabase/reminders.ts` uses the shared README reminder fields: `id`, `user_id`, `title`, `due_at`, `priority`, `status`, `acknowledged_at`. It validates returned records and rejects ownership mismatches, but these client checks are not a replacement for database RLS.

Before using connected mode, the backend owner must land and apply owner-scoped RLS and the agreed schema, provision an existing test account, and enable Realtime publication if desired. An incompatible schema produces an error and retry state rather than switching silently to demo data. Polling refetches every 30 seconds and every mutation refetches immediately. Signed-out/account-changed sessions clear visible records and invalidate in-flight reads.

No database migration or Supabase project configuration exists in main at implementation time. Consequently, connected CRUD is implemented against the README contract but has not been exercised against a live database. Profiles, verified contacts, persistent home records, memory, check-ins, and outreach still require their backend contracts and endpoints. They are explicit local simulations, not claimed as complete integrations. Do not enable production live data until two-user RLS checks pass.

Home Assistant and voice-worker services remain backend integration work. The frontend does not command real hardware. A typed conversation uses a deterministic grammar, not speech recognition or an AI service. It supports creation and exact-title acknowledgment, completion, snooze, and rescheduling, with review before save and clarification on duplicate names.

## Validation

Run `npm run lint`, `npm test`, `npm run build -- --webpack`, and `npm run typecheck`. Webpack avoids macOS sandbox file-watcher and Turbopack port restrictions. Agent code inherited from main remains owned by the backend team.
