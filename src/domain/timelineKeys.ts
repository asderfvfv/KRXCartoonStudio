import { createId } from "./ids";
import type { ActorAnimatableProperty, GeneratedSceneTimeline, Scene } from "./types";
import { createEmptyGeneratedTimeline, ensureSceneGeneratedTimeline } from "./emptyTimeline";

export { createEmptyGeneratedTimeline, ensureSceneGeneratedTimeline };

/** Write or update a key on an actor property track at `time`. */
export function upsertActorPropertyKey(
  scene: Scene,
  actorId: string,
  property: ActorAnimatableProperty,
  time: number,
  value: number,
): void {
  const generated = ensureSceneGeneratedTimeline(scene);
  const t = Math.max(0, time);
  generated.duration = Math.max(generated.duration, scene.duration, t + 0.05);
  let track = generated.actorTracks.find((item) => item.actorId === actorId && item.property === property);
  if (!track) {
    track = { id: createId("manual-actor-track"), actorId, property, keyframes: [] };
    generated.actorTracks.push(track);
  }
  const existing = track.keyframes.find((key) => Math.abs(key.time - t) < 0.0001);
  if (existing) existing.value = value;
  else track.keyframes.push({ id: createId("manual-key"), time: t, value, easing: "easeInOut" });
  track.keyframes.sort((a, b) => a.time - b.time);
  generated.manualEdits = true;
  scene.duration = Math.max(scene.duration, generated.duration);
}

/** Remove all actor property keys near `time` (default ±1 frame @ 50fps). */
export function deleteActorKeysAtTime(
  scene: Scene,
  actorId: string,
  time: number,
  tolerance = 0.025,
): number {
  const generated = scene.generatedTimeline;
  if (!generated) return 0;
  let removed = 0;
  for (const track of generated.actorTracks.filter((item) => item.actorId === actorId)) {
    const before = track.keyframes.length;
    track.keyframes = track.keyframes.filter((key) => Math.abs(key.time - time) > tolerance);
    removed += before - track.keyframes.length;
  }
  if (removed) generated.manualEdits = true;
  return removed;
}

/** After moving/scaling/rotating an actor, keep timeline keys in sync so they don't fight the drag. */
export function syncActorTransformKeysAtTime(
  scene: Scene,
  actorId: string,
  time: number,
  values: { x?: number; y?: number; scale?: number; rotation?: number },
): void {
  if (values.x !== undefined) upsertActorPropertyKey(scene, actorId, "x", time, values.x);
  if (values.y !== undefined) upsertActorPropertyKey(scene, actorId, "y", time, values.y);
  if (values.scale !== undefined) upsertActorPropertyKey(scene, actorId, "scale", time, values.scale);
  if (values.rotation !== undefined) upsertActorPropertyKey(scene, actorId, "rotation", time, values.rotation);
}
