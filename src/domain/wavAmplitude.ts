/** Local WAV PCM amplitude utilities for lip sync (no cloud APIs). */

export interface AmplitudeEnvelope {
  /** Seconds per envelope sample. */
  hopSeconds: number;
  /** Peak-normalized RMS values 0..1. */
  values: Float32Array;
  duration: number;
  sampleRate: number;
}

export interface WavPcm {
  sampleRate: number;
  channels: number;
  samples: Float32Array; // mono mix
}

function readAscii(view: DataView, offset: number, length: number): string {
  let text = "";
  for (let i = 0; i < length; i += 1) text += String.fromCharCode(view.getUint8(offset + i));
  return text;
}

/** Parse little-endian PCM WAV (8/16/32-bit integer or 32-bit float). */
export function parseWavPcm(bytes: Uint8Array): WavPcm {
  if (bytes.byteLength < 44) throw new Error("WAV слишком короткий.");
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Файл не является WAV (RIFF/WAVE).");
  }

  let offset = 12;
  let format: number | null = null;
  let channels = 1;
  let sampleRate = 22050;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (id === "fmt ") {
      format = view.getUint16(chunkStart, true);
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (id === "data") {
      dataOffset = chunkStart;
      dataSize = size;
      break;
    }
    offset = chunkStart + size + (size % 2);
  }

  if (dataOffset < 0 || format == null) throw new Error("WAV без блока data/fmt.");
  if (format !== 1 && format !== 3) throw new Error(`Неподдерживаемый WAV format tag: ${format}`);
  if (![8, 16, 32].includes(bitsPerSample)) throw new Error(`Неподдерживаемый bitsPerSample: ${bitsPerSample}`);

  const frameSize = (bitsPerSample / 8) * channels;
  const frameCount = Math.floor(dataSize / frameSize);
  const mono = new Float32Array(frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    let mixed = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = dataOffset + frame * frameSize + channel * (bitsPerSample / 8);
      let sample = 0;
      if (format === 3 && bitsPerSample === 32) {
        sample = view.getFloat32(sampleOffset, true);
      } else if (bitsPerSample === 8) {
        sample = (view.getUint8(sampleOffset) - 128) / 128;
      } else if (bitsPerSample === 16) {
        sample = view.getInt16(sampleOffset, true) / 32768;
      } else {
        sample = view.getInt32(sampleOffset, true) / 2147483648;
      }
      mixed += sample;
    }
    mono[frame] = mixed / channels;
  }

  return { sampleRate, channels, samples: mono };
}

export function buildAmplitudeEnvelope(
  pcm: WavPcm,
  hopMs = 20,
  windowMs = 40,
): AmplitudeEnvelope {
  const hopSamples = Math.max(1, Math.round(pcm.sampleRate * (hopMs / 1000)));
  const windowSamples = Math.max(hopSamples, Math.round(pcm.sampleRate * (windowMs / 1000)));
  const count = Math.max(1, Math.ceil(pcm.samples.length / hopSamples));
  const values = new Float32Array(count);
  let peak = 0;

  for (let i = 0; i < count; i += 1) {
    const start = i * hopSamples;
    const end = Math.min(pcm.samples.length, start + windowSamples);
    let sum = 0;
    const n = Math.max(1, end - start);
    for (let s = start; s < end; s += 1) {
      const v = pcm.samples[s];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / n);
    values[i] = rms;
    if (rms > peak) peak = rms;
  }

  if (peak > 1e-8) {
    for (let i = 0; i < values.length; i += 1) values[i] = Math.min(1, values[i] / peak);
  }

  return {
    hopSeconds: hopSamples / pcm.sampleRate,
    values,
    duration: pcm.samples.length / pcm.sampleRate,
    sampleRate: pcm.sampleRate,
  };
}

/** Sample envelope at local audio time (seconds into the clip). Returns 0..1. */
export function sampleAmplitude(envelope: AmplitudeEnvelope, timeSeconds: number, sensitivity = 1): number {
  if (timeSeconds < 0 || timeSeconds > envelope.duration + envelope.hopSeconds) return 0;
  const index = timeSeconds / envelope.hopSeconds;
  const i0 = Math.floor(index);
  const i1 = Math.min(envelope.values.length - 1, i0 + 1);
  if (i0 < 0 || i0 >= envelope.values.length) return 0;
  const t = index - i0;
  const raw = envelope.values[i0]! * (1 - t) + envelope.values[i1]! * t;
  const shaped = Math.pow(Math.max(0, raw), 0.85) * Math.max(0.25, Math.min(3, sensitivity));
  return Math.max(0, Math.min(1, shaped));
}

/** Peak bars for Timeline waveform UI (asset-local time window). */
export function downsamplePeaks(
  envelope: AmplitudeEnvelope,
  barCount: number,
  startTime: number,
  windowDuration: number,
): number[] {
  const bars = Math.max(8, Math.min(256, Math.round(barCount)));
  const window = Math.max(0.05, windowDuration);
  const out: number[] = [];
  for (let i = 0; i < bars; i += 1) {
    const t0 = startTime + (i / bars) * window;
    const t1 = startTime + ((i + 1) / bars) * window;
    let peak = 0;
    for (let s = 0; s < 5; s += 1) {
      const t = t0 + ((t1 - t0) * s) / 4;
      peak = Math.max(peak, sampleAmplitude(envelope, t, 1));
    }
    out.push(peak);
  }
  return out;
}

export function buildEnvelopeFromWavBytes(bytes: Uint8Array, hopMs = 20): AmplitudeEnvelope {
  return buildAmplitudeEnvelope(parseWavPcm(bytes), hopMs);
}

/** Encode mono PCM16 WAV for tests / procedural audio. */
export function encodeMonoWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, Math.round(clamped * 32767), true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Повреждённый data URL.");
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (meta.includes(";base64")) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(payload));
}

export function looksLikeWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const header = String.fromCharCode(...bytes.subarray(0, 4)) + String.fromCharCode(...bytes.subarray(8, 12));
  return header === "RIFFWAVE";
}
