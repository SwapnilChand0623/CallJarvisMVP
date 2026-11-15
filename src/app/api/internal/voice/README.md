# Voice endpoint and shared domain actions

`POST /api/internal/voice` runs reminder, home and JarvisTalks actions for the
LiveKit worker in [`agent/`](../../../../../agent/). The same actions are
exported for the iMessage handler, so both channels share one contract and one
set of authorization rules.

## Request

```http
POST /api/internal/voice
Authorization: Bearer <VOICE_TOOL_TOKEN>

{ "action": "createReminder", "args": { "title": "Call Mom", "dueInMinutes": 30 }, "call": { "callId": "…", "attemptId": "…" } }
```

| Status | Body | Meaning |
| --- | --- | --- |
| 200 | `{ "ok": true, "result": { … } }` | The write succeeded. Only now may Jarvis confirm it. |
| 422 | `{ "ok": false, "error": { "code", "message", "candidates"? } }` | Refused. `message` tells the model what to do next. |
| 502 | `{ "ok": false, "error": { "code": "write_failed" } }` | Storage failed. |
| 400, 401, 403, 503 | same error shape | Bad request, wrong token, unverified caller, storage not configured. |

`session.start` returns the caller's context (name, local time, open reminders,
approved notes, the reminder an outbound call is about) and `tools`, the action
list in [`_lib/contract.ts`](_lib/contract.ts). The worker registers those as
model tools.

## Who the call belongs to

The request never carries a user ID, and one in `args` or `call` is ignored.

- **Outbound** calls send `call.attemptId`. The server reads the owner and
  reminder from `notification_attempts`. An unknown attempt is refused.
- **Inbound** calls belong to the verified demo caller in `VOICE_DEMO_USER_ID`.
  With it unset, inbound calls get no tools. Chert does not give the worker the
  caller's number, so per-caller lookup needs a Chert call lookup from the
  outreach owner.

Every store query filters by that owner. The Supabase store uses the service
role key, which bypasses RLS, so the filter is the isolation boundary.

## Actions

| Action | Arguments | Effect |
| --- | --- | --- |
| `listReminders` | `filter?` open, overdue, today, completed | Up to 10, soonest first. |
| `createReminder` | `title`, one of `dueLocal` or `dueInMinutes`, `priority?` | New `pending` reminder. No time gives `time_required`. |
| `updateReminder` | `reminder?`, `title?`, `priority?`, one due field | A new time sets `pending` and clears the snooze and `acknowledged_at`. |
| `snoozeReminder` | `reminder?`, one due field | `snoozed` until that time. `due_at` is kept and `acknowledged_at` cleared. |
| `acknowledgeReminder` | `reminder?` | Sets `acknowledged_at`. Status is unchanged. |
| `completeReminder` | `reminder?` | `completed`. `acknowledged_at` is unchanged. |
| `cancelReminder` | `reminder` | `canceled`. Never defaults to the call's reminder. |
| `getHomeStatus` | none | Home or Away, the owner's permitted devices and five latest events, with a simulated flag. |
| `controlDevice` | `device`, `on` | Switches a permitted device (a light or the stove) through the home service and reports its outcome. |
| `setHomeMode` | `mode` home or away | While Away, home events place a call. |
| `acknowledgeHomeEvent` | none | Acknowledges the event the call is about, or the newest unacknowledged one. |
| `saveMemory` | `content`, `userConsented` | Refused unless `userConsented` is `true`. |
| `scheduleCheckIn` | one due field, `userConsented` | Refused unless `userConsented` is `true`. |

`reminder` is an ID or a few words of the title. It matches only the owner's
open reminders; several matches return `reminder_ambiguous` with candidates.
Omitted, it means the reminder the outbound call is about.

`dueLocal` is `YYYY-MM-DDTHH:mm` in the user's `profiles.timezone`. The
server converts it to UTC, rejects past times and times skipped by a
daylight-saving change, and returns the saved time for Jarvis to read back.

## iMessage

The Chert webhook forwards any text that is not a plain acknowledgment:

```json
{ "action": "inboundMessage", "args": { "text": "snooze 30 min" }, "call": { "attemptId": "…" } }
```

Set `VOICE_ACTIONS_URL` to this route's full URL and `VOICE_ACTIONS_TOKEN` to the
same value as `VOICE_TOOL_TOKEN`. The attempt is required; text never falls back
to the demo caller. The owner and reminder come from the attempt.

The text is matched against a fixed command set: `done`, `snooze <duration>`,
`list`, `turn on|off <light>`, and `remind me to <task> in <duration>`. Anything
else changes nothing. The response is
`{ ok: true, result: { understood, action, changed, reply } }`, where `reply` is
a short text the transport can send back.

Server code can also call the actions directly:

```ts
import { runAction, resolveActor, voiceConfig } from "@/app/api/internal/voice/_lib";

const config = voiceConfig();
const actor = await resolveActor(config.deps!.store, { attemptId }, config, "imessage");
const outcome = await runAction(config.deps!, actor!, "acknowledgeReminder", {});
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `VOICE_TOOL_TOKEN` | Shared secret with the worker. Unset rejects every request. |
| `VOICE_DEMO_USER_ID` | `profiles.user_id` of the verified demo caller for inbound calls. |
| `VOICE_DEFAULT_TIME_ZONE` | Used when a profile has no valid zone. Defaults to `America/Chicago`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage. Server-side only. |
| `VOICE_STORE=memory` | In-memory fixtures for local work. Ignored when `NODE_ENV` is `production`. |

## Database

The Supabase store follows `docs/data-contract.md` on `codex/database`.

- Snoozing sets `status = 'snoozed'` and `snoozed_until`, and keeps `due_at`.
  Completing, canceling or rescheduling clears `snoozed_until`.
- The store never writes `revision`. Triggers bump it, append
  `reminder_history` and cancel stale pending attempts.
- Lights are read and changed only where `permitted` is true.
- A device action writes one `device_action_logs` row after its outcome.
- Saved notes are `structured_memory` rows keyed `note:<uuid>` with value
  `{"text": …}` and `approved_at` set. Expired rows are not read.
- A check-in is inserted enabled, with `consented_at` set and `priority`
  critical so the scheduler calls. The column's default, low, sends nothing.
- `profiles` has no name column, so Jarvis does not address the user by name.

## Open dependencies

- **Home service.** `controlDevice` goes through the
  `HomeService` port. Until `src/lib/server/home` exists, [`_lib/home.ts`](_lib/home.ts)
  changes a simulated light's stored state and logs it as `simulated`. It
  refuses a device whose `source` is `real`.
- **Outbound (Swapnil's Cursor).** The worker reads the dispatch metadata that
  `src/lib/server/chert` sends. See the [agent guide](../../../../../agent/README.md#voice-actions).

## Checks

```sh
node --import ./src/app/api/internal/voice/_tests/resolve-ts.mjs --test src/app/api/internal/voice/_tests/voice.test.mjs
```

Runs on Node 22.18 or later with no dependencies.
