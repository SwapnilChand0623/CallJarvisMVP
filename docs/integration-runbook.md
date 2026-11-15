# Escalation and demo integration

The scheduler and Cron installation script are ready for fixture testing. The
following RPC and handoff shapes are integration proposals for the database and
outreach owners; confirm them before deploying. Do not enable Cron until the
manual simulated run passes.

## Database and outreach handoff

- `list_escalation_candidates(p_limit integer)` returns a JSON array matching
  [Candidate](../supabase/functions/escalate/policy.ts). Return at most the
  requested limit, scoped to potentially actionable stages and recoverable
  attempts. Exclude resolved work and rotate deferred rows so a page of capped
  or quiet-hour contacts cannot starve the queue. Build `channels` from verified
  destinations, channel consent, and current transport capability. For low
  priority with messaging disabled, use the existing reminder/event record as
  the log. A critical fallback requires a definitive `unanswered` outcome.
- `claim_escalation_attempt(p_job jsonb)` consumes
  `{kind,id,revision,channel,stage}`. It returns JSON `null` for ineligible work
  or a current competing lease, or `{"attemptId":"…"}`. In one transaction
  recheck the source revision, due time, acknowledgment, lifecycle state,
  scheduling policy, current consent, verified destination, quiet hours, stage
  prerequisites and call cap. Reserve call capacity atomically per user. The
  unique key includes source kind, ID, revision, channel and stage. A retry of
  the same logical attempt reuses its ID and reservation. Release or expire
  abandoned claims so an Edge crash before handoff can recover. Restrict both
  RPCs to the server role.
- `POST /api/internal/outreach` accepts `{"attemptId":"…"}` and
  `Authorization: Bearer <OUTREACH_TOKEN>`. It returns the same attempt ID
  alongside its outcome. Before provider send, atomically acquire the right
  to send and recheck freshness and consent so changes after scheduler claim
  can still suppress contact. Persist the stable provider request key before
  sending. For an in-flight or unknown outcome, reconcile from the provider
  or callback state before any send; if absence cannot be proven and the
  provider cannot deduplicate, keep the attempt unknown for review. A timeout
  is not a definitive failure or an unanswered call. Callbacks can use the
  persisted attempt even if the source becomes inactive.

## Deployment order

1. Land shared schema, generated types, RPCs and two-user fixture data. Verify
   service-only RPC access and the database's concurrent claim behavior.
2. Land the outreach route and simulator. Deploy the dashboard and API to
   Vercel with its server credentials and matching `OUTREACH_TOKEN`. Keep
   Chert in simulation mode until the destination and channel are verified.
3. Deploy the LiveKit worker to a persistent host; verify named dispatch and
   that a voice mutation appears for the right signed-in dashboard user.
4. Set Edge secrets `ESCALATE_TOKEN`, `OUTREACH_TOKEN` and
   `OUTREACH_ORIGIN`. Use distinct strong tokens for the two hops. The
   runtime supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (confirm
   the legacy service role key is enabled for this project). Configure this
   function with `verify_jwt = false` so the gateway passes the private bearer
   to the handler, which validates it before accessing the database. Deploy
   only the `escalate` function.
5. Invoke the same handler manually using environment variables populated
   from the secret store:

   ```sh
   curl --fail-with-body -X POST "$ESCALATE_URL" \
     -H "Authorization: Bearer $ESCALATE_TOKEN"
   ```

6. Enable Cron and pg_net. Store the full HTTPS function URL and its token
   in Vault as `calljarvis_escalate_url` and `calljarvis_escalate_token`.
   Run [the Cron installer](../supabase/cron/escalate.sql) in the demo database
   to register one job each minute. See [Scheduling Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).
   Check `cron.job_run_details` for job execution and Edge logs for the actual
   HTTP result: successful SQL means the request was queued, not processed.
   Pause the job from the dashboard if needed.

## Rehearsal

- Run local fixtures: `node --test supabase/functions/escalate/escalate.test.mjs`
  with Node 24, or use `deno check supabase/functions/escalate/index.ts` to
  type-check the Edge entry point.
- In the integrated simulator, trigger two manual runs together and then
  repeat. Verify one attempt per source revision, channel and stage; verify
  consent, quiet hours across midnight, call caps and delays. Simulate a
  timeout after provider acceptance and check that the same attempt is
  reconciled without a second delivery.
- Acknowledge, snooze, complete or reschedule between scan and claim and
  between claim and send. Verify the stale stage produces no delivery.
- Use the authorized home-event simulator to inject a critical event. Confirm
  the same scheduler hands it off with a visible simulation label. Rehearse
  the voice → reminder → dashboard → outreach → acknowledgment path with
  Shishir's Codex. Enable live delivery only for the verified test contact
  once the outreach owner confirms provider provisioning.
