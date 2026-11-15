# CallJarvis database contract

The database branch owns the shared contract for all six workstreams. Merge it
before scheduler PR #2. Both migrations are deployed to the **CallJarvis** project
`boglzcpbnzmpxdaqwqvb` in `us-east-1`. Repository migration versions match hosted
migration history so later CLI deployments do not replay the schema.

Hosted verification passed using temporary, rolled-back Auth users: profile/rule
onboarding, cross-owner read/write isolation, server-only claim permissions,
idempotent claims and a single pending-to-sending authorization. All 12 public
tables have RLS. Security advisors report no findings; performance advisors report
only unused indexes expected before application traffic. The demo seed was not
installed on the hosted project. Browser login, Cron, provider delivery and the
application's environment configuration still need their owning workstreams.

## Local startup and verification

Docker and Supabase CLI are required. CLI 2.75.0 generated the published types.
The migration, seed, 50 SQL assertions and eight-worker concurrency checks passed
on PostgreSQL 17 using an
Auth-compatible test fixture. The full Supabase image could not fit this execution
environment's Docker storage driver, so a complete `supabase start`/Auth login
rehearsal still needs to run on a normal development machine.
From the repository root:

```sh
supabase start
supabase db reset --local
supabase test db
python3 supabase/tests/concurrency.py
supabase gen types --local --schema public > src/types/database.ts
```

`supabase/config.toml` supplies local configuration. The migration was created
with `supabase migration new calljarvis_shared_contract`. Never run the demo seed
against production. `alex@calljarvis.test` and `sam@calljarvis.test` have password
`LocalDemoOnly!123`. Each has two reminders, a simulated integration/light, and a
simulated motion event. Outreach is disabled, destinations are empty, and contacts
are unverified. New Auth users receive a profile and default communication rules
through a private trigger. Public signup must not accept caller-provided ownership
or verification fields.

## Records and access

All timestamps are `timestamptz` (send ISO 8601 with an offset); display in profile
`timezone`. IDs are UUIDs. Generated types include Row, Insert, Update, enums,
foreign-key relationships, and RPC signatures. UUID ownership references Auth
through `profiles.user_id`; deleting an Auth account cascades its application data.

| Table | Contract |
| --- | --- |
| profiles | `user_id`, IANA `timezone`, server-verified `destination`/`verified_at`, `opted_in_channels`, `outreach_enabled` |
| communication_rules | One per owner; quiet hours, grace, follow-up/escalation delays, daily call cap and critical fallback |
| reminders | Title, due time, four priorities, lifecycle status, independent acknowledgment, snooze time, monotonic revision |
| reminder_history | Server-written before/after snapshots and revision; owner-readable |
| home_assistant_integrations | Owner's integration configuration; no tokens or credentials; store those separately in Vault/server secrets |
| devices | Owned light, integration, entity ID, explicit permission, on/off state and real/simulated source |
| home_events | Type, severity, observation description, occurred time, real/simulated source, server-approved outreach eligibility |
| check_ins | One-off due time, enabled flag and explicit consent timestamp; no recurring scheduling |
| notification_attempts | Exactly one owned source, source revision, channel, stage, globally unique stable key, provider ID, status/error/outcome |
| communication_metadata | Append-only provider event metadata: accepted, answered and completed are separate rows; do not store recordings or transcripts |
| device_action_logs | Server-written requested state, confirmation and result, including explicit simulated outcome |
| structured_memory | Owner-approved structured value, approval timestamp, optional expiry; no implicit conversational storage |

Every table has RLS and an owner index. Anonymous clients have no table access.
Clients can manage their own reminders, rules, integrations, check-ins and approved
memory. They can update profile preferences but cannot verify contacts. Devices,
home events and history are server-created; clients can rename their devices and
acknowledge events. Attempts, communication events and device audit logs cannot be
forged by clients. Composite foreign keys reject linking another owner's source,
integration, device or attempt even through a service-side programming mistake.
The backend must authorize verified call context against the owner before writes.

## Reminder mutations

`status` is `pending`, `snoozed`, `completed`, or `canceled`; overdue is derived.
Acknowledgment sets `acknowledged_at` without completing the reminder. Snoozing
sets `status='snoozed'` and a non-null `snoozed_until`. Rescheduling sets `due_at`,
clears `snoozed_until`, sets `status='pending'`, and clears acknowledgment when the
user explicitly wants renewed outreach. Changes increment `revision` and append
history automatically. Never set revision from application code. Pending attempts
from older revisions are canceled; already-started provider delivery cannot be
recalled. On device actions, require a known permitted light, trusted owner and
explicit on/off state; persist an audit result only after the action's outcome.

## Scheduler RPC contract (service role only)

These match `supabase/functions/escalate/index.ts` on `codex/escalation`:

* `list_escalation_candidates({p_limit:20})` returns a JSON array matching that
  branch's `Candidate` type (camelCase). Revision is a **string**. It filters out
  sources with no currently eligible stage and rotates retried claims behind
  never-claimed work. Page size is bounded to 100.
* `claim_escalation_attempt({p_job:{kind,id,revision,channel,stage}})` returns
  `{attemptId}` or null. Kinds: `reminder`, `home_event`, `check_in`. Channels:
  `imessage`, `facetime`. Stages: `initial`, `follow_up`, `escalation`, `fallback`.
* The function locks the owner and source, rechecks current revision, status,
  acknowledgment, due time, consent, verified destination, quiet hours, call cap,
  and prerequisite delivery outcomes. Its unique key is
  `kind:sourceUUID:revision:channel:stage`. Concurrent identical claims reuse the
  same attempt. No lease creates a replacement attempt on a retry.

The call cap reserves attempts per owner's local calendar day of creation,
including simulated/failed/pending attempts (canceled attempts release a slot).
Transport capability must be checked by the server before enabling a user's
channels. Quiet hours apply to every priority, including critical. The database
and scheduler do not bypass user consent. Time parsing and DST ambiguities must be
resolved by the voice/UI layer before writing an absolute due time.

## Transport handshake and outcomes

The outreach route must call
`begin_notification_delivery({p_attempt_id:attemptId})` before any provider send.
Only the first pending-to-sending transition returns
`{attemptId,idempotencyKey,channel,destination,userId}`. All duplicates return
null. It locks and revalidates the current source and preferences, so stale queued
jobs cannot start. Never send merely because claim returned an attempt ID.

The trusted adapter records `simulated` explicitly for fixture delivery, or records
provider acceptance as `accepted`, then `answered` and `completed` as separate
callback events. Set `outcome_at` on outcomes. An unresolved provider timeout is
`unknown`; do not blindly replay `sending`/`unknown`. Reconcile via provider ID
and the stable idempotency key. If a provider offers neither idempotency nor
reconciliation, exactly-once external delivery cannot be guaranteed; leave the
outcome unknown for operator review. Database claims alone cannot guarantee it.
No provider credentials, outreach secrets, or Cron jobs are installed here.

## Retention and deletion paths

* Owner can delete reminders (their history and attempts cascade), check-ins,
  integrations (devices and action logs cascade), and individual memory rows.
* To revoke memory consent, delete the corresponding `structured_memory` rows;
  do not retain a copy in call metadata. Retrieval must filter `expires_at is null
  or expires_at > now()`.
* Backend history deletion must authenticate the user and delete by trusted
  `user_id` from communication metadata, notification attempts, home events,
  reminder history and device action logs. Clients cannot rewrite audit records.
* Account deletion uses the server-only Supabase Auth admin delete-user API after
  revoking sessions. Foreign keys cascade all application-owned records. Provider
  retention and external copies must be deleted through their own APIs.
* Recommended demo retention: purge expired memory daily; retain delivery,
  communication, home-event and device-action history for 30 days, then delete
  by their timestamp and owner. A deployment must configure this cleanup; this
  migration does not silently install Cron or retain recordings. Keep only active
  reminder history as required by the user's selected retention policy.

For future deployments, inspect existing tables/migrations, apply reviewed migrations,
run advisors and verify with real Auth roles. Never run the demo seed against a
hosted database containing real users. Migration files were created with the CLI
and renamed to the versions recorded by the hosted migration service.
