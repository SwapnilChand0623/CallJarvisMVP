import { createSpeechHandler, speechConfig } from "@/lib/server/speech/speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return createSpeechHandler(speechConfig())(request);
}
