/** Turn raw microphone samples into a 16 kHz, 16-bit mono WAV file (small, and every model reads it). */
export const TARGET_RATE = 16000;

export function encodeWav(chunks: Float32Array[], inputRate: number, targetRate = TARGET_RATE): Blob {
  let length = 0;
  for (const c of chunks) length += c.length;
  const merged = new Float32Array(length);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  // Downsample by averaging each input window (a simple low-pass that avoids harsh aliasing).
  const ratio = inputRate / targetRate;
  const outLen = ratio <= 1 ? merged.length : Math.floor(merged.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    if (ratio <= 1) {
      out[i] = merged[i];
      continue;
    }
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), merged.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += merged[j];
    out[i] = sum / Math.max(1, end - start);
  }
  const rate = ratio <= 1 ? inputRate : targetRate;

  const buffer = new ArrayBuffer(44 + out.length * 2);
  const view = new DataView(buffer);
  const write = (pos: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(pos + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + out.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  write(36, "data");
  view.setUint32(40, out.length * 2, true);
  for (let i = 0; i < out.length; i++) {
    const v = Math.max(-1, Math.min(1, out[i]));
    view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}
