import { decide, type Candidate, type Channel, type Stage } from "./policy.ts";

export type Claim = {
  kind: Candidate["kind"];
  id: string;
  revision: string;
  channel: Channel;
  stage: Stage;
};

export type Dependencies = {
  token: string;
  candidates: () => Promise<Candidate[]>;
  claim: (input: Claim) => Promise<{ attemptId: string } | null>;
  outreach: (attemptId: string) => Promise<void>;
  now?: () => Date;
};

async function matches(actual: string, expected: string) {
  const digest = (value: string) =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function createHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (!deps.token || !await matches(request.headers.get("authorization") ?? "", `Bearer ${deps.token}`)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    let candidates: Candidate[];
    try {
      candidates = await deps.candidates();
    } catch {
      return Response.json({ error: "candidate_lookup_failed" }, { status: 502 });
    }

    const now = deps.now?.() ?? new Date();
    const stats = { scanned: candidates.length, claimed: 0, handedOff: 0, errors: 0 };
    const jobs = candidates.flatMap((item) => decide(item, now).map((stage) => ({
      kind: item.kind, id: item.id, revision: item.revision, ...stage,
    })));
    // The DB and transport enforce exclusivity across workers; this pool bounds latency per tick.
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        try {
          const claim = await deps.claim(job);
          if (!claim) continue;
          stats.claimed++;
          await deps.outreach(claim.attemptId);
          stats.handedOff++;
        } catch {
          // Never replay here: delivery may already have happened. Next tick uses the same attempt.
          stats.errors++;
        }
      }
    }));
    return Response.json(stats, { status: stats.errors ? 502 : 200 });
  };
}
