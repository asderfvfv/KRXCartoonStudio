import { describe, expect, it } from "vitest";
import {
  LIPSYNC_SCHEMA_VERSION,
  createDefaultLipSyncSettings,
  createEmptyAudioTrack,
  createEmptyDialogue,
  evaluateMouthOpen,
} from "../src/domain/audio";
import {
  buildAmplitudeEnvelope,
  encodeMonoWav,
  parseWavPcm,
  sampleAmplitude,
} from "../src/domain/wavAmplitude";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import { findPartByRole } from "../src/domain/semantic";
import { AmplitudeEnvelopeCache, amplitudeEnvelopeCache } from "../src/systems/AmplitudeEnvelopeCache";
import { SceneRuntime } from "../src/systems/SceneRuntime";
import { buildProceduralCharacter } from "../src/domain/characterCreator";

describe("Stage 6 WAV amplitude lip sync", () => {
  it("parses synthetic WAV and samples loud vs quiet segments", () => {
    const sampleRate = 8000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < sampleRate; i += 1) {
      samples[i] = i < sampleRate / 2
        ? 0.9 * Math.sin((i / sampleRate) * Math.PI * 2 * 220)
        : 0.02 * Math.sin((i / sampleRate) * Math.PI * 2 * 220);
    }
    const wav = encodeMonoWav(samples, sampleRate);
    const pcm = parseWavPcm(wav);
    expect(pcm.sampleRate).toBe(sampleRate);
    const envelope = buildAmplitudeEnvelope(pcm, 20, 40);
    const loud = sampleAmplitude(envelope, 0.2);
    const quiet = sampleAmplitude(envelope, 0.75);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeGreaterThan(0.4);
    expect(quiet).toBeLessThan(0.25);
  });

  it("preferAmplitude uses resolver instead of dialogue pulse", () => {
    const dialogues = [createEmptyDialogue({ id: "d1", text: "hi", startTime: 0, duration: 1, actorId: "a1", audioTrackId: "t1" })];
    const pulse = evaluateMouthOpen(0.2, dialogues, { actorId: "a1", lipSync: createDefaultLipSyncSettings({ preferAmplitude: false }) });
    const fromWav = evaluateMouthOpen(0.2, dialogues, {
      actorId: "a1",
      lipSync: createDefaultLipSyncSettings({ preferAmplitude: true, sensitivity: 1 }),
      resolveAmplitude: () => 0.12,
    });
    expect(pulse).toBeGreaterThan(0.2);
    expect(fromWav).toBeGreaterThan(0.05);
    expect(fromWav).toBeLessThan(0.25);
    expect(evaluateMouthOpen(0.2, dialogues, { actorId: "other" })).toBe(0);
  });

  it("cache + SceneRuntime moves speaking actor mouth from WAV amplitude", () => {
    const sampleRate = 8000;
    const samples = new Float32Array(sampleRate);
    for (let i = 0; i < samples.length; i += 1) samples[i] = 0.85 * Math.sin(i * 0.2);
    const wav = encodeMonoWav(samples, sampleRate);
    const local = new AmplitudeEnvelopeCache();
    expect(local.setFromWavBytes("audio-1", wav)).toBe(true);
    expect(local.sample("audio-1", 0.1)).toBeGreaterThan(0.2);

    amplitudeEnvelopeCache.clear();
    amplitudeEnvelopeCache.setFromWavBytes("audio-1", wav);

    const project = createDefaultProject();
    const built = buildProceduralCharacter("Talker", undefined, "character-talker", true);
    const mouthAsset = built.assets.find((asset) => asset.name.includes("mouth"))!;
    const mouthTemplate = built.character.parts.find((part) => part.semanticRole === "Mouth")!;
    const speaker = project.scenes![0].actors[0];
    const character = project.characters.find((item) => item.id === speaker.characterId)!;
    project.assets.push({ ...mouthAsset, id: "asset-mouth-demo" });
    character.parts.push({
      ...mouthTemplate,
      id: "mouth-demo",
      assetId: "asset-mouth-demo",
      parentId: findPartByRole(character, "Head")?.id ?? "head",
    });

    const scene = project.scenes![0];
    scene.audioTracks = [createEmptyAudioTrack({ id: "t1", assetId: "audio-1", name: "voice", duration: 1, startTime: 0 })];
    scene.dialogues = [createEmptyDialogue({ id: "d1", text: "yo", startTime: 0, duration: 1, actorId: speaker.id, audioTrackId: "t1" })];
    scene.lipSyncSettings = createDefaultLipSyncSettings({ preferAmplitude: true });

    const state = new SceneRuntime().setTime(scene, project.characters, 0.2);
    const scaleY = state.actors[speaker.id].rig["mouth-demo"]?.scaleY ?? 0;
    expect(scaleY).toBeGreaterThan(0.35);

    const other = scene.actors[1];
    expect(state.actors[other.id].rig["mouth-demo"]).toBeUndefined();
  });

  it("migrates lipSyncSettings and schema >= 4", () => {
    const old = createDefaultProject("Legacy Lip");
    delete (old as { schemaVersion?: unknown }).schemaVersion;
    for (const scene of old.scenes ?? []) delete scene.lipSyncSettings;
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(LIPSYNC_SCHEMA_VERSION);
    expect(migrated.scenes?.[0].lipSyncSettings?.preferAmplitude).toBe(true);
  });
});
