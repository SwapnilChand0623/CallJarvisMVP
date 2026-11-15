// The home simulator's API for the signed-in dashboard user.
//   GET  /api/home                       -> mode, devices, recent events and the prop map
//   POST /api/home { action: "setMode", mode } | { action: "trigger", prop } | { action: "setDevice", deviceId, on } | { action: "reset" }
import { voiceConfig } from "@/app/api/internal/voice/_lib/config";
import { signedInUser } from "@/lib/server/auth";
import { createHome } from "@/lib/server/home/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (status: number, code: string) => Response.json({ error: code }, { status });

async function open(request: Request) {
  const userId = await signedInUser(request);
  if (!userId) return { error: fail(401, "sign_in_required") };
  const store = voiceConfig().deps?.store;
  if (!store) return { error: fail(503, "store_unavailable") };
  return { userId, home: createHome(store) };
}

export async function GET(request: Request) {
  const session = await open(request);
  if ("error" in session) return session.error;
  try {
    return Response.json(await session.home.state(session.userId));
  } catch (error) {
    console.error("[home] state failed", error instanceof Error ? error.message : error);
    return fail(502, "home_unavailable");
  }
}

export async function POST(request: Request) {
  const session = await open(request);
  if ("error" in session) return session.error;
  const { userId, home } = session;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  try {
    switch (body?.action) {
      case "setMode":
        if (body.mode !== "home" && body.mode !== "away") return fail(400, "invalid_mode");
        await home.setMode(userId, body.mode);
        break;
      case "trigger": {
        const result = await home.trigger(userId, body.prop);
        if (!result.recorded && result.reason === "unknown_prop") return fail(400, "unknown_prop");
        return Response.json({ result, state: await home.state(userId) });
      }
      case "setDevice":
        if (!(await home.setDevice(userId, body.deviceId, body.on))) return fail(404, "device_not_found");
        break;
      case "reset":
        await home.reset(userId);
        break;
      default:
        return fail(400, "unknown_action");
    }
    return Response.json({ state: await home.state(userId) });
  } catch (error) {
    console.error("[home] action failed", error instanceof Error ? error.message : error);
    return fail(502, "home_unavailable");
  }
}
