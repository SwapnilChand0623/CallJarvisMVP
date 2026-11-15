import { createHmac, timingSafeEqual } from "node:crypto";
import { roomNameFor } from "./status.mjs";

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

export function signJwt(payload, secret) {
  const encoded = `${b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${b64url(JSON.stringify(payload))}`;
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function sameHex(leftHex, rightHex) {
  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

/** FaceTime integration webhook: `X-Chert-Signature: sha256=<hex>` over the raw body. */
export function verifyFaceTimeSignature(rawBody, header, secret) {
  const match = /^sha256=([a-f0-9]+)$/i.exec(header || "");
  if (!match || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sameHex(match[1], expected);
}

/** Messaging webhook. HMAC is `timestamp + "." + rawBody` with the subscription secret. */
export function verifyMessagingSignature(rawBody, header, secret, now = Date.now()) {
  const legacy = /^v1,(\d+),([a-f0-9]+)$/i.exec(header || "");
  const modern = /^t=(\d+),v1=([a-f0-9]+)$/i.exec(header || "");
  const match = legacy || modern;
  if (!match || !secret) return false;
  const ts = Number(match[1]);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${match[1]}.${rawBody}`).digest("hex");
  return sameHex(match[2], expected);
}

export function bridgeToken({ apiKey, apiSecret, identity, room, ttlSeconds = 3600 }) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.min(Math.max(ttlSeconds, 120), 7200);
  return signJwt({
    iss: apiKey,
    sub: identity,
    nbf: now,
    exp: now + ttl,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true },
  }, apiSecret);
}

/** Lets the simulator's camera publish video into one call's room. It cannot hear or see the call. */
export function cameraToken({ apiKey, apiSecret, identity, room, ttlSeconds = 900 }) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: apiKey,
    sub: identity,
    nbf: now,
    exp: now + ttlSeconds,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: false, canPublishData: false, canPublishSources: ["camera"] },
  }, apiSecret);
}

function adminToken(env, room) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: env.LIVEKIT_API_KEY,
    sub: "calljarvis-outreach",
    nbf: now,
    exp: now + 600,
    video: { roomCreate: true, roomAdmin: true, roomList: true, ...(room ? { room } : {}) },
  }, env.LIVEKIT_API_SECRET);
}

function liveKitHttp(url) {
  return url.replace(/^wss:/, "https:").replace(/\/$/, "");
}

async function twirp(env, fetchImpl, service, method, body) {
  const response = await fetchImpl(`${liveKitHttp(env.LIVEKIT_URL)}/twirp/livekit.${service}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminToken(env, body.room)}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error("livekit_failed");
    error.code = "livekit_failed";
    error.status = response.status;
    throw error;
  }
  return payload;
}

function trackIsOpenAudio(track) {
  const type = String(track?.type ?? track?.kind ?? "").toUpperCase();
  const mime = String(track?.mime_type ?? track?.mimeType ?? "");
  const audio = type === "AUDIO" || type === "1" || mime.startsWith("audio/");
  return audio && track?.muted !== true;
}

export function participantHasAudio(participant) {
  const tracks = participant?.tracks ?? [];
  return Array.isArray(tracks) && tracks.some(trackIsOpenAudio);
}

/** Video is for critical home alerts only, and can be switched off with ALERT_VIDEO=0. */
export function wantsVideo(attempt, env = process.env) {
  return attempt?.video === true && env.ALERT_VIDEO !== "0";
}

export function createLiveKit(env = process.env, fetchImpl = fetch) {
  const agentName = env.AGENT_NAME || "calljarvis";
  return {
    agentName,
    async prepare(attempt) {
      const room = roomNameFor(attempt);
      const metadata = JSON.stringify({
        outbound: true,
        userId: attempt.userId,
        attemptId: attempt.id,
        sourceKind: attempt.sourceKind,
        sourceId: attempt.sourceId,
        revision: attempt.revision,
        reminderId: attempt.sourceKind === "reminder" ? attempt.sourceId : null,
        channel: "facetime",
        // A critical home alert is a video call that shows the live home camera.
        video: wantsVideo(attempt, env),
        greeting: "bridge_ready",
      });
      await twirp(env, fetchImpl, "RoomService", "CreateRoom", { name: room, empty_timeout: 600, metadata });
      await twirp(env, fetchImpl, "AgentDispatchService", "CreateDispatch", {
        agent_name: agentName,
        room,
        metadata,
      });
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const listed = await twirp(env, fetchImpl, "RoomService", "ListParticipants", { room });
        const people = listed.participants ?? [];
        const agent = people.find((person) => !/^(chert-bridge-|home-camera-)/.test(String(person.identity)) && participantHasAudio(person));
        // Chert subscribes to this exact participant. A dispatched worker joins under a job identity, not its agent name.
        if (agent) return { roomName: room, agentIdentity: agent.identity };
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      const error = new Error("audio_not_ready");
      error.code = "audio_not_ready";
      throw error;
    },
    /** Creates a room and dispatches the voice worker into it. The metadata reaches the worker as its job metadata. */
    async openRoom(room, details) {
      const metadata = JSON.stringify(details);
      await twirp(env, fetchImpl, "RoomService", "CreateRoom", { name: room, empty_timeout: 120, metadata });
      await twirp(env, fetchImpl, "AgentDispatchService", "CreateDispatch", { agent_name: agentName, room, metadata });
    },
    /** A bridge token for one room, minted per call. */
    tokenFor(identity, room) {
      return bridgeToken({ apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET, identity, room, ttlSeconds: 3600 });
    },
    async activateGreeting(room, callId) {
      const metadata = JSON.stringify({
        chert_call: callId,
        chert_bridge_ready: true,
        at: new Date().toISOString(),
      });
      await twirp(env, fetchImpl, "RoomService", "UpdateRoomMetadata", { room, metadata });
    },
    async deleteRoom(room) {
      await twirp(env, fetchImpl, "RoomService", "DeleteRoom", { room });
    },
    bridgeToken(attempt, room) {
      return bridgeToken({
        apiKey: env.LIVEKIT_API_KEY,
        apiSecret: env.LIVEKIT_API_SECRET,
        identity: `chert-bridge-${String(attempt.id).slice(0, 48)}`,
        room,
        ttlSeconds: 3600,
      });
    },
  };
}

export function createFaceTime(env = process.env, fetchImpl = fetch, tokens) {
  const origin = "https://facetime.trychert.com/api";
  const headers = (extra = {}) => ({
    Authorization: `Bearer ${env.CHERT_FACETIME_API_KEY}`,
    "X-Chert-Project-Id": env.CHERT_PROJECT_ID,
    Accept: "application/json",
    ...extra,
  });

  async function request(path, options = {}) {
    const response = await fetchImpl(`${origin}${path}`, { ...options, headers: headers(options.headers), signal: AbortSignal.timeout(5000) });
    const body = await response.json().catch(() => ({}));
    return { response, body };
  }

  return {
    async find(attempt) {
      const key = encodeURIComponent(attempt.idempotencyKey);
      const { response, body } = await request(`/v1/calls?idempotency_key=${key}`);
      if (response.status === 404) return { provenAbsent: false, call: null };
      if (!response.ok) return { provenAbsent: false, call: null };
      const items = body?.data?.items ?? body?.data ?? [];
      const list = Array.isArray(items) ? items : [];
      const call = list.find((item) => item.idempotency_key === attempt.idempotencyKey || item.room === attempt.roomName) ?? list[0];
      if (!call) return { provenAbsent: true, call: null };
      return { provenAbsent: false, call: { providerId: call.id, status: "accepted" } };
    },
    async create(attempt, { agentIdentity, video = wantsVideo(attempt, env) } = {}) {
      const room = roomNameFor(attempt);
      const token = tokens.bridgeToken(attempt, room);
      const destinationType = String(attempt.destination).includes("@") ? "email" : "phone";
      const { response, body } = await request("/v1/calls", {
        method: "POST",
        // The audio retry of a refused video call is a different request, so it carries its own key.
        headers: { "Content-Type": "application/json", "Idempotency-Key": video === wantsVideo(attempt, env) ? attempt.idempotencyKey : `${attempt.idempotencyKey}:audio` },
        body: JSON.stringify({
          direction: "outbound",
          mode: "customer_managed",
          line_id: env.CHERT_LINE_ID,
          destination: attempt.destination,
          destination_type: destinationType,
          media: { audio: true, video },
          livekit_url: env.LIVEKIT_URL,
          participant_token: token,
          remote_participant_identity: agentIdentity || tokens.agentName,
        }),
      });
      const providerId = body?.data?.id ?? null;
      if (response.status === 201 && providerId) return { kind: "accepted", providerId };
      if (response.status === 201) return { kind: "unknown", providerId: null, errorCode: "missing_call_id" };
      if (response.status === 202) return { kind: "unknown", providerId };
      if (response.status === 409) return { kind: "unknown", providerId, errorCode: "idempotency_conflict" };
      if (providerId && response.ok) return { kind: "unknown", providerId };
      return { kind: "failed", providerId, errorCode: body?.error?.code || `facetime_http_${response.status}` };
    },
    /** Recorded lifecycle events for a call, oldest first when the API orders them. Empty on any error. */
    async events(providerId) {
      const { response, body } = await request(`/v1/calls/${encodeURIComponent(providerId)}/events`);
      if (!response.ok) return [];
      const items = body?.data?.items ?? body?.data?.events ?? body?.data ?? body?.events ?? [];
      return Array.isArray(items) ? items : [];
    },
    async read(providerId) {
      const { response, body } = await request(`/v1/calls/${encodeURIComponent(providerId)}`);
      if (response.status === 404) return { provenAbsent: true, call: null };
      if (!response.ok) return { provenAbsent: false, call: null };
      const call = body?.data ?? null;
      if (!call?.id) return { provenAbsent: false, call: null };
      return { provenAbsent: false, call };
    },
  };
}

export function createIMessage(env = process.env, fetchImpl = fetch) {
  const headers = { Authorization: `Bearer ${env.CHERT_MESSAGING_TOKEN}`, "Content-Type": "application/json", Accept: "application/json" };
  if (env.CHERT_TENANT_SLUG) headers["x-chert-tenant"] = env.CHERT_TENANT_SLUG;
  return {
    async send(attempt, bodyText) {
      const response = await fetchImpl("https://console.trychert.com/api/v1/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          phone: attempt.destination,
          body: bodyText,
          idempotency_key: attempt.idempotencyKey,
          external_id: attempt.id,
          ...(env.CHERT_PHONE_LINE_ID ? { phone_line_id: env.CHERT_PHONE_LINE_ID } : {}),
        }),
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.json().catch(() => ({}));
      const providerId = body.message_id ?? null;
      if (response.status === 202 || body.status === "queued") return { kind: "unknown", providerId };
      if (body.status === "sent" || body.status === "duplicate") return { kind: "accepted", providerId };
      if (body.status === "delivered") return { kind: "completed", providerId };
      if (body.status === "failed") return { kind: "failed", providerId, errorCode: String(body.code ?? "send_failed") };
      if (!response.ok) return { kind: "failed", providerId, errorCode: `imessage_http_${response.status}` };
      return { kind: "unknown", providerId };
    },
    async read(messageId) {
      const response = await fetchImpl(`https://console.trychert.com/api/v1/messages/${encodeURIComponent(messageId)}`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 404) return { provenAbsent: true, status: null, providerId: messageId };
      if (!response.ok) return { provenAbsent: false, status: null, providerId: messageId };
      return {
        provenAbsent: false,
        status: body.status ?? body.data?.status ?? null,
        providerId: body.message_id ?? body.data?.id ?? messageId,
      };
    },
  };
}

export function createDomain(env = process.env, fetchImpl = fetch) {
  return {
    configured: Boolean(env.VOICE_ACTIONS_URL && env.VOICE_ACTIONS_TOKEN),
    async handle(payload) {
      if (!env.VOICE_ACTIONS_URL || !env.VOICE_ACTIONS_TOKEN) return { configured: false };
      const response = await fetchImpl(env.VOICE_ACTIONS_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.VOICE_ACTIONS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(4000),
      });
      if (response.status === 404) return { configured: false };
      if (!response.ok) {
        const error = new Error("domain_action_failed");
        error.code = "domain_action_failed";
        throw error;
      }
      return { configured: true, result: await response.json().catch(() => ({})) };
    },
  };
}
