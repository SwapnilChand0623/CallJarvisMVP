// Stand-in for the device service owned by Shishir's Codex (src/lib/server/home). It flips the stored state of a
// permitted simulated device and writes the device_action_logs row. Replace the binding in route.ts with the real service when it lands;
// controlLight only reports what setLight returns.
import type { HomeService, Store } from "./types";

export function simulatedHomeService(store: Store): HomeService {
  return {
    async setDevice({ userId, deviceId, on }) {
      const known = (await store.listDevices(userId)).find((item) => item.id === deviceId);
      if (!known) return { ok: false, reason: "the device was not found or is not permitted" };
      // This stand-in cannot command hardware, so it refuses a real device instead of faking its state.
      if (!known.simulated) return { ok: false, reason: "real devices need the home service, which is not connected yet" };
      let device;
      try { device = await store.setDeviceState(userId, deviceId, on); }
      catch { device = null; }
      const succeeded = device !== null && device.on === on;
      // The audit row is written after the outcome is known (data contract).
      try { await store.recordDeviceAction(userId, { deviceId, on, status: succeeded ? "simulated" : "failed" }); }
      catch (error) { console.error("[voice] device audit write failed", error instanceof Error ? error.message : error); }
      return succeeded ? { ok: true, on, simulated: true } : { ok: false, reason: "the state could not be saved" };
    },
  };
}
