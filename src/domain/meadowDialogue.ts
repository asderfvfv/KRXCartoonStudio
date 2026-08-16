/**
 * Full cartoon episode: two monsters meet → decide to visit the third → arrive → he comes out.
 * Cast: Огонёк, Морозко, Винтик (AudioBeast EmberPuff / FrostFang / GearBot).
 * Per-scene music beds (not one track for the whole film).
 */
import {
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
  createEmptyAudioTrack,
  createEmptyDialogue,
  estimateSpeechDuration,
  type AudioAssetDefinition,
} from "./audio";
import { AUDIO_BEAST_FIGHT_CAST, buildAudioBeastCharacter, type AudioBeastMonsterSpec } from "./audioBeastCharacters";
import { createId } from "./ids";
import { syncMontageWithScenes } from "./montage";
import { createDefaultRenderSettings } from "./renderSettings";
import { syncSeriesWithScenes } from "./series";
import { groundedActorY, spacedActorXs } from "./stagePlacement";
import type {
  Actor,
  AssetDefinition,
  CharacterDefinition,
  ProjectDocument,
  Scene,
  SceneAction,
} from "./types";
import { ActionCompiler } from "../systems/ActionCompiler";
import type { BundledCharacterPack } from "./fightDemo";

export const MEADOW_CAST_NAMES = {
  ember: "Огонёк",
  frost: "Морозко",
  gear: "Винтик",
} as const;

/** Script shown in Script panel (multi-scene story). */
export const MEADOW_DIALOGUE_SCRIPT = `# В гости к Винтику
Characters: Огонёк, Морозко, Винтик

## Встреча на поляне
Огонёк: Эй, Морозко! Какое солнечное утро!
Морозко: Ого, Огонёк! Трава тёплая… почти не холодная.
Огонёк: Слушай, давай навестим Винтика! Он давно сидит в своём домике.
Морозко: Отличная идея! Сходим к нему в гости.
Огонёк: Договорились! Пошли по тропинке.
Морозко: Я уже готов. Только не беги слишком горячо.

## Дорога в гости
Огонёк: Смотри, какие деревья! Почти пришли.
Морозко: Надеюсь, Винтик дома и не чинит свои шестерёнки весь день.
Огонёк: Если чинит — позовём громче!
Морозко: Ха! Тогда он точно выйдет.

## Домик Винтика
Огонёк: Винтик! Мы пришли в гости!
Морозко: Винтик, выходи! Мы на пороге!
Винтик: Скрип-привет! Я дома! Сейчас выйду!
Огонёк: Ура! Вот он!
Морозко: Здравствуй, друг! Мы соскучились.
Винтик: Заходите… то есть стойте тут, я уже с вами!
Огонёк: Значит, теперь мы снова втроём.
Винтик: Команда Поляны в полном составе. Скрип-ура!
`;

export interface SceneMusicBed {
  asset: AudioAssetDefinition;
  volume?: number;
}

function action(
  actorId: string | null,
  type: SceneAction["type"],
  duration: number,
  startMode: SceneAction["startMode"] = "AfterPrevious",
  parameters: SceneAction["parameters"] = {},
  targetActorId: string | null = null,
  startTime?: number,
): SceneAction {
  return {
    id: createId("action"),
    actorId,
    type,
    targetActorId,
    duration,
    startMode,
    startTime,
    parameters,
  };
}

function actorY(_specName: string, height: number): number {
  return groundedActorY(height, 1);
}

function scaleOf(specName: string): number {
  return AUDIO_BEAST_FIGHT_CAST.find((item) => item.name === specName)!.actorScale;
}

function findCast(characters: CharacterDefinition[]) {
  const ember = characters.find((item) => item.id === "character-emberpuff");
  const frost = characters.find((item) => item.id === "character-frostfang");
  const gear = characters.find((item) => item.id === "character-gearbot");
  if (!ember || !frost || !gear) {
    throw new Error("Нужны Огонёк/Морозко/Винтик (AudioBeast EmberPuff, FrostFang, GearBot).");
  }
  return { ember, frost, gear };
}

/** Tile one music bed across a single scene duration only. */
export function tileMusicForScene(
  asset: AudioAssetDefinition,
  totalDuration: number,
  volume: number,
): NonNullable<Scene["audioTracks"]> {
  const tracks: NonNullable<Scene["audioTracks"]> = [];
  const clip = Math.max(0.5, asset.duration);
  let t = 0;
  let index = 0;
  while (t < totalDuration - 0.05) {
    const duration = Math.min(clip, totalDuration - t);
    tracks.push(createEmptyAudioTrack({
      id: createId("atrack"),
      assetId: asset.id,
      name: `Music:${asset.name}:${++index}`,
      startTime: t,
      duration,
      volume,
    }));
    t += clip;
  }
  return tracks;
}

function attachDialogues(
  scene: Scene,
  lines: Array<{ actorId: string; text: string }>,
  startAt: number,
  gap = 0.4,
): number {
  let t = startAt;
  for (const line of lines) {
    const duration = estimateSpeechDuration(line.text);
    scene.dialogues!.push(createEmptyDialogue({
      id: createId("dlg"),
      actorId: line.actorId,
      text: line.text,
      startTime: t,
      duration,
    }));
    scene.actionSequence.push(action(line.actorId, "Talk", duration, "Absolute", { intensity: 1.05 }, null, t));
    scene.actionSequence.push(action(line.actorId, "Idle", Math.min(0.3, gap), "Absolute", {}, null, t + duration));
    t += duration + gap;
  }
  return t;
}

function compileScene(scene: Scene): Scene {
  scene.generatedTimeline = new ActionCompiler().compile(scene);
  scene.duration = Math.max(scene.duration, scene.generatedTimeline.duration + 0.4);
  return scene;
}

function buildMeetScene(
  characters: CharacterDefinition[],
  width: number,
  height: number,
  backgroundAssetId?: string,
): Scene {
  const { ember, frost } = findCast(characters);
  const [xEmber, xFrost] = spacedActorXs(2, width, 380);
  const actors: Actor[] = [
    {
      id: "actor-ember",
      name: MEADOW_CAST_NAMES.ember,
      characterId: ember.id,
      position: { x: xEmber!, y: actorY("EmberPuff", height) },
      scale: scaleOf("EmberPuff"),
      rotation: 0,
      facingDirection: "Right",
      visible: true,
    },
    {
      id: "actor-frost",
      name: MEADOW_CAST_NAMES.frost,
      characterId: frost.id,
      position: { x: xFrost!, y: actorY("FrostFang", height) },
      scale: scaleOf("FrostFang"),
      rotation: 0,
      facingDirection: "Left",
      visible: true,
    },
  ];

  const scene: Scene = {
    id: createId("scene"),
    name: "1. Встреча на поляне",
    duration: 35,
    width,
    height,
    background: "#87b86a",
    backgroundAssetId,
    actors,
    props: [],
    camera: { x: width / 2, y: height / 2, zoom: 1, rotation: 0 },
    actionSequence: [
      action("actor-ember", "Enter", 0.9, "AfterPrevious", { from: "Left" }),
      action("actor-frost", "Enter", 0.85, "WithPrevious", { from: "Right" }),
      action("actor-ember", "Wave", 0.65),
      action("actor-frost", "Happy", 0.55, "WithPrevious"),
    ],
    audioTracks: [],
    dialogues: [],
    subtitleSettings: createDefaultSubtitleSettings({ enabled: true, showInExport: true, showSpeaker: true }),
    lipSyncSettings: createDefaultLipSyncSettings({ enabled: true, preferAmplitude: true, textDriven: true }),
    attachments: [],
  };

  const end = attachDialogues(scene, [
    { actorId: "actor-ember", text: "Эй, Морозко! Какое солнечное утро!" },
    { actorId: "actor-frost", text: "Ого, Огонёк! Трава тёплая… почти не холодная." },
    { actorId: "actor-ember", text: "Слушай, давай навестим Винтика! Он давно сидит в своём домике." },
    { actorId: "actor-frost", text: "Отличная идея! Сходим к нему в гости." },
    { actorId: "actor-ember", text: "Договорились! Пошли по тропинке." },
    { actorId: "actor-frost", text: "Я уже готов. Только не беги слишком горячо." },
  ], 1.7);

  scene.actionSequence.push(action("actor-ember", "Happy", 0.7, "Absolute", { intensity: 1.1 }, null, end));
  scene.actionSequence.push(action("actor-frost", "Wave", 0.7, "WithPrevious"));
  scene.duration = Math.max(28, end + 1.2);
  return compileScene(scene);
}

function buildRoadScene(
  characters: CharacterDefinition[],
  width: number,
  height: number,
  backgroundAssetId?: string,
): Scene {
  const { ember, frost } = findCast(characters);
  const y = actorY("EmberPuff", height);
  const [xFrost, xEmber] = spacedActorXs(2, width, 320);
  const actors: Actor[] = [
    {
      id: "actor-ember",
      name: MEADOW_CAST_NAMES.ember,
      characterId: ember.id,
      position: { x: xEmber!, y },
      scale: scaleOf("EmberPuff"),
      rotation: 0,
      facingDirection: "Right",
      visible: true,
    },
    {
      id: "actor-frost",
      name: MEADOW_CAST_NAMES.frost,
      characterId: frost.id,
      position: { x: xFrost!, y: actorY("FrostFang", height) },
      scale: scaleOf("FrostFang"),
      rotation: 0,
      facingDirection: "Right",
      visible: true,
    },
  ];

  const scene: Scene = {
    id: createId("scene"),
    name: "2. Дорога в гости",
    duration: 30,
    width,
    height,
    background: "#7faf62",
    backgroundAssetId,
    actors,
    props: [],
    camera: { x: width / 2, y: height / 2, zoom: 1, rotation: 0 },
    actionSequence: [
      action("actor-frost", "Enter", 0.8, "AfterPrevious", { from: "Left" }),
      action("actor-ember", "Enter", 0.8, "WithPrevious", { from: "Left" }),
      action("actor-frost", "WalkTo", 2.4, "AfterPrevious", { x: Math.min(width * 0.55, xFrost! + 80), stopDistance: 0 }),
      action("actor-ember", "WalkTo", 2.4, "WithPrevious", { x: Math.min(width * 0.72, xEmber! + 80), stopDistance: 0 }),
    ],
    audioTracks: [],
    dialogues: [],
    subtitleSettings: createDefaultSubtitleSettings({ enabled: true, showInExport: true, showSpeaker: true }),
    lipSyncSettings: createDefaultLipSyncSettings({ enabled: true, preferAmplitude: true, textDriven: true }),
    attachments: [],
  };

  const end = attachDialogues(scene, [
    { actorId: "actor-ember", text: "Смотри, какие деревья! Почти пришли." },
    { actorId: "actor-frost", text: "Надеюсь, Винтик дома и не чинит свои шестерёнки весь день." },
    { actorId: "actor-ember", text: "Если чинит — позовём громче!" },
    { actorId: "actor-frost", text: "Ха! Тогда он точно выйдет." },
  ], 3.1);

  scene.actionSequence.push(action("actor-ember", "RunTo", 1.1, "Absolute", { x: Math.min(width * 0.78, (xEmber ?? width * 0.6) + 40), stopDistance: 0 }, null, end));
  scene.actionSequence.push(action("actor-frost", "RunTo", 1.1, "WithPrevious", { x: Math.min(width * 0.58, (xFrost ?? width * 0.45) + 40), stopDistance: 0 }));
  scene.duration = Math.max(24, end + 1.5);
  return compileScene(scene);
}

function buildHouseScene(
  characters: CharacterDefinition[],
  width: number,
  height: number,
  backgroundAssetId?: string,
): Scene {
  const { ember, frost, gear } = findCast(characters);
  const [xEmber, xFrost, xGear] = spacedActorXs(3, width, 340);
  const actors: Actor[] = [
    {
      id: "actor-ember",
      name: MEADOW_CAST_NAMES.ember,
      characterId: ember.id,
      position: { x: xEmber!, y: actorY("EmberPuff", height) },
      scale: scaleOf("EmberPuff"),
      rotation: 0,
      facingDirection: "Right",
      visible: true,
    },
    {
      id: "actor-frost",
      name: MEADOW_CAST_NAMES.frost,
      characterId: frost.id,
      position: { x: xFrost!, y: actorY("FrostFang", height) },
      scale: scaleOf("FrostFang"),
      rotation: 0,
      facingDirection: "Right",
      visible: true,
    },
    {
      id: "actor-gear",
      name: MEADOW_CAST_NAMES.gear,
      characterId: gear.id,
      position: { x: xGear!, y: actorY("GearBot", height) },
      scale: scaleOf("GearBot"),
      rotation: 0,
      facingDirection: "Left",
      visible: true,
      opacity: 0,
    },
  ];

  const scene: Scene = {
    id: createId("scene"),
    name: "3. Домик Винтика",
    duration: 40,
    width,
    height,
    background: "#8fb86e",
    backgroundAssetId,
    actors,
    props: [],
    camera: { x: width / 2, y: height / 2, zoom: 1, rotation: 0 },
    actionSequence: [
      action("actor-ember", "Enter", 0.75, "AfterPrevious", { from: "Left" }),
      action("actor-frost", "Enter", 0.75, "WithPrevious", { from: "Left" }),
    ],
    audioTracks: [],
    dialogues: [],
    subtitleSettings: createDefaultSubtitleSettings({ enabled: true, showInExport: true, showSpeaker: true }),
    lipSyncSettings: createDefaultLipSyncSettings({ enabled: true, preferAmplitude: true, textDriven: true }),
    attachments: [],
  };

  // Hide GearBot until he comes out: set opacity 0 at start via Absolute Idle won't work.
  // Use Enter for GearBot after the call.
  let t = attachDialogues(scene, [
    { actorId: "actor-ember", text: "Винтик! Мы пришли в гости!" },
    { actorId: "actor-frost", text: "Винтик, выходи! Мы на пороге!" },
  ], 1.6);

  scene.actionSequence.push(action("actor-gear", "Enter", 1.1, "Absolute", { from: "Right" }, null, t));
  t += 1.15;

  t = attachDialogues(scene, [
    { actorId: "actor-gear", text: "Скрип-привет! Я дома! Сейчас выйду!" },
    { actorId: "actor-ember", text: "Ура! Вот он!" },
    { actorId: "actor-frost", text: "Здравствуй, друг! Мы соскучились." },
    { actorId: "actor-gear", text: "Заходите… то есть стойте тут, я уже с вами!" },
    { actorId: "actor-ember", text: "Значит, теперь мы снова втроём." },
    { actorId: "actor-gear", text: "Команда Поляны в полном составе. Скрип-ура!" },
  ], t);

  scene.actionSequence.push(action("actor-ember", "Happy", 0.85, "Absolute", { intensity: 1.15 }, null, t));
  scene.actionSequence.push(action("actor-frost", "Happy", 0.85, "WithPrevious", { intensity: 1.1 }));
  scene.actionSequence.push(action("actor-gear", "Wave", 0.9, "WithPrevious"));
  scene.duration = Math.max(32, t + 1.4);
  return compileScene(scene);
}

export interface VisitEpisodeOptions {
  meadowBackground?: { path: string; width: number; height: number };
  houseBackground?: { path: string; width: number; height: number };
  /** Calm bed for meeting + cottage */
  musicMeet?: AudioAssetDefinition;
  /** Adventure bed for the road */
  musicRoad?: AudioAssetDefinition;
}

/** Build the full 3-scene cartoon project. */
export function applyMeadowDialogueDemo(
  project: ProjectDocument,
  packs: BundledCharacterPack[],
  options?: VisitEpisodeOptions,
): ProjectDocument {
  const draft = structuredClone(project);
  draft.name = "В гости к Винтику";
  draft.audioAssets = draft.audioAssets ?? [];

  for (const pack of packs) {
    const renamed = structuredClone(pack.character);
    if (renamed.id === "character-emberpuff") renamed.name = MEADOW_CAST_NAMES.ember;
    if (renamed.id === "character-frostfang") renamed.name = MEADOW_CAST_NAMES.frost;
    if (renamed.id === "character-gearbot") renamed.name = MEADOW_CAST_NAMES.gear;
    const index = draft.characters.findIndex((item) => item.id === renamed.id);
    if (index >= 0) draft.characters[index] = renamed;
    else draft.characters.push(renamed);
    const ids = new Set(pack.assets.map((asset) => asset.id));
    draft.assets = [...draft.assets.filter((asset) => !ids.has(asset.id)), ...pack.assets];
  }

  const ensureBg = (label: string, info?: { path: string; width: number; height: number }) => {
    if (!info) return undefined;
    const id = createId("asset");
    draft.assets = [
      ...draft.assets.filter((item) => item.name !== label),
      {
        id,
        name: label,
        path: info.path,
        mediaType: "image/png",
        width: info.width,
        height: info.height,
      } satisfies AssetDefinition,
    ];
    return id;
  };

  const meadowId = ensureBg("meadow-sunny", options?.meadowBackground);
  const houseId = ensureBg("gear-cottage", options?.houseBackground);

  if (options?.musicMeet) {
    draft.audioAssets = [...draft.audioAssets.filter((item) => item.id !== options.musicMeet!.id), options.musicMeet];
  }
  if (options?.musicRoad) {
    draft.audioAssets = [...draft.audioAssets.filter((item) => item.id !== options.musicRoad!.id), options.musicRoad];
  }

  const width = draft.renderSettings?.canvasWidth ?? 1920;
  const height = draft.renderSettings?.canvasHeight ?? 1080;

  const meet = buildMeetScene(draft.characters, width, height, meadowId);
  const road = buildRoadScene(draft.characters, width, height, meadowId);
  const house = buildHouseScene(draft.characters, width, height, houseId);

  if (options?.musicMeet) {
    meet.audioTracks = tileMusicForScene(options.musicMeet, meet.duration, 0.26);
    house.audioTracks = tileMusicForScene(options.musicMeet, house.duration, 0.24);
  }
  if (options?.musicRoad) {
    road.audioTracks = tileMusicForScene(options.musicRoad, road.duration, 0.3);
  }

  draft.scenes = [meet, road, house];
  draft.activeSceneId = meet.id;
  draft.montage = syncMontageWithScenes(undefined, draft.scenes);
  draft.montage.transition = "crossfade";
  draft.montage.crossfadeDuration = 0.6;
  draft.series = syncSeriesWithScenes(undefined, draft.scenes, draft.name);
  const total = draft.scenes.reduce((sum, scene) => sum + scene.duration, 0);
  draft.renderSettings = createDefaultRenderSettings({
    ...(draft.renderSettings ?? {}),
    canvasWidth: width,
    canvasHeight: height,
    duration: total,
    backgroundColor: meet.background,
  });
  return draft;
}

export function buildMeadowDialogueScene(
  characters: CharacterDefinition[],
  width = 1920,
  height = 1080,
  backgroundAssetId?: string,
): Scene {
  return buildMeetScene(characters, width, height, backgroundAssetId);
}

export function buildMeadowPackFromSpec(
  spec: AudioBeastMonsterSpec,
  resolveAssetPath: (fileName: string) => string,
): BundledCharacterPack {
  return buildAudioBeastCharacter(spec, (file) => resolveAssetPath(file));
}

/** Re-apply timing after real TTS durations for one scene. */
export function retimeSceneDialoguesWithTts(scene: Scene, gap = 0.4): void {
  const ordered = [...(scene.dialogues ?? [])].sort((a, b) => a.startTime - b.startTime);
  if (!ordered.length) return;
  const intro = scene.actionSequence.filter((item) => item.startMode !== "Absolute");
  let cursor = Math.max(1.5, ordered[0]!.startTime);
  for (const line of ordered) {
    line.startTime = cursor;
    const track = scene.audioTracks?.find((item) => item.id === line.audioTrackId);
    if (track) {
      track.startTime = cursor;
      track.duration = line.duration;
    }
    cursor += line.duration + gap;
  }
  const talks = ordered.flatMap((line) => ([
    action(line.actorId, "Talk", line.duration, "Absolute", { intensity: 1.05 }, null, line.startTime),
    action(line.actorId, "Idle", Math.min(0.3, gap), "Absolute", {}, null, line.startTime + line.duration),
  ]));
  const finale = scene.actionSequence.filter((item) =>
    item.startMode !== "Absolute" && (item.type === "Happy" || item.type === "Wave" || item.type === "RunTo" || item.type === "WalkTo" || item.type === "Enter"));
  // Keep intro Enter/Wave/Walk; drop old Absolute talks; append new talks + keep non-absolute locomotion that was after talks is hard —
  // Safer: keep only Enter/Wave/Happy/Idle WithPrevious from start of sequence (first 6), then talks, then scene-specific finale by name.
  const head = intro.slice(0, 8);
  scene.actionSequence = [...head, ...talks];
  if (scene.name.includes("Домик")) {
    // Ensure GearBot Enter exists before his first line
    const gearFirst = ordered.find((line) => line.actorId === "actor-gear");
    if (gearFirst) {
      const enterAt = Math.max(0, gearFirst.startTime - 1.15);
      scene.actionSequence.push(action("actor-gear", "Enter", 1.1, "Absolute", { from: "Right" }, null, enterAt));
    }
    scene.actionSequence.push(action("actor-ember", "Happy", 0.85, "Absolute", { intensity: 1.15 }, null, cursor));
    scene.actionSequence.push(action("actor-frost", "Happy", 0.85, "WithPrevious", { intensity: 1.1 }));
    scene.actionSequence.push(action("actor-gear", "Wave", 0.9, "WithPrevious"));
  } else if (scene.name.includes("Дорога")) {
    scene.actionSequence.push(action("actor-ember", "RunTo", 1.0, "Absolute", { x: scene.width * 0.9 }, null, cursor));
    scene.actionSequence.push(action("actor-frost", "RunTo", 1.0, "WithPrevious", { x: scene.width * 0.78 }));
  } else {
    scene.actionSequence.push(action("actor-ember", "Happy", 0.7, "Absolute", { intensity: 1.1 }, null, cursor));
    scene.actionSequence.push(action("actor-frost", "Wave", 0.7, "WithPrevious"));
  }
  void finale;
  scene.duration = Math.max(scene.duration, cursor + 1.6);
  scene.generatedTimeline = new ActionCompiler().compile(scene);
  scene.duration = Math.max(scene.duration, scene.generatedTimeline.duration + 0.3);
}
