/**
 * Interpret one FaceTime line record from GET /api/v1/lines.
 * `live` is media readiness only. Credentials are applied by resolveCapabilities.
 */
export function summarizeLine(item) {
  const readiness = item?.session_health?.readiness ?? {};
  const caps = item?.session_health?.capabilities ?? {};
  // Current workers defer system audio capture until a call starts. The
  // production-media verdict can pass while the legacy audio flag is false.
  const checks = readiness.automatic?.checks;
  const deferredCapture = Array.isArray(checks) && checks.some((check) =>
    check.id === "system_audio_capture" && check.outcome === "at_call_start");
  const audioReady = readiness.audio_ready === true || (
    readiness.production_media_ready === true && deferredCapture &&
    checks.every((check) => check.outcome === "passed" ||
      (check.id === "system_audio_capture" && check.outcome === "at_call_start"))
  );
  const outbound = Number(caps.outbound_audio_protocol) >= 1;
  const supportsAudio = item?.supports_audio === true;
  const available = item?.operational_status === "available" && item?.worker_occupied !== true && item?.status !== "offline";
  let reason = "ready";
  if (!item) reason = "line_missing";
  else if (!supportsAudio) reason = "audio_unsupported";
  else if (!outbound) reason = "outbound_audio_disabled";
  else if (!audioReady) reason = "audio_not_ready";
  else if (!available) reason = "line_unavailable";
  return {
    lineId: item?.id ?? null,
    sharedLine: item?.shared_line === true,
    supportsAudio,
    supportsVideo: item?.supports_video === true,
    audioReady,
    videoReady: readiness.video_ready === true,
    outboundAudioProtocol: caps.outbound_audio_protocol ?? null,
    integrationAssigned: Boolean(item?.integration_id),
    inboundPolicy: item?.inbound_policy ?? null,
    sessionRequired: item?.session_required === true,
    live: reason === "ready",
    reason,
  };
}

/** Interpret GET /api/v1/phone-numbers for the messaging tenant. */
export function summarizeMessaging(status, body) {
  if (status === 200) {
    const items = body?.data?.items ?? body?.phone_numbers ?? (Array.isArray(body?.data) ? body.data : []);
    const count = Array.isArray(items) ? items.length : 0;
    return { live: count > 0, reason: count > 0 ? "ready" : "no_sender_line", senderLines: count };
  }
  if (body?.error?.code === 2001 || status === 404) {
    return { live: false, reason: "messaging_tenant_inactive", senderLines: 0 };
  }
  return { live: false, reason: `messaging_http_${status}`, senderLines: 0 };
}

function hasLiveKit(env) {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET && env.CHERT_LINE_ID && env.CHERT_PROJECT_ID && env.CHERT_FACETIME_API_KEY);
}

function hasMessaging(env) {
  return Boolean(env.CHERT_MESSAGING_TOKEN);
}

/**
 * Channel capability result for the scheduler.
 * auto: live only when a fresh probe says the provider can place that contact.
 * simulate: always labeled simulation.
 */
export async function resolveCapabilities(env = process.env, fetchImpl = fetch) {
  const checkedAt = new Date().toISOString();
  const forceFace = env.CHERT_FACETIME_MODE === "simulate";
  const forceMessage = env.CHERT_IMESSAGE_MODE === "simulate";
  let face = { live: false, reason: "credential_missing", lineId: env.CHERT_LINE_ID || null, integrationAssigned: false, audioReady: false };
  let message = { live: false, reason: hasMessaging(env) ? "unprobed" : "credential_missing" };

  if (!forceFace && env.CHERT_FACETIME_API_KEY && env.CHERT_PROJECT_ID) {
    try {
      const response = await fetchImpl("https://facetime.trychert.com/api/v1/lines", {
        headers: {
          Authorization: `Bearer ${env.CHERT_FACETIME_API_KEY}`,
          "X-Chert-Project-Id": env.CHERT_PROJECT_ID,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(4000),
      });
      const body = await response.json().catch(() => ({}));
      const items = body?.data?.items ?? [];
      const wanted = env.CHERT_LINE_ID;
      const line = items.find((item) => item.id === wanted) ?? (wanted ? null : items[0]);
      face = line ? summarizeLine(line) : { ...summarizeLine(null), reason: response.ok ? "line_missing" : `facetime_http_${response.status}` };
      if (face.live && !hasLiveKit(env)) face = { ...face, live: false, reason: "credential_missing" };
    } catch {
      face = { ...face, live: false, reason: "probe_failed" };
    }
  } else if (forceFace) {
    face = { ...face, live: false, reason: "forced_simulation" };
  }

  if (!forceMessage && hasMessaging(env)) {
    try {
      const headers = { Authorization: `Bearer ${env.CHERT_MESSAGING_TOKEN}`, Accept: "application/json" };
      if (env.CHERT_TENANT_SLUG) headers["x-chert-tenant"] = env.CHERT_TENANT_SLUG;
      const response = await fetchImpl("https://console.trychert.com/api/v1/phone-numbers", {
        headers,
        signal: AbortSignal.timeout(4000),
      });
      const body = await response.json().catch(() => ({}));
      message = summarizeMessaging(response.status, body);
    } catch {
      message = { live: false, reason: "probe_failed" };
    }
  } else if (forceMessage) {
    message = { live: false, reason: "forced_simulation" };
  }

  return {
    checkedAt,
    simulatedLabel: "simulated",
    facetime: { live: face.live === true && !forceFace, reason: face.reason, lineId: face.lineId ?? null, audioReady: face.audioReady === true, integrationAssigned: face.integrationAssigned === true },
    imessage: { live: message.live === true && !forceMessage, reason: message.reason },
  };
}

export function channelLive(capabilities, channel) {
  return capabilities?.[channel]?.live === true;
}
