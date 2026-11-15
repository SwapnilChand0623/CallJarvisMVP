// The home simulator's server side. Everything it records is labelled simulated. A prop seen by the camera, or a
// button pressed on the page, becomes a home event; while the home is Away the event is critical and the
// scheduler places a call about it, exactly as it does for a critical reminder.
import { PROPS, propByKey, type PropKey } from "../../home/props";
import type { Device, HomeEvent, HomeMode, Store } from "../../../app/api/internal/voice/_lib/types";

/** One alert per event type in this window, however long the prop stays in view. */
export const COOLDOWN_MS = 2 * 60_000;

export type HomeState = { mode: HomeMode; devices: Device[]; events: HomeEvent[]; props: typeof PROPS; cooldownSeconds: number };
export type TriggerResult =
  | { recorded: true; event: HomeEvent; willCall: boolean }
  | { recorded: false; reason: "cooldown" | "unknown_prop"; retryInSeconds?: number };

export function createHome(store: Store, now: () => number = Date.now) {
  return {
    async state(userId: string): Promise<HomeState> {
      await store.ensureDemoHome(userId);
      const [mode, devices, events] = await Promise.all([store.getHomeMode(userId), store.listDevices(userId), store.listHomeEvents(userId, 20)]);
      return { mode, devices, events, props: PROPS, cooldownSeconds: COOLDOWN_MS / 1000 };
    },

    setMode(userId: string, mode: HomeMode) {
      return store.setHomeMode(userId, mode);
    },

    /** Records the event a prop stands for, unless the same event was raised within the cooldown. */
    async trigger(userId: string, key: unknown): Promise<TriggerResult> {
      const prop = propByKey(key as PropKey);
      if (!prop) return { recorded: false, reason: "unknown_prop" };
      const recent = (await store.listHomeEvents(userId, 20)).find((event) => event.type === prop.eventType);
      const age = recent ? now() - Date.parse(recent.occurredAt) : Infinity;
      if (age < COOLDOWN_MS) return { recorded: false, reason: "cooldown", retryInSeconds: Math.ceil((COOLDOWN_MS - age) / 1000) };

      await store.ensureDemoHome(userId);
      const [mode, devices] = await Promise.all([store.getHomeMode(userId), store.listDevices(userId)]);
      if (prop.switchesOn) {
        const device = devices.find((item) => item.kind === prop.switchesOn);
        if (device && !device.on) await store.setDeviceState(userId, device.id, true);
      }
      const away = mode === "away";
      const event = await store.insertHomeEvent(userId, {
        type: prop.eventType,
        severity: away ? "critical" : "low",
        description: away ? `${prop.description} while the home is set to Away` : prop.description,
        outreachEligible: away,
      });
      return { recorded: true, event, willCall: away };
    },

    async setDevice(userId: string, deviceId: unknown, on: unknown) {
      if (typeof deviceId !== "string" || typeof on !== "boolean") return null;
      return store.setDeviceState(userId, deviceId, on);
    },

    /** Back to a quiet house: Home mode, everything off, nothing left waiting to call. */
    async reset(userId: string) {
      const [devices, events] = await Promise.all([store.listDevices(userId), store.listHomeEvents(userId, 20)]);
      await Promise.all([
        store.setHomeMode(userId, "home"),
        ...devices.filter((device) => device.on).map((device) => store.setDeviceState(userId, device.id, false)),
        ...events.filter((event) => !event.acknowledgedAt).map((event) => store.acknowledgeHomeEvent(userId, event.id)),
      ]);
    },
  };
}
