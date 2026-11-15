# CallJarvis voice agent

A voice agent you can call on FaceTime through Chert. It is a standalone Node
application built on LiveKit Agents and Gemini 3.8 Live. Node 22.23.2 or later, Node 24 or Node 26 is required.

## Run it

1. Install it:
   ```sh
   npm install
   ```
2. If `.env.local` is missing, create it. Replace each `YOUR_` placeholder:
   ```sh
   cp .env.example .env.local && chmod 600 .env.local
   ```
   The three LiveKit values come from one LiveKit Cloud project (Settings, API
   keys). Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey)
   and put it in `GEMINI_API_KEY`. Set `AGENT_NAME` to a
   name no other team uses. This repository defaults to `calljarvis`.
   Edit the file locally and keep it out of Git and chat.
3. Terminal 1, your agent:
   ```sh
   npm start
   ```
   If another local worker already uses port 8081, run
   `node --env-file=.env.local agent.mjs dev` to use an available port.
4. Terminal 2, in this same folder, puts the agent on your FaceTime line:
   ```sh
   npx --yes @trychert/facetime@0.1.0-beta.21 setup --env-file .env.local --project 3d96bf28-5aff-479c-b645-d3f150bebac3
   npx --yes @trychert/facetime@0.1.0-beta.21 doctor --agent calljarvis --env-file .env.local
   npx --yes @trychert/facetime@0.1.0-beta.21 dev --agent calljarvis --env-file .env.local
   ```
   `chert dev` reads the LiveKit values and `AGENT_NAME` from `.env.local`.
5. When `chert dev` says Jarvis is in a waiting room, make a **FaceTime Audio**
   call from your verified phone to the line shown. Wait for Jarvis to greet you,
   then speak and check that it answers. Stop `chert dev` with Ctrl+C when done.

`chert doctor` checks sign-in, keys, the line and the Mac behind it.
`chert doctor --agent NAME` also sends the agent a real test job.

For Jarvis's avatar, set `JARVIS_VIDEO=1`, restart the agent, then call the
line using **FaceTime Video**. The caller sees a glowing core with a voice line
through it. It breathes while idle and pulses while Jarvis speaks. It is teal
normally and red when a critical reminder is overdue. The look is drawn in
`avatar.mjs`. Caller-camera input stays disabled, and outbound reminder calls
are audio only, so they show no avatar.

When testing callbacks on the same line, end the inbound call and stop
`chert dev` to release the line. Keep the agent, app, and scheduler running.
Temporary readiness failures leave the callback pending for a later retry.
The account's daily call limit also applies; currently simulated attempts count
toward that limit.

## Test the Gemini Interactions API

Set `GEMINI_API_KEY` in `.env.local` and run `npm run gemini:check` from this
folder. The command sends one short text prompt to Gemini 4 Hydrogen and prints
the reply. This check runs independently of FaceTime and LiveKit.

## Voice actions

Jarvis changes reminders and lights through the CallJarvis server, never
directly. At the start of each call the worker sends the call's identifiers to
`POST /api/internal/voice`; the server decides which user the call belongs to
and returns that user's context and the tool list. The model cannot choose a
user. See the [endpoint and tool contract](../src/app/api/internal/voice/README.md).

Set `VOICE_API_URL` and `VOICE_TOOL_TOKEN` in `.env.local`. The token must match
`VOICE_TOOL_TOKEN` on the server. Without them, or when the server refuses the
call, Jarvis still talks but has no tools and says it cannot save anything.

Run `npm test` for the worker's unit tests and `npm run test:e2e` to drive the
worker's tools against the endpoint with fixture data. Neither needs keys.

For a proactive call, the outreach service dispatches this agent with the
metadata `{"outbound":true,"attemptId":"…",…}`. The worker then opens its
session at once, so its audio track is published before Chert dials, and stays
silent. It listens to the bridge participant `chert-bridge-<attempt id>` and
greets when the outreach service writes `{"chert_bridge_ready":true}` into the
room metadata, the same signal `chert dev` gives inbound calls. It sends the
server only the attempt ID; the user and reminder are looked up from it.

## Change it

Edit Jarvis's instructions and greeting in `prompt.mjs`. Keep the greeting
to one short sentence. There is no automatic reload: end
the call, stop `chert dev` with Ctrl+C, restart `npm start`, then run `chert dev`
again. Otherwise a waiting room can still hold the old code.

## Call behavior

- It joins the room Chert prepares, waits for the caller, then opens one model
  session. Chert removes the room after the call.
- It greets once, when `chert dev` writes `"chert_bridge_ready": true` into the
  room metadata (`greet.mjs`): the Mac ends a call that hears nothing from the
  agent within 10 seconds of FaceTime being ready (`remote_audio_timeout`). It
  never greets just because the caller joined. Without the signal it does not
  greet, and you speak first.
- This worker handles inbound audio. Proactive calls require a backend that
  prepares an audio-publishing agent in a LiveKit room, creates the call using
  the Chert project API key and an outbound-enabled line, and activates the
  greeting on `bridge_ready`. See [Chert's outbound guide](https://docs.trychert.com/facetime/outbound).
- The waiting room shows that the agent joined LiveKit. It does not verify the
  model key or the media path. The first call does.
- Two credentials do different jobs. `chert login` lets this computer use your
   Chert project. `.env.local` lets the agent and `chert dev` use your LiveKit
   project, and the agent use Gemini Live. Never commit or share `.env.local`.
- LiveKit and model usage may cost money.

References: [LiveKit named dispatch](https://docs.livekit.io/agents/server/agent-dispatch/)
and the [Gemini Live plugin](https://docs.livekit.io/agents/models/realtime/gemini/).
