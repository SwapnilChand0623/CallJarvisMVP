// Shared by the local scripts: reads env files without printing values.
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/** Values from an env file, or {} when it does not exist. Placeholder values count as unset. */
export function readEnvFile(path) {
  let parsed = {};
  try { parsed = parseEnv(readFileSync(path, "utf8")); } catch { return {}; }
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value && !/YOUR_|^\.\.\.$/.test(value)));
}

/** Root server settings: .env.local, overridden by the real environment. */
export function serverEnv(root = new URL("..", import.meta.url).pathname) {
  return { ...readEnvFile(`${root}.env.local`), ...process.env };
}

export function supabase(env) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return async function rest(path, { method = "GET", body, prefer } = {}) {
    const response = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${method} ${path.split("?")[0]} failed with HTTP ${response.status}${payload?.code ? ` (${payload.code})` : ""}`);
    return payload;
  };
}
