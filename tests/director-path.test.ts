import { describe, expect, it } from "vitest";
import {
  alignSeededFootPath,
  bakeDirectorPath,
  buildGestureAction,
  buildPathActions,
  groundPathPoints,
  pathDurationSeconds,
  rdpSimplify,
  simplifyPolyline,
} from "../src/domain/directorPath";

describe("directorPath", () => {
  it("simplifies dense freehand samples", () => {
    const points = [
      { x: 0, y: 100 },
      { x: 3, y: 101 },
      { x: 20, y: 100 },
      { x: 40, y: 102 },
      { x: 80, y: 100 },
    ];
    const simplified = simplifyPolyline(points, 12);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toEqual({ x: 0, y: 100 });
    expect(simplified[simplified.length - 1]!.x).toBe(80);
  });

  it("rdp keeps ends and drops mid jitter", () => {
    const points = Array.from({ length: 40 }, (_, index) => ({
      x: index * 10,
      y: 500 + (index % 2 === 0 ? 1 : -1),
    }));
    const simplified = rdpSimplify(points, 8);
    expect(simplified.length).toBeLessThan(12);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]!.x).toBe(points[points.length - 1]!.x);
  });

  it("converts a seeded root-to-feet stroke into actor-root coordinates", () => {
    const aligned = alignSeededFootPath([
      { x: 300, y: 320 }, // current actor root injected by CanvasStage/EditorContext
      { x: 305, y: 620 }, // user starts drawing under the feet
      { x: 500, y: 640 },
      { x: 700, y: 600 },
    ]);
    expect(aligned[0]).toEqual({ x: 300, y: 320 });
    expect(aligned[1]).toEqual({ x: 305, y: 320 });
    expect(aligned[2]).toEqual({ x: 500, y: 340 });
    expect(aligned[3]).toEqual({ x: 700, y: 300 });
  });

  it("does not reinterpret an ordinary freehand path as a feet anchor", () => {
    const original = [
      { x: 100, y: 400 },
      { x: 140, y: 420 },
      { x: 220, y: 450 },
    ];
    expect(alignSeededFootPath(original)).toEqual(original);
  });

  it("bakeDirectorPath yields sparse keys following drawn Y", () => {
    const dense = Array.from({ length: 80 }, (_, index) => ({
      x: 100 + index * 8,
      y: 400 + Math.sin(index / 5) * 40,
    }));
    const baked = bakeDirectorPath(dense, { mode: "Walk", startTime: 1 });
    expect(baked).not.toBeNull();
    expect(baked!.keys.length).toBeGreaterThanOrEqual(2);
    expect(baked!.keys.length).toBeLessThanOrEqual(18);
    expect(baked!.keys[0]!.time).toBe(1);
    // Must not flatten to a single ground Y — follow the stroke.
    const ys = new Set(baked!.keys.map((key) => Math.round(key.y)));
    expect(ys.size).toBeGreaterThan(1);
  });

  it("baked seeded feet path starts from current actor root without vertical jump", () => {
    const baked = bakeDirectorPath([
      { x: 250, y: 300 },
      { x: 252, y: 610 },
      { x: 500, y: 610 },
      { x: 760, y: 610 },
    ], { mode: "Walk", startTime: 0 });
    expect(baked).not.toBeNull();
    expect(baked!.keys[0]!.y).toBe(300);
    expect(baked!.keys[baked!.keys.length - 1]!.y).toBe(300);
    expect(baked!.keys.length).toBeLessThanOrEqual(18);
  });

  it("locks nearly-horizontal paths to ground Y when requested", () => {
    const grounded = groundPathPoints(
      [
        { x: 100, y: 500 },
        { x: 400, y: 508 },
        { x: 700, y: 495 },
      ],
      520,
    );
    expect(grounded.every((point) => point.y === 520)).toBe(true);
  });

  it("builds Absolute WalkTo chain with durations", () => {
    const actions = buildPathActions({
      actorId: "actor-a",
      mode: "Walk",
      startTime: 2,
      groundY: 600,
      lockGroundY: false,
      points: [
        { x: 100, y: 600 },
        { x: 380, y: 520 },
        { x: 660, y: 600 },
      ],
      createActionId: (() => {
        let n = 0;
        return () => `action-${++n}`;
      })(),
    });
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0]!.type).toBe("WalkTo");
    expect(actions[0]!.startMode).toBe("Absolute");
    expect(actions[0]!.startTime).toBe(2);
    expect(actions[0]!.parameters.stopDistance).toBe(0);
    expect(actions[actions.length - 1]!.parameters.x).toBe(660);
    expect(pathDurationSeconds(
      [
        { x: 100, y: 600 },
        { x: 380, y: 520 },
        { x: 660, y: 600 },
      ],
      "Walk",
    )).toBeGreaterThan(1);
  });

  it("builds gesture Absolute action at playhead", () => {
    const action = buildGestureAction("actor-a", "Wave", 1.5);
    expect(action.type).toBe("Wave");
    expect(action.startMode).toBe("Absolute");
    expect(action.startTime).toBe(1.5);
    expect(action.actorId).toBe("actor-a");
  });
});
