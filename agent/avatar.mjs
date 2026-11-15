// Sir Jarvis's FaceTime presence: the UI's wooden horse, in ocean ink on parchment.
// Rasterize the small geometric mark once; frames only transform and shade its mask.
export const WIDTH = 640;
export const HEIGHT = 360;
const SIZE = 240;
const CX = WIDTH / 2;
const CY = 164;
const INK = [32, 61, 78];
const RED = [185, 57, 46];
const PAPER = [238, 233, 221];
const BRASS = [178, 147, 80];
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (value) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const body = [
  [18, 49],
  [18, 32],
  [12, 26],
  [20, 24],
  [25, 31],
  [44, 31],
  [44, 17],
  [51, 8],
  [55, 15],
  [64, 19],
  [69, 29],
  [60, 34],
  [53, 29],
  [53, 49],
];

function polygon(x, y) {
  let inside = false;
  for (let i = 0, j = body.length - 1; i < body.length; j = i++) {
    const [ax, ay] = body[i],
      [bx, by] = body[j];
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax)
      inside = !inside;
  }
  return inside;
}
function segment(x, y, ax, ay, bx, by, radius) {
  const t = Math.max(
    0,
    Math.min(
      1,
      ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) /
        ((bx - ax) ** 2 + (by - ay) ** 2),
    ),
  );
  return (
    (x - ax - t * (bx - ax)) ** 2 + (y - ay - t * (by - ay)) ** 2 <= radius ** 2
  );
}
function mark(x, y) {
  const wheel = (cx) => {
    const d = Math.hypot(x - cx, y - 68);
    return d >= 3.5 && d <= 6.5;
  };
  const shape =
    polygon(x, y) ||
    segment(x, y, 25, 49, 22, 62, 2) ||
    segment(x, y, 44, 49, 49, 62, 2) ||
    segment(x, y, 15, 64, 58, 64, 2) ||
    wheel(24) ||
    wheel(49);
  const detail =
    segment(x, y, 27, 37, 42, 37, 0.7) ||
    segment(x, y, 27, 43, 42, 43, 0.7) ||
    segment(x, y, 49, 19, 49, 29, 0.7) ||
    Math.hypot(x - 59, y - 24) <= 1.6;
  return shape && !detail;
}
const mask = new Float32Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // Four subpixels keep the silhouette clean without a graphics dependency.
    for (const dy of [0.25, 0.75])
      for (const dx of [0.25, 0.75]) {
        if (mark((x + dx) / 3, (y + dy) / 3)) mask[y * SIZE + x] += 0.25;
      }
  }
}
const backdrop = new Uint8Array(WIDTH * HEIGHT * 4);
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const offset = (y * WIDTH + x) * 4;
    const distance = Math.hypot(x - CX, y - CY);
    const compass =
      Math.abs(distance - 136) < 0.65 ||
      (Math.abs(distance - 128) < 0.8 &&
        ((Math.atan2(y - CY, x - CX) * 24) / Math.PI) % 1 > 0.88);
    const grain = ((x * 17 + y * 31) % 23) / 23;
    const sea = y > 327 + Math.sin(x / 48) * 3;
    for (let c = 0; c < 3; c++)
      backdrop[offset + c] = sea
        ? INK[c]
        : mix(PAPER[c] - grain * 2, BRASS[c], compass ? 0.38 : 0);
    backdrop[offset + 3] = 255;
  }
}
function sample(x, y) {
  if (x < 0 || y < 0 || x >= SIZE - 1 || y >= SIZE - 1) return 0;
  const ix = Math.floor(x),
    iy = Math.floor(y),
    dx = x - ix,
    dy = y - iy;
  const i = iy * SIZE + ix;
  return mix(
    mix(mask[i], mask[i + 1], dx),
    mix(mask[i + SIZE], mask[i + SIZE + 1], dx),
    dy,
  );
}

/** Opaque RGBA frame. Voice and alert are eased 0..1 levels supplied by the camera. */
export function renderFrame(
  time,
  voice,
  alert,
  pixels = new Uint8Array(WIDTH * HEIGHT * 4),
) {
  voice = clamp(voice);
  alert = clamp(alert);
  time = Number.isFinite(time) ? time : 0;
  pixels.set(backdrop);
  const pulse = (Math.sin(time * 8.2) + Math.sin(time * 12.7 + 1.4)) / 4 + 0.5;
  const scale =
    1 + 0.012 * Math.sin(time * 1.5) + voice * (0.025 + 0.055 * pulse);
  const bob = Math.sin(time * 1.5) * 1.5 - voice * 2 * pulse;
  const color = INK.map((v, c) => mix(v, RED[c], alert));
  for (let y = 22; y < 307; y++) {
    const sy = (y - CY - bob) / scale + SIZE / 2;
    const ripple = voice * 1.6 * Math.sin(y * 0.055 + time * 7);
    const lean = voice * 0.012 * Math.sin(time * 3) * (y - CY);
    const sheen = voice * (0.035 + 0.045 * Math.sin(y * 0.035 - time * 5));
    for (let x = 172; x < 468; x++) {
      const alpha = sample((x - CX - ripple - lean) / scale + SIZE / 2, sy);
      if (alpha === 0) continue;
      const offset = (y * WIDTH + x) * 4;
      for (let c = 0; c < 3; c++)
        pixels[offset + c] = mix(
          pixels[offset + c],
          mix(color[c], PAPER[c], sheen),
          alpha,
        );
    }
  }
  return pixels;
}

/** Eases the avatar's state between frames so changes glide instead of snapping. */
export function createAvatarState() {
  const state = { speaking: false, critical: false, voice: 0, alert: 0 };
  return {
    setSpeaking(value) {
      state.speaking = Boolean(value);
    },
    setCritical(value) {
      state.critical = Boolean(value);
    },
    /** Advances by one frame of `seconds` and returns the smoothed levels. */
    step(seconds) {
      const toward = (current, target, rate) =>
        current + (target - current) * Math.min(1, seconds * rate);
      state.voice = toward(
        state.voice,
        state.speaking ? 1 : 0,
        state.speaking ? 9 : 4,
      );
      state.alert = toward(state.alert, state.critical ? 1 : 0, 3);
      return { voice: state.voice, alert: state.alert };
    },
  };
}

/** True when this call should show the critical look: it is about a critical reminder or home event, or a critical reminder is overdue. */
export function isCritical(context) {
  if (!context) return false;
  if (context.focusReminder?.priority === 'critical') return true;
  if (context.focusEvent?.severity === 'critical') return true;
  return (context.openReminders ?? []).some(
    (item) => item.priority === 'critical' && item.overdue,
  );
}
