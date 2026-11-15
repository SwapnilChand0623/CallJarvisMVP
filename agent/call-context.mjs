// What the worker knows about a call before any model output exists.
//
// Inbound (chert dev): job metadata is {"chert_call":"<call id>","media":…}.
// Outbound: the backend's LiveKit agent dispatch carries
//   {"calljarvis":{"direction":"outbound","attemptId":"<notification attempt id>","bridgeIdentity":"<bridge participant>"}}
// Only these identifiers leave the worker. The server maps them to a user; nothing here is a user id.

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
  const ours = metadata && typeof metadata.calljarvis === 'object' && metadata.calljarvis ? metadata.calljarvis : {};
  const attemptId = id(ours.attemptId);
  // Outbound only when the attempt is present: without it the server cannot tie the call to a user.
  const outbound = ours.direction === 'outbound' && attemptId !== null;
  return {
    direction: outbound ? 'outbound' : 'inbound',
    callId: id(metadata.chert_call) ?? id(ours.callId),
    attemptId: outbound ? attemptId : null,
    bridgeIdentity: outbound ? id(ours.bridgeIdentity) : null,
    room: typeof roomName === 'string' ? roomName : null,
  };
}
