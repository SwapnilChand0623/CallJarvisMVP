# Swapnil's Claude Code — FaceTime agent and voice actions

Read the [README](../../README.md) for the MVP scope and shared contracts. Branch from
the latest `origin/main` as `codex/voice-agent`. Coordinate changes outside your owned
paths with their owner. Push your implementation branch to GitHub and open a PR with the
acceptance checks you ran, dependencies, and any provider limits.

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
- Expose a shared set of authorized domain actions for voice and iMessage. Support
  listing, editing, completing, snoozing, rescheduling, reprioritizing and acknowledging
  reminders. Resolve relative times using the user’s time zone. Hand the tool contract
  to Swapnil’s Cursor.
- Implement JarvisHome status and recent-event reads, and call Shishir’s Codex’s device
  service for authorized light actions. Use the verified outcome in the spoken reply.
- Implement JarvisTalks as part of the shared assistant. Offer casual conversation,
  encouragement and practical task planning. Retrieve permitted task context in a fresh
  call, disclose that Jarvis is AI, and keep support non-clinical. Save optional context
  or schedule a check-in only after explicit consent.
- Confirm a second call can retrieve the reminder created in the first, and verify
  acknowledgment, snooze, and completion as separate outcomes.
- **Done when** a call can create a reminder that appears in the dashboard, change
  a simulated light's state, and acknowledge the reminder the agent called about.
