#!/usr/bin/env node
// Checks that this machine is ready for live CallJarvis calls. Prints what is set and what answers,
// never the values of keys. Run from the repository root:  npm run doctor
import { readEnvFile, serverEnv, supabase } from "./env.mjs";

const root = new URL("..", import.meta.url).pathname;
const env = serverEnv(root);
const agent = readEnvFile(`${root}agent/.env.local`);
const origin = env.OUTREACH_ORIGIN || "http://localhost:3000";
let failures = 0;
const ok = (label, detail = "") => console.log(`  ok    ${label}${detail ? `: ${detail}` : ""}`);
const bad = (label, fix) => { failures += 1; console.log(`  FIX   ${label}: ${fix}`); };
const note = (label, detail) => console.log(`  note  ${label}: ${detail}`);
const need = (source, file, names) => {
  const missing = names.filter((name) => !source[name]);
  if (missing.length) bad(file, `set ${missing.join(", ")}`); else ok(file, `${names.length} values set`);
  return missing.length === 0;
};

console.log("\nReceive calls (inbound, with reminder tools)");
const serverReady = need(env, ".env.local", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VOICE_TOOL_TOKEN", "VOICE_DEMO_USER_ID"]);
need(agent, "agent/.env.local", ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "VOICE_API_URL", "VOICE_TOOL_TOKEN"]);
if (!agent.GEMINI_API_KEY && !agent.GOOGLE_API_KEY) bad("agent/.env.local", "set GEMINI_API_KEY");
if (env.VOICE_TOOL_TOKEN && agent.VOICE_TOOL_TOKEN && env.VOICE_TOOL_TOKEN !== agent.VOICE_TOOL_TOKEN) bad("VOICE_TOOL_TOKEN", "the value in agent/.env.local differs from .env.local");
if (env.VOICE_STORE === "memory") bad("VOICE_STORE", "remove VOICE_STORE=memory from .env.local so calls use the real database");

let profile = null;
if (serverReady) {
  try {
    const rest = supabase(env);
    const user = encodeURIComponent(env.VOICE_DEMO_USER_ID);
    [profile] = await rest(`profiles?user_id=eq.${user}&select=timezone,destination,verified_at,outreach_enabled,opted_in_channels&limit=1`);
    if (!profile) bad("database", "VOICE_DEMO_USER_ID matches no account. Sign up at /auth, then run: npm run live:user -- --phone +1…");
    else {
      const open = await rest(`reminders?user_id=eq.${user}&status=in.(pending,snoozed)&select=id&limit=100`);
      ok("database", `account found, time zone ${profile.timezone}, ${open.length} open reminders`);
      if (profile.timezone === "UTC") note("time zone", "the account is on UTC; run npm run live:user to set yours");
    }
  } catch (error) { bad("database", error.message); }

  try {
    const response = await fetch(`${origin}/api/internal/voice`, {
      method: "POST", headers: { Authorization: `Bearer ${env.VOICE_TOOL_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "session.start", call: { callId: "doctor" } }), signal: AbortSignal.timeout(8000),
    });
    const body = await response.json().catch(() => null);
    if (body?.ok) ok("server voice route", `${body.result.tools.length} tools, local time ${body.result.now.spoken}`);
    else bad("server voice route", `${origin} answered HTTP ${response.status}${body?.error?.code ? ` (${body.error.code})` : ""}`);
  } catch { bad("server voice route", `nothing is answering at ${origin}. Start it with: npm run dev`); }
}
if (agent.VOICE_API_URL && agent.VOICE_API_URL.replace(/\/+$/, "") !== origin) note("agent VOICE_API_URL", `${agent.VOICE_API_URL} (this check used ${origin})`);

console.log("\nGet called when a reminder is due (outbound)");
const outboundReady = need(env, ".env.local", ["OUTREACH_TOKEN", "CHERT_FACETIME_API_KEY", "CHERT_PROJECT_ID", "CHERT_LINE_ID", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]);
if (env.LIVEKIT_URL && agent.LIVEKIT_URL && env.LIVEKIT_URL !== agent.LIVEKIT_URL) bad("LIVEKIT_URL", "the server and the agent point at different LiveKit projects");
if ((env.AGENT_NAME || "calljarvis") !== (agent.AGENT_NAME || "calljarvis")) bad("AGENT_NAME", "the server and the agent use different agent names");
if (env.CHERT_FACETIME_MODE === "simulate") note("CHERT_FACETIME_MODE", "simulate is set, so no real call will be placed");
if (profile) {
  if (!profile.destination || !profile.verified_at) bad("phone number", "run: npm run live:user -- --phone +1…");
  else if (!profile.outreach_enabled || !profile.opted_in_channels?.includes("facetime")) bad("outreach consent", "run: npm run live:user -- --phone +1…");
  else ok("account", "verified phone, FaceTime outreach on");
}
if (outboundReady) {
  try {
    const response = await fetch(`${origin}/api/internal/outreach`, { headers: { Authorization: `Bearer ${env.OUTREACH_TOKEN}` }, signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null);
    const facetime = body?.capabilities?.facetime;
    if (facetime?.live) ok("Chert line", "ready to place FaceTime Audio calls");
    else if (facetime) bad("Chert line", `not ready to call out: ${facetime.reason}`);
    else bad("outreach route", `${origin} answered HTTP ${response.status}`);
  } catch { bad("outreach route", `nothing is answering at ${origin}. Start it with: npm run dev`); }
}

console.log(failures ? `\n${failures} thing${failures === 1 ? "" : "s"} to fix.\n` : "\nReady. Call your Chert number, or create a critical reminder and run: npm run scheduler\n");
process.exit(failures ? 1 : 0);
