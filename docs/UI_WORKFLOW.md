# Account and reminder UI

The primary flow is `/auth` → `/onboarding/phone` → `/`. Returning users with a saved phone go straight home. An existing server-provisioned `profiles.destination` also satisfies phone setup. The navigation contains Home, Reminders, and Account. Home reads the signed-in account’s Supabase reminders; demo fixtures are not uploaded or shown as account records.

## Configuration

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for sign-in. Allow the deployed `/auth` URL in Supabase Auth’s redirect allow list so email confirmation returns to the application. With confirmation enabled, signup displays a check-your-inbox screen and phone setup starts after sign-in.

Set `NEXT_PUBLIC_CHERT_PHONE_NUMBER` to the real public Chert number, with country code, before building. Home displays the configured number with a FaceTime Audio link and copy action. Missing or invalid configuration displays “Number coming soon” without a dial action. This public display setting does not provision a line or assert provider readiness.

## Phone handoff

Phone setup accepts international numbers, strips formatting, and saves `contact_phone` using Supabase Auth’s `updateUser({ data })`. It is a contact request, not verification. Changing a number does not update `profiles.destination`, `verified_at`, outreach permissions, or the caller’s identity. The account and homepage label an unverified request accordingly.

The backend workstream must verify ownership and consent before promoting a requested number into the server-owned profile and registering Chert access. Do not trust editable Auth metadata as evidence of verification. This UI change does not remove the existing single-account inbound voice limitation.

## Validation

- ESLint, TypeScript, production webpack build, and 14 unit tests.
- Local browser fixture: signup routing, phone validation/save, homepage empty/populated states, reminder creation/snooze, account details, sign-out, returning-user sign-in, email confirmation, and the configured/unconfigured call card.
- Local fixture requests do not create hosted accounts, modify the hosted database, or send calls/messages. Hosted email delivery, phone verification, and real Chert calls remain integration checks.

## Visual theme

`src/app/theme.css` defines the navy/cyan palette across account onboarding and reminders. The supplied CallJarvis logo is preserved in `public/brand/calljarvis-logo.png`; CSS clips its surrounding whitespace when displayed. `JarvisCore` provides decorative, screen-reader-hidden rings with CSS transforms, without an animation dependency. Page reveals last 360–420 ms, controls transition in 160 ms, and the two ambient ring layers turn slowly. Reduced-motion preferences disable animations and transitions. Compact screens omit the large sign-in illustration and use a small, subdued ring on the call card.
