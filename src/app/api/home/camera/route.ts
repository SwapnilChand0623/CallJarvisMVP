// Tells the simulator's camera whether an alert call is live, and if so how to stream into it.
//   POST /api/home/camera -> { live: false } | { live: true, url, token, room }
import { voiceConfig } from "@/app/api/internal/voice/_lib/config";
import { signedInUser } from "@/lib/server/auth";
import { cameraSession } from "@/lib/server/home/camera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, code: string) => Response.json({ error: code }, { status });

export async function POST(request: Request) {
  const userId = await signedInUser(request);
  if (!userId) return fail(401, "sign_in_required");
  const store = voiceConfig().deps?.store;
  if (!store) return fail(503, "store_unavailable");
  try {
    return Response.json(await cameraSession(store, userId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[home] camera session failed", error instanceof Error ? error.message : error);
    return fail(502, "camera_unavailable");
  }
}
