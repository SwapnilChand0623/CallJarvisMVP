// Greet the caller once, when FaceTime is ready.
//
// When the Chert Mac reports bridge_ready for the call, chert dev sets the room's metadata to
// {"chert_call":"<call id>","chert_bridge_ready":true,"at":"<ISO time>"}. The Mac ends a call whose agent sends
// no audible audio within 10 seconds of bridge_ready (remote_audio_timeout), so the agent greets then.
// Participant arrival is not enough: FaceTime may still be connecting. Without the signal there is no
// greeting, and the caller speaks first.

// RoomEvent.RoomMetadataChanged in @livekit/rtc-node. The room's metadata is already updated when it fires.
const METADATA_CHANGED = 'roomMetadataChanged';

/**
 * True when the room metadata carries chert dev's bridge_ready signal.
 * @param {string | undefined} metadata
 */
export function bridgeReady(metadata) {
  try { return JSON.parse(metadata || '{}')?.chert_bridge_ready === true; } catch { return false; }
}

/**
 * Calls greet() once: at once if the signal is already in the room, otherwise when it arrives.
 * Returns a function that stops waiting.
 * @param {{ metadata?: string, on(event: string, listener: () => void): unknown, off(event: string, listener: () => void): unknown }} room
 * @param {() => unknown} greet
 * @param {{ fallbackMs?: number }} [options]
 * @returns {() => void}
 */
export function greetOnBridgeReady(room, greet, { fallbackMs = 0 } = {}) {
  let done = false;
  let timer;
  const stop = () => { done = true; clearTimeout(timer); room.off(METADATA_CHANGED, check); };
  const fire = () => { stop(); try { greet(); } catch { /* the call ended first */ } };
  function check() {
    if (done || !bridgeReady(room.metadata)) return;
    fire();
  }
  room.on(METADATA_CHANGED, check);
  check();
  // With fallbackMs, greet anyway if the signal never arrives: a clipped greeting is better than a call the Mac
  // drops for silence.
  if (!done && fallbackMs > 0) timer = setTimeout(() => { if (!done) fire(); }, fallbackMs);
  return stop;
}
