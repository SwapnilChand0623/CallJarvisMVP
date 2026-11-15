// The demo's prop map: what the camera looks for and which home event each prop stands for.
// Shared by the simulator page and the server. Add a row here to add a scenario.

export type PropKey = "red_bull_can" | "black_box";

export type Prop = {
  key: PropKey;
  /** Shown in the simulator. */
  label: string;
  /** How the prop is described to the vision model. */
  look: string;
  /** What it stands for, in the prop map and the event feed. */
  standsFor: string;
  eventType: string;
  /** Spoken and written description of the event. */
  description: string;
  /** A kind of device this event switches on when it happens. */
  switchesOn?: "stove" | "light";
  /** What Jarvis offers on the call. */
  offer: string;
};

export const PROPS: Prop[] = [
  {
    key: "red_bull_can",
    label: "Red Bull can",
    look: "a Red Bull energy drink can: a slim blue and silver can with a red and yellow logo",
    standsFor: "Gas stove left on",
    eventType: "stove_on",
    description: "The gas stove appears to be on",
    switchesOn: "stove",
    offer: "Offer to turn the stove off.",
  },
  {
    key: "black_box",
    label: "Black box",
    look: "a plain black box, such as a small black cardboard or plastic box",
    standsFor: "Car in the driveway",
    eventType: "vehicle_in_driveway",
    description: "A car is in the driveway",
    offer: "Offer to turn on the porch light.",
  },
];

export const propByKey = (key: unknown) => PROPS.find((prop) => prop.key === key) ?? null;
export const propByEventType = (type: unknown) => PROPS.find((prop) => prop.eventType === type) ?? null;
