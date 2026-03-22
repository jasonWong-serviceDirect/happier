import { getOptionalHappierAudioStreamNativeModule } from '@happier-dev/audio-stream-native';
import { decodeBase64 } from '@/encryption/base64';
import { createEnergyVad, DEFAULT_ENERGY_VAD_CONFIG, type EnergyVad } from '@/voice/input/energyVad';
import { encodePcm16leFramesToWav } from '@/voice/input/encodePcm16leToWav';
import { transcribeRecordedAudioWithHttpStt } from '@/voice/input/HttpSttController';

type StatePatch = {
  status?: 'idle' | 'recording' | 'transcribing' | 'sending' | 'speaking' | 'error';
  sessionId?: string | null;
  error?: string | null;
};

type AudioStreamFrameEvent = {
  streamId: string;
  pcm16leBase64: string;
  sampleRate: number;
  channels: number;
};

type AudioStreamModuleLike = {
  start(params: { sampleRate: number; channels: number; frameMs: number }): Promise<{ streamId: string }>;
  stop(params: { streamId: string }): Promise<void>;
  addListener(eventName: 'audioFrame', cb: (event: AudioStreamFrameEvent) => void): { remove(): void };
};

type HttpStreamingHandle = {
  sessionId: string;
  streamId: string;
  subscriptions: { remove(): void }[];
  vad: EnergyVad;
  collectedFrames: Uint8Array[];
  hasSpeech: boolean;
};

export type HttpStreamingSttController = Readonly<{
  clearHandsFreeSession: (sessionId?: string) => void;
  isHandsFreeSession: (sessionId: string) => boolean;
  setHandsFreeSession: (sessionId: string | null) => void;
  start: (sessionId: string) => Promise<void>;
  stop: (sessionId: string) => Promise<string>;
}>;

function getOptionalAudioStreamModule(): AudioStreamModuleLike | null {
  return (getOptionalHappierAudioStreamNativeModule() as unknown as AudioStreamModuleLike | null) ?? null;
}

export function createHttpStreamingSttController(deps: {
  setState: (patch: StatePatch) => void;
  getSettings: () => any;
  canAutoStopTurn?: () => boolean;
  onAutoStopTurn?: (sessionId: string) => void;
  onSpeechStart?: (sessionId: string) => void;
}): HttpStreamingSttController {
  let handle: HttpStreamingHandle | null = null;
  let handsFreeSessionId: string | null = null;

  const clearHandsFreeSession = (sessionId?: string) => {
    if (sessionId && handsFreeSessionId && handsFreeSessionId !== sessionId) return;
    handsFreeSessionId = null;
  };

  const clearHandle = async () => {
    const h = handle;
    if (!h) return;
    handle = null;
    try {
      h.subscriptions.forEach((s) => s.remove());
    } catch {
      // ignore
    }
    const audioStream = getOptionalAudioStreamModule();
    if (audioStream) {
      try {
        await audioStream.stop({ streamId: h.streamId });
      } catch {
        // ignore
      }
    }
  };

  const start = async (sessionId: string) => {
    // Permission is pre-granted via Android settings.
    // The Expo requestRecordingPermissionsAsync() call can hang on some builds,
    // so we skip it and go straight to recording setup.

    await clearHandle();

    const audioStream = getOptionalAudioStreamModule();
    if (!audioStream) {
      deps.setState({ status: 'idle', sessionId: null, error: 'audio_stream_unavailable' });
      return;
    }

    const settings = deps.getSettings();
    const voice = settings?.voice ?? null;
    const providerId = voice?.providerId;
    const adapter =
      providerId === 'local_direct'
        ? voice?.adapters?.local_direct
        : voice?.adapters?.local_conversation ?? voice?.adapters?.local_direct;
    const endpointing = adapter?.handsFree?.endpointing ?? {};
    const silenceMs = typeof endpointing?.silenceMs === 'number' ? endpointing.silenceMs : 450;
    const minSpeechMs = typeof endpointing?.minSpeechMs === 'number' ? endpointing.minSpeechMs : 120;
    const frameMs = 20;

    const vadConfig = {
      ...DEFAULT_ENERGY_VAD_CONFIG,
      maxSilenceFrames: Math.max(1, Math.round(silenceMs / frameMs)),
      minSpeechFrames: Math.max(1, Math.round(minSpeechMs / frameMs)),
    };

    const sampleRate = 16000;
    const channels = 1;

    const { streamId } = await audioStream.start({ sampleRate, channels, frameMs });
    const vad = createEnergyVad(vadConfig);

    const subscriptions: { remove(): void }[] = [];
    subscriptions.push(
      audioStream.addListener('audioFrame', (event) => {
        if (!handle || handle.sessionId !== sessionId || handle.streamId !== event.streamId) return;

        let pcmBytes: Uint8Array;
        try {
          pcmBytes = decodeBase64(String(event.pcm16leBase64 ?? ''));
        } catch {
          return;
        }

        const vadEvent = handle.vad.pushFrame(pcmBytes);

        if (vadEvent?.kind === 'speech_start') {
          deps.onSpeechStart?.(sessionId);
        }

        if (vadEvent?.kind === 'speech_end') {
          handle.collectedFrames = vadEvent.frames;
          handle.hasSpeech = true;
          if (handsFreeSessionId === sessionId) {
            if (deps.canAutoStopTurn && !deps.canAutoStopTurn()) return;
            deps.onAutoStopTurn?.(sessionId);
          }
        }
      }),
    );

    handle = {
      sessionId,
      streamId,
      subscriptions,
      vad,
      collectedFrames: [],
      hasSpeech: false,
    };
    deps.setState({ status: 'recording', sessionId, error: null });
  };

  const stop = async (sessionId: string): Promise<string> => {
    if (!handle || handle.sessionId !== sessionId) return '';
    const current = handle;

    try {
      current.subscriptions.forEach((s) => s.remove());
    } catch {
      // ignore
    }

    const audioStream = getOptionalAudioStreamModule();
    if (audioStream) {
      try {
        await audioStream.stop({ streamId: current.streamId });
      } catch {
        // ignore
      }
    }

    if (handle && handle.sessionId === sessionId) {
      handle = null;
    }

    if (!current.hasSpeech || current.collectedFrames.length === 0) {
      return '';
    }

    try {
      const wav = encodePcm16leFramesToWav({
        frames: current.collectedFrames,
        sampleRate: 16000,
        channels: 1,
      });
      const { File, Paths } = await import('expo-file-system');
      const file = new File(Paths.cache, `happier-vad-${Date.now()}.wav`);
      await file.write(new Uint8Array(wav));
      const settings = deps.getSettings();
      const text = await transcribeRecordedAudioWithHttpStt({ uri: file.uri, settings });
      try {
        file.delete();
      } catch {
        // ignore
      }
      return text ?? '';
    } catch {
      return '';
    }
  };

  return {
    clearHandsFreeSession,
    isHandsFreeSession: (sessionId: string) => handsFreeSessionId === sessionId,
    setHandsFreeSession: (sessionId: string | null) => {
      handsFreeSessionId = sessionId;
    },
    start,
    stop,
  };
}
