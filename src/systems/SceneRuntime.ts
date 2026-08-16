import type { ActorRuntimeState, CharacterDefinition, EvaluatedValues, GeneratedSceneTimeline, MotionName, Scene, SceneRuntimeState } from "../domain/types";
import { interpolateKeyframes } from "./AnimationSystem";
import { MotionLibrary, motionLibrary } from "./MotionLibrary";
import { applyLipSyncToRuntime } from "./LipSyncSystem";

function evaluateTrack(keys: GeneratedSceneTimeline["actorTracks"][number]["keyframes"], time: number): number | undefined {
  return interpolateKeyframes(keys, time);
}

/** How the body animates while X/Y keys move the actor (no explicit gesture segment). */
export type MoveStyle = "walk" | "run" | "slide";

export interface SceneRuntimeOptions {
  moveStyle?: MoveStyle;
}

function isLoopingMotion(motion: MotionName): boolean {
  return motionLibrary.find((item) => item.name === motion)?.loop === true;
}

function motionCycleSeconds(motion: MotionName): number {
  switch (motion) {
    case "Run": return 0.4;
    case "Walk": return 0.55;
    case "Idle": return 1.4;
    case "Wave": return 0.7;
    case "Talk": return 0.8;
    case "Laugh": return 0.55;
    default: return 1;
  }
}

function segmentNormalized(motion: MotionName, time: number, start: number, duration: number): number {
  if (isLoopingMotion(motion)) {
    const cycle = motionCycleSeconds(motion);
    const elapsed = Math.max(0, time - start);
    return (elapsed % cycle) / cycle;
  }
  return Math.min(1, Math.max(0, (time - start) / Math.max(0.001, duration)));
}

function trackValueAt(
  timeline: GeneratedSceneTimeline,
  actorId: string,
  property: "x" | "y",
  time: number,
  fallback: number,
): number {
  const track = timeline.actorTracks.find((item) => item.actorId === actorId && item.property === property);
  if (!track?.keyframes.length) return fallback;
  const value = evaluateTrack(track.keyframes, time);
  return value === undefined ? fallback : value;
}

export class SceneRuntime {
  private readonly motions = new MotionLibrary();

  setTime(
    scene: Scene,
    characters: CharacterDefinition[],
    timeSeconds: number,
    options?: SceneRuntimeOptions,
  ): SceneRuntimeState {
    const timeline = scene.generatedTimeline;
    const time = Math.max(0, Math.min(timeline?.duration ?? scene.duration, timeSeconds));
    const actors: Record<string, ActorRuntimeState> = {};
    const moveStyle: MoveStyle = options?.moveStyle ?? "slide";

    for (const actor of scene.actors) {
      const runtime: ActorRuntimeState = { ...structuredClone(actor), position: structuredClone(actor.position), rig: {} };
      if (timeline) {
        for (const track of timeline.actorTracks.filter((candidate) => candidate.actorId === actor.id)) {
          const value = evaluateTrack(track.keyframes, time);
          if (value === undefined) continue;
          if (track.property === "x" || track.property === "y") runtime.position[track.property] = value;
          else if (track.property === "opacity") runtime.opacity = value;
          else runtime[track.property] = value;
        }
        const facing = timeline.facingChanges.filter((change) => change.actorId === actor.id && change.time <= time).sort((a, b) => a.time - b.time).at(-1);
        if (facing) runtime.facingDirection = facing.direction;
        const character = characters.find((candidate) => candidate.id === actor.characterId);
        if (character) {
          const active = timeline.motionSegments.filter((segment) => segment.actorId === actor.id && time >= segment.start && (time <= segment.start + segment.duration || segment.hold));
          if (active.length) {
            const latestStart = Math.max(-Infinity, ...active.map((segment) => segment.start));
            for (const segment of active.filter((item) => item.start === latestStart)) {
              const normalized = segmentNormalized(segment.motion, time, segment.start, segment.duration);
              const values = this.motions.evaluate(character, segment.motion, normalized, segment.intensity);
              runtime.rig = mergeRig(runtime.rig, values);
            }
          } else if (moveStyle !== "slide") {
            // Between X/Y keys: slide was the old look — now walk/run the body while position lerps.
            const dt = 1 / 30;
            const x0 = runtime.position.x;
            const y0 = runtime.position.y;
            const x1 = trackValueAt(timeline, actor.id, "x", time + dt, x0);
            const y1 = trackValueAt(timeline, actor.id, "y", time + dt, y0);
            const speed = Math.hypot(x1 - x0, y1 - y0) / dt;
            if (speed > 35) {
              const loco: MotionName = moveStyle === "run" ? "Run" : "Walk";
              const n = segmentNormalized(loco, time, 0, 1);
              runtime.rig = mergeRig(runtime.rig, this.motions.evaluate(character, loco, n, 1));
              if (x1 < x0 - 0.4) runtime.facingDirection = "Left";
              else if (x1 > x0 + 0.4) runtime.facingDirection = "Right";
            } else {
              const n = segmentNormalized("Idle", time, 0, 1);
              runtime.rig = mergeRig(runtime.rig, this.motions.evaluate(character, "Idle", n, 0.9));
            }
          }
        }
      }
      actors[actor.id] = runtime;
    }

    let camera = structuredClone(scene.camera);
    if (timeline) {
      let shake = 0;
      for (const track of timeline.cameraTracks) {
        const value = evaluateTrack(track.keyframes, time);
        if (value === undefined) continue;
        if (track.property === "shake") shake += value;
        else if (track.property === "x") camera.x = value;
        else if (track.property === "y") camera.y = value;
        else if (track.property === "zoom") camera.zoom = value;
        else if (track.property === "rotation") camera.rotation = value;
      }
      if (shake) {
        camera.x += Math.sin(time * 55) * shake;
        camera.y += Math.cos(time * 47) * shake * 0.7;
      }
    }

    const props = scene.props.map((prop) => {
      const runtime = { ...structuredClone(prop), position: structuredClone(prop.position), scale: structuredClone(prop.scale) };
      if (timeline) {
        for (const track of (timeline.propTracks ?? []).filter((candidate) => candidate.propId === prop.id)) {
          const value = evaluateTrack(track.keyframes, time);
          if (value === undefined) continue;
          if (track.property === "x" || track.property === "y") runtime.position[track.property] = value;
          else if (track.property === "scaleX") runtime.scale.x = value;
          else if (track.property === "scaleY") runtime.scale.y = value;
          else if (track.property === "opacity") runtime.opacity = value;
          else if (track.property === "rotation") runtime.rotation = value;
        }
      }
      return runtime;
    });

    const base: SceneRuntimeState = { time, camera, actors, props };
    return applyLipSyncToRuntime(base, scene, characters, time);
  }
}

export function actorFacingScaleX(actor: { scale: number; facingDirection: "Left" | "Right" }): number {
  return actor.scale * (actor.facingDirection === "Left" ? -1 : 1);
}

function mergeRig(base: EvaluatedValues, incoming: EvaluatedValues): EvaluatedValues {
  const result = structuredClone(base);
  for (const [partId, values] of Object.entries(incoming)) result[partId] = { ...(result[partId] ?? {}), ...values };
  return result;
}
