import { describe, expect, it } from "vitest";
import { createId } from "../src/domain/ids";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import {
  SERIES_SCHEMA_VERSION,
  buildSeriesManifest,
  createDefaultSeries,
  enabledSeriesEpisodes,
  episodeDuration,
  formatEpisodeFileName,
  projectForEpisode,
  syncSeriesWithScenes,
  validateSeries,
} from "../src/domain/series";

describe("Stage 11 local series pack", () => {
  it("builds default series and episode filenames", () => {
    const project = migrateProject(createDefaultProject("Show"));
    const series = createDefaultSeries(project.name, project.scenes);
    expect(series.episodes).toHaveLength(1);
    expect(series.episodes[0].sceneIds).toEqual([project.scenes![0].id]);
    expect(formatEpisodeFileName(series.episodes[0], "mp4")).toMatch(/^E01_.+\.mp4$/);
  });

  it("scopes montage to episode scenes only", () => {
    const project = migrateProject(createDefaultProject("Ep"));
    const a = project.scenes![0];
    a.duration = 2;
    a.generatedTimeline = undefined;
    const b = structuredClone(a);
    b.id = createId("scene");
    b.name = "B";
    b.duration = 3;
    b.generatedTimeline = undefined;
    project.scenes!.push(b);
    project.series = {
      name: "Demo Series",
      episodes: [{
        id: "ep1",
        number: 1,
        title: "Only B",
        enabled: true,
        sceneIds: [b.id],
      }],
    };
    const scoped = projectForEpisode(project, project.series.episodes[0]);
    expect(scoped.montage?.clips).toHaveLength(1);
    expect(scoped.montage?.clips[0].sceneId).toBe(b.id);
    expect(episodeDuration(project, project.series.episodes[0])).toBeCloseTo(3, 5);
    expect(validateSeries(project).ok).toBe(true);
  });

  it("syncs deleted scenes and migrates schema >= 9", () => {
    const old = createDefaultProject("Legacy Series");
    delete (old as { schemaVersion?: unknown; series?: unknown }).schemaVersion;
    delete (old as { series?: unknown }).series;
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(SERIES_SCHEMA_VERSION);
    expect(migrated.series?.episodes.length).toBeGreaterThan(0);

    const second = structuredClone(migrated.scenes![0]);
    second.id = "gone";
    migrated.series = syncSeriesWithScenes({
      name: "S",
      episodes: [{ id: "e", number: 1, title: "T", enabled: true, sceneIds: ["gone", migrated.scenes![0].id] }],
    }, migrated.scenes, migrated.name);
    expect(migrated.series.episodes[0].sceneIds).toEqual([migrated.scenes![0].id]);
  });

  it("builds local-only manifest", () => {
    const series = createDefaultSeries("Pack", []);
    series.episodes = [{ id: "e1", number: 2, title: "Hello", enabled: true, sceneIds: ["s1"] }];
    const manifest = buildSeriesManifest({
      series,
      projectName: "Pack",
      format: "mp4",
      fps: 30,
      width: 1920,
      height: 1080,
      episodes: [{
        number: 2,
        title: "Hello",
        fileName: "E02_Hello.mp4",
        sceneIds: ["s1"],
        durationSeconds: 5,
        enabled: true,
      }],
    });
    expect(manifest.localOnly).toBe(true);
    expect(manifest.episodes[0].fileName).toBe("E02_Hello.mp4");
    expect(enabledSeriesEpisodes(series)).toHaveLength(1);
  });
});
