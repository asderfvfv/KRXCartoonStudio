import type { CharacterDefinition, SemanticRole, Transform } from "./types";
import { captureBindPose, findPartByRole } from "./semantic";
import { createId } from "./ids";

export interface PosePreset {
  id: string;
  labelRu: string;
  deltas: Partial<Record<SemanticRole, Partial<Transform>>>;
}

const ROLE_ORDER: SemanticRole[] = [
  "Root", "Body", "Head", "EyeLeft", "EyeRight", "Mouth",
  "ArmLeft", "ArmRight", "HandLeft", "HandRight",
  "LegLeft", "LegRight", "FootLeft", "FootRight",
];

export const builtInPosePresets: PosePreset[] = [
  { id: "rest", labelRu: "Стойка", deltas: {} },
  {
    id: "armsUp",
    labelRu: "Руки вверх",
    deltas: {
      ArmLeft: { rotation: 140 },
      ArmRight: { rotation: -140 },
      HandLeft: { rotation: 10 },
      HandRight: { rotation: -10 },
    },
  },
  {
    id: "armsOut",
    labelRu: "Руки в стороны",
    deltas: {
      ArmLeft: { rotation: 85 },
      ArmRight: { rotation: -85 },
      HandLeft: { rotation: 5 },
      HandRight: { rotation: -5 },
    },
  },
  {
    id: "waveReady",
    labelRu: "Машет",
    deltas: {
      ArmRight: { rotation: -55 },
      HandRight: { rotation: 12 },
      Head: { rotation: -4 },
      ArmLeft: { rotation: 8 },
    },
  },
  {
    id: "handsOnHips",
    labelRu: "Руки в боки",
    deltas: {
      ArmLeft: { rotation: -35 },
      ArmRight: { rotation: 35 },
      HandLeft: { rotation: -25 },
      HandRight: { rotation: 25 },
      Body: { scaleY: 0.01 },
    },
  },
  {
    id: "sitApprox",
    labelRu: "Сидит",
    deltas: {
      Body: { y: 28, scaleY: -0.02 },
      LegLeft: { rotation: -55 },
      LegRight: { rotation: 55 },
      FootLeft: { rotation: 20 },
      FootRight: { rotation: -20 },
      ArmLeft: { rotation: -12 },
      ArmRight: { rotation: 12 },
    },
  },
  {
    id: "reachLeft",
    labelRu: "Тянется влево",
    deltas: {
      Body: { rotation: -8, x: -10 },
      ArmLeft: { rotation: 110 },
      HandLeft: { rotation: 15 },
      ArmRight: { rotation: 20 },
      Head: { rotation: -10 },
      LegLeft: { rotation: 8 },
      LegRight: { rotation: -6 },
    },
  },
  {
    id: "reachRight",
    labelRu: "Тянется вправо",
    deltas: {
      Body: { rotation: 8, x: 10 },
      ArmRight: { rotation: -110 },
      HandRight: { rotation: -15 },
      ArmLeft: { rotation: -20 },
      Head: { rotation: 10 },
      LegLeft: { rotation: -6 },
      LegRight: { rotation: 8 },
    },
  },
];

export function findPosePreset(character: CharacterDefinition, presetId: string): PosePreset | undefined {
  return builtInPosePresets.find((item) => item.id === presetId)
    ?? character.poseLibrary?.find((item) => item.id === presetId);
}

export function listPosePresets(character: CharacterDefinition): PosePreset[] {
  const custom = character.poseLibrary ?? [];
  return [...builtInPosePresets, ...custom];
}

function applyDelta(base: Transform, delta?: Partial<Transform>): Transform {
  if (!delta) return structuredClone(base);
  return {
    x: base.x + (delta.x ?? 0),
    y: base.y + (delta.y ?? 0),
    rotation: base.rotation + (delta.rotation ?? 0),
    scaleX: base.scaleX + (delta.scaleX ?? 0),
    scaleY: base.scaleY + (delta.scaleY ?? 0),
  };
}

/** Apply bindPose + preset deltas onto character.parts. */
export function applyPosePreset(character: CharacterDefinition, presetId: string): CharacterDefinition {
  const preset = findPosePreset(character, presetId);
  if (!preset) return character;
  const bind = character.bindPose ?? captureBindPose(character);
  const parts = character.parts.map((part) => {
    const base = bind[part.id];
    if (!base) return part;
    const role = part.semanticRole;
    const delta = role && role !== "None" && role !== "Custom" ? preset.deltas[role] : undefined;
    return {
      ...part,
      transform: applyDelta(base.transform, delta),
      pivot: structuredClone(base.pivot),
      anchor: structuredClone(base.anchor),
      opacity: base.opacity,
    };
  });
  return { ...character, parts };
}

/** Capture current parts as deltas relative to bindPose (by semantic role). */
export function capturePosePreset(character: CharacterDefinition, id: string, labelRu: string): PosePreset {
  const bind = character.bindPose ?? captureBindPose(character);
  const deltas: PosePreset["deltas"] = {};
  for (const role of ROLE_ORDER) {
    const part = findPartByRole(character, role);
    if (!part) continue;
    const base = bind[part.id];
    if (!base) continue;
    const next: Partial<Transform> = {};
    const dx = part.transform.x - base.transform.x;
    const dy = part.transform.y - base.transform.y;
    const dr = part.transform.rotation - base.transform.rotation;
    const dsx = part.transform.scaleX - base.transform.scaleX;
    const dsy = part.transform.scaleY - base.transform.scaleY;
    if (Math.abs(dx) > 0.01) next.x = dx;
    if (Math.abs(dy) > 0.01) next.y = dy;
    if (Math.abs(dr) > 0.01) next.rotation = dr;
    if (Math.abs(dsx) > 0.001) next.scaleX = dsx;
    if (Math.abs(dsy) > 0.001) next.scaleY = dsy;
    if (Object.keys(next).length) deltas[role] = next;
  }
  return { id, labelRu, deltas };
}

export function addCustomPose(character: CharacterDefinition, labelRu: string): CharacterDefinition {
  const id = createId("pose");
  const preset = capturePosePreset(character, id, labelRu.trim() || "Своя поза");
  const poseLibrary = [...(character.poseLibrary ?? []), preset];
  return { ...character, poseLibrary };
}

export function removeCustomPose(character: CharacterDefinition, presetId: string): CharacterDefinition {
  if (builtInPosePresets.some((item) => item.id === presetId)) return character;
  return {
    ...character,
    poseLibrary: (character.poseLibrary ?? []).filter((item) => item.id !== presetId),
  };
}
