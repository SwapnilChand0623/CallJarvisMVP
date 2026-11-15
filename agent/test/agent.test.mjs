import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCallContext } from '../call-context.mjs';
import { buildGreeting, buildInstructions } from '../prompt.mjs';
import { buildTools, toolReply } from '../tools.mjs';
import { createVoiceApi } from '../voice-api.mjs';
import { bridgeReady, greetOnBridgeReady } from '../greet.mjs';
import { guardRepliesAfterTools } from '../reply-guard.mjs';
import { HEIGHT, WIDTH, isCritical, renderFrame } from '../avatar.mjs';
import { FEED_HEIGHT, FEED_WIDTH, fitFrame, shrinkAvatar } from '../feed.mjs';

test('call context: inbound from chert, outbound from dispatch metadata', () => {
  assert.deepEqual(parseCallContext('{"chert_call":"call_123","media":{"audio":true}}', 'room-a'),
    { direction: 'inbound', callId: 'call_123', attemptId: null, bridgeIdentity: null, video: true, feed: false, accepted: false, room: 'room-a' });
  assert.equal(parseCallContext('{"chert_call":"c","media":{"audio":true,"video":false}}', 'r').video, false);
  assert.equal(parseCallContext('{"chert_call":"c7161775-cd89","inbound":true}', 'cj-in-x').accepted, true);
  assert.deepEqual(parseCallContext('{"outbound":true,"userId":"someone-else","attemptId":"a-1","reminderId":"r-9","greeting":"bridge_ready"}', 'r'),
    { direction: 'outbound', callId: null, attemptId: 'a-1', bridgeIdentity: 'chert-bridge-a-1', video: false, feed: false, accepted: false, room: 'r' });
  const alert = parseCallContext('{"outbound":true,"attemptId":"a-2","video":true}', 'r');
  assert.deepEqual([alert.video, alert.feed], [true, true], 'an outbound video call carries the camera feed');
  assert.equal(parseCallContext('{"chert_call":"c","video":true}', 'r').feed, false, 'never on a call the user placed');
  for (const metadata of [undefined, '', 'not json', 'null', '[]', '{"outbound":true}', '{"outbound":"true","attemptId":"a-1"}',
    '{"outbound":true,"attemptId":"a b; drop"}', '{"attemptId":"a-1"}']) {
    const call = parseCallContext(metadata, undefined);
    assert.deepEqual([call.direction, call.attemptId], ['inbound', null], String(metadata));
  }
});

test('voice api: disabled without configuration', () => {
  assert.equal(createVoiceApi({ url: '', token: 't' }), null);
  assert.equal(createVoiceApi({ url: 'http://x', token: 'YOUR_VOICE_TOOL_TOKEN' }), null);
});

test('voice api: sends only call identifiers and normalizes every outcome', async () => {
  const seen = [];
  const reply = { status: 200, body: { ok: true, result: { reminder: { title: 'Call Mom' } } } };
  const fetcher = async (url, init) => {
    seen.push({ url, init });
    if (reply.throw) throw reply.throw;
    return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), { status: reply.status });
  };
  const api = createVoiceApi({ url: 'http://localhost:3000/', token: 'secret', fetch: fetcher });
  const call = { direction: 'inbound', callId: 'c1', attemptId: null, bridgeIdentity: null, room: 'r', userId: 'smuggled' };

  assert.deepEqual(await api(call, 'createReminder', { title: 'Call Mom' }), { ok: true, result: { reminder: { title: 'Call Mom' } } });
  assert.equal(seen[0].url, 'http://localhost:3000/api/internal/voice');
  assert.equal(seen[0].init.headers.authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(seen[0].init.body), { action: 'createReminder', args: { title: 'Call Mom' }, call: { callId: 'c1', attemptId: null, room: 'r' } });

  Object.assign(reply, { status: 422, body: { ok: false, error: { code: 'time_required', message: 'Ask for a time.' } } });
  assert.deepEqual(await api(call, 'createReminder', {}), { ok: false, error: { code: 'time_required', message: 'Ask for a time.' } });
  Object.assign(reply, { status: 500, body: '<html>oops</html>' });
  assert.equal((await api(call, 'x')).error.code, 'server_error');
  Object.assign(reply, { status: 200, body: { ok: true } });
  assert.equal((await api(call, 'x')).ok, false, 'ok without a result is not success');
  reply.throw = Object.assign(new Error('t'), { name: 'TimeoutError' });
  assert.equal((await api(call, 'x')).error.code, 'timeout');
  reply.throw = new Error('ECONNREFUSED');
  assert.equal((await api(call, 'x')).error.code, 'unreachable');
});

test('tools: built from the server contract, failures stay failures', async () => {
  const calls = [];
  const run = async (action, args) => { calls.push([action, args]); return action === 'createReminder' ? { ok: true, result: { reminder: { title: 'x' } } } : { ok: false, error: { code: 'reminder_ambiguous', message: 'Ask which.', candidates: [{ id: '1' }] } }; };
  const specs = [
    { name: 'createReminder', description: 'd', parameters: { type: 'object', properties: {} } },
    { name: 'completeReminder', description: 'd', parameters: { type: 'object', properties: {} } },
    { name: 'bad name!', description: 'd', parameters: { type: 'object', properties: {} } },
    { name: 'noSchema', description: 'd' }, null,
  ];
  const tools = buildTools(specs, run, spec => spec);
  assert.deepEqual(Object.keys(tools), ['createReminder', 'completeReminder']);
  assert.deepEqual(await tools.createReminder.execute({ title: 'x' }), { status: 'SUCCEEDED', reminder: { title: 'x' } });
  assert.deepEqual(await tools.completeReminder.execute(undefined), { status: 'FAILED', error: 'reminder_ambiguous', instruction: 'Ask which.', candidates: [{ id: '1' }] });
  assert.deepEqual(calls, [['createReminder', { title: 'x' }], ['completeReminder', {}]]);
  assert.equal(toolReply(undefined).status, 'FAILED');
  assert.deepEqual(buildTools(undefined, run), {});
});

test('tools: the real LiveKit factory accepts the server contract', async () => {
  const { ACTIONS } = await import('../../src/app/api/internal/voice/_lib/contract.ts');
  const tools = buildTools(ACTIONS, async () => ({ ok: true, result: {} }));
  assert.deepEqual(Object.keys(tools), ACTIONS.map(action => action.name));
});

test('prompt: honest without tools, contextual with them', () => {
  const bare = buildInstructions(null);
  assert.match(bare, /never claim a reminder or change was saved/);
  assert.doesNotMatch(bare, /Context for this call/);
  const reminder = { id: 'r1', title: 'Take evening medication', due: 'Saturday, November 14 at 11:45 AM', priority: 'high', overdue: true, acknowledged: false };
  const context = { user: { name: 'Demo User', timeZone: 'America/Chicago' }, now: { local: '2026-11-14T12:00', spoken: 'Saturday, November 14 at 12:00 PM' },
    focusReminder: reminder, openReminders: [reminder], openReminderCount: 1, savedNotes: ['Prefers mornings'] };
  const full = buildInstructions(context);
  for (const expected of [/only after the tool returns status SUCCEEDED/, /You are an AI/, /2026-11-14T12:00, America\/Chicago/, /overdue, was due Saturday/, /Prefers mornings/, /not a therapist/]) assert.match(full, expected);
  assert.match(buildGreeting(context, { direction: 'outbound' }), /calling about the reminder "Take evening medication"/);
  assert.match(buildGreeting(context, { direction: 'inbound' }), /ask how you can help.*Demo/);
  assert.match(buildGreeting(null, { direction: 'outbound' }), /checking in/);
});

test('greeting fires once, only on bridge_ready', () => {
  const listeners = new Set();
  const room = { metadata: '{"chert_call":"c"}', on: (_e, f) => listeners.add(f), off: (_e, f) => listeners.delete(f) };
  let greeted = 0;
  greetOnBridgeReady(room, () => greeted++);
  assert.equal(greeted, 0);
  room.metadata = '{"chert_bridge_ready":true}';
  for (const listener of [...listeners]) listener();
  for (const listener of [...listeners]) listener();
  assert.equal(greeted, 1);
  assert.equal(bridgeReady('nope'), false);
});

test('greeting falls back after a delay only when asked to', async () => {
  const room = () => ({ metadata: '{}', on() {}, off() {} });
  let greeted = 0;
  greetOnBridgeReady(room(), () => greeted++, { fallbackMs: 20 });
  const stop = greetOnBridgeReady(room(), () => greeted++, { fallbackMs: 20 });
  stop();
  greetOnBridgeReady(room(), () => greeted++);
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(greeted, 1);
});

test('avatar: critical means the call is about a critical reminder, or one is overdue', () => {
  assert.equal(isCritical(null), false);
  assert.equal(isCritical({ focusReminder: { priority: 'critical' }, openReminders: [] }), true);
  assert.equal(isCritical({ focusReminder: null, openReminders: [{ priority: 'critical', overdue: true }] }), true);
  assert.equal(isCritical({ focusReminder: null, openReminders: [{ priority: 'critical', overdue: false }, { priority: 'high', overdue: true }] }), false);
});

test('home events: the call names the event, offers the mapped action and shows as critical', () => {
  const context = { user: { name: null, timeZone: 'America/Chicago' }, now: { local: '2026-11-15T12:00', spoken: 'Sunday, November 15 at 12:00 PM' },
    focusReminder: null, openReminders: [], openReminderCount: 0, savedNotes: [],
    focusEvent: { type: 'stove_on', severity: 'critical', description: 'The gas stove appears to be on while the home is set to Away', when: 'Sunday, November 15 at 11:59 AM', simulated: true, suggestion: 'Offer to turn the stove off.' },
    home: { mode: 'away', devices: [{ name: 'Kitchen stove', kind: 'stove', on: true }, { name: 'Porch light', kind: 'light', on: false }] } };
  const instructions = buildInstructions(context);
  for (const expected of [/You placed this call about this home event: The gas stove appears to be on/, /from the home simulator/, /Offer to turn the stove off\./,
    /call acknowledgeHomeEvent with no arguments/, /The home is set to Away\. Devices: Kitchen stove \(on\), Porch light \(off\)/]) assert.match(instructions, expected);
  const greeting = buildGreeting(context, { direction: 'outbound' });
  assert.match(greeting, /the gas stove appears to be on while the home is set to Away, according to the home simulator/);
  assert.match(greeting, /Offer to turn the stove off\./);
  assert.equal(isCritical(context), true);
  assert.equal(isCritical({ ...context, focusEvent: { ...context.focusEvent, severity: 'low' } }), false);
});

test('reply guard: prompts once when the model stays silent after a tool, and not when it speaks', async () => {
  const listeners = {};
  const prompts = [];
  const session = { on: (name, fn) => { (listeners[name] ??= []).push(fn); }, generateReply: options => prompts.push(options.instructions) };
  const emit = (name, event) => (listeners[name] ?? []).forEach(fn => fn(event));
  const logs = [];
  guardRepliesAfterTools(session, { waitMs: 30, log: line => logs.push(line) });

  emit('function_tools_executed', { functionCalls: [{ name: 'getHomeStatus' }] });
  emit('agent_state_changed', { newState: 'speaking' });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(prompts.length, 0, 'the model answered, so no prompt');

  emit('function_tools_executed', { functionCalls: [{ name: 'getHomeStatus' }] });
  emit('agent_state_changed', { newState: 'thinking' });
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(prompts.length, 1);
  assert.match(logs[0], /no reply .* after getHomeStatus/);

  emit('function_tools_executed', { functionCalls: [] });
  emit('close', {});
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.equal(prompts.length, 1, 'nothing after the call ends');
});

test('camera feed: pictures are fitted into a small frame, centred and upright', () => {
  const pixel = (frame, x, y) => [...frame.subarray((y * FEED_WIDTH + x) * 4, (y * FEED_WIDTH + x) * 4 + 4)];
  const picture = (width, height, colour) => {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([...colour(x, y), 255], (y * width + x) * 4);
    return data;
  };
  assert.deepEqual([FEED_WIDTH, FEED_HEIGHT], [320, 180]);

  // A 16:9 picture fills the frame: left half red, right half blue.
  const wide = fitFrame(picture(640, 360, x => (x < 320 ? [255, 0, 0] : [0, 0, 255])), 640, 360);
  assert.equal(wide.length, 320 * 180 * 4);
  assert.deepEqual(pixel(wide, 10, 90), [255, 0, 0, 255]);
  assert.deepEqual(pixel(wide, 310, 90), [0, 0, 255, 255]);

  // A 4:3 picture keeps its shape, with black bars at the sides.
  const boxed = fitFrame(picture(640, 480, () => [0, 255, 0]), 640, 480);
  assert.deepEqual(pixel(boxed, 5, 90), [0, 0, 0, 255]);
  assert.deepEqual(pixel(boxed, 160, 90), [0, 255, 0, 255]);

  // A phone held upright sends a sideways picture marked with a quarter turn. Turned upright it is tall, so it
  // sits in the middle with bars either side; the picture's left edge (red) becomes the top.
  const sideways = picture(640, 360, x => (x < 320 ? [255, 0, 0] : [0, 0, 255]));
  const turned = fitFrame(sideways, 640, 360, 1);
  assert.deepEqual(pixel(turned, 160, 20), [255, 0, 0, 255]);
  assert.deepEqual(pixel(turned, 160, 160), [0, 0, 255, 255]);
  assert.deepEqual(pixel(turned, 20, 90), [0, 0, 0, 255]);
  assert.deepEqual(pixel(fitFrame(sideways, 640, 360, 3), 160, 20), [0, 0, 255, 255], 'the opposite turn flips it');
  assert.deepEqual(pixel(fitFrame(sideways, 640, 360, 2), 10, 90), [0, 0, 255, 255], 'a half turn swaps the sides');

  // A buffer is reused between frames without leaving the last picture behind.
  const reused = fitFrame(picture(640, 480, () => [9, 9, 9]), 640, 480, 0, wide);
  assert.equal(reused, wide);
  assert.deepEqual(pixel(reused, 5, 90), [0, 0, 0, 255]);

  const avatar = shrinkAvatar(renderFrame(0, 0, 1));
  assert.equal(avatar.length, 320 * 180 * 4);
  const full = renderFrame(0, 0, 1);
  assert.deepEqual(pixel(avatar, 100, 50), [...full.subarray((100 * WIDTH + 200) * 4, (100 * WIDTH + 200) * 4 + 3), 255]);
  assert.ok(HEIGHT === 360);
});

test('prompt: on a video alert call Jarvis knows the camera is shown and that it cannot see it', () => {
  const context = { now: { spoken: 'noon', local: '2026-11-15T12:00' }, user: { timeZone: 'America/Chicago' }, openReminders: [], tools: [] };
  assert.match(buildInstructions(context, { feed: true }), /live home camera.*cannot see the video/);
  assert.doesNotMatch(buildInstructions(context, { feed: false }), /live home camera/);
  assert.doesNotMatch(buildInstructions(context), /live home camera/);
});
