import { describe, expect, it } from "vitest";
import {
  applyAmplitudeToViseme,
  buildVisemeTimeline,
  sampleVisemeFromText,
  sampleVisemeTimeline,
} from "../src/domain/phonemeLipSync";
import {
  createDefaultLipSyncSettings,
  createEmptyAudioTrack,
  createEmptyDialogue,
  evaluateMouthOpen,
  evaluateMouthPose,
} from "../src/domain/audio";
import { createDefaultProject } from "../src/domain/defaults";
import { buildProceduralCharacter } from "../src/domain/characterCreator";
import { findPartByRole } from "../src/domain/semantic";
import { encodeMonoWav } from "../src/domain/wavAmplitude";
import { amplitudeEnvelopeCache } from "../src/systems/AmplitudeEnvelopeCache";
import { SceneRuntime } from "../src/systems/SceneRuntime";

describe("phoneme / viseme lip-sync", () => {
  it("maps RU vowels and bilabials to distinct visemes", () => {
    const spans = buildVisemeTimeline("Мама", 1);
    const visemes = spans.map((s) => s.viseme);
    expect(visemes).toContain("closed");
    expect(visemes).toContain("open");
  });

  it("samples open on А and closed on М across duration", () => {
    const open = sampleVisemeFromText("аааа", 1, 0.4);
    const closed = sampleVisemeFromText("мммм", 1, 0.4);
    expect(open.viseme).toBe("open");
    expect(closed.viseme).toBe("closed");
    expect(open.pose.open).toBeGreaterThan(closed.pose.open);
  });

  it("WAV amplitude gates phoneme openness", () => {
    const sample = sampleVisemeFromText("ааа", 1, 0.3);
    const quiet = applyAmplitudeToViseme(sample, 0.02, { noiseGate: 0.08 });
    const loud = applyAmplitudeToViseme(sample, 0.9, { noiseGate: 0.08 });
    expect(quiet.pose.open).toBe(0);
    expect(quiet.viseme).toBe("rest");
    expect(loud.pose.open).toBeGreaterThan(0.2);
  });

  it("evaluateMouthPose uses phonemes by default", () => {
    const dialogues = [
      createEmptyDialogue({ id: "d1", text: "Привет", startTime: 0, duration: 1, actorId: "a1" }),
    ];
    const mid = evaluateMouthPose(0.35, dialogues, {
      actorId: "a1",
      lipSync: createDefaultLipSyncSettings({ phonemeDriven: true, preferAmplitude: false }),
    });
    expect(mid.open).toBeGreaterThan(0.05);
    expect(mid.viseme).not.toBe("rest");
  });

  it("timeline spans cover full duration", () => {
    const spans = buildVisemeTimeline("Ого!", 2);
    expect(spans[0]!.start).toBe(0);
    expect(spans.at(-1)!.end).toBeCloseTo(2, 5);
    const last = sampleVisemeTimeline(spans, 1.99);
    expect(last.viseme).toBeTruthy();
  });

  it("SceneRuntime applies phoneme mouth with loud WAV", () => {
    const sampleRate = 8000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i += 1) samples[i] = 0.85 * Math.sin(i * 0.2);
    const wav = encodeMonoWav(samples, sampleRate);
    amplitudeEnvelopeCache.clear();
    amplitudeEnvelopeCache.setFromWavBytes("audio-ph", wav);

    const project = createDefaultProject();
    const built = buildProceduralCharacter("Talker", undefined, "character-talker-ph", true);
    const mouthAsset = built.assets.find((asset) => asset.name.includes("mouth"))!;
    const mouthTemplate = built.character.parts.find((part) => part.semanticRole === "Mouth")!;
    const speaker = project.scenes![0]!.actors[0]!;
    const character = project.characters.find((item) => item.id === speaker.characterId)!;
    project.assets.push({ ...mouthAsset, id: "asset-mouth-ph" });
    character.parts.push({
      ...mouthTemplate,
      id: "mouth-ph",
      assetId: "asset-mouth-ph",
      parentId: findPartByRole(character, "Head")?.id ?? "head",
    });

    const scene = project.scenes![0]!;
    scene.audioTracks = [createEmptyAudioTrack({ id: "t-ph", assetId: "audio-ph", name: "voice", duration: 1, startTime: 0 })];
    scene.dialogues = [
      createEmptyDialogue({
        id: "d-ph",
        text: "Ааа",
        startTime: 0,
        duration: 1,
        actorId: speaker.id,
        audioTrackId: "t-ph",
      }),
    ];
    scene.lipSyncSettings = createDefaultLipSyncSettings({
      phonemeDriven: true,
      preferAmplitude: true,
    });

    const state = new SceneRuntime().setTime(scene, project.characters, 0.3);
    const scaleY = state.actors[speaker.id]!.rig["mouth-ph"]?.scaleY ?? 0;
    expect(scaleY).toBeGreaterThan(1.1);
    expect(evaluateMouthOpen(0.3, scene.dialogues, {
      actorId: speaker.id,
      lipSync: scene.lipSyncSettings,
      resolveAmplitude: () => 0.8,
    })).toBeGreaterThan(0.3);
  });
});
