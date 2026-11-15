# Swapnil's Cursor — Chert outbound, iMessage, and callbacks

Read the [README](../../README.md) for the MVP scope and shared contracts. Branch from
the latest `origin/main` as `codex/chert`. Coordinate changes outside your owned paths
with their owner. Push your implementation branch to GitHub and open a PR with the
acceptance checks you ran, dependencies, and any provider limits.

**Own** `src/app/api/internal/outreach/`, `src/app/api/webhooks/chert/`,
`src/lib/server/chert/`, and `docs/chert-setup.md`.

- Verify line permissions, recipient restrictions, messaging capabilities, and
  available trial minutes early. Record which channels can run live in the demo.
- Implement outbound FaceTime Audio with a call-scoped LiveKit token, named
  dispatch, a ready audio publication, and the Chert Calls API. Enable the
  agent's greeting on the bridge-ready signal. Coordinate room cleanup and the
  trusted user/reminder metadata with Claude Code.
- Add iMessage sending and inbound reply handling where the project's Chert
  capabilities support them. A recognized acknowledgment should update only the
  matching user's reminder. Verify webhook authenticity and handle repeated or
  out-of-order provider events without regressing status.
- Implement a simulated delivery adapter for local development and unavailable
  channels. Feed provider IDs and status updates back to the attempt record.
- For incoming messages, resolve the verified sender and pass natural-language requests
  to the shared domain actions owned by Claude Code. For callbacks, record call and
  message metadata, unknown outcomes, and provider identifiers without persisting raw
  conversation content by default.
- Provide the scheduler with a channel capability result and stable outcome contract.
  Keep disabled or unprovisioned outbound FaceTime available as a clearly labeled
  simulation while preserving real inbound voice and available messaging.
- **Done when** an authorized request produces one attempt and dashboard-visible
  status updates, and an eligible verified recipient receives at least one live
  proactive contact. If provisioning blocks both channels, report that gap and
  demo the simulated path with a visible label.
