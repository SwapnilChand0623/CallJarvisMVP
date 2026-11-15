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
| `updateReminder` | `reminder?`, `title?`, `priority?`, one due field | A new time sets `pending` and clears `acknowledged_at`. |
| `snoozeReminder` | `reminder?`, one due field | `snoozed`, new `due_at`, `acknowledged_at` cleared. |
| `acknowledgeReminder` | `reminder?` | Sets `acknowledged_at`. Status is unchanged. |
| `completeReminder` | `reminder?` | `completed`. `acknowledged_at` is unchanged. |
| `cancelReminder` | `reminder` | `canceled`. Never defaults to the call's reminder. |
| `getHomeStatus` | none | The owner's lights and five latest events, with a simulated flag. |
| `controlLight` | `device`, `on` | Calls the home service and reports its outcome. |
| `saveMemory` | `content`, `userConsented` | Refused unless `userConsented` is `true`. |
| `scheduleCheckIn` | one due field, `topic?`, `userConsented` | Refused unless `userConsented` is `true`. |

`reminder` is an ID or a few words of the title. It matches only the owner's
open reminders; several matches return `reminder_ambiguous` with candidates.
Omitted, it means the reminder the outbound call is about.

`dueLocal` is `YYYY-MM-DDTHH:mm` in the user's time zone from `profiles`. The
server converts it to UTC, rejects past times and times skipped by a
daylight-saving change, and returns the saved time for Jarvis to read back.

## Use from iMessage

```ts
import { runAction, resolveActor, voiceConfig, ACTIONS } from "@/app/api/internal/voice/_lib";

const config = voiceConfig();
// attemptId when the message replies to an outreach attempt; otherwise build the Actor from the verified sender.
const actor = await resolveActor(config.deps!.store, { attemptId }, config, "imessage");
const outcome = await runAction(config.deps!, actor!, "acknowledgeReminder", {});
```

`ACTIONS` is JSON Schema and can be given to a text model as its tool list.

## Configuration

| Variable | Purpose |
| --- | --- |
| `VOICE_TOOL_TOKEN` | Shared secret with the worker. Unset rejects every request. |
| `VOICE_DEMO_USER_ID` | Profile ID of the verified demo caller for inbound calls. |
| `VOICE_DEFAULT_TIME_ZONE` | Used when a profile has no valid zone. Defaults to `America/Chicago`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Storage. Server-side only. |
| `VOICE_STORE=memory` | In-memory fixtures for local work. Ignored when `NODE_ENV` is `production`. |

## Open dependencies

- **Database (Swapnil's Gemini).** Names not fixed by the README are marked
  `proposed` in `SCHEMA` in [`_lib/store-supabase.ts`](_lib/store-supabase.ts):
  `profiles.display_name`, `profiles.time_zone`, `devices.is_on`,
  `home_events.occurred_at`, and the tables `device_actions`, `memories` and
  `check_ins`. Reminder changes write only the contract columns, so revision
  bumps and reminder history need to come from database triggers.
- **Home service (Shishir's Codex).** `controlLight` goes through the
  `HomeService` port. Until `src/lib/server/home` exists, [`_lib/home.ts`](_lib/home.ts)
  flips the stored state, writes the audit row and labels the result simulated.
- **Outbound (Swapnil's Cursor).** Dispatch metadata and the readiness signal
  are described in the [agent guide](../../../../../agent/README.md#voice-actions).

## Checks

```sh
node --import ./src/app/api/internal/voice/_tests/resolve-ts.mjs --test src/app/api/internal/voice/_tests/voice.test.mjs
```

Runs on Node 22.18 or later with no dependencies.
