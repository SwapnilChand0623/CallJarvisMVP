import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_USER_ID, OTHER_USER_ID, demoData, memoryStore } from "../app/api/internal/voice/_lib/store-memory";
import { runAction, buildContext } from "../app/api/internal/voice/_lib/actions";
import { simulatedHomeService } from "../app/api/internal/voice/_lib/home";
import { resolveActor } from "../app/api/internal/voice/_lib/handler";
import { COOLDOWN_MS, createHome } from "./server/home/service";
import { lookForProps, parseSeen } from "./server/home/vision";
import { signedInUser } from "./server/auth";

const FRESH_USER = "50000000-0000-4000-8000-000000000001";
function setup() {
  const data = demoData();
  data.profiles.push({ id: FRESH_USER, displayName: null, timeZone: "America/Chicago" });
  const store = memoryStore(data);
  let clock = Date.now();
  const home = createHome(store, () => clock);
  return { store, home, advance: (ms: number) => { clock += ms; } };
}

test("home: the first visit creates a simulated stove and porch light", async () => {
  const { home } = setup();
  const state = await home.state(FRESH_USER);
  assert.deepEqual(state.devices.map((device) => [device.name, device.kind, device.on, device.simulated]).sort(),
    [["Kitchen stove", "stove", false, true], ["Porch light", "light", false, true]]);
  assert.equal(state.mode, "home");
  assert.equal((await home.state(FRESH_USER)).devices.length, 2, "not created twice");
});

test("home: at Home a prop is logged quietly; Away makes it critical and worth a call", async () => {
  const { home, store, advance } = setup();
  const quiet = await home.trigger(FRESH_USER, "red_bull_can");
  assert.ok(quiet.recorded);
  assert.deepEqual([quiet.event.type, quiet.event.severity, quiet.event.outreachEligible, quiet.willCall], ["stove_on", "low", false, false]);
  assert.equal((await home.state(FRESH_USER)).devices.find((device) => device.kind === "stove")?.on, true, "the stove shows as on");

  await home.setMode(FRESH_USER, "away");
  const blocked = await home.trigger(FRESH_USER, "red_bull_can");
  assert.deepEqual([blocked.recorded, blocked.recorded ? "" : blocked.reason], [false, "cooldown"]);

  const car = await home.trigger(FRESH_USER, "black_box");
  assert.ok(car.recorded);
  assert.deepEqual([car.event.type, car.event.severity, car.event.outreachEligible, car.willCall], ["vehicle_in_driveway", "critical", true, true]);
  assert.match(car.event.description, /A car is in the driveway while the home is set to Away/);
  assert.equal(car.event.source, "simulated");

  advance(COOLDOWN_MS + 1000);
  const again = await home.trigger(FRESH_USER, "red_bull_can");
  assert.ok(again.recorded && again.willCall);
  assert.equal((await home.trigger(FRESH_USER, "teapot")).recorded, false);
  assert.equal(store.data.homeEvents.filter((event) => event.userId === OTHER_USER_ID).length, 0);
});

test("home: reset returns to Home with everything off and nothing waiting to call", async () => {
  const { home } = setup();
  await home.setMode(FRESH_USER, "away");
  await home.trigger(FRESH_USER, "red_bull_can");
  await home.reset(FRESH_USER);
  const state = await home.state(FRESH_USER);
  assert.equal(state.mode, "home");
  assert.ok(state.devices.every((device) => !device.on));
  assert.ok(state.events.every((event) => event.acknowledgedAt));
});

test("home: a device can only be switched by its owner", async () => {
  const { home, store } = setup();
  await home.state(FRESH_USER);
  const stove = store.data.devices.find((device) => device.userId === FRESH_USER && device.kind === "stove")!;
  assert.equal(await home.setDevice(DEMO_USER_ID, stove.id, true), null);
  assert.equal((await home.setDevice(FRESH_USER, stove.id, true))?.on, true);
  assert.equal(await home.setDevice(FRESH_USER, stove.id, "yes"), null);
});

test("jarvis: a call about a home event names it, can switch the stove off and acknowledge it", async () => {
  const { home, store } = setup();
  await home.setMode(FRESH_USER, "away");
  const raised = await home.trigger(FRESH_USER, "red_bull_can");
  assert.ok(raised.recorded);
  store.data.attempts.push({ id: "att-home-1", userId: FRESH_USER, reminderId: null, homeEventId: raised.event.id });
  const deps = { store, home: simulatedHomeService(store) };
  const actor = await resolveActor(store, { attemptId: "att-home-1" }, { demoUserId: "", defaultTimeZone: "UTC" });
  assert.equal(actor?.focusEventId, raised.event.id);

  const context = await buildContext(deps, actor!);
  assert.equal(context.focusEvent?.type, "stove_on");
  assert.equal(context.home.mode, "away");
  assert.equal(context.focusReminder, null);

  const off = await runAction(deps, actor!, "controlDevice", { device: "stove", on: false });
  assert.ok(off.ok);
  assert.equal(store.data.devices.find((device) => device.userId === FRESH_USER && device.kind === "stove")?.on, false);

  const acknowledged = await runAction(deps, actor!, "acknowledgeHomeEvent", {});
  assert.ok(acknowledged.ok);
  assert.ok(store.data.homeEvents.find((event) => event.id === raised.event.id)?.acknowledgedAt);
  const repeat = await runAction(deps, actor!, "acknowledgeHomeEvent", {});
  assert.ok(repeat.ok && repeat.result.alreadyAcknowledged);

  const mode = await runAction(deps, actor!, "setHomeMode", { mode: "home" });
  assert.ok(mode.ok);
  assert.equal(await store.getHomeMode(FRESH_USER), "home");
  assert.equal((await runAction(deps, actor!, "setHomeMode", { mode: "vacation" })).ok, false);
});

test("vision: only the model's final RESULT line counts", () => {
  assert.deepEqual(parseSeen({ outputs: [{ type: "text", text: "RESULT: red_bull_can" }] }), ["red_bull_can"]);
  assert.deepEqual(parseSeen({ output_text: "I can see both.\nRESULT: black_box, red_bull_can" }), ["red_bull_can", "black_box"]);
  assert.deepEqual(parseSeen({ outputs: [{ text: "RESULT: NONE" }] }), []);
  assert.deepEqual(parseSeen({ outputs: [{ text: "There might be a red_bull_can but it is blurry.\nRESULT: NONE" }] }), []);
  const echoed = { steps: [
    { type: "user_input", content: [{ type: "text", text: "- red_bull_can: a can\n- black_box: a box\nAnswer on one line that starts with \"RESULT:\" …" }] },
    { type: "model_output", content: [{ type: "text", text: "RESULT: NONE" }] },
  ] };
  assert.deepEqual(parseSeen(echoed), [], "an echoed question is not a sighting");
  assert.deepEqual(parseSeen(null), []);
  assert.deepEqual(parseSeen({ outputs: [{ text: "red_bull_can" }] }), [], "no RESULT line, no sighting");
});

test("vision: sends one frame to Gemini and guards size, rate and configuration", async () => {
  const calls: { url: string; body: Record<string, unknown>; key: string }[] = [];
  const fetcher = (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), key: (init.headers as Record<string, string>)["x-goog-api-key"] });
    return Response.json({ outputs: [{ type: "text", text: "RESULT: black_box" }] });
  }) as typeof fetch;
  let clock = 5_000_000;
  const env = { GEMINI_API_KEY: "g-key" };
  const look = (image: unknown, user = "u1") => lookForProps(user, image, env, fetcher, () => clock);

  assert.deepEqual(await look("data:image/jpeg;base64,QUJD"), { ok: true, seen: ["black_box"] });
  assert.equal(calls[0].url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert.equal(calls[0].key, "g-key");
  const input = calls[0].body.input as { type: string; data?: string; mime_type?: string }[];
  assert.deepEqual([input[1].type, input[1].data, input[1].mime_type], ["image", "QUJD", "image/jpeg"]);
  assert.equal(calls[0].body.store, false);

  assert.deepEqual(await look("QUJD"), { ok: false, status: 429, code: "too_many_requests" });
  clock += 2000;
  assert.equal((await look("not base64!!")).ok, false);
  assert.equal((await look(42)).ok, false);
  assert.deepEqual(await look("A".repeat(600_000)), { ok: false, status: 413, code: "image_too_large" });
  assert.deepEqual(await lookForProps("u2", "QUJD", {}, fetcher), { ok: false, status: 503, code: "vision_not_configured" });
  assert.equal(calls.length, 1, "refused requests never reach Gemini");
});

test("sign-in: only a token Supabase accepts identifies a user", async () => {
  const env = { SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub" };
  const fetcher = (async (_url: string | URL, init: RequestInit = {}) =>
    (init.headers as Record<string, string>).Authorization === "Bearer aaa.bbb.ccc" ? Response.json({ id: "user-9" }) : Response.json({}, { status: 401 })) as typeof fetch;
  const request = (token: string) => new Request("http://x/api/home", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(await signedInUser(request("aaa.bbb.ccc"), env, fetcher), "user-9");
  assert.equal(await signedInUser(request("xxx.yyy.zzz"), env, fetcher), null);
  assert.equal(await signedInUser(request("not-a-jwt"), env, fetcher), null);
  assert.equal(await signedInUser(request("aaa.bbb.ccc"), {}, fetcher), null);
});

test("home: the stove on while Away is a critical alert, whichever happens second", async () => {
  // Stove first, then Away.
  const first = setup();
  await first.home.state(FRESH_USER);
  const stove = first.store.data.devices.find((device) => device.userId === FRESH_USER && device.kind === "stove")!;
  await first.home.setDevice(FRESH_USER, stove.id, true);
  assert.equal(first.store.data.homeEvents.filter((event) => event.userId === FRESH_USER).length, 0, "nothing to report at Home");
  await first.home.setMode(FRESH_USER, "away");
  const [alert] = (await first.home.state(FRESH_USER)).events;
  assert.deepEqual([alert.type, alert.severity, alert.outreachEligible], ["stove_on", "critical", true]);
  assert.match(alert.description, /stove appears to be on while the home is set to Away/);

  // Away first, then the stove. Switching it off and on again does not stack a second alert.
  const second = setup();
  await second.home.setMode(FRESH_USER, "away");
  assert.equal((await second.home.state(FRESH_USER)).events.length, 0);
  const other = second.store.data.devices.find((device) => device.userId === FRESH_USER && device.kind === "stove")!;
  await second.home.setDevice(FRESH_USER, other.id, true);
  await second.home.setDevice(FRESH_USER, other.id, false);
  await second.home.setDevice(FRESH_USER, other.id, true);
  const critical = () => second.store.data.homeEvents.filter((event) => event.userId === FRESH_USER && event.severity === "critical");
  assert.equal(critical().length, 1);

  // Once it is acknowledged (here by Reset), the same thing happening again is a new alert straight away.
  await second.home.reset(FRESH_USER);
  await second.home.setDevice(FRESH_USER, other.id, true);
  await second.home.setMode(FRESH_USER, "away");
  assert.equal(critical().length, 2);

  // The porch light is not an alert.
  const light = second.store.data.devices.find((device) => device.userId === FRESH_USER && device.kind === "light")!;
  await second.home.setDevice(FRESH_USER, light.id, true);
  assert.equal(critical().length, 2);
});

test("home: a quiet stove entry made at Home does not hold back the alert when the home goes Away", async () => {
  const { home, store } = setup();
  await home.trigger(FRESH_USER, "red_bull_can");
  await home.setMode(FRESH_USER, "away");
  const events = store.data.homeEvents.filter((event) => event.userId === FRESH_USER);
  assert.deepEqual(events.map((event) => event.severity).sort(), ["critical", "low"]);
});

test("jarvis: setting Away by voice with the stove on raises the same alert", async () => {
  const { home, store } = setup();
  await home.state(FRESH_USER);
  const deps = { store, home: simulatedHomeService(store) };
  const actor = { userId: FRESH_USER, timeZone: "America/Chicago", displayName: null, focusReminderId: null, focusEventId: null, origin: "voice" as const };
  assert.ok((await runAction(deps, actor, "controlDevice", { device: "stove", on: true })).ok);
  assert.equal(store.data.homeEvents.filter((event) => event.userId === FRESH_USER).length, 0);
  assert.ok((await runAction(deps, actor, "setHomeMode", { mode: "away" })).ok);
  assert.deepEqual(store.data.homeEvents.filter((event) => event.userId === FRESH_USER).map((event) => [event.type, event.severity]), [["stove_on", "critical"]]);
});

test("camera: only the owner of a live critical alert call gets a publish-only token for that call's room", async () => {
  const { cameraSession } = await import("./server/home/camera");
  const { store } = setup();
  const env = { LIVEKIT_URL: "wss://lk.example", LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret" };
  const call = (patch: object) => ({ id: "aaaaaaaa-0000-4000-8000-000000000001", userId: FRESH_USER, stage: "initial", status: "accepted", errorCode: null,
    simulated: false, createdAt: new Date().toISOString(), outcomeAt: null,
    about: { kind: "home_event" as const, text: "The gas stove appears to be on", at: null, priority: "critical" }, ...patch });
  assert.deepEqual(await cameraSession(store, FRESH_USER, env), { live: false }, "no call, no token");

  store.data.callAttempts.push(call({}));
  const session = await cameraSession(store, FRESH_USER, env);
  assert.ok(session.live);
  assert.deepEqual([session.url, session.room], ["wss://lk.example", "cj-aaaaaaaa000040008000000000000001"]);
  const claims = JSON.parse(Buffer.from(session.token.split(".")[1], "base64url").toString());
  assert.deepEqual([claims.video.room, claims.video.canSubscribe, claims.sub], [session.room, false, "home-camera-50000000"]);

  assert.deepEqual(await cameraSession(store, OTHER_USER_ID, env), { live: false }, "another user's call is not offered");
  assert.deepEqual(await cameraSession(store, FRESH_USER, { ...env, ALERT_VIDEO: "0" }), { live: false });
  assert.deepEqual(await cameraSession(store, FRESH_USER, { LIVEKIT_URL: "wss://lk.example" }), { live: false }, "not configured");

  store.data.callAttempts.length = 0;
  store.data.callAttempts.push(call({ status: "completed" }), call({ about: { kind: "reminder", text: "Meds", at: null, priority: "critical" } }));
  assert.deepEqual(await cameraSession(store, FRESH_USER, env), { live: false }, "ended calls and reminder calls have no camera");
});

test("camera: a call on which the user asked to see the camera gets a token for that call's room", async () => {
  const { cameraSession } = await import("./server/home/camera");
  const { store } = setup();
  const env = { LIVEKIT_URL: "wss://lk.example", LIVEKIT_API_KEY: "key", LIVEKIT_API_SECRET: "secret" };
  const ask = (event: string, room: string | null) => store.insertCallEvent(FRESH_USER, { attemptId: null, callId: "call-1", direction: "inbound", event, summary: "", room });
  await ask("camera_on", "room-abc");
  const session = await cameraSession(store, FRESH_USER, env);
  assert.ok(session.live);
  assert.equal(session.room, "room-abc");
  const claims = JSON.parse(Buffer.from(session.token.split(".")[1], "base64url").toString());
  assert.deepEqual([claims.video.room, claims.video.canSubscribe, claims.video.canPublishSources], ["room-abc", false, ["camera"]]);
  assert.deepEqual(await cameraSession(store, OTHER_USER_ID, env), { live: false });

  await ask("camera_off", "room-abc");
  assert.deepEqual(await cameraSession(store, FRESH_USER, env), { live: false });
  await ask("camera_on", "not a room name!");
  assert.deepEqual(await cameraSession(store, FRESH_USER, env), { live: false }, "a malformed room is never signed");
});
