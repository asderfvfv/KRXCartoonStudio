import { describe, expect, it } from "vitest";
import {
  MONTAGE_TRANSITION_CATALOG,
  MONTAGE_TRANSITION_IDS,
  transitionNeedsOverlap,
} from "../src/domain/montageTransitions";
import { blendCanvasFrames } from "../src/systems/transitionBlend";

describe("montageTransitions catalog", () => {
  it("lists planned ad effects", () => {
    expect(MONTAGE_TRANSITION_IDS).toContain("wipeLeft");
    expect(MONTAGE_TRANSITION_IDS).toContain("flash");
    expect(MONTAGE_TRANSITION_IDS).toContain("circleOpen");
    expect(MONTAGE_TRANSITION_CATALOG).toHaveLength(MONTAGE_TRANSITION_IDS.length);
  });

  it("cut needs no overlap; others do", () => {
    expect(transitionNeedsOverlap("cut")).toBe(false);
    expect(transitionNeedsOverlap("crossfade")).toBe(true);
    expect(transitionNeedsOverlap("pushLeft")).toBe(true);
  });
});

describe("transitionBlend", () => {
  it("composites each kind without throwing and keeps canvas size", () => {
    if (typeof document === "undefined") return;
    const from = document.createElement("canvas");
    from.width = 32;
    from.height = 24;
    const fromCtx = from.getContext("2d");
    if (!fromCtx) return;
    fromCtx.fillStyle = "#ff0000";
    fromCtx.fillRect(0, 0, 32, 24);

    const to = document.createElement("canvas");
    to.width = 32;
    to.height = 24;
    const toCtx = to.getContext("2d");
    if (!toCtx) return;
    toCtx.fillStyle = "#0000ff";
    toCtx.fillRect(0, 0, 32, 24);

    const out = document.createElement("canvas");
    for (const kind of MONTAGE_TRANSITION_IDS) {
      blendCanvasFrames(from, to, 0.5, out, 32, 24, kind);
      expect(out.width).toBe(32);
      expect(out.height).toBe(24);
    }
  });
});
