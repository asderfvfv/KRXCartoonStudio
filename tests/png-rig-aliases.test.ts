import { describe, expect, it } from "vitest";
import {
  matchPngStemToRigSlot,
  pickPngForRigSlot,
  normalizePngStem,
} from "../src/domain/pngRigAliases";

describe("pngRigAliases", () => {
  it("normalizes RU/EN stems", () => {
    expect(normalizePngStem("Башка.PNG")).toBe("башка");
    expect(normalizePngStem("arm_right.png")).toBe("arm-right");
    expect(normalizePngStem("рука левая.png")).toBe("рука-левая");
  });

  it("maps slang head names to head", () => {
    expect(matchPngStemToRigSlot("голова.png")).toBe("head");
    expect(matchPngStemToRigSlot("Башка.PNG")).toBe("head");
    expect(matchPngStemToRigSlot("головашка.png")).toBe("head");
    expect(matchPngStemToRigSlot("head.png")).toBe("head");
    expect(matchPngStemToRigSlot("морда.png")).toBe("head");
  });

  it("maps body aliases", () => {
    expect(matchPngStemToRigSlot("тело.png")).toBe("body");
    expect(matchPngStemToRigSlot("туловище.png")).toBe("body");
    expect(matchPngStemToRigSlot("body.png")).toBe("body");
    expect(matchPngStemToRigSlot("торс.png")).toBe("body");
  });

  it("maps side-specific limbs", () => {
    expect(matchPngStemToRigSlot("рука-правая.png")).toBe("arm-right");
    expect(matchPngStemToRigSlot("arm-right.png")).toBe("arm-right");
    expect(matchPngStemToRigSlot("нога-левая.png")).toBe("leg-left");
    expect(matchPngStemToRigSlot("глаз-п.png")).toBe("eye-right");
  });

  it("picks distinct left/right when both exist", () => {
    const files = [
      { path: "/a/тело.png", name: "тело.png" },
      { path: "/a/рука-левая.png", name: "рука-левая.png" },
      { path: "/a/рука-правая.png", name: "рука-правая.png" },
    ];
    const used = new Set<string>();
    const left = pickPngForRigSlot(files, "arm-left", used)!;
    used.add(left.path);
    const right = pickPngForRigSlot(files, "arm-right", used)!;
    expect(left.name).toBe("рука-левая.png");
    expect(right.name).toBe("рука-правая.png");
  });

  it("reuses generic рука for right when only one arm file", () => {
    const files = [
      { path: "/a/рука.png", name: "рука.png" },
    ];
    const used = new Set<string>();
    const left = pickPngForRigSlot(files, "arm-left", used)!;
    used.add(left.path);
    const right = pickPngForRigSlot(files, "arm-right", used);
    // used blocks reuse via pick; caller falls back to left file
    expect(right).toBeNull();
    expect(left.name).toBe("рука.png");
  });
});
