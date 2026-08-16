import { createDefaultRenderSettings } from "./renderSettings";
import { createId } from "./ids";
import {
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
  createEmptyAudioTrack,
  createEmptyDialogue,
  estimateSpeechDuration,
  type AudioAssetDefinition,
} from "./audio";
import { syncMontageWithScenes } from "./montage";
import { syncSeriesWithScenes } from "./series";
import type {
  Actor,
  CharacterDefinition,
  ProjectDocument,
  Scene,
  SceneAction,
} from "./types";
import { ActionCompiler } from "../systems/ActionCompiler";
import { DEFAULT_ACTOR_GAP, groundedActorY, spacedActorXs } from "./stagePlacement";

export const SCRIPT_CARTOON_SCHEMA_VERSION = 11;

export interface ScriptLine {
  speaker: string | null;
  text: string;
  raw: string;
}

export interface ScriptSceneBlock {
  title: string;
  lines: ScriptLine[];
}

export interface ParsedScript {
  title: string;
  declaredCharacters: string[];
  scenes: ScriptSceneBlock[];
  speakers: string[];
  errors: string[];
}

export interface ScriptCharacterMapping {
  /** Script speaker name → project characterId */
  [speaker: string]: string;
}

export interface ScriptTtsClip {
  sceneIndex: number;
  lineIndex: number;
  path: string;
  duration: number;
}

export interface BuildCartoonOptions {
  mapping: ScriptCharacterMapping;
  width: number;
  height: number;
  background?: string;
  /** Replace all scenes (default true). */
  replaceScenes?: boolean;
  /** Gap between consecutive dialogue lines (seconds). */
  gapSeconds?: number;
  /** Lead-in silence before first line. */
  leadInSeconds?: number;
  /** Enable subtitles on generated scenes. */
  subtitles?: boolean;
  /** Add simple Talk/Idle actions for speakers. */
  addTalkActions?: boolean;
  projectName?: string;
  ttsClips?: ScriptTtsClip[];
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function isSceneHeader(line: string): string | null {
  const hash = line.match(/^#{1,3}\s*(.+)$/);
  if (hash) return hash[1].trim();
  const eq = line.match(/^={2,}\s*(.+?)\s*={0,}$/);
  if (eq) return eq[1].trim();
  const labeled = line.match(/^(?:сцена|scene)\s*[:.\-]?\s*(.+)$/i);
  if (labeled) return labeled[1].trim();
  return null;
}

/** Meta headers from prompt→script — not dialogue speakers. */
const SCRIPT_META_HEADER = /^(?:characters|персонажи|герои|actors|props|предметы|вещи|objects|title|название|genre|жанр|atmosphere|атмосфера|настроение|music|музыка)\s*[:\-]/i;
const SCRIPT_META_SPEAKER = /^(characters|персонажи|герои|actors|props|предметы|вещи|objects|title|название|genre|жанр|atmosphere|атмосфера|настроение|music|музыка|http|https|file)$/i;

function parseDialogueLine(line: string): ScriptLine | null {
  const match = line.match(/^([^:\n]{1,40}):\s*(.+)$/);
  if (!match) return null;
  const speaker = normalizeName(match[1]);
  const text = match[2].trim();
  if (!speaker || !text) return null;
  if (SCRIPT_META_SPEAKER.test(speaker)) return null;
  return { speaker, text, raw: line };
}

/**
 * Parse a local cartoon script.
 * Supported:
 * - `# Title` / `## Scene name` / `Scene: name` / `=== name`
 * - `Speaker: dialogue text`
 * - blank line starts a new scene when no explicit headers
 * - optional first line `Characters: A, B` or `Персонажи: A, B`
 */
export function parseCartoonScript(source: string): ParsedScript {
  const errors: string[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let title = "Script Cartoon";
  const declaredCharacters: string[] = [];
  const scenes: ScriptSceneBlock[] = [];
  let current: ScriptSceneBlock | null = null;
  let sawExplicitScene = false;
  let lineNo = 0;

  const ensureScene = (name?: string) => {
    if (!current) {
      current = {
        title: name?.trim() || `Scene ${scenes.length + 1}`,
        lines: [],
      };
      scenes.push(current);
    } else if (name?.trim()) {
      current.title = name.trim();
    }
  };

  for (const raw of lines) {
    lineNo += 1;
    const trimmed = raw.trim();
    if (!trimmed) {
      if (current?.lines.length && !sawExplicitScene) {
        current = null;
      }
      continue;
    }

    const charsHeader = trimmed.match(/^(?:characters|персонажи)\s*[:\-]\s*(.+)$/i);
    if (charsHeader) {
      for (const part of charsHeader[1].split(/[,;/|]+/)) {
        const name = normalizeName(part);
        if (name && !declaredCharacters.includes(name)) declaredCharacters.push(name);
      }
      continue;
    }

    // Skip prompt metadata (Props / Genre / Atmosphere…) — not narration, not speakers.
    if (SCRIPT_META_HEADER.test(trimmed)) {
      continue;
    }

    if (trimmed.startsWith("(") && /\)\s*$/.test(trimmed)) {
      continue;
    }

    if (lineNo === 1 && trimmed.startsWith("#") && !trimmed.startsWith("##")) {
      title = trimmed.replace(/^#\s*/, "").trim() || title;
      continue;
    }

    const sceneTitle = isSceneHeader(trimmed);
    if (sceneTitle) {
      sawExplicitScene = true;
      current = { title: sceneTitle, lines: [] };
      scenes.push(current);
      continue;
    }

    const dialogue = parseDialogueLine(trimmed);
    if (dialogue) {
      ensureScene();
      current!.lines.push(dialogue);
      continue;
    }

    // Narration / stage direction without speaker
    ensureScene();
    current!.lines.push({ speaker: null, text: trimmed.replace(/^[-*•]\s*/, ""), raw: trimmed });
  }

  if (!scenes.length) {
    errors.push("В сценарии нет реплик. Формат: Имя: текст");
  }

  const speakers = Array.from(new Set(
    scenes.flatMap((scene) => scene.lines.map((line) => line.speaker).filter((name): name is string => Boolean(name))),
  ));

  for (const name of speakers) {
    if (!declaredCharacters.includes(name)) declaredCharacters.push(name);
  }

  return { title, declaredCharacters, scenes: scenes.filter((scene) => scene.lines.length > 0), speakers, errors };
}

/** Auto-map script speakers to project characters by name (case-insensitive). */
export function isDemoBotCharacter(character: { id: string; name: string }): boolean {
  const name = character.name.trim().toLowerCase();
  return character.id === "character-demobot" || name === "demobot" || name === "demo bot";
}

/** Rig with at least one part — empty «Герой» shells are not usable cast. */
export function isCastableCharacter(character: CharacterDefinition): boolean {
  return (character.parts?.length ?? 0) > 0;
}

/**
 * Cast pool for prompts/templates: real rigs only.
 * DemoBot is excluded unless the script literally asks for DemoBot.
 */
export function preferredCastCharacters(
  characters: CharacterDefinition[],
  options?: { allowDemoBot?: boolean },
): CharacterDefinition[] {
  const allowDemoBot = options?.allowDemoBot === true;
  const withParts = characters.filter(isCastableCharacter);
  const withoutDemo = withParts.filter((character) => !isDemoBotCharacter(character));
  if (withoutDemo.length) return withoutDemo;
  if (allowDemoBot) return withParts.filter(isDemoBotCharacter);
  return [];
}

export function autoMapScriptCharacters(
  speakers: string[],
  characters: CharacterDefinition[],
): ScriptCharacterMapping {
  const mapping: ScriptCharacterMapping = {};
  const wantsDemo = speakers.some((speaker) => /demobot|demo bot/i.test(speaker));
  const pool = preferredCastCharacters(characters, { allowDemoBot: wantsDemo });
  const byName = new Map(characters.map((character) => [character.name.trim().toLowerCase(), character]));
  let fallbackIndex = 0;
  for (const speaker of speakers) {
    const key = speaker.trim().toLowerCase();
    const exact = byName.get(key);
    if (exact && (wantsDemo || !isDemoBotCharacter(exact) || /demobot|demo bot/i.test(speaker))) {
      if (!isDemoBotCharacter(exact) || /demobot|demo bot/i.test(speaker)) {
        mapping[speaker] = exact.id;
        continue;
      }
    }
    const fuzzyPool = pool.length ? pool : characters.filter((c) => !isDemoBotCharacter(c) && isCastableCharacter(c));
    const fuzzy = fuzzyPool.find((character) => {
      const name = character.name.toLowerCase();
      return name === key || name.includes(key) || key.includes(name);
    });
    if (fuzzy) {
      mapping[speaker] = fuzzy.id;
      continue;
    }
    if (pool.length) {
      mapping[speaker] = pool[fallbackIndex % pool.length]!.id;
      fallbackIndex += 1;
    }
  }
  return mapping;
}

export function validateScriptMapping(
  speakers: string[],
  mapping: ScriptCharacterMapping,
  characters: CharacterDefinition[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!characters.length) errors.push("В проекте нет персонажей. Импортируйте rig (Load Rig) или создайте в Character Creator.");
  for (const speaker of speakers) {
    const id = mapping[speaker];
    if (!id) errors.push(`Нет персонажа для «${speaker}».`);
    else if (!characters.some((character) => character.id === id)) errors.push(`Персонаж для «${speaker}» не найден в проекте.`);
  }
  return { ok: errors.length === 0, errors };
}

function makeActor(character: CharacterDefinition, displayName: string, x: number, y: number, facing: "Left" | "Right"): Actor {
  return {
    id: createId("actor"),
    name: displayName,
    characterId: character.id,
    position: { x, y },
    scale: 1,
    rotation: 0,
    facingDirection: facing,
    visible: true,
  };
}

function placeActors(
  speakers: string[],
  mapping: ScriptCharacterMapping,
  characters: CharacterDefinition[],
  width: number,
  height: number,
): Actor[] {
  const unique = Array.from(new Set(speakers)).filter((name) => !/^(титр|диктор|title|narrator|caption|текст)$/i.test(name));
  const y = groundedActorY(height, 1);
  const xs = spacedActorXs(Math.max(1, unique.length || 1), width, DEFAULT_ACTOR_GAP);
  if (unique.length === 0) {
    // Product ads / title cards: no silent DemoBot or monster cast.
    return [];
  }
  return unique.map((speaker, index) => {
    const mapped = characters.find((item) => item.id === mapping[speaker]);
    const pool = preferredCastCharacters(characters, { allowDemoBot: /demobot/i.test(speaker) });
    const character = (mapped && (!isDemoBotCharacter(mapped) || /demobot/i.test(speaker)) ? mapped : null)
      ?? pool[index % Math.max(1, pool.length)]
      ?? mapped;
    if (!character) return null;
    const facing = index < unique.length / 2 ? "Right" as const : "Left" as const;
    return makeActor(character, speaker, xs[index] ?? width / 2, y, facing);
  }).filter((actor): actor is Actor => Boolean(actor));
}

function findActorId(actors: Actor[], speaker: string | null, mapping: ScriptCharacterMapping): string | null {
  if (!speaker || /^(титр|диктор|title|narrator|caption|текст)$/i.test(speaker)) return null;
  const characterId = mapping[speaker];
  const byName = actors.find((actor) => actor.name.toLowerCase() === speaker.toLowerCase());
  if (byName) return byName.id;
  if (characterId) {
    const byChar = actors.find((actor) => actor.characterId === characterId);
    if (byChar) return byChar.id;
  }
  return actors[0]?.id ?? null;
}

/** Build scene documents + optional audio assets from a parsed script (local only). */
export function buildCartoonFromScript(
  project: ProjectDocument,
  parsed: ParsedScript,
  options: BuildCartoonOptions,
): { project: ProjectDocument; sceneIds: string[]; warnings: string[] } {
  const warnings = [...parsed.errors];
  const draft = structuredClone(project);
  const characters = draft.characters;
  const mapping = options.mapping;
  const gap = Math.max(0.05, options.gapSeconds ?? 0.35);
  const leadIn = Math.max(0, options.leadInSeconds ?? 0.35);
  const width = options.width;
  const height = options.height;
  const background = options.background ?? draft.scenes?.[0]?.background ?? "#dfe5e7";
  const ttsClips = options.ttsClips ?? [];
  const addTalk = options.addTalkActions !== false;
  const subtitlesOn = options.subtitles !== false;

  if (options.projectName) draft.name = options.projectName;
  if (parsed.title && parsed.title !== "Script Cartoon") draft.name = parsed.title;

  const newScenes: Scene[] = [];
  draft.audioAssets = draft.audioAssets ?? [];

  parsed.scenes.forEach((block, sceneIndex) => {
    const speakers = block.lines.map((line) => line.speaker).filter((name): name is string => Boolean(name));
    const actors = placeActors(speakers, mapping, characters, width, height);
    const scene: Scene = {
      id: createId("scene"),
      name: block.title || `Scene ${sceneIndex + 1}`,
      duration: 6,
      width,
      height,
      background,
      actors,
      props: [],
      camera: { x: width / 2, y: height / 2, zoom: 1, rotation: 0 },
      actionSequence: [],
      audioTracks: [],
      dialogues: [],
      subtitleSettings: createDefaultSubtitleSettings({ enabled: subtitlesOn, showInExport: subtitlesOn, showSpeaker: true }),
      lipSyncSettings: createDefaultLipSyncSettings({ enabled: true, preferAmplitude: true, textDriven: true }),
      attachments: [],
    };

    let cursor = leadIn;
    const actions: SceneAction[] = [];

    block.lines.forEach((line, lineIndex) => {
      const clip = ttsClips.find((item) => item.sceneIndex === sceneIndex && item.lineIndex === lineIndex);
      const duration = Math.max(0.4, clip?.duration ?? estimateSpeechDuration(line.text));
      const actorId = findActorId(actors, line.speaker, mapping);
      let audioTrackId: string | null = null;

      if (clip?.path) {
        const assetId = createId("audio");
        const asset: AudioAssetDefinition = {
          id: assetId,
          name: line.text.slice(0, 48) || `line-${sceneIndex}-${lineIndex}`,
          path: clip.path,
          mediaType: "audio/wav",
          duration,
        };
        draft.audioAssets!.push(asset);
        const trackId = createId("atrack");
        scene.audioTracks!.push(createEmptyAudioTrack({
          id: trackId,
          assetId,
          name: line.speaker ? `TTS ${line.speaker}` : "TTS",
          duration,
          startTime: cursor,
        }));
        audioTrackId = trackId;
      }

      scene.dialogues!.push(createEmptyDialogue({
        id: createId("dlg"),
        actorId,
        text: line.text,
        startTime: cursor,
        duration,
        audioTrackId,
        audioPath: clip?.path ?? null,
      }));

      if (addTalk && actorId) {
        actions.push({
          id: createId("action"),
          actorId,
          type: "Talk",
          targetActorId: null,
          duration: Math.min(duration, Math.max(0.6, duration * 0.9)),
          startMode: "Absolute",
          startTime: cursor,
          parameters: {},
        });
        actions.push({
          id: createId("action"),
          actorId,
          type: "Idle",
          targetActorId: null,
          duration: 0.2,
          startMode: "Absolute",
          startTime: cursor + duration,
          parameters: {},
        });
      }

      cursor += duration + gap;
    });

    scene.actionSequence = actions;
    if (actions.length) {
      scene.generatedTimeline = new ActionCompiler().compile(scene);
      scene.duration = Math.max(cursor, scene.generatedTimeline.duration, 1);
    } else {
      scene.duration = Math.max(cursor, 1);
    }

    newScenes.push(scene);
  });

  if (!newScenes.length) {
    warnings.push("Не удалось собрать сцены.");
    return { project: draft, sceneIds: [], warnings };
  }

  if (options.replaceScenes !== false) {
    draft.scenes = newScenes;
  } else {
    draft.scenes = [...(draft.scenes ?? []), ...newScenes];
  }
  draft.activeSceneId = newScenes[0]!.id;
  draft.montage = syncMontageWithScenes(undefined, draft.scenes);
  draft.series = syncSeriesWithScenes(undefined, draft.scenes, draft.name);
  const totalDuration = draft.scenes.reduce((sum, scene) => sum + Math.max(0.1, scene.duration), 0);
  draft.renderSettings = createDefaultRenderSettings({
    ...(draft.renderSettings ?? {}),
    canvasWidth: width,
    canvasHeight: height,
    duration: totalDuration,
    backgroundColor: background.startsWith("#") ? background : (draft.renderSettings?.backgroundColor ?? "#dfe9e7"),
  });

  return { project: draft, sceneIds: newScenes.map((scene) => scene.id), warnings };
}

export function collectScriptLinesForTts(parsed: ParsedScript): Array<{ sceneIndex: number; lineIndex: number; text: string; speaker: string | null }> {
  const result: Array<{ sceneIndex: number; lineIndex: number; text: string; speaker: string | null }> = [];
  parsed.scenes.forEach((scene, sceneIndex) => {
    scene.lines.forEach((line, lineIndex) => {
      if (line.text.trim() && line.speaker) result.push({ sceneIndex, lineIndex, text: line.text.trim(), speaker: line.speaker });
    });
  });
  return result;
}

export const SCRIPT_EXAMPLE = `# Лесной разговор
Characters: Огонёк, Морозко

## Поляна
Огонёк: Привет! Я готов к локальному мультику.
Морозко: Отлично. Без облака и платных API.
Огонёк: Сейчас соберём сцены и озвучку.

## Дорога
Морозко: Пойдём дальше?
Огонёк: Конечно. Экспортируем MP4 в конце.
`;
