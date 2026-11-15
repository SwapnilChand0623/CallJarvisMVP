// Deployment health check. Reports which groups of settings are present, never their values.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const set = (...names: string[]) => names.every((name) => Boolean(process.env[name]));

export function GET() {
  return Response.json({
    ok: true,
    configured: {
      database: set("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"),
      dashboard: set("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
      voiceActions: set("VOICE_TOOL_TOKEN", "VOICE_DEMO_USER_ID"),
      inboundCalls: set("CHERT_WEBHOOK_KEY") || set("CHERT_FACETIME_WEBHOOK_SECRET"),
      outreach: set("OUTREACH_TOKEN", "CHERT_FACETIME_API_KEY", "CHERT_PROJECT_ID", "CHERT_LINE_ID", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"),
    },
  });
}
