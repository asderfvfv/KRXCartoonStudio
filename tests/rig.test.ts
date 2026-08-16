import { describe, expect, it } from "vitest";
import { RigSystem } from "../src/systems/RigSystem";
import { transformPoint } from "../src/domain/math";
import type { RigPart } from "../src/domain/types";

const makePart = (id: string, parentId: string | null, x: number, y: number, rotation = 0): RigPart => ({ id, name: id, assetId: `asset-${id}`, parentId, zIndex: 0, transform: { x, y, rotation, scaleX: 1, scaleY: 1 }, pivot: { x: 0, y: 0 }, anchor: { x: 0, y: 0 }, visible: true, locked: false, opacity: 1 });

describe("RigSystem", () => {
  it("combines parent and child transforms", () => {
    const rig = new RigSystem([makePart("body", null, 100, 50, 90), makePart("arm", "body", 20, 0), makePart("hand", "arm", 10, 0)]);
    const point = transformPoint(rig.getWorldMatrix("hand"), { x: 0, y: 0 });
    expect(point.x).toBeCloseTo(100); expect(point.y).toBeCloseTo(80);
  });
  it("preserves the child's local transform when the parent rotates", () => {
    const parts = [makePart("arm", null, 20, 30, 45), makePart("hand", "arm", 50, 0, 10)];
    const rig = new RigSystem(parts); rig.getWorldMatrix("hand");
    expect(parts[1].transform).toEqual({ x: 50, y: 0, rotation: 10, scaleX: 1, scaleY: 1 });
  });
  it("rejects direct and indirect parenting cycles", () => {
    const rig = new RigSystem([makePart("a", null, 0, 0), makePart("b", "a", 0, 0), makePart("c", "b", 0, 0)]);
    expect(rig.canSetParent("a", "c")).toBe(false); expect(rig.canSetParent("a", "a")).toBe(false);
    expect(() => rig.setParent("a", "c")).toThrow(/Циклическая/);
  });
});
