import { createServices, imessageWebhookHandler } from "../../../../../lib/server/chert/http.mjs";
import { voiceConfig } from "../../../internal/voice/_lib/config";
import { resolveActor } from "../../../internal/voice/_lib/handler";
import { handleMessage } from "../../../internal/voice/_lib/message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const services = createServices();
  return imessageWebhookHandler(services, async ({ userId, attemptId, text }: { userId: string; attemptId?: string; text: string }) => {
    const config = voiceConfig();
    if (!config.deps) throw new Error("Message storage is unavailable");
    const actor = await resolveActor(config.deps.store, { attemptId }, {
      ...config,
      demoUserId: userId,
    }, "imessage");
    if (!actor || actor.userId !== userId) throw new Error("Message sender could not be resolved");
    return (await handleMessage(config.deps, actor, text)).reply;
  })(request);
}
