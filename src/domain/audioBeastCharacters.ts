/**
 * AudioBeast fight cast — character rigs defined in code.
 * PNG assets live in Characters/AudioBeast/<Name>/Assets/ (no character.json parse).
 *
 * Important: child parts are parented to Body, so their x/y/scale are in BODY PIXEL SPACE
 * (not the scaled on-screen size). Scaling the body must not be re-applied to children.
 */
import type { AssetDefinition, CharacterDefinition, RigPart, SemanticRole } from "./types";
import { ensureSemanticCharacter } from "./semantic";

export interface AudioBeastMonsterSpec {
  id: string;
  name: string;
  folder: string; // under Characters/
  actorScale: number;
  /**
   * Body sprite scale target: full PNG height in bind-pose pixels (before actor.scale).
   * Tuned with contentHeight so visible art matches across monsters (FrostFang PNG has huge padding).
   */
  targetHeight: number;
  /** Opaque body art height inside body.png (for equal on-screen size). */
  contentHeight: number;
}

/** Desired visible body height on screen after actor.scale (all cast members). */
export const AUDIO_BEAST_UNIFORM_VISIBLE_HEIGHT = 320;

/** Measured IHDR sizes for shipped AudioBeast PNGs. */
export const AUDIO_BEAST_ASSET_SIZES: Record<string, Record<string, { width: number; height: number }>> = {
  EmberPuff: {
    "body.png": { width: 453, height: 511 },
    "eye.png": { width: 180, height: 247 },
    "mouth.png": { width: 218, height: 73 },
    "arm.png": { width: 262, height: 292 },
    "leg.png": { width: 169, height: 171 },
  },
  FrostFang: {
    "body.png": { width: 1254, height: 1254 },
    "eye.png": { width: 198, height: 239 },
    "mouth.png": { width: 306, height: 137 },
    "arm.png": { width: 306, height: 319 },
    "leg.png": { width: 267, height: 230 },
  },
  GearBot: {
    "body.png": { width: 419, height: 413 },
    "eye.png": { width: 285, height: 277 },
    "mouth.png": { width: 292, height: 163 },
    "arm.png": { width: 317, height: 339 },
    "leg.png": { width: 232, height: 295 },
  },
};

function uniformTargetHeight(imageHeight: number, contentHeight: number): number {
  // visible ≈ targetHeight * (contentHeight / imageHeight) * actorScale; actorScale=1 → match UNIFORM.
  return Math.round(AUDIO_BEAST_UNIFORM_VISIBLE_HEIGHT * (imageHeight / contentHeight));
}

export const AUDIO_BEAST_FIGHT_CAST: AudioBeastMonsterSpec[] = [
  {
    id: "character-emberpuff",
    name: "EmberPuff",
    folder: "AudioBeast/EmberPuff",
    actorScale: 1,
    contentHeight: 471,
    targetHeight: uniformTargetHeight(511, 471),
  },
  {
    id: "character-frostfang",
    name: "FrostFang",
    folder: "AudioBeast/FrostFang",
    actorScale: 1,
    contentHeight: 1019,
    targetHeight: uniformTargetHeight(1254, 1019),
  },
  {
    id: "character-gearbot",
    name: "GearBot",
    folder: "AudioBeast/GearBot",
    actorScale: 1,
    contentHeight: 373,
    targetHeight: uniformTargetHeight(413, 373),
  },
];

/** On-screen visible body height ≈ targetHeight * (content/image) * actorScale */
export function audioBeastVisibleHeight(spec: AudioBeastMonsterSpec): number {
  const imageH = AUDIO_BEAST_ASSET_SIZES[spec.name]?.["body.png"]?.height ?? spec.targetHeight;
  return spec.targetHeight * (spec.contentHeight / imageH) * spec.actorScale;
}

const ASSET_FILES = ["body.png", "eye.png", "mouth.png", "arm.png", "leg.png"] as const;

export type AudioBeastAssetFile = (typeof ASSET_FILES)[number];

/** Relative asset filenames required in each monster Assets folder. */
export function audioBeastAssetFiles(): readonly AudioBeastAssetFile[] {
  return ASSET_FILES;
}

function part(
  id: string,
  name: string,
  assetId: string,
  parentId: string | null,
  zIndex: number,
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
  pivotX: number,
  pivotY: number,
  visible: boolean,
  opacity: number,
  semanticRole: SemanticRole,
): RigPart {
  return {
    id,
    name,
    assetId,
    parentId,
    zIndex,
    transform: { x, y, rotation, scaleX, scaleY },
    pivot: { x: pivotX, y: pivotY },
    anchor: { x: 0, y: 0 },
    visible,
    locked: false,
    opacity,
    semanticRole,
  };
}

function sizeOf(
  spec: AudioBeastMonsterSpec,
  file: AudioBeastAssetFile,
  override?: Partial<Record<AudioBeastAssetFile, { width: number; height: number }>>,
): { width: number; height: number } {
  return override?.[file] ?? AUDIO_BEAST_ASSET_SIZES[spec.name]?.[file] ?? { width: 256, height: 256 };
}

/**
 * Build a CharacterDefinition + assets for an AudioBeast monster.
 * `resolveAssetPath(fileName)` must return an absolute file path to Assets/<file>.
 */
export function buildAudioBeastCharacter(
  spec: AudioBeastMonsterSpec,
  resolveAssetPath: (fileName: AudioBeastAssetFile) => string,
  sizes?: Partial<Record<AudioBeastAssetFile, { width: number; height: number }>>,
): { character: CharacterDefinition; assets: AssetDefinition[] } {
  const body = sizeOf(spec, "body.png", sizes);
  const eye = sizeOf(spec, "eye.png", sizes);
  const mouth = sizeOf(spec, "mouth.png", sizes);
  const arm = sizeOf(spec, "arm.png", sizes);
  const leg = sizeOf(spec, "leg.png", sizes);

  const bw = body.width;
  const bh = body.height;
  const s = spec.targetHeight / bh;
  // Body pivot sits here in actor/bind space (scaled character footprint).
  const bodyX = Math.round((bw * s) / 2);
  const bodyY = Math.round((bh * s) / 2);
  // Children live in unscaled body pixel space (center = bw/2, bh/2).
  const bcx = bw / 2;
  const bcy = bh / 2;

  // Limb scales are relative to body pixels only (body.scale applies once via parent).
  const armScale = (bh * 0.42) / arm.height;
  const legScale = (bh * 0.28) / leg.height;
  const eyeScale = (bw * 0.11) / eye.width;
  const mouthScale = (bw * 0.26) / mouth.width;

  const prefix = spec.id.replace(/^character-/, "asset-");
  const assets: AssetDefinition[] = [
    { id: `${prefix}-body`, name: "body", path: resolveAssetPath("body.png"), mediaType: "image/png", width: body.width, height: body.height },
    { id: `${prefix}-eye`, name: "eye", path: resolveAssetPath("eye.png"), mediaType: "image/png", width: eye.width, height: eye.height },
    { id: `${prefix}-mouth`, name: "mouth", path: resolveAssetPath("mouth.png"), mediaType: "image/png", width: mouth.width, height: mouth.height },
    { id: `${prefix}-arm`, name: "arm", path: resolveAssetPath("arm.png"), mediaType: "image/png", width: arm.width, height: arm.height },
    { id: `${prefix}-leg`, name: "leg", path: resolveAssetPath("leg.png"), mediaType: "image/png", width: leg.width, height: leg.height },
  ];

  const bodyId = `${prefix}-body`;
  const eyeId = `${prefix}-eye`;
  const mouthId = `${prefix}-mouth`;
  const armId = `${prefix}-arm`;
  const legId = `${prefix}-leg`;

  const character = ensureSemanticCharacter({
    version: 1,
    id: spec.id,
    name: spec.name,
    parts: [
      part("body", "Body", bodyId, null, 10, bodyX, bodyY, 0, s, s, Math.round(bcx), Math.round(bcy), true, 1, "Body"),
      // Invisible head socket anchor near upper body (for semantics / attachments).
      part("head", "Head", bodyId, "body", 11, bcx, bh * 0.28, 0, 0.01, 0.01, 1, 1, false, 0, "Head"),
      part("eye-left", "EyeLeft", eyeId, "body", 22, bcx - bw * 0.16, bcy - bh * 0.14, 0, eyeScale, eyeScale, eye.width / 2, eye.height / 2, true, 1, "EyeLeft"),
      part("eye-right", "EyeRight", eyeId, "body", 22, bcx + bw * 0.16, bcy - bh * 0.14, 0, eyeScale, eyeScale, eye.width / 2, eye.height / 2, true, 1, "EyeRight"),
      part("mouth", "Mouth", mouthId, "body", 23, bcx, bcy + bh * 0.08, 0, mouthScale, mouthScale, mouth.width / 2, mouth.height / 2, true, 1, "Mouth"),
      // Arms in front so they stay readable on big round bodies.
      part("arm-left", "ArmLeft", armId, "body", 14, bw * 0.12, bcy - bh * 0.02, -14, armScale, armScale, arm.width * 0.55, arm.height * 0.12, true, 1, "ArmLeft"),
      part("arm-right", "ArmRight", armId, "body", 16, bw * 0.88, bcy - bh * 0.02, 14, -armScale, armScale, arm.width * 0.55, arm.height * 0.12, true, 1, "ArmRight"),
      part("leg-left", "LegLeft", legId, "body", 6, bcx - bw * 0.18, bh * 0.88, -4, legScale, legScale, leg.width / 2, leg.height * 0.12, true, 1, "LegLeft"),
      part("leg-right", "LegRight", legId, "body", 6, bcx + bw * 0.18, bh * 0.88, 4, -legScale, legScale, leg.width / 2, leg.height * 0.12, true, 1, "LegRight"),
    ],
    sockets: [
      { id: "socket-mouth", name: "Mouth", type: "Mouth", partId: "mouth", position: { x: 0, y: 0 } },
      { id: "socket-hand-left", name: "Left Hand", type: "HandLeft", partId: "arm-left", position: { x: 0, y: Math.round(arm.height * armScale * 0.75) } },
      { id: "socket-hand-right", name: "Right Hand", type: "HandRight", partId: "arm-right", position: { x: 0, y: Math.round(arm.height * armScale * 0.75) } },
    ],
  });

  return { character, assets };
}
