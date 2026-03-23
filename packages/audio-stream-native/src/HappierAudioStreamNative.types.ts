export type AudioStreamFrameEvent = Readonly<{
  streamId: string;
  pcm16leBase64: string;
  sampleRate: number;
  channels: number;
  /** Silero VAD speech probability (0.0–1.0). -1 if VAD is unavailable. */
  speechProbability: number;
}>;

export type HappierAudioStreamNativeModule = Readonly<{
  start: (params: { sampleRate: number; channels: number; frameMs: number }) => Promise<{ streamId: string }>;
  stop: (params: { streamId: string }) => Promise<void>;
  addListener: (
    eventName: 'audioFrame',
    cb: (event: AudioStreamFrameEvent) => void,
  ) => Readonly<{ remove: () => void }>;
}>;

