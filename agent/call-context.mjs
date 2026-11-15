// What the worker knows about a call before any model output exists.
//
// Inbound (chert dev): job metadata is {"chert_call":"<call id>","media":…}.
// Outbound: the outreach service (src/lib/server/chert) dispatches this agent with
//   {"outbound":true,"attemptId":"<notification attempt id>","userId":…,"reminderId":…,"greeting":"bridge_ready"}
// and joins the bridge as chert-bridge-<attempt id>. Only the attempt id leaves the worker: the server looks the
// owner and reminder up from that attempt, so the userId and reminderId in the metadata are never used.

const ID = /^[\w-]{1,100}$/;
const id = value => (typeof value === 'string' && ID.test(value) ? value : null);

/**
 * @param {string | undefined} jobMetadata the dispatch metadata string
 * @param {string | undefined} roomName
 * @returns {{ direction: 'inbound' | 'outbound', callId: string | null, attemptId: string | null, bridgeIdentity: string | null, room: string | null }}
 */
export function parseCallContext(jobMetadata, roomName) {
  let metadata = {};
  try { metadata = JSON.parse(jobMetadata || '{}') ?? {}; } catch { /* not ours: treat as inbound */ }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) metadata = {};
  const attemptId = id(metadata.attemptId);
  // Outbound only when the attempt is present: without it the server cannot tie the call to a user.
  const outbound = metadata.outbound === true && attemptId !== null;
  return {
    direction: outbound ? 'outbound' : 'inbound',
    callId: id(metadata.chert_call),
    attemptId: outbound ? attemptId : null,
    bridgeIdentity: outbound ? `chert-bridge-${attemptId.slice(0, 48)}` : null,
    room: typeof roomName === 'string' ? roomName : null,
  };
}
