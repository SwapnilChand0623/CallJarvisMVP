import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCallContext } from '../call-context.mjs';
import { buildGreeting, buildInstructions } from '../prompt.mjs';
import { buildTools, toolReply } from '../tools.mjs';
import { createVoiceApi } from '../voice-api.mjs';
import { bridgeReady, greetOnBridgeReady } from '../greet.mjs';
import { HEIGHT, WIDTH, createAvatarState, isCritical, renderFrame } from '../avatar.mjs';

test('call context: inbound from chert, outbound from dispatch metadata', () => {
  assert.deepEqual(parseCallContext('{"chert_call":"call_123","media":{"audio":true}}', 'room-a'),
    { direction: 'inbound', callId: 'call_123', attemptId: null, bridgeIdentity: null, video: true, accepted: false, room: 'room-a' });
  assert.equal(parseCallContext('{"chert_call":"c","media":{"audio":true,"video":false}}', 'r').video, false);
  assert.equal(parseCallContext('{"chert_call":"c7161775-cd89","inbound":true}', 'cj-in-x').accepted, true);
  assert.deepEqual(parseCallContext('{"outbound":true,"userId":"someone-else","attemptId":"a-1","reminderId":"r-9","greeting":"bridge_ready"}', 'r'),
    { direction: 'outbound', callId: null, attemptId: 'a-1', bridgeIdentity: 'chert-bridge-a-1', video: false, accepted: false, room: 'r' });
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

test('avatar: glows brighter while speaking and turns red when critical', () => {
  const centre = (HEIGHT / 2 - 30) * WIDTH * 4 + (WIDTH / 2 + 70) * 4; // a point beside the core, off the voice line
  const idle = renderFrame(1, 0, 0);
  const speaking = renderFrame(1, 1, 0);
  const critical = renderFrame(1, 0, 1);
  assert.equal(idle.length, WIDTH * HEIGHT * 4);
  assert.ok(speaking[centre + 1] > idle[centre + 1], 'the glow reaches further while speaking');
  assert.ok(idle[centre + 1] > idle[centre], 'calm is teal: more green than red');
  assert.ok(critical[centre] > critical[centre + 1], 'critical is red: more red than green');
  assert.ok(idle.every((value, index) => index % 4 !== 3 || value === 255), 'every pixel is opaque');

  const state = createAvatarState();
  assert.deepEqual(state.step(1 / 15), { voice: 0, alert: 0 });
  state.setSpeaking(true); state.setCritical(true);
  const first = state.step(1 / 15);
  assert.ok(first.voice > 0 && first.voice < 1 && first.alert > 0 && first.alert < 1, 'levels ease in');
  for (let i = 0; i < 60; i++) state.step(1 / 15);
  assert.ok(state.step(1 / 15).voice > 0.99);
});

test('avatar: critical means the call is about a critical reminder, or one is overdue', () => {
  assert.equal(isCritical(null), false);
  assert.equal(isCritical({ focusReminder: { priority: 'critical' }, openReminders: [] }), true);
  assert.equal(isCritical({ focusReminder: null, openReminders: [{ priority: 'critical', overdue: true }] }), true);
  assert.equal(isCritical({ focusReminder: null, openReminders: [{ priority: 'critical', overdue: false }, { priority: 'high', overdue: true }] }), false);
});
