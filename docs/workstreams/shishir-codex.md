# Shishir's Codex — Dashboard data, simulation, and demo QA

Read the [README](../../README.md) for the MVP scope and shared contracts. Branch from
the latest `origin/main` as `codex/dashboard-data-home`. Coordinate changes outside your
owned paths with their owner. Push your implementation branch to GitHub and open a PR
with the acceptance checks you ran, dependencies, and any provider limits.

**Own** `src/lib/supabase/`, `src/features/`, auth routes under
`src/app/auth/`, `src/app/api/demo/`, `tests/e2e/`, `src/lib/server/home/`,
`src/app/api/internal/home/`, and `docs/demo-runbook.md`. Coordinate page-level wiring with Shishir's Cursor.

- Implement sign-in, session handling, typed reminder CRUD, profile updates,
  and ownership-scoped dashboard reads. Subscribe to reminder, home event,
  device, and delivery changes or refetch reliably after mutations.
- Implement authenticated controls to inject the demo home event and inspect or
  toggle the simulated light. Wire the pages to live Supabase data and include
  a reproducible fixture setup.
- Run browser smoke tests and write a three-minute demo script. Rehearse
  creating a reminder over FaceTime, showing it in the dashboard, triggering
  outreach, and acknowledging it. Show the urgent home-event flow and the
  simulated light state.
- Own the Home Assistant integration boundary in `src/lib/server/home/` and
  `src/app/api/internal/home/`. Implement a working on/off light action through the
  configured adapter and ingest one authorized camera or motion event. Use a labeled
  simulator when hardware is unavailable. Record device command outcomes for the event
  history and provide the same service to the voice worker.
- Wire reminder history, home status, communication settings, and JarvisTalks
  preferences to persistent data. Add opt-in and delete flows for saved context and
  optional check-ins. Keep device credentials and privileged mutations server-side.
- Verify reminder creation, acknowledgment, snooze, and rescheduling over a call or
  supported message flow. Rehearse the home alert, light control, and a follow-up
  conversation that retrieves authorized task context. Include quiet-hours, call-cap,
  duplicate-event, and cross-user checks.
- **Done when** updates made in a call appear in the same user's dashboard, a
  second user cannot see them, and the demo can be reproduced from a clean seed.
