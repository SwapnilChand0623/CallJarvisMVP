import { LocalVideoTrack, TrackSource, VideoBufferType, VideoFrame, VideoSource } from '@livekit/rtc-node';

const WIDTH = 640;
const HEIGHT = 360;
const FPS = 15;

function drawFrame(tick) {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  const ring = 100 + Math.sin(tick / 10) * 4;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const dx = x - WIDTH / 2;
      const dy = y - HEIGHT / 2;
      const radius = Math.hypot(dx, dy);
      const eye = Math.abs(Math.abs(dx) - 28) < 8 && Math.abs(dy + 16) < 12;
      const mouth = Math.abs(dx) < 20 && Math.abs(dy - 30) < 3;
      const accent = Math.abs(radius - ring) < 3 || eye || mouth;
      const offset = (y * WIDTH + x) * 4;
      pixels[offset] = accent ? 79 : 12;
      pixels[offset + 1] = accent ? 229 : radius < ring ? 37 : 20;
      pixels[offset + 2] = accent ? 208 : radius < ring ? 53 : 34;
      pixels[offset + 3] = 255;
    }
  }
  return new VideoFrame(pixels, WIDTH, HEIGHT, VideoBufferType.RGBA);
}

export async function publishDemoCamera(ctx) {
  const source = new VideoSource(WIDTH, HEIGHT);
  const track = LocalVideoTrack.createVideoTrack('jarvis-camera', source);
  let timer;
  ctx.addShutdownCallback(async () => {
    clearInterval(timer);
    try { await track.close(); } finally { await source.close(); }
  });
  let tick = 0;
  const capture = () => source.captureFrame(drawFrame(tick++));
  capture();
  const publication = await ctx.room.localParticipant.publishTrack(track, { source: TrackSource.SOURCE_CAMERA });
  console.log(`[jarvis] avatar camera published: ${publication.sid}`);
  timer = setInterval(capture, 1000 / FPS);
}
