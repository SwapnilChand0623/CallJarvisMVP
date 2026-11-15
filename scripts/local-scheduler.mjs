#!/usr/bin/env node
// Runs the escalation scheduler on this machine, in place of the Edge Function and Cron job.
// Every tick it asks the database which reminders are due, claims each eligible attempt, and hands it to
// POST /api/internal/outreach on the local server. The claim RPCs make this safe to run beside the hosted Cron.
//
//   npm run dev            (terminal 1)
//   npm run scheduler      (terminal 2)
import { createHandler } from "../supabase/functions/escalate/handler.ts";
import { serverEnv, supabase } from "./env.mjs";

const env = serverEnv();
for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OUTREACH_TOKEN"]) {
  if (!env[name]) { console.error(`Missing ${name} in .env.local`); process.exit(1); }
}
const origin = env.OUTREACH_ORIGIN || "http://localhost:3000";
const seconds = Math.max(5, Number(env.SCHEDULER_INTERVAL_SECONDS) || 20);
const rest = supabase(env);
const rpc = (name, body) => rest(`rpc/${name}`, { method: "POST", body });
const stamp = () => new Date().toLocaleTimeString();

const tick = createHandler({
  token: "local",
  candidates: () => rpc("list_escalation_candidates", { p_limit: 20 }),
  claim: (job) => rpc("claim_escalation_attempt", { p_job: job }),
  outreach: async (attemptId) => {
    const response = await fetch(new URL("/api/internal/outreach", origin), {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OUTREACH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => ({}));
    console.log(`${stamp()}  attempt ${attemptId}: ${result.outcome ?? `HTTP ${response.status}`}${result.simulated ? " (simulated)" : ""}${result.errorCode ? ` [${result.errorCode}]` : ""}${result.error ? ` [${result.error}]` : ""}`);
    if (!response.ok || result.attemptId !== attemptId) throw new Error("outreach handoff failed");
  },
});

let last = "";
async function run() {
  try {
    const response = await tick(new Request("http://scheduler.local/", { method: "POST", headers: { authorization: "Bearer local" } }));
    const stats = await response.json();
    const line = stats.error ? `error: ${stats.error}` : `due ${stats.scanned}, claimed ${stats.claimed}, handed off ${stats.handedOff}, errors ${stats.errors}`;
    if (line !== last || stats.claimed || stats.errors) console.log(`${stamp()}  ${line}`);
    last = line;
  } catch (error) {
    console.error(`${stamp()}  tick failed: ${error.message}`);
  }
}

console.log(`Scheduler running every ${seconds} s against ${origin}. Stop with Ctrl+C.`);
await run();
setInterval(run, seconds * 1000);
