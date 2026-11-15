import assert from "node:assert/strict";
import test from "node:test";
import { createSpeechHandler, speechConfig } from "./server/speech/speech";
import { reminderLine } from "./speech-line";

const TOKEN = "aaa.bbb.ccc";
let users = 0;
function setup(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  let clock = 1_000_000;
  const userId = `user-${++users}`; // the rate limit is per user and shared across handlers
  const fetcher = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/auth/v1/user")) {
      const ok = (init.headers as Record<string, string>).Authorization === `Bearer ${TOKEN}`;
      return ok ? Response.json({ id: userId }) : Response.json({ msg: "bad" }, { status: 401 });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  }) as typeof fetch;
  const handler = createSpeechHandler({ apiKey: "el-key", voiceId: "voice 1", model: "eleven_flash_v2_5", supabaseUrl: "https://x.supabase.co/",
    supabaseKey: "pub", fetch: fetcher, now: () => clock, ...overrides });
  const post = (body: unknown, token = TOKEN) => handler(new Request("http://x/api/speech", { method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { post, calls, advance: (ms: number) => { clock += ms; } };
}

test("speech: a signed-in user gets audio and the key never reaches the browser", async () => {
  const { post, calls } = setup();
  const response = await post({ text: "  Call   Mom, due Sunday.  " });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal((await response.arrayBuffer()).byteLength, 3);
  const upstream = calls.find((call) => call.url.includes("elevenlabs"))!;
  assert.equal(upstream.url, "https://api.elevenlabs.io/v1/text-to-speech/voice%201?output_format=mp3_44100_128");
  assert.equal((upstream.init.headers as Record<string, string>)["xi-api-key"], "el-key");
  assert.deepEqual(JSON.parse(String(upstream.init.body)), { text: "Call Mom, due Sunday.", model_id: "eleven_flash_v2_5" });
  assert.ok(![...response.headers.values()].some((value) => value.includes("el-key")));
});

test("speech: refuses anonymous, empty, oversized and too-frequent requests without calling ElevenLabs", async () => {
  const { post, calls, advance } = setup();
  assert.equal((await post({ text: "hi" }, "not-a-token")).status, 401);
  assert.equal((await post({ text: "hi" }, "xxx.yyy.zzz")).status, 401);
  assert.equal((await post({ text: "   " })).status, 400);
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post({ text: "x".repeat(301) })).status, 413);
  assert.equal(calls.filter((call) => call.url.includes("elevenlabs")).length, 0);
  for (let i = 0; i < 10; i++) assert.equal((await post({ text: "hi" })).status, 200);
  assert.equal((await post({ text: "hi" })).status, 429);
  advance(61_000);
  assert.equal((await post({ text: "hi" })).status, 200);
  assert.equal((await createSpeechHandler(null)(new Request("http://x", { method: "POST" }))).status, 503);
});

test("speech: an ElevenLabs failure is reported, not played", async () => {
  const fetcher = (async (url: string | URL) => String(url).includes("/auth/") ? Response.json({ id: "user-2" }) : Response.json({ detail: "bad key" }, { status: 401 })) as typeof fetch;
  const { post } = setup({ fetch: fetcher });
  const response = await post({ text: "hi" });
  assert.deepEqual([response.status, await response.json()], [502, { error: "speech_key_rejected" }]);
});

test("speech: configuration and the spoken line", () => {
  assert.equal(speechConfig({}), null);
  assert.equal(speechConfig({ ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v" }), null, "needs Supabase to check sign-in");
  assert.equal(speechConfig({ ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v", SUPABASE_URL: "u", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "p" })?.model, "eleven_flash_v2_5");
  assert.equal(reminderLine(" Stretch ", "2026-11-15T15:00:00Z", "en-US").startsWith("Stretch, due Sunday"), true);
  assert.equal(reminderLine("Stretch", "not a date"), "Stretch.");
});
