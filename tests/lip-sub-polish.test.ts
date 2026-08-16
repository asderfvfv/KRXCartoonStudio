import { describe, expect, it } from "vitest";
import {
  LIPSUB_POLISH_SCHEMA_VERSION,
  buildSrtFromDialogues,
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
  createEmptyAudioTrack,
  createEmptyDialogue,
  dialogueLocalToAssetTime,
  dialogueTextPulse,
  evaluateMouthOpen,
  formatSrtTimestamp,
  getActiveSubtitleText,
  syncDialogueToTrack,
  wrapSubtitleLines,
} from "../src/domain/audio";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";

describe("Lip sync / subtitle polish", () => {
  it("migrates schema >= 10 with new lip/subtitle defaults", () => {
    const old = createDefaultProject("Legacy LipSub");
    delete (old as { schemaVersion?: unknown }).schemaVersion;
    for (const scene of old.scenes ?? []) {
      scene.lipSyncSettings = { enabled: true, preferAmplitude: true, sensitivity: 1 } as never;
      scene.subtitleSettings = { enabled: true, showInExport: true, fontSize: 40, bottomOffset: 50 } as never;
    }
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(LIPSUB_POLISH_SCHEMA_VERSION);
    expect(migrated.scenes?.[0].lipSyncSettings?.smoothing).toBeGreaterThan(0);
    expect(migrated.scenes?.[0].lipSyncSettings?.textDriven).toBe(true);
    expect(migrated.scenes?.[0].subtitleSettings?.showSpeaker).toBe(false);
    expect(migrated.scenes?.[0].subtitleSettings?.maxCharsPerLine).toBe(42);
  });

  it("aligns dialogue local time to track asset time", () => {
    const line = createEmptyDialogue({ id: "d1", text: "hi", startTime: 2, duration: 1, audioTrackId: "t1" });
    const track = createEmptyAudioTrack({ id: "t1", assetId: "a1", name: "v", startTime: 1.5, trimStart: 0.2, duration: 2 });
    expect(dialogueLocalToAssetTime(line, track, 0)).toBeCloseTo(0.7, 5);
    expect(dialogueLocalToAssetTime(line, track, -1)).toBeNull();
  });

  it("applies noise gate and text-driven fallback", () => {
    const dialogues = [createEmptyDialogue({ id: "d1", text: "ааа ммм", startTime: 0, duration: 1, actorId: "a1", audioTrackId: "t1" })];
    const vowelish = dialogueTextPulse(0.1, 1, "ааа ммм");
    const closedish = dialogueTextPulse(0.7, 1, "ааа ммм");
    expect(vowelish).toBeGreaterThan(closedish);

    const gated = evaluateMouthOpen(0.2, dialogues, {
      actorId: "a1",
      lipSync: createDefaultLipSyncSettings({ preferAmplitude: true, noiseGate: 0.2, textDriven: true }),
      resolveAmplitude: () => 0.05,
    });
    expect(gated).toBe(0);

    const loud = evaluateMouthOpen(0.2, dialogues, {
      actorId: "a1",
      lipSync: createDefaultLipSyncSettings({ preferAmplitude: true, noiseGate: 0.05 }),
      resolveAmplitude: () => 0.6,
    });
    expect(loud).toBeGreaterThan(0.2);
  });

  it("wraps captions, builds SRT, syncs dialogue to track", () => {
    expect(wrapSubtitleLines("one two three four five six seven eight", 12).length).toBeGreaterThan(1);
    expect(formatSrtTimestamp(66.5)).toBe("00:01:06,500");

    const actors = [{ id: "a1", name: "DemoBot" }];
    const dialogues = [
      createEmptyDialogue({ id: "d1", text: "Hello world", startTime: 1, duration: 2, actorId: "a1" }),
      createEmptyDialogue({ id: "d2", text: "Bye", startTime: 4, duration: 1, actorId: "a1" }),
    ];
    expect(getActiveSubtitleText(dialogues, 1.5, { showSpeaker: true, actors })).toBe("DemoBot: Hello world");
    const srt = buildSrtFromDialogues(dialogues, { showSpeaker: true, actors });
    expect(srt).toContain("1\n00:00:01,000 --> 00:00:03,000");
    expect(srt).toContain("DemoBot: Hello world");

    const track = createEmptyAudioTrack({ id: "t1", assetId: "a", name: "v", startTime: 3.5, duration: 1.25 });
    const synced = syncDialogueToTrack(dialogues[0], track);
    expect(synced.startTime).toBe(3.5);
    expect(synced.duration).toBe(1.25);
    expect(createDefaultSubtitleSettings().backgroundEnabled).toBe(true);
  });
});
