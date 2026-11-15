// Publishes Jarvis's avatar as the worker's camera track, for FaceTime Video calls.
import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';
import { HEIGHT, WIDTH, createAvatarState, renderFrame } from './avatar.mjs';

const FPS = 15;

/**
 * Starts the avatar and returns its controls: setSpeaking(boolean) and setCritical(boolean).
 * The track is closed when the job shuts down.
 */
export async function publishAvatar(ctx) {
  const source = new VideoSource(WIDTH, HEIGHT);
  const track = LocalVideoTrack.createVideoTrack('jarvis-camera', source);
  const state = createAvatarState();
  let timer;
  ctx.addShutdownCallback(async () => {
    clearInterval(timer);
    try { await track.close(); } finally { await source.close(); }
  });
  const started = Date.now();
  const capture = () => {
    const { voice, alert } = state.step(1 / FPS);
    source.captureFrame(new VideoFrame(renderFrame((Date.now() - started) / 1000, voice, alert), WIDTH, HEIGHT, VideoBufferType.RGBA));
  };
  capture();
  const publication = await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
  console.log(`[jarvis] avatar camera published: ${publication.sid}`);
  timer = setInterval(capture, 1000 / FPS);
  return state;
}
