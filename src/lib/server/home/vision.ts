// Asks Gemini which demo props are visible in one camera frame. The frame is sent for this one question and is
// not stored by this server.
import { PROPS, type PropKey } from "../../home/props";

const MAX_IMAGE_BYTES = 400_000;
const MIN_INTERVAL_MS = 1000;
const lastLook = new Map<string, number>();

export type Look = { ok: true; seen: PropKey[] } | { ok: false; status: number; code: string };

const question = () => [
  "You are checking one frame from a home camera for specific objects.",
  ...PROPS.map((prop) => `- ${prop.key}: ${prop.look}`),
  'Answer on one line that starts with "RESULT:" and then lists the keys of the objects that are clearly visible, separated by commas.',
  'If none is clearly visible, answer "RESULT: NONE". Do not guess from a partial or blurry view.',
].join("\n");

/** Every string inside a value, wherever the API nested it. */
function collectText(value: unknown, found: string[] = []): string[] {
  if (typeof value === "string") found.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectText(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectText(item, found));
  return found;
}

/**
 * The props named on the model's RESULT line. Only the last such line counts, and only the model's final output
 * is searched, so a response that echoes the question (which names every key) cannot produce a false sighting.
 */
export function parseSeen(body: unknown): PropKey[] {
  const fields = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const steps = Array.isArray(fields.steps) ? fields.steps.at(-1) : undefined;
  const output = fields.outputs ?? steps ?? fields.output_text ?? "";
  const lines = [...collectText(output).join("\n").matchAll(/result:\s*([^\n]*)/gi)];
  const answer = (lines.at(-1)?.[1] ?? "").toLowerCase();
  return PROPS.filter((prop) => answer.includes(prop.key)).map((prop) => prop.key);
}

/**
 * @param image a JPEG as base64, with or without a data-URL prefix
 */
export async function lookForProps(userId: string, image: unknown, env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch, now: () => number = Date.now): Promise<Look> {
  if (!env.GEMINI_API_KEY) return { ok: false, status: 503, code: "vision_not_configured" };
  if (typeof image !== "string") return { ok: false, status: 400, code: "image_required" };
  const data = image.replace(/^data:image\/jpeg;base64,/, "");
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return { ok: false, status: 400, code: "image_required" };
  if (data.length * 0.75 > MAX_IMAGE_BYTES) return { ok: false, status: 413, code: "image_too_large" };
  if (now() - (lastLook.get(userId) ?? 0) < MIN_INTERVAL_MS) return { ok: false, status: 429, code: "too_many_requests" };
  const started = now();
  lastLook.set(userId, started);

  let response: Response;
  try {
    response = await fetcher("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        // The lite model with minimal thinking: this is a yes-or-no look at one frame, and it has to be quick.
        model: env.GEMINI_VISION_MODEL || "gemini-flash-lite-latest",
        input: [{ type: "text", text: question() }, { type: "image", data, mime_type: "image/jpeg" }],
        generation_config: { thinking_level: "minimal", temperature: 0, max_output_tokens: 60 },
        store: false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const timedOut = (error as { name?: string } | null)?.name === "TimeoutError";
    console.error(`[home] Gemini vision ${timedOut ? "gave no answer in 20 s" : "could not be reached"}`);
    return { ok: false, status: 502, code: timedOut ? "vision_slow" : "vision_unreachable" };
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: { status?: unknown; message?: unknown } } | null;
    console.error(`[home] Gemini vision answered HTTP ${response.status} ${String(detail?.error?.status ?? "")}: ${String(detail?.error?.message ?? "").slice(0, 200)}`);
    return { ok: false, status: 502, code: response.status === 429 || response.status === 503 ? "vision_busy" : "vision_failed" };
  }
  const body = await response.json().catch(() => null);
  const seen = parseSeen(body);
  console.log(`[home] vision look took ${now() - started} ms; saw ${seen.length ? seen.join(", ") : "nothing on the prop map"}`);
  return { ok: true, seen };
}
