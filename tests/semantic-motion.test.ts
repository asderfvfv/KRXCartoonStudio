import { describe, expect, it } from "vitest";
import { createDefaultProject, demoCharacter } from "../src/domain/defaults";
import { applyBindPose, captureBindPose, ensureSemanticCharacter, findPartByRole } from "../src/domain/semantic";
import { MotionLibrary, applyMotionToParts } from "../src/systems/MotionLibrary";
import { actorFacingScaleX } from "../src/systems/SceneRuntime";

describe("Stage 2 semantic rig and motion library", () => {
  it("assigns semantic roles independently of part names", () => {
    const character = ensureSemanticCharacter({ version: 1, id: "custom", name: "Custom", parts: [{ ...demoCharacter.parts.find((part) => part.id === "arm-left")!, id: "robot_arm_01", name: "robot_arm_01", semanticRole: "ArmLeft" }] });
    expect(findPartByRole(character, "ArmLeft")?.id).toBe("robot_arm_01"); expect(findPartByRole(character, "LegLeft")).toBeUndefined();
  });
  it("captures and restores a bind pose without mutation", () => {
    const character = structuredClone(demoCharacter); character.bindPose = captureBindPose(character); const originalX = character.parts[0].transform.x; character.parts[0].transform.x += 500;
    const restored = applyBindPose(character); expect(restored.parts[0].transform.x).toBe(originalX); expect(character.parts[0].transform.x).toBe(originalX + 500);
  });
  it("applies motions relative to bind pose", () => {
    const library = new MotionLibrary(); const arm = findPartByRole(demoCharacter, "ArmRight")!; const base = demoCharacter.bindPose![arm.id].transform.rotation; const values = library.evaluate(demoCharacter, "Wave", .25);
    expect(values[arm.id].rotation).not.toBe(base); expect(demoCharacter.parts.find((part) => part.id === arm.id)!.transform.rotation).toBe(base);
  });
  it("walk animates limbs in counter phase and gracefully skips missing roles", () => {
    const library = new MotionLibrary(); const values = library.evaluate(demoCharacter, "Walk", .125); const leftArm = findPartByRole(demoCharacter, "ArmLeft")!; const rightArm = findPartByRole(demoCharacter, "ArmRight")!;
    expect(values[leftArm.id].rotation! * values[rightArm.id].rotation!).toBeLessThan(0);
    const legless = { ...demoCharacter, parts: demoCharacter.parts.filter((part) => !part.semanticRole?.startsWith("Leg")) }; expect(() => library.evaluate(legless, "Run", .5)).not.toThrow();
  });
  it("motion application produces new parts rather than damaging the definition", () => {
    const before = structuredClone(demoCharacter.parts); const posed = applyMotionToParts(demoCharacter, "Angry", .8); expect(posed).not.toEqual(before); expect(demoCharacter.parts).toEqual(before);
  });
  it("facing direction flips an actor at the instance root", () => {
    expect(actorFacingScaleX({ scale: .8, facingDirection: "Left" })).toBe(-.8); expect(actorFacingScaleX({ scale: .8, facingDirection: "Right" })).toBe(.8);
  });
  it("preserves independent actor instances of one character definition", () => {
    const scene = createDefaultProject().scenes![0]; expect(scene.actors).toHaveLength(2); expect(scene.actors[0].characterId).toBe(scene.actors[1].characterId); expect(scene.actors[0].id).not.toBe(scene.actors[1].id); expect(scene.actors[0].position).not.toEqual(scene.actors[1].position);
  });
});
