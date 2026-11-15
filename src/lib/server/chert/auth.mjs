import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time bearer check. An empty expected token never authorizes. */
export function authorized(header, token) {
  if (!token) return false;
  const actual = createHash("sha256").update(header ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  return timingSafeEqual(actual, expected);
}

export function json(body, status = 200) {
  return Response.json(body, { status });
}
