// The live home camera on a FaceTime Video alert call. The simulator page joins the call's room as
// "home-camera-…" and publishes its camera; FaceTime only shows this worker's own video, so the worker relays the
// frames onto its track. The picture is kept small (320x180) so relaying costs little. Until the camera joins, or
// if it drops, the track shows Jarvis's avatar instead.
import { LocalVideoTrack, RoomEvent, TrackKind, TrackSource, VideoBufferType, VideoFrame, VideoSource, VideoStream } from '@livekit/rtc-node';
import { HEIGHT, WIDTH, createAvatarState, renderFrame } from './avatar.mjs';

export const FEED_WIDTH = 320;
export const FEED_HEIGHT = 180;
export const CAMERA_PREFIX = 'home-camera-';
const FEED_FPS = 12;
const AVATAR_FPS = 8;
/** The avatar returns when no camera frame has arrived for this long. */
const STALE_MS = 1500;

/**
 * Fits an RGBA picture into the feed frame: scaled down to fit, centred on black, turned upright.
 * rotation is in quarter turns clockwise (0 to 3), as the camera reports it.
 */
export function fitFrame(source, width, height, rotation = 0, out = new Uint8Array(FEED_WIDTH * FEED_HEIGHT * 4)) {
  const turns = ((rotation % 4) + 4) % 4;
  const uprightW = turns % 2 ? height : width;
  const uprightH = turns % 2 ? width : height;
  const scale = Math.min(FEED_WIDTH / uprightW, FEED_HEIGHT / uprightH);
  const drawW = Math.max(1, Math.round(uprightW * scale));
  const drawH = Math.max(1, Math.round(uprightH * scale));
  const left = (FEED_WIDTH - drawW) >> 1;
  const top = (FEED_HEIGHT - drawH) >> 1;
  for (let i = 0; i < out.length; i += 4) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 255; }
  for (let y = 0; y < drawH; y++) {
    const v = Math.min(uprightH - 1, Math.floor((y + 0.5) / scale));
    for (let x = 0; x < drawW; x++) {
      const u = Math.min(uprightW - 1, Math.floor((x + 0.5) / scale));
      // Where the upright pixel (u, v) sits in the picture as it arrived.
      const sx = turns === 0 ? u : turns === 1 ? v : turns === 2 ? width - 1 - u : width - 1 - v;
      const sy = turns === 0 ? v : turns === 1 ? height - 1 - u : turns === 2 ? height - 1 - v : u;
      const from = (sy * width + sx) * 4;
      const to = ((top + y) * FEED_WIDTH + left + x) * 4;
      out[to] = source[from]; out[to + 1] = source[from + 1]; out[to + 2] = source[from + 2];
    }
  }
  return out;
}

/** The avatar at feed size: every second pixel of its 640x360 frame. */
export function shrinkAvatar(full, out = new Uint8Array(FEED_WIDTH * FEED_HEIGHT * 4)) {
  const stepX = WIDTH / FEED_WIDTH, stepY = HEIGHT / FEED_HEIGHT;
  for (let y = 0; y < FEED_HEIGHT; y++) {
    for (let x = 0; x < FEED_WIDTH; x++) {
      const from = (Math.floor(y * stepY) * WIDTH + Math.floor(x * stepX)) * 4;
      const to = (y * FEED_WIDTH + x) * 4;
      out[to] = full[from]; out[to + 1] = full[from + 1]; out[to + 2] = full[from + 2]; out[to + 3] = 255;
    }
  }
  return out;
}

const isCamera = participant => typeof participant?.identity === 'string' && participant.identity.startsWith(CAMERA_PREFIX);

/**
 * Publishes the worker's video track and relays the home camera onto it when one joins.
 * Returns the avatar's controls (setSpeaking, setCritical), used while no camera is live.
 */
export async function publishFeed(ctx) {
  const source = new VideoSource(FEED_WIDTH, FEED_HEIGHT);
  const track = LocalVideoTrack.createVideoTrack('jarvis-camera', source);
  const state = createAvatarState();
  const full = new Uint8Array(WIDTH * HEIGHT * 4);
  const small = new Uint8Array(FEED_WIDTH * FEED_HEIGHT * 4);
  const started = Date.now();
  let lastCameraFrame = 0;
  let closed = false;
  let live = false;

  const push = pixels => { if (!closed) source.captureFrame(new VideoFrame(pixels, FEED_WIDTH, FEED_HEIGHT, VideoBufferType.RGBA)); };
  const avatarFrame = () => {
    const { voice, alert } = state.step(1 / AVATAR_FPS);
    if (Date.now() - lastCameraFrame < STALE_MS) return;
    if (live) { live = false; console.log('[jarvis] camera feed paused: showing the avatar'); }
    push(shrinkAvatar(renderFrame((Date.now() - started) / 1000, voice, alert, full), small));
  };

  async function relay(remoteTrack, identity) {
    console.log(`[jarvis] camera feed joined: ${identity}`);
    const stream = new VideoStream(remoteTrack);
    const reader = stream.getReader();
    const picture = new Uint8Array(FEED_WIDTH * FEED_HEIGHT * 4);
    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        const now = Date.now();
        if (now - lastCameraFrame < 1000 / FEED_FPS) continue; // more frames than the call needs
        const rgba = value.frame.convert(VideoBufferType.RGBA);
        push(fitFrame(rgba.data, rgba.width, rgba.height, value.rotation, picture));
        lastCameraFrame = now;
        if (!live) { live = true; console.log(`[jarvis] camera feed live: ${rgba.width}x${rgba.height} shown at ${FEED_WIDTH}x${FEED_HEIGHT}`); }
      }
    } catch (error) {
      if (!closed) console.warn('[jarvis] camera feed stopped:', error instanceof Error ? error.message : String(error));
    } finally {
      reader.releaseLock();
    }
  }

  // The worker subscribes to audio only, so the camera's video is asked for by name.
  const want = (publication, participant) => {
    if (isCamera(participant) && publication.kind === TrackKind.KIND_VIDEO) publication.setSubscribed(true);
  };
  const onSubscribed = (remoteTrack, publication, participant) => {
    if (isCamera(participant) && publication.kind === TrackKind.KIND_VIDEO) void relay(remoteTrack, participant.identity);
  };
  ctx.room.on(RoomEvent.TrackPublished, want);
  ctx.room.on(RoomEvent.TrackSubscribed, onSubscribed);
  for (const participant of ctx.room.remoteParticipants.values()) {
    for (const publication of participant.trackPublications.values()) want(publication, participant);
  }

  avatarFrame();
  const publication = await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
  console.log(`[jarvis] alert video published at ${FEED_WIDTH}x${FEED_HEIGHT}: ${publication.sid}`);
  const timer = setInterval(avatarFrame, 1000 / AVATAR_FPS);
  ctx.addShutdownCallback(async () => {
    closed = true;
    clearInterval(timer);
    ctx.room.off(RoomEvent.TrackPublished, want);
    ctx.room.off(RoomEvent.TrackSubscribed, onSubscribed);
    try { await track.close(); } finally { await source.close(); }
  });
  return state;
}
