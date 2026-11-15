// End-to-end over real HTTP: the worker's client -> POST /api/internal/voice -> fixture store.
import http from 'node:http';
import assert from 'node:assert/strict';
const root = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const { createVoiceHandler } = await import(`${root}/src/app/api/internal/voice/_lib/handler.ts`);
const { voiceConfig } = await import(`${root}/src/app/api/internal/voice/_lib/config.ts`);
const { createVoiceApi } = await import(`${root}/agent/voice-api.mjs`);
const { buildTools } = await import(`${root}/agent/tools.mjs`);
const { parseCallContext } = await import(`${root}/agent/call-context.mjs`);
const { buildGreeting } = await import(`${root}/agent/prompt.mjs`);
const { toFunctionDeclarations } = await import(`${root}/agent/node_modules/@livekit/agents-plugin-google/dist/utils.js`);
const { llm, voice } = await import(`${root}/agent/node_modules/@livekit/agents/dist/index.js`);

const config = voiceConfig({ VOICE_STORE: 'memory', VOICE_TOOL_TOKEN: 'e2e-token' });
const handler = createVoiceHandler(config);
const server = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const response = await handler(new Request(`http://x${req.url}`, { method: req.method, headers: req.headers, body: Buffer.concat(chunks) }));
  res.writeHead(response.status, { 'content-type': 'application/json' }); res.end(await response.text());
}).listen(0);
const api = createVoiceApi({ url: `http://127.0.0.1:${server.address().port}`, token: 'e2e-token' });
const open = async metadata => {
  const call = parseCallContext(metadata, 'room');
  const started = await api(call, 'session.start');
  assert.equal(started.ok, true);
  return { call, context: started.result, tools: buildTools(started.result.tools, (a, args) => api(call, a, args)) };
};

// Call 1 (inbound): create a reminder, switch the light.
const first = await open('{"chert_call":"call-1"}');
const toolCtx = new voice.Agent({ instructions: 'x', tools: first.tools }).toolCtx;
console.log('Agent registered tools:', Object.keys(toolCtx.functionTools).join(', '));
console.log('Gemini declarations:', toFunctionDeclarations(toolCtx, false).length, '(OpenAPI) /', toFunctionDeclarations(toolCtx, true).length, '(JSON schema)');
const run = (session, name, args) => session.tools[name].execute(args, {});
console.log('vague  ->', (await run(first, 'createReminder', { title: 'Call Mom' })).status);
const created = await run(first, 'createReminder', { title: 'Call Mom', dueInMinutes: 30, priority: 'high' });
console.log('create ->', created.status, created.reminder.title, '|', created.reminder.due);
const light = await run(first, 'controlLight', { device: 'living room lamp', on: true });
console.log('light  ->', light.status, light.light, 'simulated:', light.simulated);

// Call 2 (fresh inbound): the reminder is in context; snooze then complete it.
const second = await open('{"chert_call":"call-2"}');
assert.ok(second.context.openReminders.some(r => r.title === 'Call Mom'));
console.log('call 2 sees:', second.context.openReminders.map(r => r.title).join(', '));
const snoozed = await run(second, 'snoozeReminder', { reminder: 'call mom', dueInMinutes: 60 });
console.log('snooze ->', snoozed.status, snoozed.reminder.status, 'acknowledged:', snoozed.reminder.acknowledged);
const done = await run(second, 'completeReminder', { reminder: created.reminder.id });
console.log('done   ->', done.status, done.reminder.status);

// Call 3 (outbound about the medication reminder): acknowledge with no argument.
const third = await open('{"outbound":true,"attemptId":"40000000-0000-4000-8000-000000000001"}');
console.log('greeting:', buildGreeting(third.context, third.call).slice(0, 110), '…');
const ack = await run(third, 'acknowledgeReminder', {});
console.log('ack    ->', ack.status, ack.reminder.title, 'status:', ack.reminder.status, 'acknowledged:', ack.reminder.acknowledged);
const rows = config.deps.store.data.reminders;
assert.equal(rows.find(r => r.title === 'Take evening medication').status, 'pending');
assert.ok(rows.find(r => r.title === 'Take evening medication').acknowledgedAt);
assert.equal(rows.find(r => r.title === 'Renew passport').acknowledgedAt, null);

// Wrong token and unknown attempt.
const bad = createVoiceApi({ url: `http://127.0.0.1:${server.address().port}`, token: 'nope' });
console.log('wrong token ->', (await bad(first.call, 'listReminders')).error.code);
console.log('forged attempt ->', (await api(parseCallContext('{"outbound":true,"attemptId":"forged"}'), 'session.start')).error.code);
server.close();
console.log('E2E OK');
