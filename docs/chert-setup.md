# Chert outbound, iMessage, and callbacks

This is the transport for CallJarvis outreach. The scheduler claims one attempt and calls `POST /api/internal/outreach`. This service places at most one FaceTime Audio call or iMessage for that attempt, then records provider ids and later callbacks on the same row.

Shishir's app scaffold and Gemini's schema are separate branches. Until those land, the route modules are ready to mount and the acceptance checks run against the in-memory store.

## What can run live

Checked from this workspace without printing credentials:

- `agent/.env.local` has LiveKit and Gemini values for the inbound worker. It does not include a FaceTime project API key, project id, line id, or messaging token.
- Outbound FaceTime and iMessage therefore stay on the labeled simulator until those values are set and a probe returns `live: true`.
- Inbound FaceTime through `chert dev` is a separate path owned by the voice worker. Simulation here does not replace that inbound line.

Chert's published limits still apply once a line is provisioned. Free and Shared outbound calls require a verified recipient. A trial line, when activated from the CLI, is documented as 50 FaceTime minutes, 5 minutes per call, and inbound iMessage up to 50 messages an hour for 24 hours. HTTP 201 means the call was allocated, not answered. HTTP 202 on iMessage means the send is still queued. A lost iMessage response must not be retried with a new key: Chert can deliver twice. FaceTime create is safe to retry only with the same `Idempotency-Key`.

## Routes

| Route | Auth | Behavior |
| --- | --- | --- |
| `GET /api/internal/outreach` | `Authorization: Bearer $OUTREACH_TOKEN` | Current channel capability result. |
| `POST /api/internal/outreach` | same | Body `{"attemptId":"..."}`. Returns that id, `outcome`, `status`, `simulated`, `providerId`, `errorCode`, and `capabilities`. |
| `POST /api/webhooks/chert/facetime` | `X-Chert-Signature: sha256=<hex>` over the raw body with `CHERT_FACETIME_WEBHOOK_SECRET` | Call lifecycle. Greets on `call.started` or `bridge_ready`. |
| `POST /api/webhooks/chert/imessage` | `X-Webhook-Signature: t=<unix>,v1=<hex>` over `<timestamp>.<raw body>` with `CHERT_WEBHOOK_SECRET` | Inbound replies and delivery updates. |

Outcomes are `suppressed`, `unknown`, `accepted`, `answered`, `completed`, `simulated`, `unanswered`, and `failed`. `simulated` is the visible label for a channel that is forced off or not provisioned. `unknown` means the provider may already have the request; the next pass reconciles instead of starting another contact. A timeout is stored as `unknown`, not as a failed or unanswered call.

## Server environment

Keep these on the server. Do not commit them.

| Name | Use |
| --- | --- |
| `OUTREACH_TOKEN` | Scheduler bearer. Use a different value from `ESCALATE_TOKEN`. |
| `CHERT_FACETIME_API_KEY`, `CHERT_PROJECT_ID`, `CHERT_LINE_ID` | Calls API. The line is explicit; Chert does not pick a fallback line. |
| `CHERT_FACETIME_WEBHOOK_SECRET` | FaceTime integration webhook. |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `AGENT_NAME` | Room, named dispatch, and the call-scoped bridge token. `AGENT_NAME` must match the worker, default `calljarvis`. |
| `CHERT_MESSAGING_TOKEN` | Bearer for `POST https://console.trychert.com/api/v1/send`. |
| `CHERT_TENANT_SLUG`, `CHERT_PHONE_LINE_ID` | Optional messaging tenant and sender line. |
| `CHERT_WEBHOOK_SECRET` | Messaging subscription secret, not the API bearer. |
| `CHERT_FACETIME_MODE`, `CHERT_IMESSAGE_MODE` | Set either to `simulate` to force a labeled simulation even when credentials exist. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Service-role reads and writes. Without both, the process uses memory and nothing is shared across instances. |
| `VOICE_ACTIONS_URL`, `VOICE_ACTIONS_TOKEN` | Claude Code's voice action route. Inbound text other than a plain acknowledgment is forwarded with the attempt id. |

`GET /api/internal/outreach` is the capability result the scheduler can show. `facetime.live` and `imessage.live` are true only after a fresh probe. The FaceTime probe checks the selected line for audio support, outbound audio protocol, audio readiness, and an available worker. The iMessage probe checks `GET /api/v1/phone-numbers`.

## Delivery rules

1. Reload the attempt. A settled attempt, or one whose send lease is still open, is returned as-is.
2. If the outcome is already unknown, or a provider id exists, reconcile. FaceTime retries `POST /v1/calls` only with the stored idempotency key when no call id was saved. iMessage is polled by message id and is never sent again when the id is missing.
3. If the reminder was acknowledged, canceled, completed, snoozed, or the user opted out, mark this attempt `failed` with `errorCode: "suppressed"` and do not contact them.
4. Claim `pending` → `sending`, store the idempotency key, then contact the provider.
5. When the channel is not live, store `status: "simulated"` and a stable `sim-...` provider id. Do not call Chert.
6. For FaceTime, create the room, dispatch `AGENT_NAME`, and wait until that agent has one unmuted audio track. The bridge token can join only that room, publish, and subscribe, and it lives for one hour. The create body is audio-only (`video: false`). Room metadata carries `userId`, `attemptId`, and `reminderId` for the voice worker. The agent stays silent until a callback sets `chert_bridge_ready`.
7. If the agent audio is not ready, no call is placed and the attempt returns to `pending` so a later scheduler pass can try the same key.
8. Callbacks update the same attempt. A later or repeated event cannot move `completed`, `simulated`, `unanswered`, or `failed` backward. Terminal calls delete the LiveKit room. Raw transcripts and message text are not written onto the attempt.

An iMessage reply of `YES`, `OK`, `ACK`, or `GOT IT` acknowledges only the newest open reminder for the verified sender. Any other handle, a shared handle, or a group chat does nothing. Other text is posted to the voice action route as `{ action: "inboundMessage", args: { text }, call: { attemptId } }`. The sender's user id is taken from the attempt, not from the message.

## Acceptance checks

From the repository root, with Node 22.23 or later:

```sh
for file in src/lib/server/chert/*.mjs; do node --check "$file" || exit 1; done
node --test src/lib/server/chert/chert.test.mjs
```

The checks cover one simulated attempt, a single live create under two concurrent requests, same-key FaceTime reconciliation, no second iMessage send after an unknown result, suppression after acknowledgment, webhook signatures, one greeting, out-of-order call events, and a reply that updates only the matching user's reminder.

## Dependencies still owned elsewhere

- The Supabase adapter reads `destination`, `verified_at` and `opted_in_channels`, and authorizes sends through `begin_notification_delivery`. Use a normalized destination (E.164 or lowercase email).
- Run the hosted integration in simulation mode until durable webhook deduplication is wired. The webhook store expects `provider_events`, which is absent from the deployed schema. For a hosted FaceTime attempt with an unknown outcome and no provider ID, leave the attempt for reconciliation without starting another call.
- Codex should keep calling `POST /api/internal/outreach` with the claimed attempt id and treat HTTP 200 plus `outcome: "unknown"` as in flight, not as a reason to claim a second attempt.
- Claude Code's worker must greet only when room metadata gains `chert_bridge_ready`, and its voice route should accept `inboundMessage` for iMessage text.
