import { createId } from "./ids";
import {
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
  createEmptyDialogue,
  estimateSpeechDuration,
} from "./audio";
import {
  AUDIO_BEAST_FIGHT_CAST,
  buildAudioBeastCharacter,
  type AudioBeastMonsterSpec,
} from "./audioBeastCharacters";
import { syncMontageWithScenes } from "./montage";
import { syncSeriesWithScenes } from "./series";
import { createDefaultRenderSettings } from "./renderSettings";
import type {
  Actor,
  AssetDefinition,
  CharacterDefinition,
  ProjectDocument,
  Scene,
  SceneAction,
} from "./types";
import { ActionCompiler } from "../systems/ActionCompiler";

export { AUDIO_BEAST_FIGHT_CAST } from "./audioBeastCharacters";

/** @deprecated alias — use AUDIO_BEAST_FIGHT_CAST */
export const FIGHT_DEMO_MONSTERS = AUDIO_BEAST_FIGHT_CAST.map((item) => ({
  folder: item.folder,
  id: item.id,
  name: item.name,
  role: item.name === "EmberPuff" ? "challenger" as const : item.name === "FrostFang" ? "runner" as const : "watcher" as const,
}));

export const FIGHT_DEMO_SCRIPT = `# Драка на поляне
Characters: EmberPuff, FrostFang, GearBot

## Вызов
EmberPuff: Эй, ты! Иди сюда!
GearBot: Ой-ой…
FrostFang: Сейчас подбегу!
`;

export interface BundledCharacterPack {
  character: CharacterDefinition;
  assets: AssetDefinition[];
}

function action(
  actorId: string | null,
  type: SceneAction["type"],
  duration: number,
  startMode: SceneAction["startMode"] = "AfterPrevious",
  parameters: SceneAction["parameters"] = {},
  targetActorId: string | null = null,
): SceneAction {
  return {
    id: createId("action"),
    actorId,
    type,
    targetActorId,
    duration,
    startMode,
    parameters,
  };
}

/** Build the fight demo scene: EmberPuff calls out → FrostFang runs in → they fight; GearBot watches. */
export function buildAudioBeastFightScene(
  characters: CharacterDefinition[],
  width = 1920,
  height = 1080,
): Scene {
  const ember = characters.find((item) => item.id === "character-emberpuff" || item.name === "EmberPuff");
  const frost = characters.find((item) => item.id === "character-frostfang" || item.name === "FrostFang");
  const gear = characters.find((item) => item.id === "character-gearbot" || item.name === "GearBot");
  if (!ember || !frost || !gear) {
    throw new Error("Нужны персонажи EmberPuff, FrostFang и GearBot (Characters/AudioBeast).");
  }

  // Actor root ≈ top-left of body; keep feet above the safe frame (~8% margin).
  const ground = height * 0.88;
  const specOf = (specName: string) => AUDIO_BEAST_FIGHT_CAST.find((item) => item.name === specName)!;
  const actorY = (specName: string) => {
    const spec = specOf(specName);
    // body PNG + legs ≈ 1.22 of targetHeight after actor.scale
    return Math.round(ground - spec.targetHeight * spec.actorScale * 1.22);
  };

  const actors: Actor[] = [
    {
      id: "actor-ember",
      name: "EmberPuff",
      characterId: ember.id,
      position: { x: width * 0.28, y: actorY("EmberPuff") },
      scale: specOf("EmberPuff").actorScale,
      rotation: 0,
      facingDirection: "Right",
      visible: true,
    },
    {
      id: "actor-frost",
      name: "FrostFang",
      characterId: frost.id,
      position: { x: width * 0.72, y: actorY("FrostFang") },
      scale: specOf("FrostFang").actorScale,
      rotation: 0,
      facingDirection: "Left",
      visible: true,
    },
    {
      id: "actor-gear",
      name: "GearBot",
      characterId: gear.id,
      position: { x: width * 0.88, y: actorY("GearBot") },
      scale: specOf("GearBot").actorScale,
      rotation: 0,
      facingDirection: "Left",
      visible: true,
    },
  ];

  const line = "Эй, ты! Иди сюда!";
  const talkDur = estimateSpeechDuration(line);
  const clash = 112; // contact distance for punches (actor roots)

  const actions: SceneAction[] = [
    // Setup: challenger enters and calls out
    action("actor-ember", "Enter", 0.85, "AfterPrevious", { from: "Left" }),
    action("actor-gear", "Enter", 0.7, "WithPrevious", { from: "Right" }),
    action("actor-ember", "Talk", talkDur, "AfterPrevious", { intensity: 1.1 }),
    action("actor-ember", "Angry", 0.45, "AfterPrevious", { intensity: 1.2 }),
    // FrostFang rushes into melee range
    action("actor-frost", "Enter", 0.45, "AfterPrevious", { from: "Right" }),
    action("actor-frost", "RunTo", 0.95, "AfterPrevious", { stopDistance: clash }, "actor-ember"),
    action("actor-gear", "Scared", 0.7, "WithPrevious", { intensity: 1.2 }),
    action("actor-ember", "Face", 0.05, "AfterPrevious", {}, "actor-frost"),
    // Exchange 1 — Ember lunges in
    action("actor-ember", "Attack", 0.55, "AfterPrevious", { stopDistance: clash - 8, distance: 36, intensity: 1.5 }, "actor-frost"),
    action("actor-frost", "Hit", 0.4, "WithPrevious", { direction: "Right", distance: 110, intensity: 1.4 }),
    action(null, "CameraShake", 0.35, "WithPrevious", { intensity: 30 }),
    // Exchange 2 — Frost counters immediately
    action("actor-frost", "Attack", 0.5, "AfterPrevious", { stopDistance: clash - 8, distance: 40, intensity: 1.5 }, "actor-ember"),
    action("actor-ember", "Hit", 0.38, "WithPrevious", { direction: "Left", distance: 100, intensity: 1.35 }),
    action(null, "CameraShake", 0.3, "WithPrevious", { intensity: 26 }),
    // Exchange 3 — both close again, Ember finishes
    action("actor-ember", "RunTo", 0.45, "AfterPrevious", { stopDistance: clash }, "actor-frost"),
    action("actor-ember", "Attack", 0.5, "AfterPrevious", { stopDistance: clash - 14, distance: 48, intensity: 1.7 }, "actor-frost"),
    action("actor-frost", "Hit", 0.35, "WithPrevious", { direction: "Right", distance: 130, intensity: 1.5 }),
    action(null, "CameraShake", 0.4, "WithPrevious", { intensity: 34 }),
    action("actor-frost", "Fall", 0.9, "AfterPrevious", { direction: "Right", distance: 220 }),
    action("actor-ember", "Happy", 0.85, "AfterPrevious", { intensity: 1.2 }),
    action("actor-gear", "Surprised", 0.7, "WithPrevious", { intensity: 1.3 }),
    action("actor-ember", "Idle", 1.0),
  ];

  const talkStart = 0.85;

  const scene: Scene = {
    id: createId("scene"),
    name: "Драка: Эй, ты! Иди сюда!",
    duration: 12,
    width,
    height,
    background: "#8fb59a",
    actors,
    props: [],
    camera: { x: width / 2, y: height / 2, zoom: 1, rotation: 0 },
    actionSequence: actions,
    audioTracks: [],
    dialogues: [
      createEmptyDialogue({
        id: createId("dlg"),
        actorId: "actor-ember",
        text: line,
        startTime: talkStart,
        duration: talkDur,
      }),
    ],
    subtitleSettings: createDefaultSubtitleSettings({ enabled: true, showInExport: true, showSpeaker: true }),
    lipSyncSettings: createDefaultLipSyncSettings({ enabled: true, preferAmplitude: true, textDriven: true }),
    attachments: [],
  };
  scene.generatedTimeline = new ActionCompiler().compile(scene);
  scene.duration = Math.max(scene.generatedTimeline.duration, talkStart + talkDur + 1);
  return scene;
}

/** Merge AudioBeast packs into a project and replace scenes with the fight demo. */
export function applyAudioBeastFightDemo(
  project: ProjectDocument,
  packs: BundledCharacterPack[],
): ProjectDocument {
  const draft = structuredClone(project);
  draft.name = "AudioBeast Fight Demo";
  draft.audioAssets = draft.audioAssets ?? [];

  for (const pack of packs) {
    const character = pack.character;
    const index = draft.characters.findIndex((item) => item.id === character.id || item.name === character.name);
    if (index >= 0) draft.characters[index] = character;
    else draft.characters.push(character);
    const ids = new Set(pack.assets.map((asset) => asset.id));
    draft.assets = [...draft.assets.filter((asset) => !ids.has(asset.id)), ...pack.assets];
  }

  const width = draft.renderSettings?.canvasWidth ?? 1920;
  const height = draft.renderSettings?.canvasHeight ?? 1080;
  const scene = buildAudioBeastFightScene(draft.characters, width, height);
  draft.scenes = [scene];
  draft.activeSceneId = scene.id;
  draft.montage = syncMontageWithScenes(undefined, draft.scenes);
  draft.series = syncSeriesWithScenes(undefined, draft.scenes, draft.name);
  draft.renderSettings = createDefaultRenderSettings({
    ...(draft.renderSettings ?? {}),
    canvasWidth: width,
    canvasHeight: height,
    duration: scene.duration,
    backgroundColor: scene.background,
  });
  return draft;
}

export function buildPackFromSpec(
  spec: AudioBeastMonsterSpec,
  resolveAssetPath: (fileName: string) => string,
  sizes?: Parameters<typeof buildAudioBeastCharacter>[2],
): BundledCharacterPack {
  return buildAudioBeastCharacter(spec, (file) => resolveAssetPath(file), sizes);
}
