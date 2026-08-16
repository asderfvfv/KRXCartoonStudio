import {
  buildEnvelopeFromWavBytes,
  dataUrlToBytes,
  looksLikeWav,
  sampleAmplitude,
  type AmplitudeEnvelope,
} from "../domain/wavAmplitude";

/**
 * In-memory cache of local audio amplitude envelopes for lip sync.
 * Populated from WAV bytes / data URLs. Compressed MP3/OGG/M4A/FLAC should be
 * decoded to WAV in Electron (`readAudioWav`) before they reach this cache.
 */
export class AmplitudeEnvelopeCache {
  private readonly envelopes = new Map<string, AmplitudeEnvelope>();
  private readonly failed = new Set<string>();
  private readonly inflight = new Map<string, Promise<boolean>>();

  get(assetId: string): AmplitudeEnvelope | undefined {
    return this.envelopes.get(assetId);
  }

  has(assetId: string): boolean {
    return this.envelopes.has(assetId);
  }

  clear(): void {
    this.envelopes.clear();
    this.failed.clear();
    this.inflight.clear();
  }

  sample(assetId: string, timeSeconds: number, sensitivity = 1): number | null {
    const envelope = this.envelopes.get(assetId);
    if (!envelope) return null;
    return sampleAmplitude(envelope, timeSeconds, sensitivity);
  }

  /** Deterministic short-window average; smoothing 0 = single sample, 1 ≈ ±60ms. */
  sampleSmoothed(assetId: string, timeSeconds: number, sensitivity = 1, smoothing = 0): number | null {
    const envelope = this.envelopes.get(assetId);
    if (!envelope) return null;
    const amount = Math.max(0, Math.min(1, smoothing));
    if (amount <= 0.001) return sampleAmplitude(envelope, timeSeconds, sensitivity);
    const radius = 0.02 + amount * 0.06;
    const samples = [
      sampleAmplitude(envelope, timeSeconds - radius, sensitivity),
      sampleAmplitude(envelope, timeSeconds - radius * 0.5, sensitivity),
      sampleAmplitude(envelope, timeSeconds, sensitivity),
      sampleAmplitude(envelope, timeSeconds + radius * 0.5, sensitivity),
      sampleAmplitude(envelope, timeSeconds + radius, sensitivity),
    ];
    return samples.reduce((sum, value) => sum + value, 0) / samples.length;
  }

  setFromWavBytes(assetId: string, bytes: Uint8Array): boolean {
    if (!looksLikeWav(bytes)) {
      this.failed.add(assetId);
      return false;
    }
    try {
      this.envelopes.set(assetId, buildEnvelopeFromWavBytes(bytes));
      this.failed.delete(assetId);
      return true;
    } catch {
      this.failed.add(assetId);
      return false;
    }
  }

  setFromDataUrl(assetId: string, dataUrl: string): boolean {
    try {
      return this.setFromWavBytes(assetId, dataUrlToBytes(dataUrl));
    } catch {
      this.failed.add(assetId);
      return false;
    }
  }

  async ensureFromLoader(
    assetId: string,
    loader: () => Promise<string | Uint8Array>,
  ): Promise<boolean> {
    if (this.envelopes.has(assetId)) return true;
    if (this.failed.has(assetId)) return false;
    const existing = this.inflight.get(assetId);
    if (existing) return existing;

    const task = (async () => {
      try {
        const payload = await loader();
        if (typeof payload === "string") return this.setFromDataUrl(assetId, payload);
        return this.setFromWavBytes(assetId, payload);
      } catch {
        this.failed.add(assetId);
        return false;
      } finally {
        this.inflight.delete(assetId);
      }
    })();

    this.inflight.set(assetId, task);
    return task;
  }
}

export const amplitudeEnvelopeCache = new AmplitudeEnvelopeCache();
