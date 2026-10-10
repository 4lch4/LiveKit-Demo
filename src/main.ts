import { ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
import { EnhancerModel, audioEnhancement } from '@livekit/plugins-ai-coustics';
import dotenv from 'dotenv';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAgent } from './agent.ts';

// Load environment variables from a local file.
// Make sure to set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET
// when running locally or self-hosting your agent server.
//
// Resolved relative to this module, not the process working directory, so the
// worker finds the same file no matter where it was launched from. A missing
// file is not an error: in Docker the values come from the real environment and
// dotenv leaves them untouched.
dotenv.config({ path: join(import.meta.dirname, '..', '.env.local') });

export default defineAgent({
  entry: async (ctx) => {
    // Set up a voice AI pipeline using AssemblyAI, Fish Audio, and the LiveKit turn detector
    const session = new voice.AgentSession({
      // Speech-to-text (STT) is your agent's ears, turning the user's speech into text that the LLM can understand
      // See all available models at https://docs.livekit.io/agents/models/stt/
      stt: new inference.STT({
        // Deepgram Nova-3 at roughly $0.0048/min, versus AssemblyAI's rate. The
        // whole project runs on $2.50 of inference credit, so this is the single
        // biggest lever on how many test minutes remain. See
        // docs/agents/architecture.md.
        model: 'deepgram/nova-3',
        language: 'en',
      }),

      // Text-to-speech (TTS) is your agent's voice, turning the LLM's text into speech that the user can hear
      // See all available models as well as voice selections at https://docs.livekit.io/agents/models/tts/
      tts: new inference.TTS({
        // Rime Mist v3. Free at Build-plan pricing, against roughly $0.008/min
        // for Fish Audio s2.1-pro. Note that Rime does not declare a markup
        // dialect, which is why expressive mode is off below.
        model: 'rime/mistv3',
        voice: 'astra',
      }),

      turnHandling: {
        // Turn detection determines when the user is speaking and when the agent should respond.
        // The LiveKit audio turn detector is a multimodal model that encodes the user's audio
        // directly to predict end of turn. It's built into the SDK (no extra plugin) and
        // AgentSession supplies the required VAD automatically.
        // See more at https://docs.livekit.io/agents/logic/turns/turn-detector/
        turnDetection: new inference.TurnDetector(),
        // Adaptive interruptions use the turn detector to tell a real interruption from a
        // backchannel like "mhm" or "right", so the agent keeps talking through the latter.
        interruption: { mode: 'adaptive' },
        // Allow the LLM to generate a response while waiting for the end of turn
        preemptiveGeneration: { enabled: true },
      },

      // Expressive mode injects the TTS provider's markup guide into the LLM prompt, so the model
      // emits inline delivery tags (emotion, pacing, non-verbal sounds) that the TTS renders and
      // the transcript never shows. It requires a TTS model that declares a markup dialect, and
      // the supported list is Fish Audio s2.1-pro, Inworld tts-2, Cartesia Sonic, and Gemini
      // flash tts. Rime is not among them, so this is off while TTS is Rime.
      // See https://docs.livekit.io/agents/models/tts/expressive/
      //
      // Turning this off is the cost of the cheap model set. It also removes a
      // whole class of failure, since injected markup can reach the transcript
      // if a provider does not support it. Re-enable it if the TTS moves back
      // to Fish Audio, and decide then whether it is worth the credit.
      expressive: false,
    });

    // Start the session, which initializes the voice pipeline and warms up the models
    await session.start({
      agent: createAgent(),
      room: ctx.room,
      inputOptions: {
        // ai-coustics QUAIL audio enhancement for noise cancellation
        // Works for both WebRTC and telephony (SIP) participants
        noiseCancellation: audioEnhancement({ model: EnhancerModel.QuailVfS }),
      },
    });

    // // Add a virtual avatar to the session, if desired
    // // For other providers, see https://docs.livekit.io/agents/models/avatar/
    // const avatar = new anam.AvatarSession({
    //   personaConfig: {
    //     name: '...',
    //     avatarId: '...', // See https://docs.livekit.io/agents/models/avatar/plugins/anam
    //   },
    // });
    // // Start the avatar and wait for it to join
    // await avatar.start(session, ctx.room);

    // Join the room and connect to the user
    await ctx.connect();

    // Greet the user on joining
    session.generateReply({
      instructions: 'Greet the user in a helpful and friendly manner.',
    });
  },
});

// Run the agent server
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'on-call',
  }),
);
