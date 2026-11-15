import { createServices, imessageWebhookHandler } from "../../../../../lib/server/chert/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return imessageWebhookHandler(createServices())(request);
}
