import { createId } from "./ids";
import { montageTotalDuration, validateMontage } from "./montage";
import type { ProjectDocument, Scene } from "./types";

export const SERIES_SCHEMA_VERSION = 9;

export interface SeriesEpisode {
  id: string;
  /** Display episode number (1-based). */
  number: number;
  title: string;
  enabled: boolean;
  /** Ordered scene ids that form this episode's montage. */
  sceneIds: string[];
}

export interface ProjectSeries {
  name: string;
  episodes: SeriesEpisode[];
}

export interface SeriesManifestEpisode {
  number: number;
  title: string;
  fileName: string;
  sceneIds: string[];
  durationSeconds: number;
  enabled: boolean;
}

export interface SeriesManifest {
  version: 1;
  seriesName: string;
  projectName: string;
  createdAt: string;
  format: "mp4" | "webm";
  fps: number;
  width: number;
  height: number;
  localOnly: true;
  note: string;
  episodes: SeriesManifestEpisode[];
}

export function sanitizeSeriesFilePart(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").replace(/\s+/g, "_").trim();
  return cleaned || "episode";
}

export function formatEpisodeFileName(episode: SeriesEpisode, format: "mp4" | "webm"): string {
  const num = String(Math.max(1, Math.round(episode.number))).padStart(2, "0");
  return `E${num}_${sanitizeSeriesFilePart(episode.title)}.${format}`;
}

export function buildSeriesFolderName(seriesName: string): string {
  return sanitizeSeriesFilePart(seriesName || "Series");
}

export function createDefaultSeries(projectName: string, scenes: Scene[] | undefined): ProjectSeries {
  const list = scenes ?? [];
  return {
    name: `${projectName || "Cartoon"} Series`,
    episodes: list.length
      ? [{
          id: createId("ep"),
          number: 1,
          title: list[0].name || "Episode 1",
          enabled: true,
          sceneIds: list.map((scene) => scene.id),
        }]
      : [],
  };
}

/** Drop deleted scenes; keep episode order; renumber gaps only when syncing new scenes into empty episodes. */
export function syncSeriesWithScenes(series: ProjectSeries | undefined, scenes: Scene[] | undefined, projectName = "Cartoon"): ProjectSeries {
  const list = scenes ?? [];
  const base = series ?? createDefaultSeries(projectName, list);
  const validIds = new Set(list.map((scene) => scene.id));
  const episodes = (base.episodes ?? []).map((episode, index) => {
    const sceneIds = (episode.sceneIds ?? []).filter((id) => validIds.has(id));
    return {
      ...episode,
      id: episode.id || createId("ep"),
      number: Math.max(1, Math.round(episode.number || index + 1)),
      title: episode.title?.trim() || `Episode ${index + 1}`,
      enabled: episode.enabled !== false,
      sceneIds: sceneIds.length ? sceneIds : list.map((scene) => scene.id),
    };
  });

  if (!episodes.length && list.length) {
    return createDefaultSeries(projectName, list);
  }

  return {
    name: base.name?.trim() || `${projectName} Series`,
    episodes,
  };
}

export function moveSeriesEpisode(series: ProjectSeries, episodeId: string, direction: -1 | 1): ProjectSeries {
  const episodes = [...series.episodes];
  const index = episodes.findIndex((item) => item.id === episodeId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= episodes.length) return series;
  [episodes[index], episodes[target]] = [episodes[target], episodes[index]];
  return { ...series, episodes };
}

export function renumberSeriesEpisodes(series: ProjectSeries): ProjectSeries {
  return {
    ...series,
    episodes: series.episodes.map((episode, index) => ({ ...episode, number: index + 1 })),
  };
}

/** Project clone whose montage clips match the episode scene list (keeps transition settings). */
export function projectForEpisode(project: ProjectDocument, episode: SeriesEpisode): ProjectDocument {
  const clone = structuredClone(project);
  const transition = clone.montage?.transition ?? "cut";
  const crossfadeDuration = clone.montage?.crossfadeDuration ?? 0.5;
  const clips = episode.sceneIds
    .filter((sceneId) => clone.scenes?.some((scene) => scene.id === sceneId))
    .map((sceneId) => ({ id: createId("mclip"), sceneId, enabled: true as const }));
  clone.montage = { clips, transition, crossfadeDuration };
  return clone;
}

export function episodeDuration(project: ProjectDocument, episode: SeriesEpisode): number {
  return montageTotalDuration(projectForEpisode(project, episode));
}

export function enabledSeriesEpisodes(series: ProjectSeries): SeriesEpisode[] {
  return series.episodes.filter((episode) => episode.enabled && episode.sceneIds.length > 0);
}

export function validateSeries(project: ProjectDocument): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const series = syncSeriesWithScenes(project.series, project.scenes, project.name);
  const enabled = enabledSeriesEpisodes(series);
  if (!enabled.length) errors.push("В Series нет включённых эпизодов.");
  for (const episode of enabled) {
    const scoped = projectForEpisode(project, episode);
    const check = validateMontage(scoped);
    if (!check.ok) errors.push(`E${String(episode.number).padStart(2, "0")} ${episode.title}: ${check.errors.join(" ")}`);
  }
  return { ok: errors.length === 0, errors };
}

export function buildSeriesManifest(input: {
  series: ProjectSeries;
  projectName: string;
  format: "mp4" | "webm";
  fps: number;
  width: number;
  height: number;
  episodes: SeriesManifestEpisode[];
}): SeriesManifest {
  return {
    version: 1,
    seriesName: input.series.name,
    projectName: input.projectName,
    createdAt: new Date().toISOString(),
    format: input.format,
    fps: input.fps,
    width: input.width,
    height: input.height,
    localOnly: true,
    note: "Local Series pack. No cloud upload. Open folder to publish manually.",
    episodes: input.episodes,
  };
}
