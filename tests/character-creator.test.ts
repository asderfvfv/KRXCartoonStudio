import { describe, expect, it } from "vitest";
import {
  applyCreatorHierarchy,
  buildLibraryCharacter,
  buildProceduralCharacter,
  createDefaultPalette,
  createProceduralAsset,
  creatorSlots,
  findSlot,
  listDemoBotLibrary,
  removeSlotPart,
  requiredSlotsComplete,
  slotFilled,
  upsertSlotAsset,
} from "../src/domain/characterCreator";
import { findPartByRole } from "../src/domain/semantic";

describe("character creator", () => {
  it("builds a complete procedural humanoid with mouth and clothes", () => {
    const { character, assets } = buildProceduralCharacter("Hero", createDefaultPalette({ body: "#4aa", mouth: "#c33" }), "character-hero");
    expect(character.name).toBe("Hero");
    expect(requiredSlotsComplete(character)).toBe(true);
    expect(findPartByRole(character, "Mouth")).toBeTruthy();
    expect(character.parts.some((part) => part.customSemanticRole === "Clothes")).toBe(true);
    expect(assets.length).toBe(character.parts.length);
    expect(assets.every((asset) => asset.path.startsWith("data:image/svg+xml"))).toBe(true);
    const hand = findPartByRole(character, "HandRight");
    const arm = findPartByRole(character, "ArmRight");
    expect(hand?.parentId).toBe(arm?.id);
  });

  it("builds library character from DemoBot builtins plus procedural mouth", () => {
    const { character, assets } = buildLibraryCharacter("BotClone");
    expect(requiredSlotsComplete(character)).toBe(true);
    expect(listDemoBotLibrary().length).toBeGreaterThanOrEqual(10);
    expect(assets.some((asset) => asset.path.startsWith("builtin://demobot/"))).toBe(true);
    expect(assets.some((asset) => asset.path.startsWith("data:"))).toBe(true);
    expect(findPartByRole(character, "Body")?.parentId).toBeNull();
    expect(findPartByRole(character, "Head")?.parentId).toBe(findPartByRole(character, "Body")?.id);
  });

  it("upserts and clears slot assets while keeping hierarchy valid", () => {
    let { character, assets } = buildProceduralCharacter("Temp", undefined, "character-temp", false);
    const mouth = findSlot("mouth");
    const asset = createProceduralAsset(mouth, createDefaultPalette(), "asset-mouth-1");
    ({ character, assets } = upsertSlotAsset(character, assets, mouth, asset));
    expect(slotFilled(character, mouth)).toBe(true);
    expect(findPartByRole(character, "Mouth")?.parentId).toBe(findPartByRole(character, "Head")?.id);

    ({ character, assets } = removeSlotPart(character, assets, mouth));
    expect(slotFilled(character, mouth)).toBe(false);
    expect(assets.every((item) => character.parts.some((part) => part.assetId === item.id))).toBe(true);

    character = applyCreatorHierarchy(character);
    for (const slot of creatorSlots.filter((item) => !item.optional)) {
      expect(slotFilled(character, slot)).toBe(true);
    }
  });
});
