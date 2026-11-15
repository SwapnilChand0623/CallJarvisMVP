// Jarvis's on-screen presence for FaceTime Video: a soft glowing core with a voice line running through it.
// The core breathes while idle, swells and ripples while Jarvis speaks, and shifts from teal to red when the
// call is about something critical. This file only computes pixels; camera.mjs publishes them.

export const WIDTH = 640;
export const HEIGHT = 360;

const CX = WIDTH / 2;
const CY = HEIGHT / 2;
const CALM = [56, 222, 204];   // teal
const ALERT = [255, 70, 52];   // red
const BACKDROP = [5, 9, 16];

// Distance of every pixel from the centre, in half-pixel steps, computed once.
const STEPS = Math.ceil(Math.hypot(CX, CY) * 2) + 2;
const distance = new Uint16Array(WIDTH * HEIGHT);
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) distance[y * WIDTH + x] = Math.round(Math.hypot(x - CX, y - CY) * 2);
}
// The voice line fades out toward the left and right edges.
const envelope = Float32Array.from({ length: WIDTH }, (_, x) => Math.sin((Math.PI * x) / WIDTH) ** 2);

const mix = (from, to, amount) => from + (to - from) * amount;
const glowByDistance = new Float32Array(STEPS);

/**
 * One frame as RGBA bytes.
 * @param {number} time seconds since the avatar started
 * @param {number} voice 0 (silent) to 1 (speaking), already smoothed
 * @param {number} alert 0 (calm) to 1 (critical), already smoothed
 * @param {Uint8Array} [pixels] buffer to draw into
 */
export function renderFrame(time, voice, alert, pixels = new Uint8Array(WIDTH * HEIGHT * 4)) {
  const red = mix(CALM[0], ALERT[0], alert);
  const green = mix(CALM[1], ALERT[1], alert);
  const blue = mix(CALM[2], ALERT[2], alert);

  // Idle: a slow breath. Speaking: a quicker, uneven pulse layered on top. Critical calls breathe faster.
  const breath = Math.sin(time * (1.5 + alert * 1.6)) * 0.5 + 0.5;
  const pulse = (Math.sin(time * 9.1) + Math.sin(time * 14.3 + 1.7) + Math.sin(time * 5.2 + 0.4)) / 6 + 0.5;
  const radius = 46 * (1 + 0.1 * breath + voice * (0.22 + 0.3 * pulse));
  const strength = 0.82 + 0.1 * breath + 0.18 * voice;
  for (let step = 0; step < STEPS; step++) {
    const d = step / 2;
    const core = Math.exp(-((d / radius) ** 2) * 1.6);
    const halo = 0.38 * Math.exp(-((d / (radius * 3.1)) ** 2));
    glowByDistance[step] = Math.min(1, (core + halo) * strength);
  }
  for (let i = 0, offset = 0; i < distance.length; i++, offset += 4) {
    const glow = glowByDistance[distance[i]];
    const heat = glow * glow * glow * glow * 0.8; // the centre runs toward white, the rim keeps its colour
    pixels[offset] = BACKDROP[0] + (red - BACKDROP[0]) * glow + (255 - red) * heat;
    pixels[offset + 1] = BACKDROP[1] + (green - BACKDROP[1]) * glow + (255 - green) * heat;
    pixels[offset + 2] = BACKDROP[2] + (blue - BACKDROP[2]) * glow + (255 - blue) * heat;
    pixels[offset + 3] = 255;
  }

  // The voice line: nearly flat when silent, rippling when Jarvis speaks.
  const amplitude = 2 + voice * (22 + 26 * pulse);
  for (let x = 0; x < WIDTH; x++) {
    const phase = x * 0.045;
    const wave = Math.sin(phase * 1.0 + time * 6.2) * 0.55 + Math.sin(phase * 2.3 - time * 9.4) * 0.3 + Math.sin(phase * 4.1 + time * 13.0) * 0.15;
    const centre = CY + wave * amplitude * envelope[x];
    const reach = 14;
    const top = Math.max(0, Math.floor(centre - reach));
    const bottom = Math.min(HEIGHT - 1, Math.ceil(centre + reach));
    for (let y = top; y <= bottom; y++) {
      const dy = y - centre;
      const line = (Math.exp(-((dy / 1.6) ** 2)) + 0.3 * Math.exp(-((dy / 6.5) ** 2))) * (0.25 + 0.75 * envelope[x]) * (0.55 + 0.45 * voice);
      if (line < 0.01) continue;
      const offset = (y * WIDTH + x) * 4;
      const lit = Math.min(1, line);
      pixels[offset] = Math.min(255, pixels[offset] + (mix(red, 255, 0.55) - pixels[offset]) * lit);
      pixels[offset + 1] = Math.min(255, pixels[offset + 1] + (mix(green, 255, 0.55) - pixels[offset + 1]) * lit);
      pixels[offset + 2] = Math.min(255, pixels[offset + 2] + (mix(blue, 255, 0.55) - pixels[offset + 2]) * lit);
    }
  }
  return pixels;
}

/** Eases the avatar's state between frames so changes glide instead of snapping. */
export function createAvatarState() {
  const state = { speaking: false, critical: false, voice: 0, alert: 0 };
  return {
    setSpeaking(value) { state.speaking = Boolean(value); },
    setCritical(value) { state.critical = Boolean(value); },
    /** Advances by one frame of `seconds` and returns the smoothed levels. */
    step(seconds) {
      const toward = (current, target, rate) => current + (target - current) * Math.min(1, seconds * rate);
      state.voice = toward(state.voice, state.speaking ? 1 : 0, state.speaking ? 9 : 4);
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
  return (context.openReminders ?? []).some(item => item.priority === 'critical' && item.overdue);
}
