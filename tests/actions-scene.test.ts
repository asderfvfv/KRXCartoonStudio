import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../src/domain/defaults";
import type { SceneAction } from "../src/domain/types";
import { ActionCompiler, scheduleActions } from "../src/systems/ActionCompiler";
import { SceneRuntime } from "../src/systems/SceneRuntime";
import { ProjectManager } from "../src/systems/managers";

const action = (id: string, startMode: SceneAction["startMode"], duration = 1): SceneAction => ({ id, actorId: "actor-hero", type: "Idle", targetActorId: null, duration, startMode, parameters: {} });

describe("Stage 2 scenes, actions and deterministic runtime", () => {
  it("serializes scenes, actors and actions", () => { const project = createDefaultProject("Scene Save"); const manager = new ProjectManager(); const restored = manager.deserialize(manager.serialize(project)); expect(restored.scenes).toEqual(project.scenes); expect(restored.scenes![0].actors).toHaveLength(2); });
  it("schedules sequential actions after the previous end", () => { const result = scheduleActions([action("a", "AfterPrevious", 1.2), action("b", "AfterPrevious", .8)]); expect(result[0].start).toBe(0); expect(result[1].start).toBeCloseTo(1.2); });
  it("schedules parallel actions with the previous start", () => { const result = scheduleActions([action("a", "AfterPrevious", 2), action("b", "WithPrevious", .5)]); expect(result[1].start).toBe(result[0].start); expect(result[1].end).toBe(.5); });
  it("compiles a high-level action sequence into actor, motion and camera tracks", () => { const scene = createDefaultProject().scenes![0]; const timeline = new ActionCompiler().compile(scene); expect(timeline.actorTracks.length).toBeGreaterThan(0); expect(timeline.motionSegments.length).toBeGreaterThanOrEqual(8); expect(timeline.cameraTracks.some((track) => track.property === "shake")).toBe(true); });
  it("WalkTo stops the hero near its target", () => {
    const scene = createDefaultProject().scenes![0];
    const timeline = new ActionCompiler().compile(scene);
    const heroX = timeline.actorTracks.find((track) => track.actorId === "actor-hero" && track.property === "x")!;
    expect(heroX.keyframes.some((key) => Math.abs(key.value - 1110) < 1)).toBe(true);
  });
  it("Attack lunges toward the target on X", () => {
    const scene = createDefaultProject().scenes![0];
    const timeline = new ActionCompiler().compile(scene);
    const heroX = timeline.actorTracks.find((track) => track.actorId === "actor-hero" && track.property === "x")!;
    const scheduled = scheduleActions(scene.actionSequence);
    const attack = scheduled.find((item) => item.action.type === "Attack")!;
    const duringAttack = heroX.keyframes.filter((key) => key.time >= attack.start - 0.001 && key.time <= attack.end + 0.001);
    expect(duringAttack.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...duringAttack.map((key) => key.value))).toBeGreaterThan(1110);
  });
  it("synchronizes Attack impact, Hit and CameraShake", () => { const scheduled = scheduleActions(createDefaultProject().scenes![0].actionSequence); const attack = scheduled.find((item) => item.action.type === "Attack")!; const hit = scheduled.find((item) => item.action.type === "Hit")!; const shake = scheduled.find((item) => item.action.type === "CameraShake")!; const impact = attack.start + attack.action.duration * .62; expect(hit.start).toBeCloseTo(impact); expect(shake.start).toBeCloseTo(impact); });
  it("setTime is deterministic regardless of previous evaluation order", () => { const project = createDefaultProject(); const scene = project.scenes![0]; const runtime = new SceneRuntime(); const first = runtime.setTime(scene, project.characters, 3.25); runtime.setTime(scene, project.characters, 8); const repeated = runtime.setTime(scene, project.characters, 3.25); expect(repeated).toEqual(first); });
  it("camera shake is deterministic, animated and returns to base", () => { const project = createDefaultProject(); const scene = project.scenes![0]; const runtime = new SceneRuntime(); const base = runtime.setTime(scene, project.characters, 0).camera; const shakeTrack = scene.generatedTimeline!.cameraTracks[0]; const peak = shakeTrack.keyframes[1].time; const shaken = runtime.setTime(scene, project.characters, peak).camera; const after = runtime.setTime(scene, project.characters, shakeTrack.keyframes.at(-1)!.time + .1).camera; expect(shaken).not.toEqual(base); expect(after.x).toBeCloseTo(scene.camera.x); expect(after.y).toBeCloseTo(scene.camera.y); });
});
