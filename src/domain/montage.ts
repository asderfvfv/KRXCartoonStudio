import { createId } from "./ids";
import type { ProjectDocument, Scene } from "./types";
import {
  normalizeMontageTransition,
  transitionNeedsOverlap,
  type MontageTransitionType,
} from "./montageTransitions";

export type { MontageTransitionType } from "./montageTransitions";
export {
  MONTAGE_TRANSITION_CATALOG,
  MONTAGE_TRANSITION_IDS,
  isMontageTransitionType,
  montageTransitionLabel,
  normalizeMontageTransition,
  transitionNeedsOverlap,
} from "./montageTransitions";

export const MONTAGE_SCHEMA_VERSION = 5;
/** Stage 9+: montage transitions (cut, crossfade, wipes…). */
export const CROSSFADE_SCHEMA_VERSION = 7;

export interface MontageClip {
  id: string;
  sceneId: string;
  enabled: boolean;
  /** Transition into the next enabled clip; falls back to montage.transition. */
  transitionOut?: MontageTransitionType;
}

export interface ProjectMontage {
  clips: MontageClip[];
  /** Default transition between consecutive enabled clips. */
  transition?: MontageTransitionType;
  /** Overlap / effect duration in seconds (clamped per adjacent pair). */
  crossfadeDuration?: number;
}

export interface MontageSegment {
  clip: MontageClip;
  scene: Scene;
  /** Start on the output timeline (accounts for transition overlap). */
  offset: number;
  duration: number;
}

export interface MontageBlendLayer {
  scene: Scene;
  localTime: number;
  segment: MontageSegment;
}

/** Result of mapping global montage time (optional A→B transition blend). */
export interface MontageTimeMap {
  scene: Scene;
  localTime: number;
  segment: MontageSegment;
  /** Present during overlapping transition: amount 0 = only from, 1 = only to. */
  blend?: {
    from: MontageBlendLayer;
    to: MontageBlendLayer;
    amount: number;
    kind: MontageTransitionType;
  };
}

export const DEFAULT_CROSSFADE_DURATION = 0.5;

export function scenePlaybackDuration(scene: Scene): number {
  return Math.max(0.01, scene.generatedTimeline?.duration ?? scene.duration ?? 1);
}

export function normalizeCrossfadeDuration(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_CROSSFADE_DURATION;
  return Math.max(0, Math.min(30, n));
}

function normalizeClip(clip: MontageClip): MontageClip {
  const next: MontageClip = {
    id: clip.id,
    sceneId: clip.sceneId,
    enabled: clip.enabled !== false,
  };
  if (clip.transitionOut != null) next.transitionOut = normalizeMontageTransition(clip.transitionOut);
  return next;
}

export function createDefaultMontage(scenes: Scene[] | undefined): ProjectMontage {
  return {
    clips: (scenes ?? []).map((scene) => ({
      id: createId("mclip"),
      sceneId: scene.id,
      enabled: true,
    })),
    transition: "cut",
    crossfadeDuration: DEFAULT_CROSSFADE_DURATION,
  };
}

/** Keep montage clips aligned with project scenes (add missing, drop deleted). */
export function syncMontageWithScenes(montage: ProjectMontage | undefined, scenes: Scene[] | undefined): ProjectMontage {
  const list = scenes ?? [];
  const previous = montage?.clips ?? [];
  const byScene = new Map(previous.map((clip) => [clip.sceneId, clip]));
  const clips: MontageClip[] = [];

  for (const clip of previous) {
    if (list.some((scene) => scene.id === clip.sceneId)) clips.push(normalizeClip(clip));
  }
  for (const scene of list) {
    if (!byScene.has(scene.id)) {
      clips.push({ id: createId("mclip"), sceneId: scene.id, enabled: true });
    }
  }
  return {
    clips,
    transition: normalizeMontageTransition(montage?.transition),
    crossfadeDuration: normalizeCrossfadeDuration(montage?.crossfadeDuration),
  };
}

/**
 * Max usable overlap for a pair: half of the shorter scene (keeps each sole portion > 0).
 */
export function maxCrossfadeForPair(durationA: number, durationB: number): number {
  return Math.max(0, Math.min(durationA, durationB) * 0.5);
}

/** Transition kind leaving `fromSegment` into the next enabled clip. */
export function transitionKindForJunction(
  project: ProjectDocument,
  fromSegment: MontageSegment,
): MontageTransitionType {
  const montage = syncMontageWithScenes(project.montage, project.scenes);
  return normalizeMontageTransition(fromSegment.clip.transitionOut ?? montage.transition);
}

/** Overlap seconds for a specific junction (0 for cut). */
export function overlapForJunction(
  project: ProjectDocument,
  fromSegment: MontageSegment,
  toSegment: MontageSegment,
  requestedDuration?: number,
): number {
  const kind = transitionKindForJunction(project, fromSegment);
  if (!transitionNeedsOverlap(kind)) return 0;
  const requested = normalizeCrossfadeDuration(
    requestedDuration ?? project.montage?.crossfadeDuration ?? DEFAULT_CROSSFADE_DURATION,
  );
  return Math.min(requested, maxCrossfadeForPair(fromSegment.duration, toSegment.duration));
}

/**
 * Max overlap used anywhere on the timeline (for UI “effective” readout).
 * Alias kept: effectiveCrossfadeDuration.
 */
export function effectiveTransitionDuration(project: ProjectDocument, segments?: MontageSegment[]): number {
  const list = segments ?? resolveMontageSegmentsRaw(project);
  if (list.length < 2) return 0;
  let max = 0;
  for (let i = 0; i < list.length - 1; i += 1) {
    max = Math.max(max, overlapForJunction(project, list[i]!, list[i + 1]!));
  }
  return max;
}

/** @deprecated use effectiveTransitionDuration — same behavior for mixed transitions. */
export const effectiveCrossfadeDuration = effectiveTransitionDuration;

/** Segments with raw sequential offsets (no overlap). */
function resolveMontageSegmentsRaw(project: ProjectDocument): MontageSegment[] {
  const scenes = project.scenes ?? [];
  const clips = project.montage?.clips ?? createDefaultMontage(scenes).clips;
  const segments: MontageSegment[] = [];
  let offset = 0;
  for (const clip of clips) {
    if (!clip.enabled) continue;
    const scene = scenes.find((item) => item.id === clip.sceneId);
    if (!scene) continue;
    const duration = scenePlaybackDuration(scene);
    segments.push({ clip: normalizeClip(clip), scene, offset, duration });
    offset += duration;
  }
  return segments;
}

/**
 * Enabled clips on the output timeline.
 * Overlapping transitions shorten total length by overlapping adjacent clips.
 */
export function resolveMontageSegments(project: ProjectDocument): MontageSegment[] {
  const raw = resolveMontageSegmentsRaw(project);
  if (raw.length < 2) return raw;

  const segments: MontageSegment[] = [];
  let offset = 0;
  for (let i = 0; i < raw.length; i += 1) {
    segments.push({ ...raw[i]!, offset });
    if (i < raw.length - 1) {
      const fade = overlapForJunction(project, raw[i]!, raw[i + 1]!);
      offset += raw[i]!.duration - fade;
    } else {
      offset += raw[i]!.duration;
    }
  }
  return segments;
}

export function montageTotalDuration(project: ProjectDocument): number {
  const segments = resolveMontageSegments(project);
  if (!segments.length) return 0;
  const last = segments[segments.length - 1]!;
  return last.offset + last.duration;
}

function montageMeta(montage: ProjectMontage): Pick<ProjectMontage, "transition" | "crossfadeDuration"> {
  return {
    transition: normalizeMontageTransition(montage.transition),
    crossfadeDuration: normalizeCrossfadeDuration(montage.crossfadeDuration),
  };
}

export function moveMontageClip(montage: ProjectMontage, clipId: string, direction: -1 | 1): ProjectMontage {
  const clips = [...montage.clips];
  const index = clips.findIndex((clip) => clip.id === clipId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= clips.length) {
    return { clips: montage.clips, ...montageMeta(montage) };
  }
  [clips[index], clips[target]] = [clips[target]!, clips[index]!];
  return { clips, ...montageMeta(montage) };
}

/** Move clip to absolute index (for drag-and-drop reorder). */
export function reorderMontageClip(montage: ProjectMontage, clipId: string, toIndex: number): ProjectMontage {
  const clips = [...montage.clips];
  const from = clips.findIndex((clip) => clip.id === clipId);
  if (from < 0) return { clips: montage.clips, ...montageMeta(montage) };
  const clamped = Math.max(0, Math.min(clips.length - 1, Math.round(toIndex)));
  if (clamped === from) return { clips: montage.clips, ...montageMeta(montage) };
  const [item] = clips.splice(from, 1);
  clips.splice(clamped, 0, item!);
  return { clips, ...montageMeta(montage) };
}

export function setMontageClipTransitionOut(
  montage: ProjectMontage,
  clipId: string,
  transitionOut: MontageTransitionType | null,
): ProjectMontage {
  return {
    ...montageMeta(montage),
    clips: montage.clips.map((clip) => {
      if (clip.id !== clipId) return clip;
      if (transitionOut == null) {
        return { id: clip.id, sceneId: clip.sceneId, enabled: clip.enabled };
      }
      return { ...clip, transitionOut: normalizeMontageTransition(transitionOut) };
    }),
  };
}

export function validateMontage(project: ProjectDocument): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const segments = resolveMontageSegments(project);
  if (!segments.length) errors.push("В монтаже нет включённых сцен.");
  if (montageTotalDuration(project) <= 0) errors.push("Длительность монтажа должна быть > 0.");
  const requested = normalizeCrossfadeDuration(project.montage?.crossfadeDuration);
  if (requested > 0 && segments.length >= 2) {
    for (let i = 0; i < segments.length - 1; i += 1) {
      const kind = transitionKindForJunction(project, segments[i]!);
      if (!transitionNeedsOverlap(kind)) continue;
      const fade = overlapForJunction(project, segments[i]!, segments[i + 1]!);
      if (fade <= 0) {
        errors.push("Переход слишком длинный для длительности соседних сцен.");
        break;
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function buildMontageVideoFileName(projectName: string, format: "mp4" | "webm"): string {
  const safe = projectName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "cartoon";
  return `${safe}_montage.${format}`;
}

export function buildMontageSequenceFolderName(projectName: string): string {
  const safe = projectName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "cartoon";
  return `${safe}_montage_frames`;
}

/** Markers for UI: where each scene handoff sits on the montage timeline. */
export interface MontageTransitionMarker {
  index: number;
  fromName: string;
  toName: string;
  /** Global time when the next scene starts contributing (cut point or fade start). */
  start: number;
  end: number;
  mid: number;
  kind: MontageTransitionType;
}

export function listMontageTransitions(project: ProjectDocument): MontageTransitionMarker[] {
  const segments = resolveMontageSegments(project);
  if (segments.length < 2) return [];
  const markers: MontageTransitionMarker[] = [];
  for (let i = 0; i < segments.length - 1; i += 1) {
    const from = segments[i]!;
    const to = segments[i + 1]!;
    const kind = transitionKindForJunction(project, from);
    const fade = overlapForJunction(project, from, to);
    if (transitionNeedsOverlap(kind) && fade > 0) {
      markers.push({
        index: i,
        fromName: from.scene.name,
        toName: to.scene.name,
        start: to.offset,
        end: to.offset + fade,
        mid: to.offset + fade * 0.5,
        kind,
      });
    } else {
      markers.push({
        index: i,
        fromName: from.scene.name,
        toName: to.scene.name,
        start: to.offset,
        end: to.offset,
        mid: to.offset,
        kind: "cut",
      });
    }
  }
  return markers;
}

/** Map global montage time → scene + local time (+ optional transition blend). */
export function mapMontageTime(project: ProjectDocument, globalTime: number): MontageTimeMap | null {
  const segments = resolveMontageSegments(project);
  if (!segments.length) return null;
  const total = montageTotalDuration(project);
  const t = Math.max(0, Math.min(globalTime, total));

  const active: Array<{ index: number; localTime: number }> = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]!;
    const end = segment.offset + segment.duration;
    if (t >= segment.offset && (t < end || (i === segments.length - 1 && t <= end))) {
      active.push({
        index: i,
        localTime: Math.min(segment.duration, Math.max(0, t - segment.offset)),
      });
    }
  }

  if (active.length >= 2) {
    const fromInfo = active[0]!;
    const toInfo = active[active.length - 1]!;
    const fromSeg = segments[fromInfo.index]!;
    const toSeg = segments[toInfo.index]!;
    const kind = transitionKindForJunction(project, fromSeg);
    const fade = overlapForJunction(project, fromSeg, toSeg);
    if (transitionNeedsOverlap(kind) && fade > 0) {
      const amount = Math.min(1, Math.max(0, (t - toSeg.offset) / fade));
      const from: MontageBlendLayer = { scene: fromSeg.scene, localTime: fromInfo.localTime, segment: fromSeg };
      const to: MontageBlendLayer = { scene: toSeg.scene, localTime: toInfo.localTime, segment: toSeg };
      const primary = amount >= 0.5 ? to : from;
      return {
        scene: primary.scene,
        localTime: primary.localTime,
        segment: primary.segment,
        blend: { from, to, amount, kind },
      };
    }
  }

  if (active.length >= 1) {
    const pick = active[active.length - 1]!;
    const segment = segments[pick.index]!;
    return { scene: segment.scene, localTime: pick.localTime, segment };
  }

  const last = segments[segments.length - 1]!;
  return { scene: last.scene, localTime: last.duration, segment: last };
}
