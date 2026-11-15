// Lets the simulator's camera join a live alert call. While Jarvis's FaceTime Video call about a critical home
// alert is ringing or in progress, the signed-in owner gets a short-lived token that can publish camera video into
// that call's room and nothing else: it cannot hear the call, see it, or join any other room.
import { cameraToken } from "../chert/providers.mjs";
import { roomNameFor } from "../chert/status.mjs";
import type { Store } from "../../../app/api/internal/voice/_lib/types";

export type CameraSession = { live: false } | { live: true; url: string; token: string; room: string };
type Env = Record<string, string | undefined>;

export async function cameraSession(store: Store, userId: string, env: Env = process.env): Promise<CameraSession> {
  if (env.ALERT_VIDEO === "0" || !env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return { live: false };
  const attemptId = await store.findLiveAlertCall(userId);
  if (!attemptId) return { live: false };
  const room = roomNameFor({ id: attemptId });
  return {
    live: true,
    url: env.LIVEKIT_URL,
    room,
    token: cameraToken({ apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET, identity: `home-camera-${attemptId.slice(0, 8)}`, room }),
  };
}
