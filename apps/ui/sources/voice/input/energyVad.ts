export type EnergyVadConfig = {
  speechThreshold: number;
  silenceThreshold: number;
  preSpeechPadFrames: number;
  maxSilenceFrames: number;
  minSpeechFrames: number;
};

export const DEFAULT_ENERGY_VAD_CONFIG: EnergyVadConfig = {
  speechThreshold: 300,
  silenceThreshold: 150,
  preSpeechPadFrames: 10,
  maxSilenceFrames: 22,
  minSpeechFrames: 6,
};

export type EnergyVadEvent =
  | { kind: 'speech_start' }
  | { kind: 'speech_end'; frames: Uint8Array[] };

export type EnergyVad = {
  pushFrame(pcmBytes: Uint8Array): EnergyVadEvent | null;
  reset(): void;
};

export function computeFrameRms(pcm16leBytes: Uint8Array): number {
  const sampleCount = pcm16leBytes.byteLength >>> 1;
  if (sampleCount === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < pcm16leBytes.byteLength - 1; i += 2) {
    const lo = pcm16leBytes[i]!;
    const hi = pcm16leBytes[i + 1]!;
    const sample = (hi << 8) | lo;
    const signed = sample >= 0x8000 ? sample - 0x10000 : sample;
    sumSq += signed * signed;
  }
  return Math.sqrt(sumSq / sampleCount);
}

export function createEnergyVad(config: EnergyVadConfig): EnergyVad {
  let state: 'waiting' | 'in_speech' = 'waiting';
  const preSpeechBuffer: Uint8Array[] = [];
  let speechFrames: Uint8Array[] = [];
  let speechFrameCount = 0;
  let silenceFrameCount = 0;

  const reset = () => {
    state = 'waiting';
    preSpeechBuffer.length = 0;
    speechFrames = [];
    speechFrameCount = 0;
    silenceFrameCount = 0;
  };

  const pushFrame = (pcmBytes: Uint8Array): EnergyVadEvent | null => {
    const rms = computeFrameRms(pcmBytes);

    if (state === 'waiting') {
      preSpeechBuffer.push(pcmBytes);
      while (preSpeechBuffer.length > config.preSpeechPadFrames) {
        preSpeechBuffer.shift();
      }

      if (rms >= config.speechThreshold) {
        state = 'in_speech';
        speechFrames = [...preSpeechBuffer];
        preSpeechBuffer.length = 0;
        speechFrameCount = 1;
        silenceFrameCount = 0;
        return { kind: 'speech_start' };
      }

      return null;
    }

    // state === 'in_speech'
    speechFrames.push(pcmBytes);

    if (rms >= config.silenceThreshold) {
      speechFrameCount++;
      silenceFrameCount = 0;
    } else {
      silenceFrameCount++;
    }

    if (silenceFrameCount >= config.maxSilenceFrames && speechFrameCount >= config.minSpeechFrames) {
      const frames = speechFrames;
      reset();
      return { kind: 'speech_end', frames };
    }

    return null;
  };

  return { pushFrame, reset };
}
