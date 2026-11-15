import { createOutreachHandler, createServices } from "../../../../lib/server/chert/http.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function handle(request: Request) {
  return createOutreachHandler(createServices())(request);
}

export function GET(request: Request) {
  return handle(request);
}

export function POST(request: Request) {
  return handle(request);
}
