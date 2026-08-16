import { describe, expect, it } from "vitest";
import {
  buildCropSpecs,
  detectSheetBlobs,
  extractCropRgba,
  isForegroundPixel,
  makeTestSheet,
  suggestSlotAssignments,
} from "../src/domain/spritesheetSlice";

describe("spritesheetSlice", () => {
  it("treats near-black opaque as background", () => {
    expect(isForegroundPixel(0, 0, 0, 255, 28)).toBe(false);
    expect(isForegroundPixel(20, 20, 20, 255, 28)).toBe(false);
    expect(isForegroundPixel(80, 160, 220, 255, 28)).toBe(true);
    expect(isForegroundPixel(255, 0, 0, 0, 28)).toBe(false);
  });

  it("detects separate rectangles on a black sheet", () => {
    const sheet = makeTestSheet(200, 120, [
      { x: 10, y: 10, w: 40, h: 50 },
      { x: 80, y: 20, w: 30, h: 30 },
      { x: 140, y: 15, w: 35, h: 55 },
    ]);
    const blobs = detectSheetBlobs(sheet, { minArea: 20, bgThreshold: 28 });
    expect(blobs.length).toBe(3);
    expect(blobs[0]!.area).toBeGreaterThanOrEqual(blobs[1]!.area);
  });

  it("suggests body for the largest blob and does not force clothes", () => {
    const sheet = makeTestSheet(300, 200, [
      { x: 20, y: 20, w: 80, h: 100 },
      { x: 140, y: 30, w: 40, h: 42 },
      { x: 200, y: 30, w: 24, h: 24 },
      { x: 240, y: 30, w: 24, h: 24 },
      { x: 140, y: 90, w: 50, h: 16 },
    ]);
    const blobs = detectSheetBlobs(sheet, { minArea: 20 });
    const map = suggestSlotAssignments(blobs);
    const bodyId = [...map.entries()].find(([, slot]) => slot === "body")?.[0];
    expect(bodyId).toBeTruthy();
    expect(blobs.find((b) => b.id === bodyId)?.area).toBe(Math.max(...blobs.map((b) => b.area)));
    expect([...map.values()].includes("clothes")).toBe(false);
    const specs = buildCropSpecs(blobs);
    expect(specs.some((s) => s.suggestedSlot === "body")).toBe(true);
  });

  it("prefers denser mid-large blob as head over sparse elongated leftover", () => {
    // large body, solid square "head", sparse-looking tall "tail" (low fill via thinner rect still solid - use aspect)
    const sheet = makeTestSheet(400, 240, [
      { x: 20, y: 40, w: 90, h: 120 },
      { x: 140, y: 30, w: 70, h: 75 },
      { x: 250, y: 20, w: 40, h: 160 },
    ]);
    const blobs = detectSheetBlobs(sheet, { minArea: 20 });
    const map = suggestSlotAssignments(blobs);
    const headId = [...map.entries()].find(([, slot]) => slot === "head")?.[0];
    expect(headId).toBeTruthy();
    const head = blobs.find((b) => b.id === headId)!;
    expect(head.aspect).toBeGreaterThan(0.7);
    expect(head.aspect).toBeLessThan(1.4);
  });

  it("extracts crop with padding inside bounds", () => {
    const sheet = makeTestSheet(100, 80, [{ x: 20, y: 20, w: 20, h: 20, color: [200, 40, 40, 255] }]);
    const blobs = detectSheetBlobs(sheet, { minArea: 10 });
    expect(blobs.length).toBe(1);
    const crop = extractCropRgba(sheet, blobs[0]!, 2);
    expect(crop.width).toBe(24);
    expect(crop.height).toBe(24);
    // center-ish pixel should be red-ish
    const mid = ((12 * crop.width + 12) * 4);
    expect(crop.data[mid]).toBeGreaterThan(100);
  });
});
