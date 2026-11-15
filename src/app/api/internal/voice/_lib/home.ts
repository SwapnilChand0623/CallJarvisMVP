// Stand-in for the device service owned by Shishir's Codex (src/lib/server/home). It flips the stored state of a
// simulated light and writes the audit row. Replace the binding in route.ts with the real service when it lands;
// controlLight only reports what setLight returns.
import type { HomeService, Store } from "./types";

export function simulatedHomeService(store: Store): HomeService {
  return {
    async setLight({ userId, deviceId, on, origin }) {
      let device;
      try { device = await store.setDeviceState(userId, deviceId, on); }
      catch { device = undefined; }
      const succeeded = Boolean(device) && device!.on === on;
      try { await store.recordDeviceAction(userId, { deviceId, on, outcome: succeeded ? "succeeded" : "failed", source: "simulated", origin }); }
      catch (error) { console.error("[voice] device audit write failed", error instanceof Error ? error.message : error); }
      return succeeded ? { ok: true, on, simulated: true } : { ok: false, reason: device === null ? "the light was not found" : "the state could not be saved" };
    },
  };
}
