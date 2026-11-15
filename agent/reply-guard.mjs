// Guards against a silent line after a tool call. The model should speak once a tool returns; when it does not
// start within a few seconds, it is asked once to tell the user the outcome.

/**
 * @param {{ on(event: string, listener: (event: any) => void): unknown, generateReply(options: { instructions: string }): unknown }} session
 * @param {{ waitMs?: number, log?: (message: string) => void }} [options]
 * @returns {() => void} stops the guard
 */
export function guardRepliesAfterTools(session, { waitMs = 5000, log = message => console.warn(message) } = {}) {
  let timer;
  let closed = false;
  const stop = () => { closed = true; clearTimeout(timer); };
  session.on('function_tools_executed', event => {
    if (closed) return;
    const names = (event?.functionCalls ?? []).map(call => call?.name).filter(Boolean).join(', ') || 'a tool';
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (closed) return;
      log(`[jarvis] no reply ${waitMs / 1000} s after ${names}; asking the model to answer`);
      try {
        session.generateReply({ instructions: 'You just ran a tool and have not told the user the outcome. Tell them now in one or two short sentences, based only on what the tool returned.' });
      } catch { /* the call ended first */ }
    }, waitMs);
  });
  session.on('agent_state_changed', event => { if (event?.newState === 'speaking') clearTimeout(timer); });
  session.on('close', stop);
  return stop;
}
