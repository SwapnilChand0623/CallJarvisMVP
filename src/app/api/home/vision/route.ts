// POST /api/home/vision { image } -> { seen: [prop keys] }. The simulator's camera sends one frame at a time.
import { signedInUser } from "@/lib/server/auth";
import { lookForProps } from "@/lib/server/home/vision";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = await signedInUser(request);
  if (!userId) return Response.json({ error: "sign_in_required" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
  const look = await lookForProps(userId, body?.image);
  return look.ok ? Response.json({ seen: look.seen }) : Response.json({ error: look.code }, { status: look.status });
}
