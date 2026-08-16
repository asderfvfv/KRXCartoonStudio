import { describe, expect, it } from "vitest";
import { demoCharacter } from "../src/domain/defaults";
import {
  chainEffectorWorld,
  effectorError,
  listIkChains,
  solveIkChain,
  solveOneBoneIk,
} from "../src/domain/ik";
import { findPartByRole } from "../src/domain/semantic";
import { partWorldPoint } from "../src/domain/math";

describe("two-bone / one-bone IK", () => {
  it("detects arm chains with hands and leg 1-bone without feet", () => {
    const chains = listIkChains(demoCharacter);
    const armR = chains.find((item) => item.id === "armRight");
    const legL = chains.find((item) => item.id === "legLeft");
    expect(armR?.midId).toBe("hand-right");
    expect(legL?.midId).toBeNull();
    expect(legL?.tipId).toBe("leg-left");
  });

  it("one-bone aim moves tip closer to target", () => {
    const leg = findPartByRole(demoCharacter, "LegLeft")!;
    const pivot = partWorldPoint(leg.id, demoCharacter.parts, leg.pivot);
    const target = { x: pivot.x + 80, y: pivot.y + 40 };
    const before = effectorError(demoCharacter.parts, {
      id: "legLeft",
      labelRu: "",
      rootRole: "LegLeft",
      tipRole: "LegLeft",
      rootId: leg.id,
      midId: null,
      tipId: leg.id,
    }, target);
    const next = solveOneBoneIk(demoCharacter.parts, leg.id, target);
    const after = effectorError(next, {
      id: "legLeft",
      labelRu: "",
      rootRole: "LegLeft",
      tipRole: "LegLeft",
      rootId: leg.id,
      midId: null,
      tipId: leg.id,
    }, target);
    expect(after).toBeLessThan(before);
  });

  it("two-bone arm IK reduces effector error", () => {
    const chains = listIkChains(demoCharacter);
    const arm = chains.find((item) => item.id === "armRight")!;
    const start = chainEffectorWorld(demoCharacter.parts, arm);
    const target = { x: start.x + 60, y: start.y - 90 };
    const before = effectorError(demoCharacter.parts, arm, target);
    const next = solveIkChain(demoCharacter.parts, arm, target);
    const after = effectorError(next, arm, target);
    expect(after).toBeLessThan(before);
    expect(after).toBeLessThan(before * 0.55);
  });
});
