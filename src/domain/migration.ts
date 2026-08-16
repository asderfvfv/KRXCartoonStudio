import type { Actor, ProjectDocument, Scene } from "./types";
import { ensureSemanticCharacter } from "./semantic";
import { RENDER_SCHEMA_VERSION, createDefaultRenderSettings } from "./renderSettings";
import {
  AUDIO_SCHEMA_VERSION,
  LIPSYNC_SCHEMA_VERSION,
  LIPSUB_POLISH_SCHEMA_VERSION,
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
} from "./audio";
import {
  CROSSFADE_SCHEMA_VERSION,
  MONTAGE_SCHEMA_VERSION,
  createDefaultMontage,
  syncMontageWithScenes,
} from "./montage";
import { ATTACHMENT_SCHEMA_VERSION, PARTFORGE_SCHEMA_VERSION } from "./attachments";
import { SERIES_SCHEMA_VERSION, syncSeriesWithScenes } from "./series";
import { SCRIPT_CARTOON_SCHEMA_VERSION } from "./scriptCartoon";
import { VOICE_STUDIO_SCHEMA_VERSION } from "./voiceStudio";
import { AUTO_LIPSYNC_SCHEMA_VERSION, createEmptyMouthSet } from "./visemeSystem";
import { SCENE_BACKGROUND_SCHEMA_VERSION, normalizeSceneBackgroundFields } from "./sceneBackgrounds";

export function migrateProject(project: ProjectDocument): ProjectDocument {
  const migrated = structuredClone(project);
  migrated.characters = migrated.characters.map(ensureSemanticCharacter);
  migrated.audioAssets = migrated.audioAssets ?? [];
  migrated.voiceProfiles = migrated.voiceProfiles ?? [];
  for (const character of migrated.characters) {
    if (character.voiceProfileId === undefined) character.voiceProfileId = null;
    if (!character.mouthSet) {
      const mouth = character.parts.find((part) => part.semanticRole === "Mouth");
      character.mouthSet = createEmptyMouthSet({
        mode: mouth ? "basic" : "simple",
        primaryMouthPartId: mouth?.id ?? null,
      });
    }
  }
  if (!migrated.scenes?.length) {
    const actors: Actor[] = migrated.characters.slice(0, 1).map((character, index) => ({
      id: `actor-migrated-${index}`,
      name: character.name,
      characterId: character.id,
      position: { x: migrated.canvas.width / 2, y: migrated.canvas.height / 2 },
      scale: 1,
      rotation: 0,
      facingDirection: "Right",
      visible: true,
    }));
    const scene: Scene = {
      id: "scene-migrated",
      name: "Scene 1",
      duration: migrated.animationClips[0]?.duration ?? 5,
      width: migrated.canvas.width,
      height: migrated.canvas.height,
      background: migrated.canvas.background,
      actors,
      props: [],
      camera: { x: migrated.canvas.width / 2, y: migrated.canvas.height / 2, zoom: 1, rotation: 0 },
      actionSequence: [],
      audioTracks: [],
      dialogues: [],
      subtitleSettings: createDefaultSubtitleSettings(),
      lipSyncSettings: createDefaultLipSyncSettings(),
      attachments: [],
    };
    migrated.scenes = [scene];
    migrated.activeSceneId = scene.id;
  } else if (!migrated.activeSceneId || !migrated.scenes.some((scene) => scene.id === migrated.activeSceneId)) {
    migrated.activeSceneId = migrated.scenes[0].id;
  }

  for (const scene of migrated.scenes ?? []) {
    scene.audioTracks = scene.audioTracks ?? [];
    scene.dialogues = scene.dialogues ?? [];
    for (const line of scene.dialogues) {
      if (line.voiceProfileId === undefined) line.voiceProfileId = null;
      if (line.emotion === undefined) line.emotion = null;
      if (line.audioPath === undefined) line.audioPath = null;
      if (line.takeIndex === undefined) line.takeIndex = null;
      if (line.takeId === undefined) line.takeId = null;
      if (line.lipSync === undefined) line.lipSync = null;
      if (line.lipSyncStatus === undefined) line.lipSyncStatus = line.lipSync?.cues?.length ? "ready" : "not_generated";
    }
    scene.subtitleSettings = { ...createDefaultSubtitleSettings(), ...(scene.subtitleSettings ?? {}) };
    scene.lipSyncSettings = { ...createDefaultLipSyncSettings(), ...(scene.lipSyncSettings ?? {}) };
    scene.attachments = scene.attachments ?? [];
    normalizeSceneBackgroundFields(scene);
  }

  migrated.montage = migrated.montage
    ? syncMontageWithScenes(migrated.montage, migrated.scenes)
    : createDefaultMontage(migrated.scenes);
  migrated.attachmentPresets = migrated.attachmentPresets ?? [];
  migrated.series = syncSeriesWithScenes(migrated.series, migrated.scenes, migrated.name);

  const activeScene = migrated.scenes.find((scene) => scene.id === migrated.activeSceneId) ?? migrated.scenes[0];
  const defaults = createDefaultRenderSettings({
    canvasWidth: activeScene?.width ?? migrated.canvas.width ?? 1920,
    canvasHeight: activeScene?.height ?? migrated.canvas.height ?? 1080,
    fps: Number(migrated.fps) || 30,
    duration: Math.max(0.001, activeScene?.duration ?? 1),
    backgroundColor: activeScene?.background ?? migrated.canvas.background ?? "#dfe9e7",
  });
  migrated.renderSettings = {
    ...defaults,
    ...(migrated.renderSettings ?? {}),
    pixelFormat: "yuv420p",
  };
  if (!migrated.renderSettings.duration || migrated.renderSettings.duration <= 0) {
    migrated.renderSettings.duration = defaults.duration;
  }
  const targetSchema = Math.max(
    RENDER_SCHEMA_VERSION,
    AUDIO_SCHEMA_VERSION,
    LIPSYNC_SCHEMA_VERSION,
    MONTAGE_SCHEMA_VERSION,
    ATTACHMENT_SCHEMA_VERSION,
    CROSSFADE_SCHEMA_VERSION,
    PARTFORGE_SCHEMA_VERSION,
    SERIES_SCHEMA_VERSION,
    LIPSUB_POLISH_SCHEMA_VERSION,
    SCRIPT_CARTOON_SCHEMA_VERSION,
    VOICE_STUDIO_SCHEMA_VERSION,
    AUTO_LIPSYNC_SCHEMA_VERSION,
    SCENE_BACKGROUND_SCHEMA_VERSION,
  );
  migrated.schemaVersion = Math.max(migrated.schemaVersion ?? 1, targetSchema);
  migrated.canvas = {
    width: migrated.renderSettings.canvasWidth,
    height: migrated.renderSettings.canvasHeight,
    background: migrated.renderSettings.transparentBackground ? "#00000000" : migrated.renderSettings.backgroundColor,
  };
  const fpsCandidate = migrated.renderSettings.fps;
  migrated.fps = ([24, 25, 30, 50, 60].includes(fpsCandidate) ? fpsCandidate : 30) as ProjectDocument["fps"];
  return migrated;
}
