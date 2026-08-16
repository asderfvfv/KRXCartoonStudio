import { createId } from "./ids";
import { captureBindPose, ensureSemanticCharacter, findPartByRole } from "./semantic";
import type { AssetDefinition, CharacterDefinition, RigPart, RigSocket, SemanticRole, Transform, Vec2 } from "./types";

export type CreatorSlotId =
  | "body"
  | "head"
  | "eyeLeft"
  | "eyeRight"
  | "mouth"
  | "armLeft"
  | "handLeft"
  | "armRight"
  | "handRight"
  | "legLeft"
  | "legRight"
  | "clothes";

export interface CreatorSlot {
  id: CreatorSlotId;
  label: string;
  role: SemanticRole;
  parentRole: SemanticRole | null;
  customRole?: string;
  optional?: boolean;
  width: number;
  height: number;
  transform: Transform;
  pivot: Vec2;
  zIndex: number;
}

export interface CreatorPalette {
  body: string;
  accent: string;
  eyes: string;
  mouth: string;
  clothes: string;
}

export interface PartLibraryItem {
  id: string;
  label: string;
  role: SemanticRole;
  asset: AssetDefinition;
}

export const creatorSlots: CreatorSlot[] = [
  { id: "body", label: "Тело", role: "Body", parentRole: null, width: 220, height: 310, transform: { x: 110, y: 150, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 110, y: 150 }, zIndex: 10 },
  { id: "head", label: "Голова", role: "Head", parentRole: "Body", width: 240, height: 210, transform: { x: 110, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 120, y: 105 }, zIndex: 20 },
  { id: "eyeLeft", label: "Глаз Л", role: "EyeLeft", parentRole: "Head", width: 32, height: 42, transform: { x: 88, y: 82, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 16, y: 21 }, zIndex: 22 },
  { id: "eyeRight", label: "Глаз П", role: "EyeRight", parentRole: "Head", width: 32, height: 42, transform: { x: 152, y: 82, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 16, y: 21 }, zIndex: 22 },
  { id: "mouth", label: "Рот", role: "Mouth", parentRole: "Head", optional: true, width: 72, height: 36, transform: { x: 120, y: 150, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 36, y: 12 }, zIndex: 23 },
  { id: "armLeft", label: "Рука Л", role: "ArmLeft", parentRole: "Body", width: 72, height: 210, transform: { x: 20, y: 65, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 36, y: 28 }, zIndex: 8 },
  { id: "handLeft", label: "Кисть Л", role: "HandLeft", parentRole: "ArmLeft", width: 68, height: 72, transform: { x: 36, y: 190, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 34, y: 15 }, zIndex: 9 },
  { id: "armRight", label: "Рука П", role: "ArmRight", parentRole: "Body", width: 72, height: 210, transform: { x: 200, y: 65, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 36, y: 28 }, zIndex: 12 },
  { id: "handRight", label: "Кисть П", role: "HandRight", parentRole: "ArmRight", width: 68, height: 72, transform: { x: 36, y: 190, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 34, y: 15 }, zIndex: 13 },
  { id: "legLeft", label: "Нога Л", role: "LegLeft", parentRole: "Body", width: 82, height: 225, transform: { x: 65, y: 290, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 41, y: 22 }, zIndex: 7 },
  { id: "legRight", label: "Нога П", role: "LegRight", parentRole: "Body", width: 82, height: 225, transform: { x: 155, y: 290, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 41, y: 22 }, zIndex: 7 },
  { id: "clothes", label: "Одежда", role: "Custom", parentRole: "Body", customRole: "Clothes", optional: true, width: 200, height: 180, transform: { x: 110, y: 170, rotation: 0, scaleX: 1, scaleY: 1 }, pivot: { x: 100, y: 40 }, zIndex: 11 },
];

export const defaultCreatorPalette: CreatorPalette = {
  body: "#3fa5b6",
  accent: "#2a6f7a",
  eyes: "#10252a",
  mouth: "#c45c5c",
  clothes: "#e5b94e",
};

const demobotSizes: Record<string, { width: number; height: number }> = {
  body: { width: 220, height: 310 },
  head: { width: 240, height: 210 },
  "eye-left": { width: 32, height: 42 },
  "eye-right": { width: 32, height: 42 },
  "arm-left": { width: 72, height: 210 },
  "arm-right": { width: 72, height: 210 },
  "hand-left": { width: 68, height: 72 },
  "hand-right": { width: 68, height: 72 },
  "leg-left": { width: 82, height: 225 },
  "leg-right": { width: 82, height: 225 },
};

export function createDefaultPalette(partial?: Partial<CreatorPalette>): CreatorPalette {
  return { ...defaultCreatorPalette, ...partial };
}

export function svgToDataUrl(svg: string): string {
  const normalized = svg.replace(/\s+/g, " ").trim();
  if (typeof btoa === "function") {
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(normalized)))}`;
  }
  return `data:image/svg+xml;base64,${Buffer.from(normalized, "utf8").toString("base64")}`;
}

export function createProceduralPartSvg(slot: CreatorSlot, palette: CreatorPalette): string {
  const { width: w, height: h } = slot;
  const stroke = palette.accent;
  switch (slot.id) {
    case "body":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="30" y="20" width="160" height="270" rx="48" fill="${palette.body}" stroke="${stroke}" stroke-width="6"/></svg>`;
    case "head":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><ellipse cx="120" cy="110" rx="100" ry="90" fill="${palette.body}" stroke="${stroke}" stroke-width="6"/><ellipse cx="120" cy="150" rx="42" ry="18" fill="${palette.accent}" opacity=".35"/></svg>`;
    case "eyeLeft":
    case "eyeRight":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><ellipse cx="16" cy="21" rx="14" ry="18" fill="#f7fbfc" stroke="${stroke}" stroke-width="3"/><circle cx="16" cy="23" r="7" fill="${palette.eyes}"/></svg>`;
    case "mouth":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="M8 12 Q36 34 64 12" fill="none" stroke="${palette.mouth}" stroke-width="8" stroke-linecap="round"/><ellipse cx="36" cy="18" rx="18" ry="8" fill="${palette.mouth}" opacity=".55"/></svg>`;
    case "armLeft":
    case "armRight":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="18" y="8" width="36" height="190" rx="18" fill="${palette.body}" stroke="${stroke}" stroke-width="5"/></svg>`;
    case "handLeft":
    case "handRight":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><ellipse cx="34" cy="36" rx="28" ry="30" fill="${palette.body}" stroke="${stroke}" stroke-width="5"/></svg>`;
    case "legLeft":
    case "legRight":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="18" y="6" width="46" height="200" rx="20" fill="${palette.accent}" stroke="${stroke}" stroke-width="5"/><ellipse cx="41" cy="210" rx="34" ry="14" fill="${palette.body}" stroke="${stroke}" stroke-width="4"/></svg>`;
    case "clothes":
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="M40 20 L100 8 L160 20 L178 70 L150 170 L50 170 L22 70 Z" fill="${palette.clothes}" stroke="${stroke}" stroke-width="5" opacity=".92"/></svg>`;
    default:
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" rx="12" fill="${palette.body}"/></svg>`;
  }
}

export function createProceduralAsset(slot: CreatorSlot, palette: CreatorPalette, assetId = createId("asset")): AssetDefinition {
  const svg = createProceduralPartSvg(slot, palette);
  return {
    id: assetId,
    name: `${slot.id}-procedural`,
    path: svgToDataUrl(svg),
    mediaType: "image/svg+xml",
    width: slot.width,
    height: slot.height,
  };
}

export function listDemoBotLibrary(): PartLibraryItem[] {
  const map: Array<[CreatorSlotId, string, SemanticRole]> = [
    ["body", "body", "Body"],
    ["head", "head", "Head"],
    ["eyeLeft", "eye-left", "EyeLeft"],
    ["eyeRight", "eye-right", "EyeRight"],
    ["armLeft", "arm-left", "ArmLeft"],
    ["armRight", "arm-right", "ArmRight"],
    ["handLeft", "hand-left", "HandLeft"],
    ["handRight", "hand-right", "HandRight"],
    ["legLeft", "leg-left", "LegLeft"],
    ["legRight", "leg-right", "LegRight"],
  ];
  return map.map(([slotId, file, role]) => {
    const size = demobotSizes[file];
    return {
      id: `lib-demobot-${file}`,
      label: `DemoBot · ${slotId}`,
      role,
      asset: {
        id: `asset-demobot-${file}`,
        name: file,
        path: `builtin://demobot/${file}.svg`,
        mediaType: "image/svg+xml",
        width: size.width,
        height: size.height,
      },
    };
  });
}

export function findSlot(slotId: CreatorSlotId): CreatorSlot {
  const slot = creatorSlots.find((item) => item.id === slotId);
  if (!slot) throw new Error(`Unknown creator slot: ${slotId}`);
  return slot;
}

export function findSlotByRole(role: SemanticRole, customRole?: string): CreatorSlot | undefined {
  return creatorSlots.find((slot) => slot.role === role && (role !== "Custom" || slot.customRole === customRole));
}

function makePart(slot: CreatorSlot, assetId: string, partId = createId("part")): RigPart {
  return {
    id: partId,
    name: slot.customRole ?? slot.label,
    assetId,
    parentId: null,
    zIndex: slot.zIndex,
    transform: structuredClone(slot.transform),
    pivot: structuredClone(slot.pivot),
    anchor: { x: 0, y: 0 },
    visible: true,
    locked: false,
    opacity: 1,
    semanticRole: slot.role,
    customSemanticRole: slot.customRole,
  };
}

export function applyCreatorHierarchy(character: CharacterDefinition): CharacterDefinition {
  const byRole = new Map<SemanticRole, RigPart>();
  for (const part of character.parts) {
    const role = part.semanticRole ?? "None";
    if (role !== "None" && role !== "Custom") byRole.set(role, part);
  }
  const clothes = character.parts.find((part) => part.semanticRole === "Custom" && part.customSemanticRole === "Clothes");
  const parts = character.parts.map((part) => {
    const slot = findSlotByRole(part.semanticRole ?? "None", part.customSemanticRole);
    if (!slot) return part;
    if (!slot.parentRole) return { ...part, parentId: null };
    if (slot.parentRole === "Body" && slot.id === "clothes") {
      return { ...part, parentId: byRole.get("Body")?.id ?? part.parentId };
    }
    const parent = byRole.get(slot.parentRole);
    return { ...part, parentId: parent?.id ?? null };
  });
  if (clothes) {
    const body = byRole.get("Body");
    const index = parts.findIndex((part) => part.id === clothes.id);
    if (index >= 0 && body) parts[index] = { ...parts[index], parentId: body.id };
  }
  return { ...character, parts };
}

export function ensureCreatorSockets(character: CharacterDefinition): RigSocket[] {
  const sockets = [...(character.sockets ?? [])];
  const ensure = (id: string, name: string, type: RigSocket["type"], role: SemanticRole, position: Vec2) => {
    const part = findPartByRole(character, role);
    if (!part) return;
    if (sockets.some((item) => item.id === id || (item.type === type && item.partId === part.id))) return;
    sockets.push({ id, name, type, partId: part.id, position });
  };
  ensure("socket-head-top", "Head Top", "HeadTop", "Head", { x: 120, y: 4 });
  ensure("socket-mouth", "Mouth", "Mouth", "Mouth", { x: 36, y: 12 });
  ensure("socket-hand-left", "Left Hand", "HandLeft", "HandLeft", { x: 34, y: 36 });
  ensure("socket-hand-right", "Right Hand", "HandRight", "HandRight", { x: 34, y: 36 });
  return sockets;
}

export function upsertSlotAsset(
  character: CharacterDefinition,
  assets: AssetDefinition[],
  slot: CreatorSlot,
  asset: AssetDefinition,
): { character: CharacterDefinition; assets: AssetDefinition[] } {
  const nextAssets = [...assets];
  const existingAssetIndex = nextAssets.findIndex((item) => item.id === asset.id);
  if (existingAssetIndex >= 0) nextAssets[existingAssetIndex] = asset;
  else nextAssets.push(asset);

  const existingPart = character.parts.find((part) => {
    if (slot.role === "Custom") return part.semanticRole === "Custom" && part.customSemanticRole === slot.customRole;
    return part.semanticRole === slot.role;
  });

  let parts: RigPart[];
  if (existingPart) {
    parts = character.parts.map((part) => (part.id === existingPart.id
      ? { ...part, assetId: asset.id, name: slot.customRole ?? slot.label, semanticRole: slot.role, customSemanticRole: slot.customRole, zIndex: slot.zIndex }
      : part));
  } else {
    parts = [...character.parts, makePart(slot, asset.id)];
  }

  let nextCharacter: CharacterDefinition = ensureSemanticCharacter({
    ...character,
    parts,
  });
  nextCharacter = applyCreatorHierarchy(nextCharacter);
  nextCharacter = {
    ...nextCharacter,
    sockets: ensureCreatorSockets(nextCharacter),
    bindPose: captureBindPose(nextCharacter),
  };
  return { character: nextCharacter, assets: nextAssets };
}

export function removeSlotPart(
  character: CharacterDefinition,
  assets: AssetDefinition[],
  slot: CreatorSlot,
): { character: CharacterDefinition; assets: AssetDefinition[] } {
  const target = character.parts.find((part) => {
    if (slot.role === "Custom") return part.semanticRole === "Custom" && part.customSemanticRole === slot.customRole;
    return part.semanticRole === slot.role;
  });
  if (!target) return { character, assets };
  const parts = character.parts
    .filter((part) => part.id !== target.id)
    .map((part) => (part.parentId === target.id ? { ...part, parentId: target.parentId } : part));
  const used = new Set(parts.map((part) => part.assetId));
  const nextAssets = assets.filter((asset) => used.has(asset.id));
  let nextCharacter: CharacterDefinition = ensureSemanticCharacter({
    ...character,
    parts,
    sockets: (character.sockets ?? []).filter((socket) => socket.partId !== target.id),
  });
  nextCharacter = applyCreatorHierarchy(nextCharacter);
  nextCharacter = { ...nextCharacter, bindPose: captureBindPose(nextCharacter), sockets: ensureCreatorSockets(nextCharacter) };
  return { character: nextCharacter, assets: nextAssets };
}

export function buildEmptyCharacter(name: string, id = createId("character")): CharacterDefinition {
  return ensureSemanticCharacter({
    version: 1,
    id,
    name,
    parts: [],
    sockets: [],
    bindPose: {},
  });
}

export function buildProceduralCharacter(
  name: string,
  palette: CreatorPalette = defaultCreatorPalette,
  id = createId("character"),
  includeOptional = true,
): { character: CharacterDefinition; assets: AssetDefinition[] } {
  let character = buildEmptyCharacter(name, id);
  let assets: AssetDefinition[] = [];
  for (const slot of creatorSlots) {
    if (slot.optional && !includeOptional) continue;
    const asset = createProceduralAsset(slot, palette, createId(`asset-${slot.id}`));
    const result = upsertSlotAsset(character, assets, slot, asset);
    character = result.character;
    assets = result.assets;
  }
  return { character, assets };
}

export function buildLibraryCharacter(
  name: string,
  palette: CreatorPalette = defaultCreatorPalette,
  id = createId("character"),
): { character: CharacterDefinition; assets: AssetDefinition[] } {
  let character = buildEmptyCharacter(name, id);
  let assets: AssetDefinition[] = [];
  const library = listDemoBotLibrary();
  for (const slot of creatorSlots) {
    if (slot.id === "mouth" || slot.id === "clothes") {
      const asset = createProceduralAsset(slot, palette, createId(`asset-${slot.id}`));
      const result = upsertSlotAsset(character, assets, slot, asset);
      character = result.character;
      assets = result.assets;
      continue;
    }
    const item = library.find((entry) => entry.role === slot.role);
    if (!item) continue;
    const asset: AssetDefinition = {
      ...item.asset,
      id: createId(`asset-${slot.id}`),
    };
    const result = upsertSlotAsset(character, assets, slot, asset);
    character = result.character;
    assets = result.assets;
  }
  return { character, assets };
}

export function slotFilled(character: CharacterDefinition, slot: CreatorSlot): boolean {
  return character.parts.some((part) => {
    if (slot.role === "Custom") return part.semanticRole === "Custom" && part.customSemanticRole === slot.customRole;
    return part.semanticRole === slot.role;
  });
}

export function creatorProgress(character: CharacterDefinition): { filled: number; requiredFilled: number; required: number; total: number } {
  const requiredSlots = creatorSlots.filter((slot) => !slot.optional);
  return {
    filled: creatorSlots.filter((slot) => slotFilled(character, slot)).length,
    requiredFilled: requiredSlots.filter((slot) => slotFilled(character, slot)).length,
    required: requiredSlots.length,
    total: creatorSlots.length,
  };
}

export function requiredSlotsComplete(character: CharacterDefinition): boolean {
  return creatorSlots.filter((slot) => !slot.optional).every((slot) => slotFilled(character, slot));
}
