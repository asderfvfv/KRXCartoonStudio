import { createId } from "./ids";
import {
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
  createEmptyDialogue,
  estimateSpeechDuration,
} from "./audio";
import type {
  Actor,
  CharacterDefinition,
  ProjectDocument,
  Scene,
  SceneAction,
} from "./types";
import { ActionCompiler } from "../systems/ActionCompiler";
import type { SeriesEpisode } from "./series";
import {
  createSolidBackgroundFill,
  templateBackgroundFor,
  type SceneBackgroundFill,
} from "./sceneBackgrounds";

export type SceneTemplateId = "empty" | "solo" | "duo" | "dialogue" | "action";
export type EpisodeTemplateId = "blank" | "single" | "per-scene" | "intro-main-outro";

export interface SceneTemplateInfo {
  id: SceneTemplateId;
  label: string;
  description: string;
}

export interface EpisodeTemplateInfo {
  id: EpisodeTemplateId;
  label: string;
  description: string;
}

export const sceneTemplates: SceneTemplateInfo[] = [
  { id: "empty", label: "Empty", description: "Пустая сцена без актёров" },
  { id: "solo", label: "Solo", description: "Один актёр по центру" },
  { id: "duo", label: "Duo", description: "Два актёра слева и справа" },
  { id: "dialogue", label: "Dialogue", description: "Два актёра + пример реплик и субтитры" },
  { id: "action", label: "Action", description: "Актёр + Enter → Wave → Idle и Build Timeline" },
];

export const episodeTemplates: EpisodeTemplateInfo[] = [
  { id: "blank", label: "Blank episode", description: "Один пустой эпизод со всеми сценами" },
  { id: "single", label: "One episode", description: "Один эпизод = все сцены проекта" },
  { id: "per-scene", label: "Per scene", description: "По эпизоду на каждую сцену" },
  { id: "intro-main-outro", label: "Intro / Main / Outro", description: "Три эпизода: первая, середина, последняя сцена(ы)" },
];

export interface BuildSceneContext {
  name: string;
  width: number;
  height: number;
  characters: CharacterDefinition[];
  background?: string;
  backgroundFill?: SceneBackgroundFill;
}

function makeActor(
  character: CharacterDefinition,
  name: string,
  x: number,
  y: number,
  facing: "Left" | "Right" = "Right",
): Actor {
  return {
    id: createId("actor"),
    name,
    characterId: character.id,
    position: { x, y },
    scale: 0.75,
    rotation: 0,
    facingDirection: facing,
    visible: true,
  };
}

function baseScene(ctx: BuildSceneContext, actors: Actor[], duration: number): Scene {
  const fallback = templateBackgroundFor("empty");
  return {
    id: createId("scene"),
    name: ctx.name,
    duration,
    width: ctx.width,
    height: ctx.height,
    background: ctx.background ?? fallback.background,
    backgroundFill: ctx.backgroundFill ?? fallback.backgroundFill,
    actors,
    props: [],
    camera: { x: ctx.width / 2, y: ctx.height / 2, zoom: 1, rotation: 0 },
    actionSequence: [],
    audioTracks: [],
    dialogues: [],
    subtitleSettings: createDefaultSubtitleSettings(),
    lipSyncSettings: createDefaultLipSyncSettings(),
    attachments: [],
  };
}

/** Build a new Scene from a built-in template (local only). */
export function buildSceneFromTemplate(templateId: SceneTemplateId, ctx: BuildSceneContext): Scene {
  const vivid = templateBackgroundFor(templateId);
  let background: string;
  let backgroundFill: SceneBackgroundFill;
  if (ctx.backgroundFill) {
    background = ctx.background ?? vivid.background;
    backgroundFill = ctx.backgroundFill;
  } else if (ctx.background) {
    background = ctx.background;
    backgroundFill = createSolidBackgroundFill();
  } else {
    background = vivid.background;
    backgroundFill = vivid.backgroundFill;
  }
  const ctxWithBg: BuildSceneContext = { ...ctx, background, backgroundFill };
  const chars = ctxWithBg.characters;
  const pool = chars.filter((character) => (character.parts?.length ?? 0) > 0
    && character.id !== "character-demobot"
    && character.name.trim().toLowerCase() !== "demobot");
  const cast = pool.length ? pool : chars.filter((character) => (character.parts?.length ?? 0) > 0);
  const primary = cast[0];
  const secondary = cast[1] ?? cast[0];
  const cx = ctxWithBg.width / 2;
  const cy = ctxWithBg.height / 2;

  if (templateId === "empty" || !primary) {
    return baseScene(ctxWithBg, [], 6);
  }

  if (templateId === "solo") {
    return baseScene(ctxWithBg, [makeActor(primary, primary.name, cx, cy)], 6);
  }

  if (templateId === "duo") {
    const left = makeActor(primary, primary.name, cx - 320, cy, "Right");
    const right = makeActor(secondary, secondary === primary ? `${secondary.name} B` : secondary.name, cx + 320, cy, "Left");
    return baseScene(ctxWithBg, [left, right], 6);
  }

  if (templateId === "dialogue") {
    const left = makeActor(primary, primary.name, cx - 300, cy, "Right");
    const right = makeActor(secondary, secondary === primary ? `${secondary.name} B` : secondary.name, cx + 300, cy, "Left");
    const scene = baseScene(ctxWithBg, [left, right], 8);
    const line1 = "Привет! Это локальный шаблон диалога.";
    const line2 = "Отлично. Без облака и платных API.";
    const d1 = estimateSpeechDuration(line1);
    const d2 = estimateSpeechDuration(line2);
    scene.dialogues = [
      createEmptyDialogue({ id: createId("dlg"), actorId: left.id, text: line1, startTime: 0.4, duration: d1 }),
      createEmptyDialogue({ id: createId("dlg"), actorId: right.id, text: line2, startTime: 0.4 + d1 + 0.35, duration: d2 }),
    ];
    scene.subtitleSettings = createDefaultSubtitleSettings({ enabled: true, showInExport: true });
    scene.duration = Math.max(8, 0.4 + d1 + 0.35 + d2 + 0.8);
    return scene;
  }

  // action
  const hero = makeActor(primary, primary.name, cx - 400, cy, "Right");
  const actions: SceneAction[] = [
    { id: createId("action"), actorId: hero.id, type: "Enter", targetActorId: null, duration: 1, startMode: "AfterPrevious", parameters: { from: "Left" } },
    { id: createId("action"), actorId: hero.id, type: "WalkTo", targetActorId: null, duration: 1.4, startMode: "AfterPrevious", parameters: { x: cx, y: cy, stopDistance: 0 } },
    { id: createId("action"), actorId: hero.id, type: "Wave", targetActorId: null, duration: 0.9, startMode: "AfterPrevious", parameters: {} },
    { id: createId("action"), actorId: hero.id, type: "Idle", targetActorId: null, duration: 1.2, startMode: "AfterPrevious", parameters: {} },
  ];
  const scene = baseScene(ctxWithBg, [hero], 6);
  scene.actionSequence = actions;
  scene.generatedTimeline = new ActionCompiler().compile(scene);
  scene.duration = scene.generatedTimeline.duration;
  return scene;
}

/** Replace series episodes from a built-in episode template. */
export function buildEpisodesFromTemplate(
  templateId: EpisodeTemplateId,
  scenes: Scene[],
): SeriesEpisode[] {
  const ids = scenes.map((scene) => scene.id);
  if (templateId === "blank") {
    return [{
      id: createId("ep"),
      number: 1,
      title: "Episode 1",
      enabled: true,
      sceneIds: [...ids],
    }];
  }

  if (templateId === "single" || ids.length === 0) {
    return [{
      id: createId("ep"),
      number: 1,
      title: scenes[0]?.name ?? "Episode 1",
      enabled: true,
      sceneIds: [...ids],
    }];
  }

  if (templateId === "per-scene") {
    return scenes.map((scene, index) => ({
      id: createId("ep"),
      number: index + 1,
      title: scene.name,
      enabled: true,
      sceneIds: [scene.id],
    }));
  }

  // intro-main-outro
  if (ids.length === 1) {
    return [
      { id: createId("ep"), number: 1, title: "Intro", enabled: true, sceneIds: [ids[0]] },
      { id: createId("ep"), number: 2, title: "Main", enabled: true, sceneIds: [ids[0]] },
      { id: createId("ep"), number: 3, title: "Outro", enabled: true, sceneIds: [ids[0]] },
    ];
  }
  if (ids.length === 2) {
    return [
      { id: createId("ep"), number: 1, title: "Intro", enabled: true, sceneIds: [ids[0]] },
      { id: createId("ep"), number: 2, title: "Main", enabled: true, sceneIds: [ids[0], ids[1]] },
      { id: createId("ep"), number: 3, title: "Outro", enabled: true, sceneIds: [ids[1]] },
    ];
  }
  const intro = ids[0];
  const outro = ids[ids.length - 1];
  const main = ids.slice(1, -1);
  return [
    { id: createId("ep"), number: 1, title: "Intro", enabled: true, sceneIds: [intro] },
    { id: createId("ep"), number: 2, title: "Main", enabled: true, sceneIds: main.length ? main : [intro, outro] },
    { id: createId("ep"), number: 3, title: "Outro", enabled: true, sceneIds: [outro] },
  ];
}

export function applyEpisodeTemplateToProject(
  project: ProjectDocument,
  templateId: EpisodeTemplateId,
): ProjectDocument {
  const draft = structuredClone(project);
  const episodes = buildEpisodesFromTemplate(templateId, draft.scenes ?? []);
  draft.series = {
    name: draft.series?.name ?? `${draft.name} Series`,
    episodes,
  };
  return draft;
}
