#!/usr/bin/env node
// Prepares one signed-up account to receive CallJarvis calls, and prints its id for VOICE_DEMO_USER_ID.
//
//   node scripts/live-user.mjs --phone +15551234567 --timezone America/Chicago [--user <uuid>]
//
// Sign up at /auth first. With one account in the project, --user is optional. --phone must be your own phone:
// this records it as verified and opts the account in to FaceTime outreach, and critical reminders will call it.
import { parseArgs } from "node:util";
import { serverEnv, supabase } from "./env.mjs";

const { values } = parseArgs({ options: { phone: { type: "string" }, timezone: { type: "string" }, user: { type: "string" } } });
const env = serverEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
if (!/^\+[1-9]\d{7,14}$/.test(values.phone ?? "")) throw new Error("Pass --phone in international format, for example +15551234567.");
const zone = values.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
new Intl.DateTimeFormat("en-US", { timeZone: zone }); // throws on an unknown zone

const rest = supabase(env);
const profiles = await rest("profiles?select=user_id&order=created_at.asc&limit=20");
const userId = values.user ?? (profiles.length === 1 ? profiles[0].user_id : null);
if (!userId) throw new Error(profiles.length === 0 ? "No account exists yet. Sign up at /auth, then run this again." : `There are ${profiles.length} accounts. Pass --user <uuid>.`);
if (!profiles.some((profile) => profile.user_id === userId)) throw new Error("No account has that id.");

const filter = `user_id=eq.${encodeURIComponent(userId)}`;
await rest(`profiles?${filter}`, { method: "PATCH", prefer: "return=minimal",
  body: { timezone: zone, destination: values.phone, verified_at: new Date().toISOString(), outreach_enabled: true, opted_in_channels: ["facetime"] } });
// Critical reminders call straight away. Other priorities start with an iMessage, which this account has not opted in to.
await rest(`communication_rules?${filter}`, { method: "PATCH", prefer: "return=minimal", body: { critical_channel: "facetime", grace_seconds: 0 } });

console.log(`Account ${userId} is set up: time zone ${zone}, FaceTime outreach on, critical reminders call ${values.phone.slice(0, 4)}…${values.phone.slice(-2)}.`);
console.log(`\nAdd this line to .env.local, then restart the server:\nVOICE_DEMO_USER_ID=${userId}`);
