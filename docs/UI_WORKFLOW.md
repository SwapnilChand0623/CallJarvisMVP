# Account and reminder workflow

The primary flow is `/auth` → `/onboarding/phone` → `/`. Phone setup now verifies the existing signed-in account’s phone, asks for calling consent, and writes the same database records the scheduler reads. Returning users with a verified profile phone go straight home. Home and Account derive calling status from `profiles` and `communication_rules`, never editable sign-in metadata.

## Deploy the connected flow

1. Apply `supabase/migrations/20261115120000_verified_phone_onboarding.sql` with the normal database migration deployment. This must precede deploying the UI. The migration adds `complete_phone_onboarding`; it requires no application service-role key.
2. In the hosted Supabase Auth settings, enable the Phone provider, require phone confirmation, and configure an SMS provider. Email/password signup remains the UI entry point. SMS credentials stay in Supabase. The repository’s local `auth.sms` configuration requires confirmation; configure a local SMS provider or use Supabase’s local test-phone support for development. Do not disable confirmations to bypass setup.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Allow the deployed `/auth` URL in Auth’s redirect allow list for email confirmation.
4. Set `NEXT_PUBLIC_CHERT_PHONE_NUMBER` to the public Chert line before building. A missing/invalid number shows “Number coming soon” without a dial action. This setting does not provision or activate a provider line.
5. Ensure the existing scheduler, outreach server, voice worker, and Chert line are configured. Chert plan restrictions and allowed/verified destinations still apply; Supabase SMS ownership verification does not register a destination with Chert. No provider provisioning or inbound multi-account routing is changed by this PR.

Supabase’s phone-change flow is documented at https://supabase.com/docs/guides/auth/phone-login#updating-a-phone-number.

## Verification and scheduler handoff

- `auth.updateUser({ phone })` sends a phone-change code on the signed-in account. `verifyOtp` uses `phone_change`, not a separate phone signup. Existing confirmed Auth phones can finish setup without requesting a redundant code.
- After verification and explicit consent, the authenticated `complete_phone_onboarding` RPC checks `auth.uid()` and the actual `auth.users.phone` / `phone_confirmed_at` under a row lock. Neither a client-selected user ID nor metadata can provide verification.
- One transaction sets `profiles.destination`, `verified_at`, the browser time zone, `outreach_enabled=true`, and FaceTime opt-in. It sets `communication_rules.critical_channel='facetime'`, preserving the call cap, quiet hours, escalation delays, and existing channel choices. These are the exact records used by candidate selection and send authorization.
- The UI refetches those records before navigating home. If the database save fails after a valid code, “Finish setup” retries the save without requesting another code. Provider/code errors remain on the verification screen.
- Account’s “Pause reminder calls” action updates `profiles.outreach_enabled`, immediately suppressing new scheduler delivery. Re-enabling requires calling consent again; an already confirmed Auth phone does not need another code.
- Critical reminders follow the existing FaceTime policy. Other priorities retain their existing messaging/escalation behavior; signup does not make every reminder a phone call.
- Old `contact_phone` metadata is used only as an input prefill for migration. It never completes onboarding or enables outreach. Server-provisioned verified profile phones remain supported.

## Validation

- ESLint, TypeScript, production webpack build, and 29 unit tests.
- `supabase/tests/phone-onboarding.sql`: transactional tests against a test database. Covers anonymous access, forged metadata, unconfirmed or mismatched phones, consent, time zone validation, another account’s isolation, repeat completion, rollback when rule saving fails, and actual scheduler candidate → claim → send authorization resolving to the newly verified destination. No provider is contacted.
- The migration and SQL checks were run locally in PostgreSQL via PGlite with an Auth-compatible fixture, including all repository migrations. They have not been applied to the hosted project by this UI task.
- Browser checks use simulated Auth/SMS and the real migration/RPC in the local database. Hosted SMS delivery and live Chert calls require deployment and configured providers.

## Visual theme

`src/app/theme.css` defines Sir Jarvis’s parchment, ocean ink, and antique brass palette. The original Trojan horse vector in `src/components/trojan-horse.tsx` is the shared logo; `src/app/icon.svg` is its browser icon. Classic system serif fonts keep headings and the wordmark crisp without an external font download. Forms keep readable sans-serif text.

`OdysseyScene` draws an original, decorative vector voyage inspired by the supplied reference: a Greek ship, layered waves, rocky shores, a compass, and a small wooden horse. CSS transforms animate the ship, sail, waves, and horse. Distant lightning uses a slow opacity fade, never a rapid flash. Page reveals take 360–420 ms; controls respond in 160 ms. `prefers-reduced-motion` disables all motion. Mobile keeps a smaller scene while leaving controls readable. The existing Home, Reminders, Simulator, and Account navigation and verified-phone workflow remain available.
