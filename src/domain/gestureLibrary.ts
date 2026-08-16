/**
 * Gesture / clip library: RU catalog, bake MotionLibrary → AnimationClip, pose snapshot.
 */
import { createId } from "./ids";
import { captureBindPose } from "./semantic";
import type {
  AnimatableProperty,
  AnimationClip,
  AnimationTrack,
  CharacterDefinition,
  EasingName,
  Keyframe,
  MotionName,
  ProjectDocument,
} from "./types";
import { applyEasing, interpolateKeyframes } from "../systems/AnimationSystem";
import { MotionLibrary, motionLibrary, type MotionDefinition } from "../systems/MotionLibrary";

export type GestureCategory = MotionDefinition["category"];

export interface BuiltinGestureInfo {
  name: MotionName;
  labelRu: string;
  category: GestureCategory;
  categoryRu: string;
  loop: boolean;
}

export const CATEGORY_LABELS_RU: Record<GestureCategory, string> = {
  locomotion: "Движение",
  gesture: "Жест",
  emotion: "Эмоция",
  reaction: "Реакция",
};

export const MOTION_LABELS_RU: Record<MotionName, string> = {
  Idle: "Стойка",
  Walk: "Ходьба",
  Run: "Бег",
  Wave: "Машет",
  Talk: "Говорит",
  Happy: "Радость",
  Angry: "Злость",
  Surprised: "Удивление",
  Scared: "Страх",
  Laugh: "Смех",
  Jump: "Прыжок",
  Attack: "Удар",
  Hit: "Получил",
  Fall: "Падение",
};

export const EASING_LABELS_RU: Record<EasingName, string> = {
  linear: "Линейно",
  easeIn: "Плавный вход",
  easeOut: "Плавный выход",
  easeInOut: "Вход-выход",
};

const TRACK_PROPS: AnimatableProperty[] = ["x", "y", "rotation", "scaleX", "scaleY", "opacity"];

export function listBuiltinGestures(): BuiltinGestureInfo[] {
  return motionLibrary.map((motion) => ({
    name: motion.name,
    labelRu: MOTION_LABELS_RU[motion.name] ?? motion.name,
    category: motion.category,
    categoryRu: CATEGORY_LABELS_RU[motion.category],
    loop: motion.loop,
  }));
}

export function listProjectClips(project: ProjectDocument): Array<AnimationClip & { labelRu: string }> {
  return (project.animationClips ?? []).map((clip) => ({
    ...clip,
    labelRu: MOTION_LABELS_RU[clip.name as MotionName] ?? clip.name,
  }));
}

/** Sample easing curve 0..1 → eased value (for tests / mini icons). */
export function sampleEasingCurve(name: EasingName, samples = 24): Array<{ t: number; v: number }> {
  const out: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    out.push({ t, v: applyEasing(name, t) });
  }
  return out;
}

/** Sample interpolated track values across its time span. */
export function sampleKeyframeCurve(keyframes: Keyframe[], samples = 40): Array<{ t: number; v: number }> {
  if (!keyframes.length) return [];
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  const t0 = sorted[0]!.time;
  const t1 = sorted.at(-1)!.time;
  if (t1 <= t0) {
    return [{ t: t0, v: sorted[0]!.value }];
  }
  const out: Array<{ t: number; v: number }> = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = t0 + ((t1 - t0) * i) / samples;
    const v = interpolateKeyframes(sorted, t);
    if (v !== undefined) out.push({ t, v });
  }
  return out;
}

/**
 * Bake a short AnimationClip from procedural MotionLibrary samples
 * (absolute transform values, easeInOut keys).
 */
export function bakeMotionClip(
  character: CharacterDefinition,
  motion: MotionName,
  options?: { duration?: number; samples?: number; id?: string },
): AnimationClip {
  const duration = options?.duration ?? 1;
  const samples = Math.max(4, options?.samples ?? 7);
  const meta = motionLibrary.find((item) => item.name === motion);
  const lib = new MotionLibrary();
  const trackMap = new Map<string, AnimationTrack>();

  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const time = Number((u * duration).toFixed(4));
    const values = lib.evaluate(character, motion, u);
    for (const [partId, props] of Object.entries(values)) {
      for (const prop of TRACK_PROPS) {
        const value = props[prop];
        if (value === undefined || !Number.isFinite(value)) continue;
        const key = `${partId}:${prop}`;
        let track = trackMap.get(key);
        if (!track) {
          track = {
            id: createId("gtrack"),
            partId,
            property: prop,
            keyframes: [],
          };
          trackMap.set(key, track);
        }
        track.keyframes.push({
          id: createId("gkey"),
          time,
          value,
          easing: "easeInOut",
        });
      }
    }
  }

  return {
    id: options?.id ?? createId("gclip"),
    name: motion,
    duration,
    loop: meta?.loop ?? false,
    tracks: [...trackMap.values()],
    generated: true,
  };
}

/** Ensure each built-in motion has a project AnimationClip (bake missing). */
export function ensureBuiltinGestureClips(
  project: ProjectDocument,
  character?: CharacterDefinition,
): ProjectDocument {
  const char = character ?? project.characters[0];
  if (!char) return project;
  const clips = [...(project.animationClips ?? [])];
  let changed = false;
  for (const motion of motionLibrary) {
    if (clips.some((clip) => clip.name === motion.name)) continue;
    clips.push(bakeMotionClip(char, motion.name));
    changed = true;
  }
  return changed ? { ...project, animationClips: clips } : project;
}

export function duplicateAnimationClip(clip: AnimationClip, name?: string): AnimationClip {
  const copy = structuredClone(clip);
  copy.id = createId("gclip");
  copy.name = name?.trim() || `${clip.name} копия`;
  copy.generated = false;
  for (const track of copy.tracks) {
    track.id = createId("gtrack");
    for (const key of track.keyframes) key.id = createId("gkey");
  }
  return copy;
}

/** One-frame clip from current parts that differ from bindPose. */
export function capturePoseClip(character: CharacterDefinition, name = "Поза"): AnimationClip {
  const bind = character.bindPose ?? captureBindPose(character);
  const tracks: AnimationTrack[] = [];
  for (const part of character.parts) {
    const base = bind[part.id];
    if (!base) continue;
    for (const prop of TRACK_PROPS) {
      if (prop === "opacity") {
        if (Math.abs(part.opacity - base.opacity) <= 0.001) continue;
        tracks.push({
          id: createId("gtrack"),
          partId: part.id,
          property: prop,
          keyframes: [{ id: createId("gkey"), time: 0, value: part.opacity, easing: "linear" }],
        });
        continue;
      }
      const current = part.transform[prop];
      const origin = base.transform[prop];
      if (Math.abs(current - origin) <= 0.01) continue;
      tracks.push({
        id: createId("gtrack"),
        partId: part.id,
        property: prop,
        keyframes: [{ id: createId("gkey"), time: 0, value: current, easing: "linear" }],
      });
    }
  }
  return {
    id: createId("gclip"),
    name: name.trim() || "Поза",
    duration: 0.1,
    loop: false,
    tracks,
    generated: false,
  };
}

export function renameAnimationClip(clip: AnimationClip, name: string): AnimationClip {
  return { ...clip, name: name.trim() || clip.name, generated: false };
}
