// Builds the endpoint's dependencies from server-side environment variables.
import type { VoiceConfig } from "./handler";
import { simulatedHomeService } from "./home";
import { DEMO_USER_ID, memoryStore } from "./store-memory";
import { supabaseStore } from "./store-supabase";
import type { Store } from "./types";

const globals = globalThis as { __calljarvisVoiceFixtures?: Store };

export function voiceConfig(env: Record<string, string | undefined> = process.env): VoiceConfig {
  const fixtures = env.VOICE_STORE === "memory";
  let store: Store | null = null;
  if (fixtures) {
    // Never serve fixtures from a production build, even if the variable is left set.
    if (env.NODE_ENV !== "production") store = globals.__calljarvisVoiceFixtures ??= memoryStore();
  } else if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    store = supabaseStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return {
    token: env.VOICE_TOOL_TOKEN ?? "",
    demoUserId: env.VOICE_DEMO_USER_ID ?? (fixtures ? DEMO_USER_ID : ""),
    defaultTimeZone: env.VOICE_DEFAULT_TIME_ZONE ?? "America/Chicago",
    deps: store ? { store, home: simulatedHomeService(store) } : null,
  };
}
