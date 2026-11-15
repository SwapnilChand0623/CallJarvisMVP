// Lets the simulator's camera join a live call: Jarvis's FaceTime Video call about a critical home alert while it is
// ringing or in progress, or a call on which the user asked Jarvis to show the camera. Then the signed-in owner gets a short-lived token that can publish camera video into
// that call's room and nothing else: it cannot hear the call, see it, or join any other room.
import { cameraToken } from "../chert/providers.mjs";
import { roomNameFor } from "../chert/status.mjs";
import type { Store } from "../../../app/api/internal/voice/_lib/types";

export type CameraSession = { live: false } | { live: true; url: string; token: string; room: string };
type Env = Record<string, string | undefined>;

export async function cameraSession(store: Store, userId: string, env: Env = process.env): Promise<CameraSession> {
  if (env.ALERT_VIDEO === "0" || !env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) return { live: false };
  // An alert call always shows the camera. On any other call it is shown only after the user asks Jarvis for it.
  const attemptId = await store.findLiveAlertCall(userId);
  const room = attemptId ? roomNameFor({ id: attemptId }) : await store.findCameraRoom(userId);
  if (!room || !/^[\w-]{1,100}$/.test(room)) return { live: false };
  return {
    live: true,
    url: env.LIVEKIT_URL,
    room,
    token: cameraToken({ apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET, identity: `home-camera-${userId.slice(0, 8)}`, room }),
  };
}
