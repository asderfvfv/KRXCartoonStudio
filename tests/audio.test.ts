import { describe, expect, it } from "vitest";
import {
  AUDIO_SCHEMA_VERSION,
  createDefaultSubtitleSettings,
  createEmptyAudioTrack,
  createEmptyDialogue,
  estimateSpeechDuration,
  evaluateMouthOpen,
  getActiveSubtitleText,
  validateAudioTrack,
  audioMediaTypeFromPath,
  folderFromAudioPath,
} from "../src/domain/audio";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import { SceneRuntime } from "../src/systems/SceneRuntime";
import { buildFfmpegEncodeArgs } from "../src/systems/ffmpegArgs";

describe("Stage 4 audio / dialogue / lip sync", () => {
  it("migrates old projects with empty audio fields and schema 3", () => {
    const old = createDefaultProject("Legacy Audio");
    delete (old as { audioAssets?: unknown }).audioAssets;
    delete (old as { schemaVersion?: unknown }).schemaVersion;
    for (const scene of old.scenes ?? []) {
      delete scene.audioTracks;
      delete scene.dialogues;
      delete scene.subtitleSettings;
    }
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(AUDIO_SCHEMA_VERSION);
    expect(migrated.audioAssets).toEqual([]);
    expect(migrated.scenes?.[0].audioTracks).toEqual([]);
    expect(migrated.scenes?.[0].dialogues).toEqual([]);
    expect(migrated.scenes?.[0].subtitleSettings?.enabled).toBe(true);
  });

  it("computes dialogue-driven mouth open and subtitles", () => {
    const dialogues = [
      createEmptyDialogue({ id: "d1", text: "Hello world", startTime: 1, duration: 2 }),
    ];
    expect(evaluateMouthOpen(0.5, dialogues)).toBe(0);
    expect(evaluateMouthOpen(1.2, dialogues)).toBeGreaterThan(0.2);
    expect(getActiveSubtitleText(dialogues, 1.2)).toBe("Hello world");
    expect(getActiveSubtitleText(dialogues, 4)).toBeNull();
    expect(estimateSpeechDuration("one two three four")).toBeGreaterThan(1);
    expect(validateAudioTrack(createEmptyAudioTrack({ id: "t1", assetId: "a1", name: "x", duration: 1 })).ok).toBe(true);
    expect(createDefaultSubtitleSettings().showInExport).toBe(true);
  });

  it("applies lip sync through SceneRuntime without crashing when Mouth is missing", () => {
    const project = createDefaultProject();
    const scene = project.scenes![0];
    scene.dialogues = [createEmptyDialogue({ id: "d1", text: "Привет", startTime: 0, duration: 2, actorId: scene.actors[0]?.id ?? null })];
    const runtime = new SceneRuntime();
    const state = runtime.setTime(scene, project.characters, 0.3);
    expect(state.time).toBe(0.3);
    expect(Object.keys(state.actors).length).toBeGreaterThan(0);
  });

  it("builds ffmpeg args with local audio mux and without shell", () => {
    const args = buildFfmpegEncodeArgs({
      framesDir: "C:/Temp/frames",
      outputPath: "C:/Temp/out.mp4",
      fps: 30,
      width: 1280,
      height: 720,
      format: "mp4",
      codec: "h264",
      quality: "standard",
      audioInputs: [{ path: "C:/Temp/voice.wav", startTime: 0.5, volume: 0.8 }],
    });
    expect(args.includes("-itsoffset")).toBe(true);
    expect(args.includes("C:/Temp/voice.wav")).toBe(true);
    expect(args.includes("aac")).toBe(true);
    expect(args.includes("-c")).toBe(false);
  });

  it("maps audio extensions to playback MIME types", () => {
    expect(audioMediaTypeFromPath("theme.mp3")).toBe("audio/mpeg");
    expect(audioMediaTypeFromPath("line.WAV")).toBe("audio/wav");
    expect(audioMediaTypeFromPath("bed.ogg")).toBe("audio/ogg");
    expect(audioMediaTypeFromPath("ref.m4a")).toBe("audio/mp4");
    expect(audioMediaTypeFromPath("ref.flac")).toBe("audio/flac");
  });

  it("takes the parent folder when an MP3 file is picked", () => {
    expect(folderFromAudioPath("C:\\Music\\theme.mp3")).toBe("C:\\Music");
    expect(folderFromAudioPath("C:\\Music")).toBe("C:\\Music");
    expect(folderFromAudioPath("D:/ost/calm.wav")).toBe("D:/ost");
  });
});
