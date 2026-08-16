import { describe, expect, it } from "vitest";
import { demoCharacter } from "../src/domain/defaults";
import {
  bakeMotionClip,
  capturePoseClip,
  duplicateAnimationClip,
  ensureBuiltinGestureClips,
  listBuiltinGestures,
  sampleEasingCurve,
  sampleKeyframeCurve,
} from "../src/domain/gestureLibrary";
import { applyEasing } from "../src/systems/AnimationSystem";
import { motionLibrary } from "../src/systems/MotionLibrary";
import { createDefaultProject } from "../src/domain/defaults";
import { captureBindPose } from "../src/domain/semantic";

describe("gestureLibrary", () => {
  it("lists builtin gestures with RU labels covering motionLibrary", () => {
    const list = listBuiltinGestures();
    expect(list.length).toBe(motionLibrary.length);
    expect(list.find((item) => item.name === "Wave")?.labelRu).toBe("Машет");
    expect(list.find((item) => item.name === "Idle")?.categoryRu).toBe("Движение");
  });

  it("bakes Wave clip with tracks and keys", () => {
    const clip = bakeMotionClip(demoCharacter, "Wave", { duration: 1, samples: 7 });
    expect(clip.name).toBe("Wave");
    expect(clip.generated).toBe(true);
    expect(clip.tracks.length).toBeGreaterThan(0);
    const arm = clip.tracks.find((track) => track.partId === "arm-right" && track.property === "rotation");
    expect(arm).toBeTruthy();
    expect(arm!.keyframes.length).toBeGreaterThanOrEqual(5);
  });

  it("ensureBuiltinGestureClips adds missing motions", () => {
    const project = createDefaultProject("t");
    expect(project.animationClips.map((c) => c.name).sort()).toEqual(["Idle", "Wave"]);
    const next = ensureBuiltinGestureClips(project, demoCharacter);
    expect(next.animationClips.length).toBe(motionLibrary.length);
    expect(next.animationClips.some((c) => c.name === "Jump")).toBe(true);
    const again = ensureBuiltinGestureClips(next, demoCharacter);
    expect(again.animationClips.length).toBe(next.animationClips.length);
  });

  it("capturePoseClip stores differing parts", () => {
    const character = structuredClone(demoCharacter);
    character.bindPose = captureBindPose(character);
    const arm = character.parts.find((p) => p.id === "arm-right")!;
    arm.transform.rotation += 40;
    const clip = capturePoseClip(character, "Моя");
    expect(clip.name).toBe("Моя");
    expect(clip.tracks.some((t) => t.partId === "arm-right" && t.property === "rotation")).toBe(true);
  });

  it("duplicateAnimationClip renames and new ids", () => {
    const clip = bakeMotionClip(demoCharacter, "Idle");
    const copy = duplicateAnimationClip(clip, "Idle 2");
    expect(copy.id).not.toBe(clip.id);
    expect(copy.name).toBe("Idle 2");
    expect(copy.tracks[0]!.id).not.toBe(clip.tracks[0]!.id);
  });

  it("easeIn sample curve is monotonic rising", () => {
    const samples = sampleEasingCurve("easeIn", 20);
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]!.v).toBeGreaterThanOrEqual(samples[i - 1]!.v - 1e-9);
    }
    expect(applyEasing("easeIn", 0.5)).toBeCloseTo(0.25, 5);
  });

  it("sampleKeyframeCurve follows easeInOut segment", () => {
    const keys = [
      { id: "a", time: 0, value: 0, easing: "easeInOut" as const },
      { id: "b", time: 1, value: 100, easing: "easeInOut" as const },
    ];
    const curve = sampleKeyframeCurve(keys, 10);
    expect(curve[0]!.v).toBeCloseTo(0, 5);
    expect(curve.at(-1)!.v).toBeCloseTo(100, 5);
    expect(curve[5]!.v).toBeGreaterThan(40);
    expect(curve[5]!.v).toBeLessThan(60);
  });
});
