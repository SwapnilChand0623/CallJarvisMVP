import { createHandler, type Claim } from "./handler.ts";
import type { Candidate } from "./policy.ts";

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}

const supabase = new URL(required("SUPABASE_URL"));
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const outreachUrl = new URL("/api/internal/outreach", required("OUTREACH_ORIGIN"));
if (outreachUrl.protocol !== "https:" && !["localhost", "127.0.0.1", "host.docker.internal"].includes(outreachUrl.hostname)) {
  throw new Error("OUTREACH_ORIGIN must use HTTPS outside local development");
}
const outreachToken = required("OUTREACH_TOKEN");

async function rpc<T>(name: string, body: object): Promise<T> {
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, supabase), {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("RPC failed");
  return await response.json() as T;
}

Deno.serve(createHandler({
  token: required("ESCALATE_TOKEN"),
  candidates: () => rpc<Candidate[]>("list_escalation_candidates", { p_limit: 20 }),
  claim: (job: Claim) => rpc<{ attemptId: string } | null>("claim_escalation_attempt", { p_job: job }),
  outreach: async (attemptId) => {
    const response = await fetch(outreachUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${outreachToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId }),
      signal: AbortSignal.timeout(6500),
      redirect: "error",
    });
    if (!response.ok) throw new Error("Outreach handoff failed");
    const result = await response.json();
    if (result?.attemptId !== attemptId) throw new Error("Unexpected outreach response");
  },
}));
