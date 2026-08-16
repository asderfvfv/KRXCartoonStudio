import { describe, expect, it } from "vitest";
import {
  compressAdCaption,
  pickPiperVoice,
  piperSpeakOptions,
  recommendAdVoiceMode,
} from "../src/domain/adNarration";

describe("ad narration voice policy", () => {
  it("prefers Chatterbox when installed", () => {
    const pick = recommendAdVoiceMode({
      chatterboxInstalled: true,
      hasVoiceProfile: true,
      hasPiper: true,
    });
    expect(pick.mode).toBe("natural");
  });

  it("falls back to Piper, never suggests SAPI", () => {
    const pick = recommendAdVoiceMode({
      chatterboxInstalled: false,
      hasVoiceProfile: false,
      hasPiper: true,
    });
    expect(pick.mode).toBe("piper");
    expect(pick.label.toLowerCase()).toContain("piper");
  });

  it("stays off when only robotic OS voice would remain", () => {
    const pick = recommendAdVoiceMode({
      chatterboxInstalled: false,
      hasVoiceProfile: false,
      hasPiper: false,
    });
    expect(pick.mode).toBe("off");
  });

  it("picks Russian Piper voice when available", () => {
    const voice = pickPiperVoice([
      { name: "SAPI Irina", culture: "ru-RU", gender: "Female", engine: "sapi" },
      { name: "Piper en", culture: "en-US", gender: "Female", engine: "piper", modelPath: "en.onnx" },
      { name: "Piper ru", culture: "ru-RU", gender: "Female", engine: "piper", modelPath: "ru.onnx" },
    ]);
    expect(voice?.name).toBe("Piper ru");
    expect(piperSpeakOptions(voice).rate).toBe(-2);
  });

  it("compresses captions for natural delivery", () => {
    const long = "А".repeat(100);
    expect(compressAdCaption(long).length).toBeLessThanOrEqual(72);
  });
});
