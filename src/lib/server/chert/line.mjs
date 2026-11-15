// One FaceTime line carries one call. Two calls placed at the same moment both fail and can leave the line stuck
// "in a call", so the scheduler hands over one item at a time and waits while a call is ringing or in progress.

/** A call that has been ringing or in progress for longer than this is taken to be stale and no longer blocks. */
export const LIVE_CALL_WINDOW_MS = 10 * 60_000;

/** The PostgREST query for a FaceTime attempt that is being placed, ringing or in progress right now. */
export function liveCallQuery(now = Date.now()) {
  const since = new Date(now - LIVE_CALL_WINDOW_MS).toISOString();
  return `notification_attempts?channel=eq.facetime&status=in.(sending,accepted,answered)&created_at=gte.${encodeURIComponent(since)}&select=id&limit=1`;
}

/** What the scheduler may hand over this tick: nothing while the line is busy, otherwise the first due item. */
export function nextForLine(candidates, lineBusy) {
  if (lineBusy) return [];
  return candidates.slice(0, 1);
}
