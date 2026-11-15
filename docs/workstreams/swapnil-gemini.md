# Swapnil's Gemini — Database and shared types

Read the [README](../../README.md) for the MVP scope and shared contracts. Branch from
the latest `origin/main` as `codex/database`. Coordinate changes outside your owned
paths with their owner. Push your implementation branch to GitHub and open a PR with the
acceptance checks you ran, dependencies, and any provider limits.

**Own** `supabase/migrations/`, `supabase/seed.sql`,
`src/types/database.ts`, and `docs/data-contract.md`. Coordinate migration
ordering with Swapnil's Codex.

- Implement the shared schema, relationships, constraints, and indexes for due
  reminders and notification lookups. Set owner-based RLS and minimal grants.
  Keep privileged claim and delivery operations server-only.
- Seed two demo users with representative reminders, a light, and a home-event
  fixture. Add an atomic claim mechanism that prevents overlapping scheduler runs
  from creating multiple attempts for the same event,
  channel, and notification stage.
- Publish generated TypeScript types, the claim contract, and instructions for
  starting and seeding the local database.
- Support four priority levels and separate reminder lifecycle state from acknowledgment
  and delivery history. Model snooze and rescheduling explicitly and invalidate stale
  notification jobs when a reminder changes.
- Add owner-scoped records for communication rules, reminder history, call and message
  metadata, Home Assistant integrations and permitted devices, device action audit logs,
  optional check-ins, and user-approved structured memory. Publish the retention and
  deletion paths alongside the schema.
- Verify the claim key distinguishes notification stages and reminder revisions.
  Exercise the negative cases for cross-user reads, writes, and use of privileged
  functions.
- **Done when** a clean local database applies the migrations, each user sees
  only their own data, and two claims for the same record produce one attempt.
