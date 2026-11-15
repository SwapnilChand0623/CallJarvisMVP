// Turns the server's tool contract into model tools. The contract arrives with session.start, so voice and
// iMessage share one definition and the worker holds no copy to drift.
import { llm } from '@livekit/agents';

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * @param {unknown} specs the `tools` array from session.start
 * @param {(action: string, args: object) => Promise<any>} run bound to this call
 * @param {(spec: object) => unknown} [make] tool factory, replaceable in tests
 * @returns {Record<string, unknown>}
 */
export function buildTools(specs, run, make = spec => llm.tool(spec)) {
  const tools = {};
  for (const spec of Array.isArray(specs) ? specs : []) {
    if (!spec || !NAME.test(spec.name) || typeof spec.description !== 'string' || spec.parameters?.type !== 'object') continue;
    tools[spec.name] = make({
      description: spec.description,
      parameters: spec.parameters,
      execute: async args => {
        const started = Date.now();
        const outcome = await run(spec.name, args && typeof args === 'object' ? args : {});
        // Names and outcomes only: arguments can hold what the user said.
        console.log(`[jarvis] tool ${spec.name}: ${outcome?.ok === true ? 'ok' : `failed (${outcome?.error?.code ?? 'unknown'})`} in ${Date.now() - started} ms`);
        return toolReply(outcome);
      },
    });
  }
  return tools;
}

/** What the model reads after a tool call. The status line comes first so a failure cannot be skimmed past. */
export function toolReply(outcome) {
  if (outcome?.ok === true) return { status: 'SUCCEEDED', ...outcome.result };
  const error = outcome?.error ?? { code: 'server_error', message: '' };
  return {
    status: 'FAILED',
    error: error.code,
    instruction: error.message || 'The change did not go through. Tell the user it failed.',
    ...(error.candidates ? { candidates: error.candidates } : {}),
  };
}
