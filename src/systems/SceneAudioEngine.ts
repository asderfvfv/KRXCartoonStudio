import type { AudioAssetDefinition, SceneAudioTrack } from "../domain/audio";
import { tracksActiveAt } from "../domain/audio";

interface PlayingSlot {
  trackId: string;
  element: HTMLAudioElement;
}

/**
 * Local HTMLAudio playback synced to scene time.
 * Stop/pause must kill sound immediately — late play() from in-flight loads is ignored.
 */
export class SceneAudioEngine {
  private slots = new Map<string, PlayingSlot>();
  private resolveUrl: ((assetPath: string) => Promise<string>) | null = null;
  private assets: AudioAssetDefinition[] = [];
  private epoch = 0;
  private wantPlaying = false;

  configure(assets: AudioAssetDefinition[], resolveUrl: (assetPath: string) => Promise<string>): void {
    this.assets = assets;
    this.resolveUrl = resolveUrl;
  }

  /** Instant mute for Stop / Pause — does not wait for React effects or file loads. */
  pauseAll(): void {
    this.wantPlaying = false;
    this.epoch += 1;
    this.pauseElements();
  }

  async sync(tracks: SceneAudioTrack[] | undefined, timeSeconds: number, playing: boolean): Promise<void> {
    this.wantPlaying = playing;
    const epoch = ++this.epoch;
    if (!playing) this.pauseElements();

    const active = playing ? tracksActiveAt(tracks, timeSeconds) : [];
    const activeIds = new Set(active.map((track) => track.id));

    for (const [id, slot] of [...this.slots.entries()]) {
      if (!activeIds.has(id)) {
        slot.element.pause();
        slot.element.removeAttribute("src");
        this.slots.delete(id);
      }
    }

    if (!playing || epoch !== this.epoch) {
      this.pauseElements();
      return;
    }

    for (const track of active) {
      if (epoch !== this.epoch || !this.wantPlaying) {
        this.pauseElements();
        return;
      }
      const asset = this.assets.find((item) => item.id === track.assetId);
      if (!asset || !this.resolveUrl) continue;
      let slot = this.slots.get(track.id);
      if (!slot) {
        const element = new Audio();
        element.preload = "auto";
        slot = { trackId: track.id, element };
        this.slots.set(track.id, slot);
        const url = await this.resolveUrl(asset.path);
        if (epoch !== this.epoch || !this.wantPlaying) {
          element.pause();
          return;
        }
        element.src = url;
      }
      const localTime = Math.max(0, track.trimStart + (timeSeconds - track.startTime));
      const element = slot.element;
      element.volume = Math.max(0, Math.min(1, track.volume));
      element.muted = track.muted;
      if (Math.abs((element.currentTime || 0) - localTime) > 0.12) {
        try { element.currentTime = localTime; } catch { /* ignore seek errors while loading */ }
      }
      if (this.wantPlaying && epoch === this.epoch && !track.muted && track.volume > 0) {
        if (element.paused) {
          void element.play().then(() => {
            if (epoch !== this.epoch || !this.wantPlaying) element.pause();
          }).catch(() => undefined);
        }
      } else if (!element.paused) {
        element.pause();
      }
    }
  }

  stopAll(): void {
    this.pauseAll();
    for (const slot of this.slots.values()) {
      slot.element.pause();
      slot.element.removeAttribute("src");
    }
    this.slots.clear();
  }

  private pauseElements(): void {
    for (const slot of this.slots.values()) {
      slot.element.pause();
    }
  }
}
