# Shishir's Cursor — Dashboard and UI

Read the [README](../../README.md) for the MVP scope and shared contracts. Branch from
the latest `origin/main` as `codex/dashboard-ui`. Coordinate changes outside your owned
paths with their owner. Push your implementation branch to GitHub and open a PR with the
acceptance checks you ran, dependencies, and any provider limits.

**Own** the root Next.js scaffold, route layouts and pages, shared UI
components, and styling in `src/app/` and `src/components/`. Other owners edit their assigned API and auth routes.

- Ship **Overview** for upcoming reminders, recent home events, and outreach
  history. Ship **JarvisRemind** for creating, editing, acknowledging, and
  completing reminders. Ship **Settings** for time zone, contact preferences,
  outreach opt-in, and simulation controls.
- Start from agreed fixtures and component props while the database is being
  built. Cover loading, empty, error, and success states and make simulated
  actions visible.
- Build **JarvisHome** for device status, an authenticated light control, and camera or
  motion event history with source labels. Treat detection labels as observations.
- Build **JarvisTalks** for conversation preferences and, when enabled, consent-based
  check-ins and review or deletion of approved saved context. Add quiet hours,
  escalation delays, max call frequency, integration enable/disable, and history
  deletion to Settings. Include snooze, reschedule, priority, and reminder history in
  JarvisRemind.
- **Done when** all five sections work at desktop and phone sizes, the core
  flows are usable with fixtures, and Shishir's Codex can wire the server data
  through the agreed props and actions.
