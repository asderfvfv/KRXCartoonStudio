import { createId } from "./ids";
import { svgToDataUrl } from "./characterCreator";
import type { AssetDefinition, CharacterDefinition, SocketType, Vec2 } from "./types";

export const ATTACHMENT_SCHEMA_VERSION = 6;
/** Stage 10: PartForge presets + timed visibility + expanded library. */
export const PARTFORGE_SCHEMA_VERSION = 8;

export type AttachmentKind =
  | "hat"
  | "sword"
  | "bubble"
  | "star"
  | "glasses"
  | "shield"
  | "wand"
  | "book"
  | "cloud"
  | "heart"
  | "flag"
  | "custom";

export interface ActorAttachment {
  id: string;
  name: string;
  actorId: string;
  /** Resolve socket by type on the actor character (portable across similar rigs). */
  socketType: SocketType;
  /** Optional exact socket id; wins over socketType when present. */
  socketId?: string | null;
  assetId: string;
  offset: Vec2;
  rotation: number;
  scale: Vec2;
  anchor: Vec2;
  zIndex: number;
  opacity: number;
  visible: boolean;
  kind?: AttachmentKind;
  flipX?: boolean;
  flipY?: boolean;
  /** Inclusive local scene time window; null/undefined = always (when visible). */
  startTime?: number | null;
  endTime?: number | null;
}

/** Reusable PartForge preset stored on the project (local-only). */
export interface AttachmentPreset {
  id: string;
  name: string;
  kind: AttachmentKind;
  socketType: SocketType;
  /** Baked asset already in project.assets */
  assetId: string;
  offset: Vec2;
  rotation: number;
  scale: Vec2;
  anchor: Vec2;
  zIndex: number;
  opacity: number;
  flipX?: boolean;
  flipY?: boolean;
  libraryId?: string | null;
  color?: string | null;
}

export interface AttachmentLibraryItem {
  id: string;
  label: string;
  kind: AttachmentKind;
  preferredSocket: SocketType;
  width: number;
  height: number;
  createSvg(color: string): string;
}

export const attachmentLibrary: AttachmentLibraryItem[] = [
  {
    id: "lib-hat",
    label: "Hat",
    kind: "hat",
    preferredSocket: "HeadTop",
    width: 120,
    height: 70,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="70" viewBox="0 0 120 70"><ellipse cx="60" cy="52" rx="54" ry="12" fill="${color}"/><path d="M22 48 Q60 8 98 48" fill="${color}" stroke="#1b1e21" stroke-width="3"/></svg>`,
  },
  {
    id: "lib-glasses",
    label: "Glasses",
    kind: "glasses",
    preferredSocket: "HeadTop",
    width: 110,
    height: 40,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="40" viewBox="0 0 110 40"><circle cx="32" cy="22" r="16" fill="none" stroke="${color}" stroke-width="4"/><circle cx="78" cy="22" r="16" fill="none" stroke="${color}" stroke-width="4"/><path d="M48 22 H62" stroke="${color}" stroke-width="4"/><path d="M16 18 H4" stroke="${color}" stroke-width="3"/><path d="M94 18 H106" stroke="${color}" stroke-width="3"/></svg>`,
  },
  {
    id: "lib-sword",
    label: "Sword",
    kind: "sword",
    preferredSocket: "HandRight",
    width: 40,
    height: 160,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="160" viewBox="0 0 40 160"><rect x="16" y="20" width="8" height="100" rx="2" fill="#cfd7dc"/><polygon points="20,4 28,22 12,22" fill="#e8eef2"/><rect x="10" y="118" width="20" height="10" rx="2" fill="${color}"/><rect x="17" y="128" width="6" height="24" rx="2" fill="#5a3a22"/></svg>`,
  },
  {
    id: "lib-wand",
    label: "Wand",
    kind: "wand",
    preferredSocket: "HandRight",
    width: 36,
    height: 140,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="140" viewBox="0 0 36 140"><rect x="15" y="28" width="6" height="100" rx="2" fill="#6b4a2e"/><circle cx="18" cy="18" r="12" fill="${color}" stroke="#1b1e21" stroke-width="2"/><circle cx="18" cy="18" r="4" fill="#fff6c8"/></svg>`,
  },
  {
    id: "lib-shield",
    label: "Shield",
    kind: "shield",
    preferredSocket: "HandLeft",
    width: 90,
    height: 110,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="110" viewBox="0 0 90 110"><path d="M45 8 L78 24 V58 Q78 88 45 102 Q12 88 12 58 V24 Z" fill="${color}" stroke="#1b1e21" stroke-width="3"/><path d="M45 22 L66 32 V56 Q66 74 45 84 Q24 74 24 56 V32 Z" fill="#ffffff44"/></svg>`,
  },
  {
    id: "lib-bubble",
    label: "Speech Bubble",
    kind: "bubble",
    preferredSocket: "Mouth",
    width: 140,
    height: 90,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="90" viewBox="0 0 140 90"><rect x="8" y="8" width="124" height="58" rx="18" fill="${color}" stroke="#1b1e21" stroke-width="3"/><path d="M48 66 L40 84 L68 66" fill="${color}" stroke="#1b1e21" stroke-width="3"/></svg>`,
  },
  {
    id: "lib-book",
    label: "Book",
    kind: "book",
    preferredSocket: "HandLeft",
    width: 70,
    height: 90,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="70" height="90" viewBox="0 0 70 90"><rect x="8" y="10" width="54" height="70" rx="4" fill="${color}" stroke="#1b1e21" stroke-width="3"/><path d="M35 10 V80" stroke="#1b1e21" stroke-width="2"/><rect x="14" y="22" width="16" height="4" fill="#fff8"/><rect x="40" y="22" width="16" height="4" fill="#fff8"/></svg>`,
  },
  {
    id: "lib-star",
    label: "Star Effect",
    kind: "star",
    preferredSocket: "Custom",
    width: 72,
    height: 72,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72"><polygon points="36,4 44,28 70,28 49,44 57,68 36,52 15,68 23,44 2,28 28,28" fill="${color}" stroke="#1b1e21" stroke-width="2"/></svg>`,
  },
  {
    id: "lib-heart",
    label: "Heart",
    kind: "heart",
    preferredSocket: "Custom",
    width: 64,
    height: 58,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="58" viewBox="0 0 64 58"><path d="M32 52 C12 36 4 24 4 16 A12 12 0 0 1 28 16 L32 22 L36 16 A12 12 0 0 1 60 16 C60 24 52 36 32 52 Z" fill="${color}" stroke="#1b1e21" stroke-width="2"/></svg>`,
  },
  {
    id: "lib-cloud",
    label: "Cloud",
    kind: "cloud",
    preferredSocket: "HeadTop",
    width: 120,
    height: 70,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="70" viewBox="0 0 120 70"><ellipse cx="48" cy="40" rx="28" ry="18" fill="${color}"/><ellipse cx="72" cy="36" rx="30" ry="20" fill="${color}"/><ellipse cx="58" cy="48" rx="36" ry="16" fill="${color}" stroke="#1b1e21" stroke-width="2"/></svg>`,
  },
  {
    id: "lib-flag",
    label: "Flag",
    kind: "flag",
    preferredSocket: "HandRight",
    width: 100,
    height: 120,
    createSvg: (color) => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="120" viewBox="0 0 100 120"><rect x="12" y="8" width="6" height="104" fill="#5a3a22"/><path d="M18 12 H88 L72 36 L88 60 H18 Z" fill="${color}" stroke="#1b1e21" stroke-width="2"/></svg>`,
  },
];

export function createEmptyAttachment(
  partial: Partial<ActorAttachment> & Pick<ActorAttachment, "id" | "actorId" | "assetId" | "name">,
): ActorAttachment {
  return {
    socketType: "HandRight",
    socketId: null,
    offset: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    zIndex: 50,
    opacity: 1,
    visible: true,
    kind: "custom",
    flipX: false,
    flipY: false,
    startTime: null,
    endTime: null,
    ...partial,
  };
}

export function resolveAttachmentSocket(character: CharacterDefinition, attachment: ActorAttachment) {
  const sockets = character.sockets ?? [];
  if (attachment.socketId) {
    const exact = sockets.find((socket) => socket.id === attachment.socketId);
    if (exact) return exact;
  }
  return sockets.find((socket) => socket.type === attachment.socketType) ?? null;
}

export function createLibraryAttachmentAsset(item: AttachmentLibraryItem, color = "#e5b94e"): AssetDefinition {
  const svg = item.createSvg(color);
  return {
    id: createId(`asset-${item.kind}`),
    name: item.label,
    path: svgToDataUrl(svg),
    mediaType: "image/svg+xml",
    width: item.width,
    height: item.height,
  };
}

export function validateAttachment(attachment: Partial<ActorAttachment>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!attachment.actorId) errors.push("Attachment без actorId.");
  if (!attachment.assetId) errors.push("Attachment без assetId.");
  if (!attachment.socketType) errors.push("Attachment без socketType.");
  if (
    attachment.startTime != null
    && attachment.endTime != null
    && Number.isFinite(attachment.startTime)
    && Number.isFinite(attachment.endTime)
    && attachment.endTime < attachment.startTime
  ) {
    errors.push("Attachment endTime < startTime.");
  }
  return { ok: errors.length === 0, errors };
}

/** Visible flag + optional local scene time window. */
export function isAttachmentVisibleAt(attachment: ActorAttachment, timeSeconds: number): boolean {
  if (!attachment.visible) return false;
  const start = attachment.startTime;
  const end = attachment.endTime;
  if (start != null && Number.isFinite(start) && timeSeconds < start) return false;
  if (end != null && Number.isFinite(end) && timeSeconds > end) return false;
  return true;
}

export function attachmentDrawScale(attachment: ActorAttachment): Vec2 {
  return {
    x: attachment.scale.x * (attachment.flipX ? -1 : 1),
    y: attachment.scale.y * (attachment.flipY ? -1 : 1),
  };
}

export function createPresetFromAttachment(attachment: ActorAttachment, name?: string): AttachmentPreset {
  return {
    id: createId("preset"),
    name: name?.trim() || `${attachment.name} Preset`,
    kind: attachment.kind ?? "custom",
    socketType: attachment.socketType,
    assetId: attachment.assetId,
    offset: { ...attachment.offset },
    rotation: attachment.rotation,
    scale: { ...attachment.scale },
    anchor: { ...attachment.anchor },
    zIndex: attachment.zIndex,
    opacity: attachment.opacity,
    flipX: Boolean(attachment.flipX),
    flipY: Boolean(attachment.flipY),
    libraryId: null,
    color: null,
  };
}

export function attachmentFromPreset(
  preset: AttachmentPreset,
  actorId: string,
  id = createId("attach"),
): ActorAttachment {
  return createEmptyAttachment({
    id,
    name: preset.name.replace(/\s+Preset$/i, "") || preset.name,
    actorId,
    assetId: preset.assetId,
    socketType: preset.socketType,
    offset: { ...preset.offset },
    rotation: preset.rotation,
    scale: { ...preset.scale },
    anchor: { ...preset.anchor },
    zIndex: preset.zIndex,
    opacity: preset.opacity,
    flipX: Boolean(preset.flipX),
    flipY: Boolean(preset.flipY),
    kind: preset.kind,
  });
}

export function duplicateAttachment(source: ActorAttachment, id = createId("attach")): ActorAttachment {
  return {
    ...structuredClone(source),
    id,
    name: `${source.name} Copy`,
  };
}
