// Identifies the signed-in dashboard user for server routes, from the Supabase access token the browser sends.

/** The user's id, or null when the token is missing, malformed or rejected by Supabase. */
export async function signedInUser(request: Request, env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!url || !key || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  try {
    const response = await fetcher(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const user = (await response.json().catch(() => null)) as { id?: unknown } | null;
    return typeof user?.id === "string" ? user.id : null;
  } catch {
    return null;
  }
}
