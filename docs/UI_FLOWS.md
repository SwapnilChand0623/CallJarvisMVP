# Frontend experience map

## Overview

Open dashboard → load saved local state (or seed data) → inspect pending, completed, and overdue counts → complete a reminder, open JarvisRemind, or start a simulated call.

A clock refreshes overdue status every 30 seconds. Completion removes the item from pending counts; reopening is available in the completed list. Home-event simulation appends to the activity feed and respects the home-alert preference.

## JarvisRemind

Enter task → choose local date/time and priority → validate → save → show confirmation → inspect Upcoming, Completed, or All. New reminders inherit the preferred communications channel. Past dates are permitted to demonstrate overdue tasks.

## Simulated conversation

Start demo call → explain simulation → enter a typed reminder request → parse the supported relative time → review task, timestamp, priority, and channel → confirm → append reminder and activity → return to dashboard.

Invalid or ambiguous language keeps the user on the request step with a supported example. Edit request returns from review without saving. Closing or cancelling never creates a reminder. No microphone permission is requested.

## Settings

Edit display name and preferred channel → toggle escalation preference/home simulations → save → show confirmation. Escalation is a stored preference awaiting backend integration. Reset requires a second explicit action and restores sample data in the current browser.

## Backend handoff

Keep simulation labels until integrations are actually available. Replace the provider with authenticated queries and subscriptions against the agreed backend schema. Handle pending, failed, and retry states for writes before enabling real communications. API keys and user ownership enforcement belong on the server. No Supabase schema, credentials, or webhook contract is present in main yet, so the frontend currently runs in demo mode.
