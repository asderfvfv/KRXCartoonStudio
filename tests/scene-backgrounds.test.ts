import { describe, expect, it } from "vitest";
import { createBlankProject, createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import {
  SCENE_BACKGROUND_PRESETS,
  SCENE_BACKGROUND_SCHEMA_VERSION,
  SCENE_BACKGROUND_SWATCHES,
  applyGradientColors,
  applySolidColor,
  backgroundHexFromFill,
  normalizeHexColor,
  normalizeSceneBackgroundFields,
  resolveSceneBackgroundFill,
  templateBackgroundFor,
} from "../src/domain/sceneBackgrounds";
import { buildSceneFromTemplate } from "../src/domain/templates";

describe("scene backgrounds", () => {
  it("exposes a large vivid swatch palette and named presets", () => {
    expect(SCENE_BACKGROUND_SWATCHES.length).toBeGreaterThanOrEqual(40);
    expect(SCENE_BACKGROUND_PRESETS.some((item) => item.fill.mode === "gradient")).toBe(true);
    expect(SCENE_BACKGROUND_PRESETS.some((item) => item.fill.mode === "solid")).toBe(true);
  });

  it("normalizes hex and applies solid / gradient fills", () => {
    expect(normalizeHexColor("#AbC")).toBe("#aabbcc");
    expect(normalizeHexColor("nope", "#112233")).toBe("#112233");
    expect(applySolidColor("#FF7A3D")).toEqual({
      background: "#ff7a3d",
      backgroundFill: { mode: "solid" },
    });
    const grad = applyGradientColors("#4db8ff", "#3f9b4a", 0.55, 0.04);
    expect(grad.backgroundFill).toEqual({
      mode: "gradient",
      top: "#4db8ff",
      bottom: "#3f9b4a",
      horizon: 0.55,
      softness: 0.04,
    });
    expect(backgroundHexFromFill(grad.background, grad.backgroundFill)).toBe("#4db8ff");
  });

  it("resolves missing fill as solid and normalizes scene fields", () => {
    expect(resolveSceneBackgroundFill("#87b86a")).toEqual({ mode: "solid" });
    const scene = {
      background: "#AbCDef",
      backgroundFill: { mode: "gradient" as const, top: "#4db8ff", bottom: "#112233", horizon: 0.4, softness: 0 },
    };
    normalizeSceneBackgroundFields(scene);
    expect(scene.background).toBe("#4db8ff");
    expect(scene.backgroundFill.mode).toBe("gradient");
    if (scene.backgroundFill.mode === "gradient") {
      expect(scene.backgroundFill.horizon).toBe(0.4);
      expect(scene.backgroundFill.softness).toBe(0);
    }
  });

  it("gives vivid defaults per scene template", () => {
    const empty = templateBackgroundFor("empty");
    const dialogue = templateBackgroundFor("dialogue");
    const action = templateBackgroundFor("action");
    expect(empty.background).toMatch(/^#/);
    expect(dialogue.backgroundFill.mode).toBe("gradient");
    expect(action.backgroundFill.mode).toBe("gradient");

    const project = migrateProject(createDefaultProject("BgTpl"));
    const scene = buildSceneFromTemplate("dialogue", {
      name: "D",
      width: 1920,
      height: 1080,
      characters: project.characters,
    });
    expect(scene.backgroundFill?.mode).toBe("gradient");
  });

  it("migrates old scenes without backgroundFill and bumps schema", () => {
    const project = createDefaultProject("OldBg");
    delete project.scenes![0].backgroundFill;
    project.schemaVersion = 1;
    const migrated = migrateProject(project);
    expect(migrated.scenes![0].backgroundFill).toEqual({ mode: "solid" });
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(SCENE_BACKGROUND_SCHEMA_VERSION);
  });

  it("blank project starts with a vivid fill", () => {
    const blank = createBlankProject();
    expect(blank.scenes![0].backgroundFill).toBeDefined();
    expect(blank.scenes![0].background).not.toBe("#c5d0d4");
  });
});
