import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEIGHT,
  WIDTH,
  createAvatarState,
  isCritical,
  renderFrame,
} from '../avatar.mjs';

const pixel = (frame, x, y) =>
  Array.from(frame.subarray((y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 3));
// Unit coordinates of the same horse mark used by the UI, at its resting scale.
const horsePixel = (frame, x, y) =>
  pixel(frame, 320 + (x - 40) * 3, 164 + (y - 40) * 3);

test('avatar: renders an opaque ocean-ink horse on parchment, red for critical alerts', () => {
  const calm = renderFrame(0, 0, 0);
  const critical = renderFrame(0, 0, 1);
  assert.equal(calm.length, WIDTH * HEIGHT * 4);
  assert.deepEqual(
    horsePixel(calm, 34, 40),
    [32, 61, 78],
    'solid wooden body uses the UI ink',
  );
  assert.deepEqual(
    horsePixel(critical, 34, 40),
    [185, 57, 46],
    'critical recolors the horse itself',
  );
  for (const point of [
    [36, 20],
    [24, 68],
    [49, 68],
    [30, 37],
  ]) {
    const [r, g, b] = horsePixel(calm, ...point);
    assert.ok(
      r > 220 && g > 210 && b > 200,
      `the neck cutout, wheel hubs and plank grooves remain visible: ${point}`,
    );
  }
  assert.deepEqual(
    pixel(calm, 10, 10),
    pixel(critical, 10, 10),
    'critical does not flash or recolor the backdrop',
  );
  assert.ok(calm.every((v, i) => i % 4 !== 3 || v === 255));
});

test('avatar: speech fluctuates the silhouette while idle motion stays gentle', () => {
  const resting = renderFrame(0, 0, 0);
  const idle = renderFrame(1, 0, 0);
  const speaking = renderFrame(1, 1, 0);
  const changed = (a, b) => {
    let count = 0;
    for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])
        count++;
    return count;
  };
  assert.ok(changed(resting, idle) > 100, 'horse breathes while listening');
  assert.ok(
    changed(resting, speaking) > changed(resting, idle) * 2,
    'speech adds expansion and ripples',
  );
  assert.notDeepEqual(
    renderFrame(1, 1, 0),
    renderFrame(1.3, 1, 0),
    'speech movement evolves with time',
  );
  const reused = new Uint8Array(WIDTH * HEIGHT * 4);
  renderFrame(1, 1, 1, reused);
  assert.equal(renderFrame(0, 0, 0, reused), reused);
  assert.deepEqual(reused, resting, 'frame reuse leaves no motion trails');
});

test('avatar: speaking and critical states ease in and return to calm', () => {
  const state = createAvatarState();
  assert.deepEqual(state.step(1 / 15), { voice: 0, alert: 0 });
  state.setSpeaking(true);
  state.setCritical(true);
  const first = state.step(1 / 15);
  assert.ok(
    first.voice > 0 && first.voice < 1 && first.alert > 0 && first.alert < 1,
  );
  for (let i = 0; i < 60; i++) state.step(1 / 15);
  assert.ok(state.step(1 / 15).voice > 0.99);
  state.setSpeaking(false);
  state.setCritical(false);
  for (let i = 0; i < 60; i++) state.step(1 / 15);
  const calm = state.step(1 / 15);
  assert.ok(calm.voice < 0.001 && calm.alert < 0.001);
});

test('avatar: critical reminders and home events select the red horse', () => {
  assert.equal(isCritical({ focusEvent: { severity: 'critical' } }), true);
  assert.equal(isCritical({ focusReminder: { priority: 'critical' } }), true);
  assert.equal(
    isCritical({ openReminders: [{ priority: 'critical', overdue: true }] }),
    true,
  );
  assert.equal(
    isCritical({ openReminders: [{ priority: 'high', overdue: true }] }),
    false,
  );
});
