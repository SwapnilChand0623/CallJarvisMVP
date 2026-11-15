# Reproducible frontend demo and integration gates

## Clean local seed

Run `npm ci && npm run dev`, open the app, go to Settings, choose Reset demo data, and confirm. This recreates fixtures relative to the current clock, with one overdue high-priority reminder. All outreach channels and consent settings start disabled. These are fixture records, not authenticated production records.

## Three-minute walkthrough

1. **0:00–0:30:** Open Overview. Explain the overdue reminder, completed count, and independent acknowledgment.
2. **0:30–1:15:** Open Try a demo call. Type `Remind me to call the pharmacy in 30 minutes`, review, and confirm. Go to JarvisRemind and see it. Use the simulated conversation again with `acknowledge call the pharmacy`; it stays pending. Complete it through Manage or the checkbox.
3. **1:15–1:50:** Manage an active reminder: edit priority to critical, snooze 15 minutes, reschedule, and inspect history. All four lifecycle states and four priorities are visible.
4. **1:50–2:20:** Open JarvisHome. Confirm turning the simulated light on. Inject a high-severity motion observation. Labels are observations; no hardware or certified alarm is being monitored.
5. **2:20–2:45:** In Settings, opt into local outreach and enable iMessage. Set quiet hours appropriately for the demo. Preview the due reminder or home event policy. See a requested simulated attempt in Overview, not a delivered/answered call. Repeating the same eligible event/channel/revision creates no additional simulated attempt.
6. **2:45–3:00:** In JarvisTalks, show that context and check-ins are off by default. Opt in, explicitly approve context, then delete it. Explain the remaining live integration milestone.

## Browser smoke checklist

Desktop and phone: navigate all five sections; create a reminder; review/confirm a typed request; acknowledge without completing; snooze/reschedule; inspect history; confirm light change; inject labeled event; opt into/save/delete context; schedule/cancel check-in; save preferences; refresh and verify persistence. Check empty states after history deletion and disabled controls before consent.

## Live integration gate (pending backend deployment)

1. Apply the database owner's migrations and two-user seed. Configure public Supabase variables and use `/auth` to sign in as user A.
2. Create a connected reminder. Verify user A's task appears after a successful write and after refresh. Modify it over the real voice agent once the backend tool is wired; verify Realtime or polling updates the workspace.
3. Sign out, then sign in as user B. User A's records must disappear. Attempt cross-user reads, updates, and deletes directly against RLS; all must fail. Client ownership checks alone do not prove RLS.
4. Rehearse the backend scheduler, quiet hours, call caps, duplicate-event/retry suppression, verified contact routing, provider answer/completion outcomes, and one authorized home command. This local preview is not a substitute for server policy tests.
5. Verify memory consent/deletion and check-in cancellation against their server data once contracts land. Do not copy demo browser context automatically.
6. Record which paths actually ran live. At present, frontend simulations and unit checks ran locally; Supabase, real call/message delivery, and hardware have not been verified in this checkout.

## Local verification recorded

- Lint, TypeScript, production webpack build, and 13 unit tests pass.
- Browser: created a critical reminder, refreshed and confirmed persistence, acknowledged without completion, and confirmed a typed snooze request.
- Browser: confirmed simulated light on/off action and injected a labeled motion event.
- Browser: consent gates started disabled; approving context enabled explicit saving; deletion required confirmation and removed the record.
- Browser: saved outreach/iMessage preferences and verified the unconfigured Supabase state.
- Phone width: 390 × 844; inspected all five sections, reminder dialog, and no horizontal overflow in Overview, Reminders, Home, and Settings. Talks consent/context controls remained usable. Desktop/default viewport restored afterward.
- Live database/RLS, voice calls, messaging, and hardware were not available and were not validated.
