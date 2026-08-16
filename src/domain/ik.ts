import type { CharacterDefinition, RigPart, SemanticRole, Vec2 } from "./types";
import { findPartByRole } from "./semantic";
import {
  angleDeg,
  distance,
  limbTipLocal,
  partWorldPoint,
  worldMatrix,
} from "./math";

export type IkChainId = "armLeft" | "armRight" | "legLeft" | "legRight";

export interface IkChain {
  id: IkChainId;
  labelRu: string;
  rootRole: SemanticRole;
  tipRole: SemanticRole;
  rootId: string;
  midId: string | null;
  tipId: string;
}

export function listIkChains(character: CharacterDefinition): IkChain[] {
  const defs: Array<{ id: IkChainId; labelRu: string; rootRole: SemanticRole; tipRole: SemanticRole }> = [
    { id: "armLeft", labelRu: "Рука Л", rootRole: "ArmLeft", tipRole: "HandLeft" },
    { id: "armRight", labelRu: "Рука П", rootRole: "ArmRight", tipRole: "HandRight" },
    { id: "legLeft", labelRu: "Нога Л", rootRole: "LegLeft", tipRole: "FootLeft" },
    { id: "legRight", labelRu: "Нога П", rootRole: "LegRight", tipRole: "FootRight" },
  ];
  const chains: IkChain[] = [];
  for (const def of defs) {
    const root = findPartByRole(character, def.rootRole);
    if (!root) continue;
    const tip = findPartByRole(character, def.tipRole);
    if (tip && tip.parentId === root.id) {
      chains.push({
        id: def.id,
        labelRu: def.labelRu,
        rootRole: def.rootRole,
        tipRole: def.tipRole,
        rootId: root.id,
        midId: tip.id,
        tipId: tip.id,
      });
    } else {
      chains.push({
        id: def.id,
        labelRu: def.labelRu,
        rootRole: def.rootRole,
        tipRole: def.rootRole,
        rootId: root.id,
        midId: null,
        tipId: root.id,
      });
    }
  }
  return chains;
}

export function findIkChainForPart(character: CharacterDefinition, partId: string): IkChain | undefined {
  return listIkChains(character).find((chain) => chain.rootId === partId || chain.tipId === partId || chain.midId === partId);
}

export function chainEffectorWorld(parts: RigPart[], chain: IkChain): Vec2 {
  const tip = parts.find((item) => item.id === chain.tipId);
  if (!tip) return { x: 0, y: 0 };
  // Always use a tip past the pivot so rotating the tip bone actually moves the effector.
  return partWorldPoint(tip.id, parts, limbTipLocal(tip, chain.midId ? 48 : undefined));
}

function setPartRotation(parts: RigPart[], partId: string, rotation: number): RigPart[] {
  return parts.map((part) => (part.id === partId ? { ...part, transform: { ...part.transform, rotation } } : part));
}

/** Aim a single bone so its tip points toward target (character-local / worldMatrix space). */
export function solveOneBoneIk(parts: RigPart[], boneId: string, targetWorld: Vec2): RigPart[] {
  const bone = parts.find((item) => item.id === boneId);
  if (!bone) return parts;
  const pivotWorld = partWorldPoint(boneId, parts, bone.pivot);
  const tipWorld = partWorldPoint(boneId, parts, limbTipLocal(bone));
  const currentAngle = angleDeg(pivotWorld, tipWorld);
  const desiredAngle = angleDeg(pivotWorld, targetWorld);
  return setPartRotation(parts, boneId, bone.transform.rotation + (desiredAngle - currentAngle));
}

/**
 * Two-bone CCD: root (upper arm/leg) + mid (hand/foot).
 * Target is in the same space as worldMatrix (character local).
 */
export function solveTwoBoneIk(
  parts: RigPart[],
  rootId: string,
  midId: string,
  targetWorld: Vec2,
  iterations = 16,
): RigPart[] {
  let next = parts.map((part) => structuredClone(part));
  if (!next.some((item) => item.id === rootId) || !next.some((item) => item.id === midId)) return parts;

  const chainStub: IkChain = {
    id: "armLeft",
    labelRu: "",
    rootRole: "ArmLeft",
    tipRole: "HandLeft",
    rootId,
    midId,
    tipId: midId,
  };

  for (let i = 0; i < iterations; i += 1) {
    // Mid first (end effector bone), then root — classic CCD order from tip.
    const midPart = next.find((item) => item.id === midId)!;
    const midPivot = partWorldPoint(midId, next, midPart.pivot);
    const midTip = partWorldPoint(midId, next, limbTipLocal(midPart, 36));
    next = setPartRotation(next, midId, midPart.transform.rotation + (angleDeg(midPivot, targetWorld) - angleDeg(midPivot, midTip)) * 0.85);

    const rootPart = next.find((item) => item.id === rootId)!;
    const rootPivot = partWorldPoint(rootId, next, rootPart.pivot);
    const effector = chainEffectorWorld(next, chainStub);
    next = setPartRotation(next, rootId, rootPart.transform.rotation + (angleDeg(rootPivot, targetWorld) - angleDeg(rootPivot, effector)) * 0.9);
  }

  // Final root snap toward target
  {
    const rootPart = next.find((item) => item.id === rootId)!;
    const rootPivot = partWorldPoint(rootId, next, rootPart.pivot);
    const effector = chainEffectorWorld(next, chainStub);
    next = setPartRotation(next, rootId, rootPart.transform.rotation + (angleDeg(rootPivot, targetWorld) - angleDeg(rootPivot, effector)));
  }

  return next;
}

export function solveIkChain(parts: RigPart[], chain: IkChain, targetWorld: Vec2): RigPart[] {
  if (chain.midId && chain.midId !== chain.rootId) {
    return solveTwoBoneIk(parts, chain.rootId, chain.midId, targetWorld);
  }
  return solveOneBoneIk(parts, chain.rootId, targetWorld);
}

/** Map scene-space point into character local space used by worldMatrix. */
export function scenePointToCharacterLocal(
  actorPosition: Vec2,
  actorRotationDeg: number,
  actorScaleX: number,
  actorScaleY: number,
  scenePoint: Vec2,
): Vec2 {
  const dx = scenePoint.x - actorPosition.x;
  const dy = scenePoint.y - actorPosition.y;
  const rad = (-actorRotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;
  return {
    x: lx / (Math.abs(actorScaleX) < 1e-6 ? 1 : actorScaleX),
    y: ly / (Math.abs(actorScaleY) < 1e-6 ? 1 : actorScaleY),
  };
}

export function applyIkToCharacter(
  character: CharacterDefinition,
  chain: IkChain,
  targetCharacterLocal: Vec2,
): CharacterDefinition {
  return {
    ...character,
    parts: solveIkChain(character.parts, chain, targetCharacterLocal),
  };
}

/** How far the effector is from a target (for tests). */
export function effectorError(parts: RigPart[], chain: IkChain, target: Vec2): number {
  return distance(chainEffectorWorld(parts, chain), target);
}

export function boneWorldMatrixExists(parts: RigPart[], partId: string): boolean {
  return Math.abs(worldMatrix(partId, parts).a) + Math.abs(worldMatrix(partId, parts).d) > 0;
}
