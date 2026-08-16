import type { GeneratedSceneTimeline } from "./types";

/** Empty scene timeline so manual keys / gestures have somewhere to land. */
export function createEmptyGeneratedTimeline(duration: number): GeneratedSceneTimeline {
  return {
    version: 1,
    duration: Math.max(0.5, duration),
    actorTracks: [],
    cameraTracks: [],
    propTracks: [],
    motionSegments: [],
    facingChanges: [],
    sourceHash: "manual",
    manualEdits: true,
  };
}

export function ensureSceneGeneratedTimeline(
  scene: { duration: number; generatedTimeline?: GeneratedSceneTimeline },
): GeneratedSceneTimeline {
  if (!scene.generatedTimeline) {
    scene.generatedTimeline = createEmptyGeneratedTimeline(scene.duration);
  }
  return scene.generatedTimeline;
}
