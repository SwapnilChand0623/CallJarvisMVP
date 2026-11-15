import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-google';
import { TrackPublishOptions, TrackSource } from '@livekit/rtc-node';
import { isCritical } from './avatar.mjs';
import { publishAvatar } from './camera.mjs';
import { parseCallContext } from './call-context.mjs';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';
import { buildGreeting, buildInstructions } from './prompt.mjs';
import { buildTools } from './tools.mjs';
import { createVoiceApi } from './voice-api.mjs';

// Jarvis's wording lives in prompt.mjs. The tools come from the server (VOICE_API_URL) at the start of each call.
const voiceApi = createVoiceApi();
if (!voiceApi) console.warn('[jarvis] VOICE_API_URL or VOICE_TOOL_TOKEN is not set: calls run without tools.');

/** Loads what the server lets this caller see. Bounded so a slow server cannot delay the greeting. */
async function startSession(call) {
  if (!voiceApi) return null;
  const started = await voiceApi(call, 'session.start', {}, 3000);
  if (started.ok) return started.result;
  console.warn(`[jarvis] no tools on this call: ${started.error.code}`);
  return null;
}

const agent = defineAgent({
  entry: async ctx => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    const call = parseCallContext(ctx.job?.metadata, ctx.room?.name);
    const context = startSession(call);
    // Inbound: Chert prepares a room before a caller exists. Join promptly so Chert can find us, but wait for the
    // caller before opening a paid model session. Doctor jobs may end without a caller ever joining.
    // Outbound: Chert needs our audio track published before it dials, so the session opens first and stays silent
    // until bridge_ready.
    // On FaceTime Video calls the caller sees Jarvis's avatar. It is published before waiting for the caller.
    let avatar = null;
    if (call.direction === 'inbound' && call.video && process.env.JARVIS_VIDEO === '1') {
      try {
        avatar = await publishAvatar(ctx);
      } catch (error) {
        console.warn('[jarvis] avatar unavailable:', error instanceof Error ? error.message : String(error));
      }
    }
    const identity = call.direction === 'outbound' ? call.bridgeIdentity : (await ctx.waitForParticipant()).identity;
    const loaded = await context;
    // Red when the call is about a critical reminder, or one is overdue; teal otherwise.
    avatar?.setCritical(isCritical(loaded));
    const instructions = buildInstructions(loaded);
    const tools = loaded ? buildTools(loaded.tools, (action, args) => voiceApi(call, action, args)) : {};

    const session = new voice.AgentSession({
      llm: new realtime.RealtimeModel({
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model: 'gemini-3.8-live',
        voice: 'Puck',
        instructions,
      }),
    });
    ctx.addShutdownCallback(() => session.close());
    // The avatar pulses while Jarvis is speaking.
    if (avatar) session.on('agent_state_changed', event => avatar.setSpeaking(event.newState === 'speaking'));
    if (call.direction === 'outbound') {
      // RoomIO waits for the caller before publishing its default audio output.
      // Chert needs the track before dialing, so publish the session's output now.
      const output = new voice.ParticipantAudioOutput(ctx.room, {
        sampleRate: 24000,
        numChannels: 1,
        queueSizeMs: 200,
        trackPublishOptions: new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
      });
      const publishing = new AbortController();
      session.output.audio = output;
      ctx.addShutdownCallback(async () => {
        publishing.abort();
        await output.close();
      });
      // start() publishes the track and then waits for Chert to subscribe.
      void output.start(publishing.signal).catch(error => {
        if (!publishing.signal.aborted) console.error('[jarvis] outbound audio publish failed:', error);
      });
    }
    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions, tools }),
      record: false,
      inputOptions: {
        ...(identity ? { participantIdentity: identity } : {}),
        audioEnabled: true,
        videoEnabled: false,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Greet once when FaceTime is ready (chert_bridge_ready in the room metadata): the Mac ends the call if it hears
    // nothing within 10 seconds of that. Participant arrival alone is not readiness, so there is no greeting on it.
    // Without the signal there is no greeting, and the other side speaks first. For outbound calls the backend
    // writes the same room metadata when Chert reports bridge_ready.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => session.generateReply({ instructions: buildGreeting(loaded, call) }),
      // Calls accepted through the webhook rely on the server's polling for readiness. If that signal is lost,
      // greet 6 seconds after the session opens, inside the Mac's 10-second window.
      { fallbackMs: call.accepted ? 6000 : 0 });
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'calljarvis' });
