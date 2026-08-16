import { describe, expect, it } from "vitest";
import {
  assetUsageLabel,
  classifyAssetKind,
  collectAssetUsage,
  filterProjectAssets,
} from "../src/domain/assetBrowser";
import { createBlankProject, createDefaultProject, demoCharacter } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import { sanitizeProjectFileStem, resolveProjectsDirLayout } from "../src/domain/projectPaths";

describe("blank onboarding + asset browser", () => {
  it("createBlankProject has no DemoBot actors or demo assets", () => {
    const project = migrateProject(createBlankProject("Тест"));
    expect(project.characters.some((c) => c.id === demoCharacter.id || c.name === "DemoBot")).toBe(false);
    expect(project.scenes?.[0]?.actors ?? []).toHaveLength(0);
    expect(project.assets).toHaveLength(0);
    expect(project.scenes?.[0]?.actionSequence ?? []).toHaveLength(0);
    expect(project.characters[0]?.name).toBe("Герой");
    expect(project.characters[0]?.parts).toHaveLength(0);
  });

  it("createDefaultProject still provides DemoBot demo", () => {
    const demo = createDefaultProject("Demo");
    expect(demo.characters.some((c) => c.name === "DemoBot")).toBe(true);
    expect(demo.scenes?.[0]?.actors.length).toBeGreaterThan(0);
  });

  it("sanitizes project file names for Projects folder", () => {
    expect(sanitizeProjectFileStem("В гости к Винтику")).toBe("В гости к Винтику");
    expect(sanitizeProjectFileStem("a/b:c*?")).toBe("a_b_c__");
    expect(sanitizeProjectFileStem("   ")).toBe("project");
  });

  it("keeps Projects outside win-unpacked so pack does not wipe cartoons", () => {
    const layout = resolveProjectsDirLayout({
      isPackaged: true,
      execDir: "D:/KRXCartoonStudio/release/win-unpacked",
      repoRoot: "D:/KRXCartoonStudio",
    });
    expect(layout.primary.replace(/\\/g, "/")).toBe("D:/KRXCartoonStudio/release/Projects");
    expect(layout.legacy[0]?.replace(/\\/g, "/")).toBe("D:/KRXCartoonStudio/release/win-unpacked/Projects");
  });

  it("classifies backgrounds and filters unused assets", () => {
    const project = createBlankProject();
    project.assets = [
      { id: "a-bg", name: "meadow-sunny", path: "x", mediaType: "image/png", width: 1920, height: 1080 },
      { id: "a-prop", name: "apple", path: "y", mediaType: "image/png", width: 64, height: 64 },
    ];
    expect(classifyAssetKind(project.assets[0]!)).toBe("background");
    expect(classifyAssetKind(project.assets[1]!)).toBe("prop");
    project.scenes![0]!.backgroundAssetId = "a-bg";
    const unused = filterProjectAssets(project, { filter: "unused" });
    expect(unused.map((a) => a.id)).toEqual(["a-prop"]);
    const usage = collectAssetUsage(project, "a-bg");
    expect(usage.asBackground).toBe(1);
    expect(assetUsageLabel(usage)).toContain("фон");
  });
});
