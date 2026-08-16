import { describe, expect, it } from "vitest";
import {
  EMOTION_CHATTERBOX_PARAMS,
  VOICE_EMOTIONS,
  createEmptyVoiceProfile,
  resolveEmotionParams,
  resolveEmotionReference,
} from "../src/domain/voiceStudio";
import { migrateProject } from "../src/domain/migration";
import { createBlankProject } from "../src/domain/defaults";

describe("voiceStudio", () => {
  it("exposes required emotions and real Chatterbox params", () => {
    expect(VOICE_EMOTIONS).toContain("neutral");
    expect(VOICE_EMOTIONS).toContain("evil");
    expect(EMOTION_CHATTERBOX_PARAMS.excited.exaggeration).toBeGreaterThan(0.5);
    expect(EMOTION_CHATTERBOX_PARAMS.excited.cfgWeight).toBeLessThan(0.5);
  });

  it("falls back to neutral reference when emotion ref missing", () => {
    const profile = createEmptyVoiceProfile({
      id: "v1",
      name: "Max",
      referencePath: "Voices/Max/References/neutral.wav",
      emotionReferences: [
        { emotion: "neutral", path: "Voices/Max/References/neutral.wav" },
        { emotion: "angry", path: "Voices/Max/References/angry.wav" },
      ],
    });
    expect(resolveEmotionReference(profile, "angry")).toBe("Voices/Max/References/angry.wav");
    expect(resolveEmotionReference(profile, "happy")).toBe("Voices/Max/References/neutral.wav");
    expect(resolveEmotionParams("shout").exaggeration).toBe(EMOTION_CHATTERBOX_PARAMS.shout.exaggeration);
  });

  it("migrates old projects with empty voiceProfiles", () => {
    const blank = createBlankProject();
    delete (blank as { voiceProfiles?: unknown }).voiceProfiles;
    const migrated = migrateProject(blank);
    expect(migrated.voiceProfiles).toEqual([]);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(12);
  });
});
