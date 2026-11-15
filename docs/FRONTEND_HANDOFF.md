# Frontend handoff

Run `npm ci`, then `npm run dev` and open http://localhost:3000. Requires Node 22.13+.

Routes: `/` Overview, `/reminders` JarvisRemind, `/settings` preferences.

This is a browser-local demo. It never sends calls, messages, or sensor commands. The guided call creates a real local reminder, and parses a limited set of typed relative-time requests, but does not transcribe speech. There is no authentication or production backend yet. Browser storage holds sample data and should not contain sensitive information.

## Demo sequence

1. Open Overview. Point out the overdue medication reminder.
2. Try a demo call, type “Remind me to call Mom in 30 minutes,” review the parsed reminder, and confirm it.
3. Open JarvisRemind to see the new reminder; complete it with the checkbox.
4. Return to Overview and simulate a home event. It appears in the activity feed.
5. Change the preferred channel in Settings; new reminders use it.
6. Reset sample data in Settings before presenting again.

## Backend integration boundary

`src/lib/mockData.ts` owns frontend types and deterministic seed generation. `src/components/demo-provider.tsx` owns loading, persistence, updates, and reset. Replace its local persistence with authenticated Supabase queries/subscriptions after the backend schema is agreed; avoid creating a competing schema from the frontend.

Suggested mappings to agree with Swapnil: Reminder `id`, `title`, `dueAt` (ISO timestamp), `priority` (high/normal), `status` (pending/completed), and `channel` (FaceTime/iMessage); activity `id`, `title`, `detail`, `time`, and `kind`. These are frontend contracts, not a prescribed database schema. Set ownership and row-level security in the backend before connecting real data.

CallDemo is a guided simulation. Replace with the agreed LiveKit/Chert session flow only after server routes exist. Settings currently store preferences only; escalation is not implemented. Home events are sample feed entries, not sensor state. Keep credentials server-side. Frontend code does not touch `/agent`, `/supabase`, or API routes.

## Verification

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

## Natural-language demo

Supported requests follow `Remind me to <task> in <number> minutes/hours/days`, from one minute to thirty days. The demo asks for clarification when input does not match; it never guesses ambiguous dates. Users review the interpreted task, due time, and channel before saving. This is a deterministic parser, not an OpenAI integration.
