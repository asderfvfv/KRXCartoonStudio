import type { AnimationClip, AssetDefinition, CharacterDefinition, ProjectDocument, RigPart, Scene, SceneAction, SemanticRole } from "./types";
import { ensureSemanticCharacter } from "./semantic";
import { ActionCompiler } from "../systems/ActionCompiler";
import { RENDER_SCHEMA_VERSION, createDefaultRenderSettings } from "./renderSettings";
import { templateBackgroundFor } from "./sceneBackgrounds";
import { buildEmptyCharacter } from "./characterCreator";
import { createDefaultLipSyncSettings, createDefaultSubtitleSettings } from "./audio";
import { syncMontageWithScenes } from "./montage";

const transform = (x: number, y: number, rotation = 0, scaleX = 1, scaleY = 1) => ({ x, y, rotation, scaleX, scaleY });
const part = (id: string, name: string, semanticRole: SemanticRole, parentId: string | null, zIndex: number, x: number, y: number, width: number, height: number, pivotX = width / 2, pivotY = height / 2): RigPart => ({
  id, name, assetId: `asset-${id}`, parentId, zIndex,
  transform: transform(x, y), pivot: { x: pivotX, y: pivotY }, anchor: { x: 0, y: 0 },
  visible: true, locked: false, opacity: 1, semanticRole,
});

export const demoAssets: AssetDefinition[] = [
  ["body", 220, 310], ["head", 240, 210], ["eye-left", 32, 42], ["eye-right", 32, 42],
  ["arm-left", 72, 210], ["arm-right", 72, 210], ["hand-left", 68, 72], ["hand-right", 68, 72],
  ["leg-left", 82, 225], ["leg-right", 82, 225],
].map(([id, width, height]) => ({
  id: `asset-${id}`, name: String(id), path: `builtin://demobot/${id}.svg`, mediaType: "image/svg+xml" as const,
  width: Number(width), height: Number(height),
}));

const rawDemoCharacter: CharacterDefinition = {
  version: 1,
  id: "character-demobot",
  name: "DemoBot",
  parts: [
    part("body", "Body", "Body", null, 10, 110, 150, 220, 310, 110, 150),
    part("head", "Head", "Head", "body", 20, 110, 0, 240, 210, 120, 105),
    part("eye-left", "EyeLeft", "EyeLeft", "head", 22, 88, 82, 32, 42, 16, 21),
    part("eye-right", "EyeRight", "EyeRight", "head", 22, 152, 82, 32, 42, 16, 21),
    part("arm-left", "ArmLeft", "ArmLeft", "body", 8, 20, 65, 72, 210, 36, 28),
    part("hand-left", "HandLeft", "HandLeft", "arm-left", 9, 36, 190, 68, 72, 34, 15),
    part("arm-right", "ArmRight", "ArmRight", "body", 12, 200, 65, 72, 210, 36, 28),
    part("hand-right", "HandRight", "HandRight", "arm-right", 13, 36, 190, 68, 72, 34, 15),
    part("leg-left", "LegLeft", "LegLeft", "body", 7, 65, 290, 82, 225, 41, 22),
    part("leg-right", "LegRight", "LegRight", "body", 7, 155, 290, 82, 225, 41, 22),
  ],
  sockets: [
    { id: "socket-head-top", name: "Head Top", type: "HeadTop", partId: "head", position: { x: 120, y: 4 } },
    { id: "socket-hand-left", name: "Left Hand", type: "HandLeft", partId: "hand-left", position: { x: 34, y: 36 } },
    { id: "socket-hand-right", name: "Right Hand", type: "HandRight", partId: "hand-right", position: { x: 34, y: 36 } },
  ],
};

export const demoCharacter: CharacterDefinition = ensureSemanticCharacter(rawDemoCharacter);

const idle: AnimationClip = {
  id: "clip-idle", name: "Idle", duration: 2, loop: true,
  tracks: [
    { id: "idle-body-y", partId: "body", property: "y", keyframes: [
      { id: "i1", time: 0, value: 150, easing: "easeInOut" }, { id: "i2", time: 1, value: 158, easing: "easeInOut" }, { id: "i3", time: 2, value: 150, easing: "easeInOut" },
    ] },
    { id: "idle-head-rot", partId: "head", property: "rotation", keyframes: [
      { id: "i4", time: 0, value: -1.5, easing: "easeInOut" }, { id: "i5", time: 1, value: 1.5, easing: "easeInOut" }, { id: "i6", time: 2, value: -1.5, easing: "easeInOut" },
    ] },
  ],
};

const wave: AnimationClip = {
  id: "clip-wave", name: "Wave", duration: 1, loop: true,
  tracks: [{ id: "wave-arm-right", partId: "arm-right", property: "rotation", keyframes: [
    { id: "w1", time: 0, value: 0, easing: "easeInOut" }, { id: "w2", time: 0.25, value: -35, easing: "easeInOut" },
    { id: "w3", time: 0.5, value: -70, easing: "easeInOut" }, { id: "w4", time: 0.75, value: -25, easing: "easeInOut" },
    { id: "w5", time: 1, value: 0, easing: "easeInOut" },
  ] }],
};

export function createDefaultProject(name = "Untitled Cartoon"): ProjectDocument {
  const actions: SceneAction[] = [
    { id: "action-enter", actorId: "actor-hero", type: "Enter", targetActorId: null, duration: 1, startMode: "AfterPrevious", parameters: { from: "Left" } },
    { id: "action-walk", actorId: "actor-hero", type: "WalkTo", targetActorId: "actor-monster", duration: 2, startMode: "AfterPrevious", parameters: { stopDistance: 210 } },
    { id: "action-wave", actorId: "actor-hero", type: "Wave", targetActorId: "actor-monster", duration: .9, startMode: "AfterPrevious", parameters: {} },
    { id: "action-laugh", actorId: "actor-monster", type: "Laugh", targetActorId: "actor-hero", duration: 1, startMode: "AfterPrevious", parameters: {} },
    { id: "action-angry", actorId: "actor-hero", type: "Angry", targetActorId: "actor-monster", duration: .7, startMode: "AfterPrevious", parameters: {} },
    { id: "action-attack", actorId: "actor-hero", type: "Attack", targetActorId: "actor-monster", duration: .7, startMode: "AfterPrevious", parameters: {} },
    { id: "action-hit", actorId: "actor-monster", type: "Hit", targetActorId: "actor-hero", duration: .5, startMode: "WithPrevious", parameters: { direction: "Right", distance: 80 } },
    { id: "action-shake", actorId: null, type: "CameraShake", targetActorId: null, duration: .45, startMode: "WithPrevious", parameters: { intensity: 22 } },
    { id: "action-fall", actorId: "actor-monster", type: "Fall", targetActorId: null, duration: .9, startMode: "AfterPrevious", parameters: { direction: "Right", distance: 150 } },
    { id: "action-idle", actorId: "actor-hero", type: "Idle", targetActorId: null, duration: 1.6, startMode: "AfterPrevious", parameters: {} },
  ];
  const scene: Scene = {
    id: "scene-demo-action", name: "Demo Action Scene", duration: 9, width: 1920, height: 1080, background: "#dfe9e7",
    actors: [
      { id: "actor-hero", name: "Hero", characterId: demoCharacter.id, position: { x: 650, y: 560 }, scale: .72, rotation: 0, facingDirection: "Right", visible: true, tint: "#ffffff" },
      { id: "actor-monster", name: "Monster", characterId: demoCharacter.id, position: { x: 1320, y: 570 }, scale: .82, rotation: 0, facingDirection: "Left", visible: true, tint: "#f19a94" },
    ], props: [], camera: { x: 960, y: 540, zoom: 1, rotation: 0 }, actionSequence: actions,
  };
  scene.generatedTimeline = new ActionCompiler().compile(scene);
  const renderSettings = createDefaultRenderSettings({
    preset: "youtube-fullhd",
    canvasWidth: 1920,
    canvasHeight: 1080,
    fps: 30,
    duration: scene.generatedTimeline.duration,
    backgroundColor: scene.background,
  });
  return {
    version: 1,
    schemaVersion: RENDER_SCHEMA_VERSION,
    name,
    canvas: { width: renderSettings.canvasWidth, height: renderSettings.canvasHeight, background: renderSettings.backgroundColor },
    fps: 30,
    assets: structuredClone(demoAssets),
    characters: [structuredClone(demoCharacter)],
    sceneObjects: [{ id: "scene-demobot", characterId: demoCharacter.id }],
    animationClips: [structuredClone(idle), structuredClone(wave)],
    settings: { snapToGrid: false, gridSize: 10 },
    scenes: [scene],
    activeSceneId: scene.id,
    renderSettings,
    voiceProfiles: [],
  };
}

/** Empty starter project — no DemoBot, no demo actors/actions. */
export function createBlankProject(name = "Новый мультфильм"): ProjectDocument {
  const character = buildEmptyCharacter("Герой", "character-hero");
  const bg = templateBackgroundFor("empty");
  const scene: Scene = {
    id: "scene-1",
    name: "Сцена 1",
    duration: 8,
    width: 1920,
    height: 1080,
    background: bg.background,
    backgroundFill: bg.backgroundFill,
    actors: [],
    props: [],
    camera: { x: 960, y: 540, zoom: 1, rotation: 0 },
    actionSequence: [],
    audioTracks: [],
    dialogues: [],
    subtitleSettings: createDefaultSubtitleSettings(),
    lipSyncSettings: createDefaultLipSyncSettings(),
    attachments: [],
  };
  const blankIdle: AnimationClip = {
    id: "clip-idle",
    name: "Idle",
    duration: 1,
    loop: true,
    tracks: [],
  };
  const blankWave: AnimationClip = {
    id: "clip-wave",
    name: "Wave",
    duration: 1,
    loop: true,
    tracks: [],
  };
  const renderSettings = createDefaultRenderSettings({
    preset: "youtube-fullhd",
    canvasWidth: 1920,
    canvasHeight: 1080,
    fps: 30,
    duration: scene.duration,
    backgroundColor: scene.background,
  });
  const project: ProjectDocument = {
    version: 1,
    schemaVersion: RENDER_SCHEMA_VERSION,
    name,
    canvas: { width: renderSettings.canvasWidth, height: renderSettings.canvasHeight, background: renderSettings.backgroundColor },
    fps: 30,
    assets: [],
    characters: [character],
    sceneObjects: [],
    animationClips: [blankIdle, blankWave],
    settings: { snapToGrid: false, gridSize: 10 },
    scenes: [scene],
    activeSceneId: scene.id,
    renderSettings,
    montage: syncMontageWithScenes(undefined, [scene]),
    voiceProfiles: [],
  };
  return project;
}
