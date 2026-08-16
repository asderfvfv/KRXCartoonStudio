import { describe, expect, it, vi } from "vitest";
import { createEmptyAudioTrack } from "../src/domain/audio";
import { SceneAudioEngine } from "../src/systems/SceneAudioEngine";

class FakeAudio {
  paused = true;
  src = "";
  volume = 1;
  muted = false;
  currentTime = 0;
  preload = "";
  playCalls = 0;
  pauseCalls = 0;

  play() {
    this.paused = false;
    this.playCalls += 1;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
    this.pauseCalls += 1;
  }

  removeAttribute() {
    this.src = "";
  }
}

describe("SceneAudioEngine stop", () => {
  it("does not keep playing after pauseAll wins a load race", async () => {
    const created: FakeAudio[] = [];
    vi.stubGlobal("Audio", class {
      constructor() {
        const el = new FakeAudio();
        created.push(el);
        return el;
      }
    });

    let finishLoad: (url: string) => void = () => undefined;
    const engine = new SceneAudioEngine();
    engine.configure(
      [{ id: "a1", name: "theme", path: "theme.mp3", mediaType: "audio/mpeg", duration: 30 }],
      () => new Promise((resolve) => { finishLoad = resolve; }),
    );

    const tracks = [createEmptyAudioTrack({
      id: "t1",
      assetId: "a1",
      name: "Music",
      startTime: 0,
      duration: 30,
      volume: 0.5,
    })];

    const playingSync = engine.sync(tracks, 0.2, true);
    engine.pauseAll();
    finishLoad("data:audio/mpeg;base64,AAA");
    await playingSync;
    await Promise.resolve();

    expect(created.length).toBeGreaterThan(0);
    expect(created.every((el) => el.paused)).toBe(true);
    expect(created.reduce((sum, el) => sum + el.playCalls, 0)).toBe(0);

    vi.unstubAllGlobals();
  });
});
