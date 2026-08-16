import { describe, expect, it } from "vitest";
import {
  BASIC_SHAPE_POSE,
  VISEME_TO_BASIC,
  charToCartoonViseme,
  createEmptyLipSyncData,
  createEmptyMouthSet,
  isLipSyncOutdated,
  lipSyncSourceKey,
  resolveMouthPartId,
  sampleVisemeCue,
  smoothVisemeCues,
} from "../src/domain/visemeSystem";
import { migrateProject } from "../src/domain/migration";
import { createBlankProject } from "../src/domain/defaults";
import { evaluateMouthPose } from "../src/domain/audio";

describe("visemeSystem", () => {
  it("maps Russian phoneme chars to cartoon visemes", () => {
    expect(charToCartoonViseme("м")).toBe("MBP");
    expect(charToCartoonViseme("п")).toBe("MBP");
    expect(charToCartoonViseme("а")).toBe("A");
    expect(charToCartoonViseme("о")).toBe("O");
    expect(charToCartoonViseme("у")).toBe("U");
    expect(charToCartoonViseme("и")).toBe("I");
    expect(charToCartoonViseme("е")).toBe("E");
    expect(charToCartoonViseme(" ")).toBe("REST");
    expect(charToCartoonViseme("!")).toBe("REST");
  });

  it("maps cartoon visemes to basic shapes with poses", () => {
    expect(VISEME_TO_BASIC.MBP).toBe("CLOSED");
    expect(VISEME_TO_BASIC.A).toBe("OPEN");
    expect(VISEME_TO_BASIC.O).toBe("ROUND");
    expect(BASIC_SHAPE_POSE.OPEN.open).toBeGreaterThan(0.8);
    expect(BASIC_SHAPE_POSE.CLOSED.open).toBeLessThan(0.2);
  });

  it("smooths short cues and merges neighbors", () => {
    const smoothed = smoothVisemeCues([
      { time: 0, duration: 0.02, viseme: "A" },
      { time: 0.02, duration: 0.1, viseme: "A" },
      { time: 0.12, duration: 0.08, viseme: "REST" },
      { time: 0.2, duration: 0.01, viseme: "O" },
    ], { minDuration: 0.045 });
    expect(smoothed.length).toBeGreaterThan(0);
    expect(smoothed.some((c) => c.viseme === "A")).toBe(true);
    expect(smoothed.every((c) => c.duration >= 0.02)).toBe(true);
  });

  it("samples REST gaps and active cues by timeline clock", () => {
    const cues = smoothVisemeCues([
      { time: 0, duration: 0.2, viseme: "REST" },
      { time: 0.2, duration: 0.3, viseme: "MBP" },
      { time: 0.5, duration: 0.4, viseme: "A" },
    ]);
    expect(sampleVisemeCue(cues, 0.05)?.viseme).toBe("REST");
    expect(sampleVisemeCue(cues, 0.25)?.viseme).toBe("MBP");
    expect(sampleVisemeCue(cues, 0.7)?.viseme).toBe("A");
  });

  it("detects outdated lip sync per take source", () => {
    const data = createEmptyLipSyncData({
      audioPath: "Audio/a.wav",
      text: "Привет",
      duration: 1,
      cues: [{ time: 0, duration: 1, viseme: "A" }],
      sourceKey: lipSyncSourceKey("Audio/a.wav", "Привет"),
    });
    expect(isLipSyncOutdated(data, "Audio/a.wav", "Привет")).toBe(false);
    expect(isLipSyncOutdated(data, "Audio/b.wav", "Привет")).toBe(true);
    expect(isLipSyncOutdated(data, "Audio/a.wav", "Пока")).toBe(true);
  });

  it("falls back mapping when mouth sprites missing", () => {
    const set = createEmptyMouthSet({ mode: "advanced", primaryMouthPartId: "mouth-1", advancedMapping: {} });
    const resolved = resolveMouthPartId(set, "O");
    expect(resolved.partId).toBe("mouth-1");
    expect(resolved.useScaleFallback).toBe(true);
    expect(resolved.basicShape).toBe("ROUND");
  });

  it("evaluateMouthPose uses LipSyncData cues over text timing", () => {
    const pose = evaluateMouthPose(0.15, [{
      id: "d1",
      actorId: "a1",
      text: "ммм",
      startTime: 0,
      duration: 1,
      lipSyncStatus: "ready",
      lipSync: createEmptyLipSyncData({
        audioPath: "x.wav",
        text: "ммм",
        duration: 1,
        cues: [
          { time: 0, duration: 0.5, viseme: "MBP" },
          { time: 0.5, duration: 0.5, viseme: "A" },
        ],
      }),
    }], { actorId: "a1", lipSync: { enabled: true, preferAmplitude: false, sensitivity: 1, smoothing: 0.4, noiseGate: 0.08, textDriven: true, phonemeDriven: true } });
    expect(pose.cartoonViseme).toBe("MBP");
    expect(pose.open).toBeLessThan(0.3);
  });

  it("migrates old projects with mouthSet defaults", () => {
    const blank = createBlankProject();
    delete (blank.characters[0] as { mouthSet?: unknown }).mouthSet;
    const migrated = migrateProject(blank);
    expect(migrated.characters[0]?.mouthSet?.mode).toBeTruthy();
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(13);
  });
});
