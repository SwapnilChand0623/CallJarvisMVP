import { createVoiceHandler } from "./_lib/handler";
import { voiceConfig } from "./_lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return createVoiceHandler(voiceConfig())(request);
}
