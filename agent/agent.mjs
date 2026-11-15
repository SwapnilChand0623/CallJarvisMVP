import { fileURLToPath } from 'node:url';
import { AutoSubscribe, defineAgent, voice } from '@livekit/agents';
import { realtime } from '@livekit/agents-plugin-google';
import { runAgent } from './chert-rooms.mjs';
import { greetOnBridgeReady } from './greet.mjs';

// Change these instructions to build your own agent. Keep replies conversational.
const instructions = `You are Jarvis, the CallJarvis AI assistant speaking over FaceTime.
Help the caller clarify a task or reminder. Ask one question at a time and keep replies brief.
This is a voice test. Be clear that you are an AI and never claim a reminder was saved.`;
// Said once, as soon as FaceTime is ready. Keep it short: it is the first thing the caller hears.
const greeting = 'Greet the caller in one short sentence: introduce yourself as Jarvis, an AI assistant, and ask how you can help.';

const agent = defineAgent({
  entry: async ctx => {
    await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    // Chert prepares a room before a caller exists. Join promptly so Chert can
    // find us, but wait before opening a paid model session. Doctor jobs may end
    // without a caller ever joining.
    const caller = await ctx.waitForParticipant();
    const session = new voice.AgentSession({
      llm: new realtime.RealtimeModel({
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        model: 'gemini-3.8-live',
        voice: 'Puck',
        instructions,
      }),
    });
    ctx.addShutdownCallback(() => session.close());
    await session.start({
      room: ctx.room,
      agent: new voice.Agent({ instructions }),
      record: false,
      inputOptions: {
        participantIdentity: caller.identity,
        audioEnabled: true,
        videoEnabled: false,
        textEnabled: false,
        closeOnDisconnect: true,
        deleteRoomOnClose: false,
      },
      outputOptions: { audioEnabled: true, transcriptionEnabled: false },
    });
    // Greet once when chert dev reports that FaceTime is ready (bridge_ready in the
    // room metadata): the Mac ends the call if it hears nothing within 10 seconds
    // of that. Participant arrival alone is not readiness, so there is no greeting
    // on it. Without the signal there is no greeting, and the caller speaks first.
    const stopGreeting = greetOnBridgeReady(ctx.room, () => session.generateReply({ instructions: greeting }));
    ctx.addShutdownCallback(async () => stopGreeting());
  },
});

export default agent;

// Your own LiveKit project when .env.local has its three LIVEKIT_ values; otherwise Chert rooms through chert dev.
runAgent(agent, { file: fileURLToPath(import.meta.url), agentName: process.env.AGENT_NAME || 'calljarvis' });
