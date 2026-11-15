// The home simulator's server side. Everything it records is labelled simulated. A prop seen by the camera, or a
// button pressed on the page, becomes a home event; while the home is Away the event is critical and the
// scheduler places a call about it, exactly as it does for a critical reminder.
import { PROPS, propByKey, type Prop, type PropKey } from "../../home/props";
import type { Device, HomeEvent, HomeMode, Store } from "../../../app/api/internal/voice/_lib/types";

/** While an alert is still unacknowledged, the same event is not raised again within this window. */
export const COOLDOWN_MS = 2 * 60_000;

export type HomeState = { mode: HomeMode; devices: Device[]; events: HomeEvent[]; props: typeof PROPS; cooldownSeconds: number };
export type TriggerResult =
  | { recorded: true; event: HomeEvent; willCall: boolean }
  | { recorded: false; reason: "cooldown" | "unknown_prop"; retryInSeconds?: number };

export function createHome(store: Store, now: () => number = Date.now) {
  /** Writes the event for a prop. An alert that is still unacknowledged is not raised again within the cooldown. */
  async function raise(userId: string, prop: Prop): Promise<TriggerResult> {
    const away = (await store.getHomeMode(userId)) === "away";
    // A quiet entry logged at Home does not hold back the critical alert once the home is Away.
    const waiting = (await store.listHomeEvents(userId, 20))
      .find((event) => event.type === prop.eventType && !event.acknowledgedAt && event.outreachEligible === away);
    const age = waiting ? now() - Date.parse(waiting.occurredAt) : Infinity;
    if (age < COOLDOWN_MS) return { recorded: false, reason: "cooldown", retryInSeconds: Math.ceil((COOLDOWN_MS - age) / 1000) };
    const event = await store.insertHomeEvent(userId, {
      type: prop.eventType,
      severity: away ? "critical" : "low",
      description: away ? `${prop.description} while the home is set to Away` : prop.description,
      outreachEligible: away,
    });
    return { recorded: true, event, willCall: away };
  }

  return {
    async state(userId: string): Promise<HomeState> {
      await store.ensureDemoHome(userId);
      const [mode, devices, events] = await Promise.all([store.getHomeMode(userId), store.listDevices(userId), store.listHomeEvents(userId, 20)]);
      return { mode, devices, events, props: PROPS, cooldownSeconds: COOLDOWN_MS / 1000 };
    },

    /** Sets Home or Away. Going Away with the stove on raises the stove alert at once. */
    async setMode(userId: string, mode: HomeMode) {
      await store.setHomeMode(userId, mode);
      if (mode === "away") await this.checkStove(userId);
      return mode;
    },

    /** Records the event a prop stands for, unless the same event is already waiting on the user. */
    async trigger(userId: string, key: unknown): Promise<TriggerResult> {
      const prop = propByKey(key as PropKey);
      if (!prop) return { recorded: false, reason: "unknown_prop" };
      await store.ensureDemoHome(userId);
      if (prop.switchesOn) {
        const device = (await store.listDevices(userId)).find((item) => item.kind === prop.switchesOn);
        if (device && !device.on) await store.setDeviceState(userId, device.id, true);
      }
      return raise(userId, prop);
    },

    /** Switches a device from the simulator. Turning the stove on while Away raises the stove alert at once. */
    async setDevice(userId: string, deviceId: unknown, on: unknown) {
      if (typeof deviceId !== "string" || typeof on !== "boolean") return null;
      const device = await store.setDeviceState(userId, deviceId, on);
      if (device?.kind === "stove" && on) await this.checkStove(userId);
      return device;
    },

    /** The stove on while the home is Away is a critical alert, however that came about. */
    async checkStove(userId: string): Promise<TriggerResult | null> {
      const [mode, devices] = await Promise.all([store.getHomeMode(userId), store.listDevices(userId)]);
      const stove = devices.find((device) => device.kind === "stove");
      const prop = PROPS.find((item) => item.switchesOn === "stove");
      if (mode !== "away" || !stove?.on || !prop) return null;
      return raise(userId, prop);
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
