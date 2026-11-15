// The Logs page's data for the signed-in dashboard user.
//   GET /api/logs -> { calls: [{ direction, startedAt, why, outcome, timeline }] }, newest first
import { voiceConfig } from "@/app/api/internal/voice/_lib/config";
import { signedInUser } from "@/lib/server/auth";
import { buildCallLog } from "@/lib/server/logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, code: string) => Response.json({ error: code }, { status });

export async function GET(request: Request) {
  const userId = await signedInUser(request);
  if (!userId) return fail(401, "sign_in_required");
  const store = voiceConfig().deps?.store;
  if (!store) return fail(503, "store_unavailable");
  try {
    const [attempts, events] = await Promise.all([store.listCallAttempts(userId, 40), store.listCallEvents(userId, 400)]);
    return Response.json({ calls: buildCallLog(attempts, events).slice(0, 40) });
  } catch (error) {
    console.error("[logs] load failed", error instanceof Error ? error.message : error);
    return fail(502, "logs_unavailable");
  }
}
