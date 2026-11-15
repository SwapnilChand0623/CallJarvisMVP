import { createServices, facetimeWebhookHandler } from "../../../../../lib/server/chert/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return facetimeWebhookHandler(createServices())(request);
}
