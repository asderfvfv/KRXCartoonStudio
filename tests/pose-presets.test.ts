import { describe, expect, it } from "vitest";
import { demoCharacter } from "../src/domain/defaults";
import {
  addCustomPose,
  applyPosePreset,
  builtInPosePresets,
  capturePosePreset,
  findPosePreset,
  removeCustomPose,
} from "../src/domain/posePresets";
import { captureBindPose, findPartByRole } from "../src/domain/semantic";

describe("pose presets", () => {
  it("lists built-in presets", () => {
    expect(builtInPosePresets.length).toBeGreaterThanOrEqual(8);
    expect(builtInPosePresets.map((item) => item.id)).toContain("armsUp");
    expect(builtInPosePresets.map((item) => item.id)).toContain("rest");
  });

  it("applies armsUp relative to bindPose", () => {
    const character = structuredClone(demoCharacter);
    character.bindPose = captureBindPose(character);
    const posed = applyPosePreset(character, "armsUp");
    const armL = findPartByRole(posed, "ArmLeft")!;
    const armR = findPartByRole(posed, "ArmRight")!;
    const bindL = character.bindPose![armL.id]!.transform.rotation;
    const bindR = character.bindPose![armR.id]!.transform.rotation;
    expect(armL.transform.rotation).toBeCloseTo(bindL + 140, 5);
    expect(armR.transform.rotation).toBeCloseTo(bindR - 140, 5);
  });

  it("rest restores bind rotations for limbs", () => {
    const character = structuredClone(demoCharacter);
    character.bindPose = captureBindPose(character);
    const up = applyPosePreset(character, "armsUp");
    const rest = applyPosePreset(up, "rest");
    const arm = findPartByRole(rest, "ArmLeft")!;
    expect(arm.transform.rotation).toBeCloseTo(character.bindPose![arm.id]!.transform.rotation, 5);
  });

  it("captures and stores custom poses", () => {
    let character = applyPosePreset(structuredClone(demoCharacter), "waveReady");
    character = addCustomPose(character, "Моя");
    expect(character.poseLibrary).toHaveLength(1);
    expect(character.poseLibrary![0]!.labelRu).toBe("Моя");
    const captured = capturePosePreset(character, "x", "x");
    expect(Object.keys(captured.deltas).length).toBeGreaterThan(0);
    expect(findPosePreset(character, character.poseLibrary![0]!.id)).toBeTruthy();
    character = removeCustomPose(character, character.poseLibrary![0]!.id);
    expect(character.poseLibrary).toHaveLength(0);
  });
});
