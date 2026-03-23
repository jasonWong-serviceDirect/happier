import { createEnergyVad, DEFAULT_ENERGY_VAD_CONFIG, type EnergyVadConfig, type EnergyVadEvent } from './energyVad';

/**
 * Neural VAD that uses Silero speech probability from the native audio module.
 * Falls back to energy VAD when neural probability is unavailable (-1).
 *
 * Same interface as EnergyVad so it's a drop-in replacement.
 */

export type NeuralVadConfig = {
  /** Probability threshold to trigger speech_start (0.0–1.0). */
  speechThreshold: number;
  /** Probability below which silence frames are counted (0.0–1.0). */
  silenceThreshold: number;
  /** Minimum consecutive speech frames before speech_start fires. */
  minSpeechFrames: number;
  /** Consecutive silence frames after speech to trigger speech_end. */
  maxSilenceFrames: number;
  /** Number of frames to buffer before speech_start for pre-speech padding. */
  preSpeechPadFrames: number;
  /** Energy VAD config for fallback when neural prob is unavailable. */
  energyFallback: EnergyVadConfig;
};

export const DEFAULT_NEURAL_VAD_CONFIG: NeuralVadConfig = {
  speechThreshold: 0.5,
  silenceThreshold: 0.35,
  minSpeechFrames: 2,
  maxSilenceFrames: 22,
  preSpeechPadFrames: 10,
  energyFallback: DEFAULT_ENERGY_VAD_CONFIG,
};

export type NeuralVad = {
  pushFrame(pcmBytes: Uint8Array, speechProbability: number): EnergyVadEvent | null;
  reset(): void;
};

export function createNeuralVad(config: NeuralVadConfig): NeuralVad {
  const energyVad = createEnergyVad({
    ...config.energyFallback,
    maxSilenceFrames: config.maxSilenceFrames,
    minSpeechFrames: config.minSpeechFrames,
  });

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
    energyVad.reset();
  };

  const pushFrame = (pcmBytes: Uint8Array, speechProbability: number): EnergyVadEvent | null => {
    // Fallback to energy VAD when neural probability is unavailable.
    if (speechProbability < 0) {
      return energyVad.pushFrame(pcmBytes);
    }

    const isSpeech = speechProbability >= (state === 'waiting' ? config.speechThreshold : config.silenceThreshold);

    if (state === 'waiting') {
      preSpeechBuffer.push(pcmBytes);
      while (preSpeechBuffer.length > config.preSpeechPadFrames) {
        preSpeechBuffer.shift();
      }

      if (isSpeech) {
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

    if (isSpeech) {
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
