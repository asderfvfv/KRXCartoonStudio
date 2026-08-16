import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../src/domain/defaults";
import { CharacterManager, ProjectManager } from "../src/systems/managers";

describe("versioned serialization", () => {
  it("round-trips projects without losing rig or animation data", () => {
    const project = createDefaultProject("Persistence Test"); project.characters[0].parts[0].pivot.x = 77; project.animationClips[1].tracks[0].keyframes[2].value = -81;
    const manager = new ProjectManager(); const restored = manager.deserialize(manager.serialize(project));
    expect(restored).toEqual(project); expect(restored.assets.every((asset) => !asset.path.match(/^[A-Z]:/i))).toBe(true);
  });
  it("round-trips standalone character rigs", () => {
    const character = createDefaultProject().characters[0]; const manager = new CharacterManager(); expect(manager.deserialize(manager.serialize(character)).parts).toEqual(character.parts);
  });
  it("rejects unknown versions", () => {
    expect(() => new ProjectManager().deserialize('{"version":99}')).toThrow(/версия/); expect(() => new CharacterManager().deserialize('{"version":2}')).toThrow(/версия/);
  });
});
