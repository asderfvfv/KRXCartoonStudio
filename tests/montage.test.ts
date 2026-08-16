import { describe, expect, it } from "vitest";
import {
  CROSSFADE_SCHEMA_VERSION,
  MONTAGE_SCHEMA_VERSION,
  createDefaultMontage,
  effectiveCrossfadeDuration,
  listMontageTransitions,
  mapMontageTime,
  montageTotalDuration,
  moveMontageClip,
  normalizeMontageTransition,
  reorderMontageClip,
  resolveMontageSegments,
  syncMontageWithScenes,
  validateMontage,
} from "../src/domain/montage";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import { createId } from "../src/domain/ids";

describe("Stage 7 multi-scene montage", () => {
  it("syncs montage clips when scenes are added or removed", () => {
    const project = migrateProject(createDefaultProject("Montage"));
    expect(project.montage?.clips.length).toBe(1);
    const second = structuredClone(project.scenes![0]);
    second.id = "scene-b";
    second.name = "Scene B";
    project.scenes!.push(second);
    project.montage = syncMontageWithScenes(project.montage, project.scenes);
    expect(project.montage.clips.map((clip) => clip.sceneId)).toEqual([project.scenes![0].id, "scene-b"]);
    project.scenes = [project.scenes![1]];
    project.montage = syncMontageWithScenes(project.montage, project.scenes);
    expect(project.montage.clips).toHaveLength(1);
    expect(project.montage.clips[0].sceneId).toBe("scene-b");
  });

  it("orders enabled segments and maps global time", () => {
    const project = migrateProject(createDefaultProject("Map"));
    const a = project.scenes![0];
    a.duration = 2;
    a.generatedTimeline = undefined;
    const b = structuredClone(a);
    b.id = createId("scene");
    b.name = "B";
    b.duration = 3;
    project.scenes!.push(b);
    project.montage = createDefaultMontage(project.scenes);
    project.montage.clips[0].enabled = true;
    project.montage.clips[1].enabled = true;
    project.montage = moveMontageClip(project.montage, project.montage.clips[1].id, -1);

    const segments = resolveMontageSegments(project);
    expect(segments).toHaveLength(2);
    expect(segments[0].scene.id).toBe(b.id);
    expect(segments[0].offset).toBe(0);
    expect(segments[1].offset).toBe(3);
    expect(montageTotalDuration(project)).toBe(5);

    const mid = mapMontageTime(project, 3.5);
    expect(mid?.scene.id).toBe(a.id);
    expect(mid?.localTime).toBeCloseTo(0.5, 5);
    expect(validateMontage(project).ok).toBe(true);
  });

  it("reorders montage clips by absolute index", () => {
    const project = migrateProject(createDefaultProject("Reorder"));
    const a = project.scenes![0]!;
    const b = structuredClone(a);
    b.id = createId("scene");
    b.name = "B";
    project.scenes!.push(b);
    project.montage = syncMontageWithScenes(project.montage, project.scenes);
    const firstId = project.montage.clips[0]!.id;
    const secondId = project.montage.clips[1]!.id;
    project.montage = reorderMontageClip(project.montage, secondId, 0);
    expect(project.montage.clips.map((clip) => clip.id)).toEqual([secondId, firstId]);
    project.montage = moveMontageClip(project.montage, secondId, 1);
    expect(project.montage.clips.map((clip) => clip.id)).toEqual([firstId, secondId]);
  });

  it("migrates schema >= 5 with montage field", () => {
    const old = createDefaultProject("Legacy Montage");
    delete (old as { schemaVersion?: unknown; montage?: unknown }).schemaVersion;
    delete (old as { montage?: unknown }).montage;
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(MONTAGE_SCHEMA_VERSION);
    expect(migrated.montage?.clips.length).toBeGreaterThan(0);
  });
});

describe("Stage 9 montage crossfade", () => {
  function twoSceneProject(durationA = 2, durationB = 2) {
    const project = migrateProject(createDefaultProject("XF"));
    const a = project.scenes![0];
    a.duration = durationA;
    a.generatedTimeline = undefined;
    const b = structuredClone(a);
    b.id = createId("scene");
    b.name = "B";
    b.duration = durationB;
    project.scenes!.push(b);
    project.montage = {
      ...createDefaultMontage(project.scenes),
      transition: "crossfade",
      crossfadeDuration: 0.5,
    };
    return project;
  }

  it("shortens total duration by overlap", () => {
    const project = twoSceneProject(2, 3);
    expect(effectiveCrossfadeDuration(project)).toBeCloseTo(0.5, 5);
    expect(montageTotalDuration(project)).toBeCloseTo(2 + 3 - 0.5, 5);
    const segments = resolveMontageSegments(project);
    expect(segments[0].offset).toBe(0);
    expect(segments[1].offset).toBeCloseTo(1.5, 5);
  });

  it("maps blend amount during overlap", () => {
    const project = twoSceneProject(2, 2);
    const atStart = mapMontageTime(project, 1.5);
    expect(atStart?.blend).toBeTruthy();
    expect(atStart!.blend!.amount).toBeCloseTo(0, 5);
    expect(atStart!.blend!.from.scene.id).toBe(project.scenes![0].id);
    expect(atStart!.blend!.to.scene.id).toBe(project.scenes![1].id);

    const mid = mapMontageTime(project, 1.75);
    expect(mid?.blend?.amount).toBeCloseTo(0.5, 5);
    expect(mid?.scene.id).toBe(project.scenes![1].id);

    const nearEnd = mapMontageTime(project, 1.99);
    expect(nearEnd?.blend?.amount).toBeGreaterThan(0.9);

    const after = mapMontageTime(project, 2.1);
    expect(after?.blend).toBeUndefined();
    expect(after?.scene.id).toBe(project.scenes![1].id);
  });

  it("clamps crossfade to half of shorter scene", () => {
    const project = twoSceneProject(1, 4);
    project.montage!.crossfadeDuration = 10;
    expect(effectiveCrossfadeDuration(project)).toBeCloseTo(0.5, 5);
    expect(validateMontage(project).ok).toBe(true);
  });

  it("cut mode keeps additive duration", () => {
    const project = twoSceneProject(2, 2);
    project.montage!.transition = "cut";
    expect(effectiveCrossfadeDuration(project)).toBe(0);
    expect(montageTotalDuration(project)).toBe(4);
    expect(mapMontageTime(project, 1.9)?.blend).toBeUndefined();
  });

  it("wipe transition overlaps like crossfade and sets blend.kind", () => {
    const project = twoSceneProject(2, 2);
    project.montage!.transition = "wipeLeft";
    expect(effectiveCrossfadeDuration(project)).toBeCloseTo(0.5, 5);
    expect(montageTotalDuration(project)).toBeCloseTo(3.5, 5);
    const mid = mapMontageTime(project, 1.75);
    expect(mid?.blend?.kind).toBe("wipeLeft");
    expect(mid?.blend?.amount).toBeCloseTo(0.5, 5);
  });

  it("per-edge transitionOut overrides global cut", () => {
    const project = twoSceneProject(2, 2);
    project.montage!.transition = "cut";
    project.montage!.clips[0]!.transitionOut = "flash";
    expect(effectiveCrossfadeDuration(project)).toBeCloseTo(0.5, 5);
    const markers = listMontageTransitions(project);
    expect(markers[0]!.kind).toBe("flash");
    const mid = mapMontageTime(project, 1.75);
    expect(mid?.blend?.kind).toBe("flash");
  });

  it("normalize unknown transition to cut", () => {
    expect(normalizeMontageTransition("nope")).toBe("cut");
    expect(normalizeMontageTransition("circleOpen")).toBe("circleOpen");
  });

  it("lists transition markers for preview UI", () => {
    const project = twoSceneProject(2, 2);
    const xf = listMontageTransitions(project);
    expect(xf).toHaveLength(1);
    expect(xf[0]!.kind).toBe("crossfade");
    expect(xf[0]!.start).toBeCloseTo(1.5, 5);
    expect(xf[0]!.mid).toBeCloseTo(1.75, 5);
    expect(xf[0]!.end).toBeCloseTo(2.0, 5);

    project.montage!.transition = "cut";
    const cut = listMontageTransitions(project);
    expect(cut).toHaveLength(1);
    expect(cut[0]!.kind).toBe("cut");
    expect(cut[0]!.mid).toBeCloseTo(2, 5);
    expect(cut[0]!.start).toBe(cut[0]!.end);
  });

  it("migrates schema >= 7 with transition defaults", () => {
    const old = createDefaultProject("Legacy XF");
    delete (old as { schemaVersion?: unknown }).schemaVersion;
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(CROSSFADE_SCHEMA_VERSION);
    expect(migrated.montage?.transition ?? "cut").toBe("cut");
    expect(typeof (migrated.montage?.crossfadeDuration ?? 0.5)).toBe("number");
  });
});
