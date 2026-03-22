export function encodePcm16leFramesToWav(opts: {
  frames: Uint8Array[];
  sampleRate: number;
  channels: number;
}): ArrayBuffer {
  const { frames, sampleRate, channels } = opts;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  let dataSize = 0;
  for (const f of frames) dataSize += f.byteLength;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      u8[offset + i] = text.charCodeAt(i) & 0xff;
    }
  };

  // RIFF header
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');

  // fmt chunk
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let cursor = 44;
  for (const frame of frames) {
    u8.set(frame, cursor);
    cursor += frame.byteLength;
  }

  return buffer;
}
