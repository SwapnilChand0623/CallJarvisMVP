// Entry point for other server code. The iMessage handler resolves its verified sender to an Actor
// (origin "imessage") and calls runAction with the same contract the voice tools use.
export { runAction, buildContext } from "./actions";
export { ACTIONS, ACTION_NAMES } from "./contract";
export type { ActionSpec } from "./contract";
export { resolveActor, createVoiceHandler } from "./handler";
export { voiceConfig } from "./config";
export type { ActionResult, Actor, Deps, HomeService, Store } from "./types";
