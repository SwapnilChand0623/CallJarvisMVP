// Client for the server's voice endpoint (POST /api/internal/voice). Every call returns
// { ok: true, result } or { ok: false, error: { code, message } } and never throws, so a tool
// can always tell the model what happened.

const configured = value => Boolean(value) && !/YOUR_/.test(value);

/**
 * @param {{ url?: string, token?: string, fetch?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {null | ((call: object, action: string, args?: object, timeoutMs?: number) => Promise<any>)}
 *   null when VOICE_API_URL or VOICE_TOOL_TOKEN is not set
 */
export function createVoiceApi({ url = process.env.VOICE_API_URL, token = process.env.VOICE_TOOL_TOKEN, fetch: fetcher = fetch, timeoutMs = 8000 } = {}) {
  if (!configured(url) || !configured(token)) return null;
  const endpoint = `${url.replace(/\/+$/, '')}/api/internal/voice`;
  return async function request(call, action, args = {}, timeout = timeoutMs) {
    const failed = (code, message) => ({ ok: false, error: { code, message } });
    try {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action, args, call: { callId: call.callId, attemptId: call.attemptId, room: call.room } }),
        signal: AbortSignal.timeout(timeout),
      });
      const body = await response.json().catch(() => null);
      if (body && body.ok === true && body.result && typeof body.result === 'object') return { ok: true, result: body.result };
      if (body && body.ok === false && body.error?.code) return failed(String(body.error.code), String(body.error.message ?? ''));
      return failed('server_error', `The server answered HTTP ${response.status}. The change was not confirmed.`);
    } catch (error) {
      // A timeout after the request left is not proof that nothing was written.
      const timedOut = error?.name === 'TimeoutError';
      return failed(timedOut ? 'timeout' : 'unreachable',
        timedOut ? 'No answer in time. The change is unconfirmed: check with a list call before retrying.' : 'The server could not be reached. Nothing was confirmed.');
    }
  };
}
