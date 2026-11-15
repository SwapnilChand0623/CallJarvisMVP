// Reads a short line of text aloud with ElevenLabs. The API key stays on the server; the browser receives audio.
// Only a signed-in user may ask, the text is capped, and requests are rate limited, since each one is billed.

export type SpeechConfig = {
  apiKey: string;
  voiceId: string;
  model: string;
  supabaseUrl: string;
  supabaseKey: string;
  fetch?: typeof fetch;
  now?: () => number;
};

const MAX_CHARACTERS = 300;
const PER_MINUTE = 10;
const recent = new Map<string, number[]>();

const fail = (status: number, code: string) => Response.json({ error: code }, { status });

/** The signed-in user's id for a Supabase access token, or null. */
async function userFor(token: string, config: SpeechConfig, fetcher: typeof fetch) {
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  const response = await fetcher(`${config.supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
    headers: { apikey: config.supabaseKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return null;
  const user = (await response.json().catch(() => null)) as { id?: unknown } | null;
  return typeof user?.id === "string" ? user.id : null;
}

export function speechConfig(env: Record<string, string | undefined> = process.env): SpeechConfig | null {
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!env.ELEVENLABS_API_KEY || !env.ELEVENLABS_VOICE_ID || !supabaseUrl || !supabaseKey) return null;
  return { apiKey: env.ELEVENLABS_API_KEY, voiceId: env.ELEVENLABS_VOICE_ID, model: env.ELEVENLABS_MODEL || "eleven_flash_v2_5", supabaseUrl, supabaseKey };
}

export function createSpeechHandler(config: SpeechConfig | null) {
  return async (request: Request): Promise<Response> => {
    if (!config) return fail(503, "speech_not_configured");
    const fetcher = config.fetch ?? fetch;
    const now = config.now?.() ?? Date.now();

    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
    let userId: string | null;
    try { userId = await userFor(token, config, fetcher); } catch { return fail(503, "sign_in_check_failed"); }
    if (!userId) return fail(401, "sign_in_required");

    let text = "";
    try {
      const body = (await request.json()) as { text?: unknown };
      if (typeof body?.text === "string") text = body.text.replace(/\s+/g, " ").trim();
    } catch { /* handled below */ }
    if (!text) return fail(400, "text_required");
    if (text.length > MAX_CHARACTERS) return fail(413, "text_too_long");

    const times = (recent.get(userId) ?? []).filter((at) => now - at < 60_000);
    if (times.length >= PER_MINUTE) return fail(429, "too_many_requests");
    recent.set(userId, [...times, now]);

    let upstream: Response;
    try {
      upstream = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": config.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: config.model }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      return fail(502, "speech_unreachable");
    }
    if (!upstream.ok || !upstream.body) {
      console.error(`[speech] ElevenLabs answered HTTP ${upstream.status}`);
      return fail(502, upstream.status === 401 ? "speech_key_rejected" : "speech_failed");
    }
    return new Response(upstream.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  };
}
