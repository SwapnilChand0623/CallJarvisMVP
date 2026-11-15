// The same FaceTime webhook, reached with the key as the last path segment instead of a query parameter.
import { createServices, facetimeWebhookHandler } from "../../../../../../lib/server/chert/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return facetimeWebhookHandler(createServices())(request);
}
