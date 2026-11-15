# Swapnil's Codex — Cron, escalation, and integration

Read the [README](../../README.md) for the MVP scope and shared contracts. Branch from
the latest `origin/main` as `codex/escalation`. Coordinate changes outside your owned
paths with their owner. Push your implementation branch to GitHub and open a PR with the
acceptance checks you ran, dependencies, and any provider limits.

**Own** `supabase/functions/escalate/`, the Cron job wiring, and
`docs/integration-runbook.md`. Route SQL additions through the database owner.

- Have Cron invoke the Edge Function. Evaluate due and unacknowledged reminders,
  eligible home events, and enabled check-ins against the shared policy. Claim
  them through the database contract and call the authenticated outreach route.
- Respect opt-in and avoid duplicate alerts across concurrent runs and retries.
  Reconcile uncertain provider outcomes before issuing another delivery. Support
  a manually triggered run for the demo using the same scheduling logic.
- Merge the workstreams in dependency order, configure the shared demo
  environment, and lead the end-to-end rehearsal with Shishir's Codex.
- Implement the four-level communication policy in deterministic code. Low logs or sends
  a message. Medium messages and follows up when configured. High messages and schedules
  a call after the configured delay if still unacknowledged. Critical alerts immediately
  through the configured policy and follows a predefined fallback if unanswered.
- Apply user opt-in, quiet hours, call caps, channel availability, and grace periods.
  Recheck eligibility before sending so acknowledgment, cancellation, completion,
  snooze, or rescheduling can suppress an outdated job. Drive the same scheduler from
  due tasks, eligible home events, and one-off opted-in check-ins if enabled.
- Own deployment order and runtime validation. Deploy the dashboard and API to Vercel
  and keep the LiveKit worker in a persistent environment. Coordinate secret
  configuration and the verified test recipient for the shared demo.
- **Done when** repeated scheduler runs create a single delivery attempt per eligible
  record, channel,
  and notification stage, acknowledged reminders produce no attempt, and an urgent
  simulated event takes the same verified path.
