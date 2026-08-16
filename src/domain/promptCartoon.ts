/**
 * Local prompt → cartoon plan (no cloud APIs).
 * Smarter parse: moods, cast aliases, backgrounds, stage directions from RU/EN prose.
 */
import { audioMediaTypeFromPath, type AudioAssetDefinition } from "./audio";
import { createId } from "./ids";
import { syncMontageWithScenes } from "./montage";
import { ActionCompiler } from "../systems/ActionCompiler";
import type { ActionType, ProjectDocument, SceneAction, SceneActionParameters } from "./types";
import { applyAdWowMotion } from "./adMotion";
import { applyCartoonCamera, applyDialogueActing } from "./cartoonActing";
import { applyBackgroundPreset, SCENE_BACKGROUND_PRESETS } from "./sceneBackgrounds";
import { isDemoBotCharacter } from "./scriptCartoon";
import { DEFAULT_ACTOR_GAP, groundedActorY, spacedActorXs } from "./stagePlacement";
import { isDemoBotAssetPath, isRigPartAssetName } from "./rigPartNames";

export type CartoonMood = "calm" | "adventure" | "funny" | "scary" | "neutral";

/** Bundled background keys under Assets/Backgrounds (or solid color fallback). */
export type PromptBackgroundKey = "meadow" | "cottage" | "sky" | "night" | "studio";

export type PromptStageHint =
  | { kind: "Enter"; from?: "Left" | "Right" }
  | { kind: "Exit"; from?: "Left" | "Right" }
  | { kind: "Walk" | "Run"; toward?: "right" | "left" | "center" }
  | { kind: "Wave" | "Happy" | "Jump" | "Angry" | "Laugh" | "Surprised" | "Scared" };

export interface PromptScenePlan {
  title: string;
  summary: string;
  lines: Array<{ speaker: string; text: string }>;
  mood: CartoonMood;
  backgroundKey: PromptBackgroundKey;
  stageHints: PromptStageHint[];
}

export interface PromptCartoonPlan {
  title: string;
  genre: string;
  atmosphere: string;
  characters: string[];
  /** Prop names from «Props: / Предметы:» — matched to asset names in the project. */
  props: string[];
  scenes: PromptScenePlan[];
  musicHints: CartoonMood[];
  /** Prefer crossfade montage for multi-scene adventure/calm stories. */
  preferCrossfade: boolean;
  warnings: string[];
}

const MOOD_WORDS: Record<CartoonMood, string[]> = {
  calm: ["спокой", "тишин", "утро", "поляна", "мирн", "нежн", "тепл", "домов", "дружел", "солнечно", "трав", "цветоч"],
  adventure: ["дорог", "путеш", "приключ", "беж", "идти", "пошли", "квест", "лес", "тропин", "гости", "вперёд", "побежал"],
  funny: ["смех", "шутк", "весел", "ха-ха", "прикол", "угар", "забав"],
  scary: ["страш", "ночь", "тёмн", "ужас", "монстр", "грозн", "тень"],
  neutral: [],
};

const CAST_ALIASES: Record<string, string> = {
  огонёк: "Огонёк",
  огонек: "Огонёк",
  ember: "Огонёк",
  emberpuff: "Огонёк",
  морозко: "Морозко",
  frost: "Морозко",
  frostfang: "Морозко",
  винтик: "Винтик",
  gear: "Винтик",
  gearbot: "Винтик",
};

export function normalizeCastName(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, "");
  return CAST_ALIASES[key] ?? name.trim().replace(/\s+/g, " ");
}

function detectMood(text: string): CartoonMood {
  const lower = text.toLowerCase();
  let best: CartoonMood = "neutral";
  let score = 0;
  (Object.keys(MOOD_WORDS) as CartoonMood[]).forEach((mood) => {
    if (mood === "neutral") return;
    const hits = MOOD_WORDS[mood].filter((word) => lower.includes(word)).length;
    if (hits > score) {
      score = hits;
      best = mood;
    }
  });
  return best;
}

export function suggestBackgroundKey(text: string, mood: CartoonMood, genre = ""): PromptBackgroundKey {
  const lower = `${text} ${genre}`.toLowerCase();
  if (/реклам|studio|студи/.test(lower)) return "studio";
  if (/домик|дом|хижин|коттедж|cottage|house|порог|мастерск/.test(lower)) return "cottage";
  if (/ночь|тёмн|темн|луна|night|scary|ужас/.test(lower) || mood === "scary") return "night";
  if (/поляна|луг|лес|трав|тропин|дорога|meadow|forest|утро|солнеч/.test(lower) || mood === "calm" || mood === "adventure") {
    return "meadow";
  }
  if (mood === "funny") return "sky";
  return "meadow";
}

/** Solid fallback colors when PNG missing. */
export function backgroundColorForKey(key: PromptBackgroundKey): string {
  switch (key) {
    case "cottage":
      return "#c4a574";
    case "night":
      return "#1a2433";
    case "sky":
      return "#87b8e0";
    case "studio":
      return "#12141c";
    case "meadow":
    default:
      return "#87b86a";
  }
}

export function backgroundFileForKey(key: PromptBackgroundKey): string | null {
  switch (key) {
    case "cottage":
      return "gear-cottage.png";
    case "meadow":
      return "meadow-sunny.png";
    case "studio":
    case "sky":
    case "night":
    default:
      return null;
  }
}

/** Painted sky/ground when PNG is absent — cartoons always get a scene, not a blank warning. */
export function backgroundPaintForKey(key: PromptBackgroundKey) {
  const presetId =
    key === "cottage" ? "grad-room"
      : key === "night" ? "grad-night"
        : key === "sky" ? "grad-sky"
          : key === "studio" ? "neon-stage"
            : "grad-meadow";
  const preset = SCENE_BACKGROUND_PRESETS.find((item) => item.id === presetId) ?? SCENE_BACKGROUND_PRESETS[0]!;
  return applyBackgroundPreset(preset);
}

export function inferStageHints(text: string): PromptStageHint[] {
  const lower = text.toLowerCase();
  const hints: PromptStageHint[] = [];
  if (/вход|входит|появил|выбежал|пришёл|пришел|enter|appear/.test(lower)) {
    hints.push({ kind: "Enter", from: /справа|right/.test(lower) ? "Right" : "Left" });
  }
  if (/уход|уходит|убежал|exit|исчез/.test(lower)) {
    hints.push({ kind: "Exit", from: /налево|left/.test(lower) ? "Left" : "Right" });
  }
  if (/беж|ран|run|мчит/.test(lower)) {
    hints.push({ kind: "Run", toward: /назад|left|налево/.test(lower) ? "left" : "right" });
  } else if (/идёт|идет|шли|пошли|дорога|тропин|walk|шага|к центру/.test(lower)) {
    hints.push({ kind: "Walk", toward: "right" });
  }
  if (/машет|привет|wave|рук|смотри/.test(lower)) hints.push({ kind: "Wave" });
  if (/рад|ура|счаст|happy|улыб|жми/.test(lower)) hints.push({ kind: "Happy" });
  if (/прыг|jump/.test(lower)) hints.push({ kind: "Jump" });
  if (/зл|angry|сердит/.test(lower)) hints.push({ kind: "Angry" });
  if (/смех|ха-ха|laugh/.test(lower)) hints.push({ kind: "Laugh" });
  if (/удивл|ого\b|surprised|смотри-ка/.test(lower)) hints.push({ kind: "Surprised" });
  if (/страх|scared|боит|тревожн/.test(lower)) hints.push({ kind: "Scared" });
  return hints;
}

export function stageHintsToRemark(hints: PromptStageHint[]): string {
  const parts: string[] = [];
  for (const hint of hints) {
    if (hint.kind === "Enter") parts.push(hint.from === "Right" ? "входит справа" : "входит слева");
    else if (hint.kind === "Exit") parts.push(hint.from === "Left" ? "уходит налево" : "уходит направо");
    else if (hint.kind === "Walk") parts.push(hint.toward === "center" ? "идёт к центру" : hint.toward === "left" ? "идёт налево" : "идут по дороге");
    else if (hint.kind === "Run") parts.push("бегут");
    else if (hint.kind === "Wave") parts.push("машет");
    else if (hint.kind === "Happy") parts.push("ура");
    else if (hint.kind === "Jump") parts.push("прыжок");
    else if (hint.kind === "Angry") parts.push("злится");
    else if (hint.kind === "Laugh") parts.push("смех");
    else if (hint.kind === "Surprised") parts.push("удивляется");
    else if (hint.kind === "Scared") parts.push("тревожно");
  }
  return [...new Set(parts)].join(", ");
}

function splitScenes(source: string): Array<{ title: string; body: string }> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const scenes: Array<{ title: string; body: string }> = [];
  let title = "Сцена 1";
  let buf: string[] = [];
  let inScenes = false;
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) scenes.push({ title, body });
    buf = [];
  };
  for (const line of lines) {
    const h2 = line.match(/^##\s*(.+)$/);
    const sceneWord = line.match(/^(?:сцена|scene)\s*(\d+)\s*[:.\-–]?\s*(.*)$/i);
    if (h2 || sceneWord) {
      if (inScenes) flush();
      inScenes = true;
      title = h2 ? h2[1]!.trim() : `Сцена ${sceneWord![1]}${sceneWord![2] ? `. ${sceneWord![2]}` : ""}`.trim();
      buf = [];
      continue;
    }
    if (!inScenes) continue;
    buf.push(line);
  }
  flush();
  if (!scenes.length) {
    // Free prose: split by blank lines into scenes (skip metadata-only blocks).
    const bodyLines = lines.filter((line) => !/^#\s+/.test(line) && !/^(?:characters|персонажи|genre|жанр|atmosphere|атмосфера)\s*:/i.test(line));
    const chunks = bodyLines.join("\n").split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
    if (chunks.length > 1) {
      chunks.forEach((chunk, index) => scenes.push({ title: `Сцена ${index + 1}`, body: chunk }));
    } else {
      const body = bodyLines.join("\n").trim();
      if (body) scenes.push({ title: "Сцена 1", body });
    }
  }
  return scenes;
}

function extractDialogue(body: string): Array<{ speaker: string; text: string }> {
  const result: Array<{ speaker: string; text: string }> = [];
  for (const raw of body.split("\n")) {
    if (raw.trim().startsWith("(")) continue;
    const match = raw.match(/^([^:#\-]{1,40}):\s*(.+)$/);
    if (!match) continue;
    const speaker = normalizeCastName(match[1]!.trim());
    if (/^(characters|персонажи|герои|actors|props|предметы|вещи|objects|title|название|genre|жанр|atmosphere|атмосфера)$/i.test(speaker)) continue;
    result.push({ speaker, text: match[2]!.trim() });
  }
  return result;
}

function extractNamedList(source: string, keys: string): string[] {
  const match = source.match(new RegExp(`(?:${keys})\\s*:\\s*(.+)`, "i"));
  if (!match) return [];
  return match[1]!
    .split(/[,;/]| и /i)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

function extractCharactersList(source: string): string[] {
  return extractNamedList(source, "characters|персонажи|герои|actors")
    .map(normalizeCastName)
    .filter(Boolean);
}

function extractPropsList(source: string): string[] {
  const names = extractNamedList(source, "props|предметы|вещи|objects");
  // Also accept per-scene: Props@Scene: a, b — keep simple for now
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function isTitleSpeaker(name: string): boolean {
  return /^(титр|диктор|title|narrator|caption|текст)$/i.test(name.trim());
}

function inferCharacters(scenes: PromptScenePlan[], declared: string[]): string[] {
  const set = new Set(declared.map(normalizeCastName).filter((name) => name && !isTitleSpeaker(name)));
  for (const scene of scenes) {
    for (const line of scene.lines) {
      if (!isTitleSpeaker(line.speaker)) set.add(normalizeCastName(line.speaker));
    }
  }
  return [...set];
}

function synthesizeLinesFromProse(body: string, fallbackSpeakers: string[]): Array<{ speaker: string; text: string }> {
  const cleaned = body
    .replace(/^\([^)]+\)\s*/gm, "")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 6 && !item.startsWith("#") && !/^(characters|персонажи|genre|жанр)/i.test(item));
  if (!cleaned.length) return [];
  const speakers = (fallbackSpeakers.length ? fallbackSpeakers : ["Огонёк", "Морозко"]).map(normalizeCastName);
  return cleaned.slice(0, 10).map((text, index) => ({
    speaker: speakers[index % speakers.length]!,
    text: text.replace(/^[-–—]\s*/, ""),
  }));
}

/** Parse user prompt into a cartoon plan (deterministic, local). */
export function parseCartoonPrompt(prompt: string): PromptCartoonPlan {
  const source = prompt.trim();
  const warnings: string[] = [];
  if (!source) {
    return {
      title: "Безымянный мультик",
      genre: "сказка",
      atmosphere: "нейтральная",
      characters: [],
      props: [],
      scenes: [],
      musicHints: ["neutral"],
      preferCrossfade: false,
      warnings: ["Пустой промпт."],
    };
  }

  const title = (source.match(/^#\s*(.+)$/m)?.[1]
    || source.match(/(?:название|title)\s*:\s*(.+)/i)?.[1]
    || "Мультик").trim().slice(0, 80);

  const moodGlobal = detectMood(source);
  const genre = source.match(/(?:жанр|genre)\s*:\s*(.+)/i)?.[1]?.trim()
    || (moodGlobal === "adventure" ? "приключение"
      : moodGlobal === "funny" ? "комедия"
        : moodGlobal === "scary" ? "триллер"
          : "сказка");
  const atmosphere = source.match(/(?:атмосфера|atmosphere|настроение)\s*:\s*(.+)/i)?.[1]?.trim()
    || (moodGlobal === "calm" ? "тёплая и спокойная"
      : moodGlobal === "adventure" ? "дорога и ожидание"
        : moodGlobal === "scary" ? "тревожная"
          : "живая");

  const declared = extractCharactersList(source);
  const props = extractPropsList(source);
  const rawScenes = splitScenes(source);
  const scenes: PromptScenePlan[] = rawScenes.map((block, index) => {
    let lines = extractDialogue(block.body);
    if (!lines.length) {
      lines = synthesizeLinesFromProse(block.body, declared);
      if (lines.length) {
        warnings.push(`Сцена «${block.title}»: реплики собраны из текста (лучше «Имя: фраза»).`);
      }
    }
    const blob = `${block.title}\n${block.body}\n${atmosphere}`;
    const mood = detectMood(blob);
    return {
      title: block.title || `Сцена ${index + 1}`,
      summary: block.body.slice(0, 140),
      lines,
      mood,
      backgroundKey: suggestBackgroundKey(blob, mood, genre),
      stageHints: inferStageHints(blob),
    };
  }).filter((scene) => scene.lines.length > 0);

  if (!scenes.length) {
    warnings.push("Не удалось выделить сцены. Используйте «Имя: текст» и «## Сцена», либо абзацы.");
  }

  // Ensure Enter leads; fill defaults when nothing detected.
  scenes.forEach((scene, index) => {
    if (!scene.stageHints.length) {
      scene.stageHints = index === 0
        ? [{ kind: "Enter", from: "Left" }, { kind: "Wave" }]
        : [{ kind: "Enter", from: "Left" }];
      if (scene.mood === "adventure") scene.stageHints.push({ kind: "Walk", toward: "right" });
      if (scene.mood === "funny" || /рад|ура/.test(scene.summary.toLowerCase())) scene.stageHints.push({ kind: "Happy" });
      if (scene.mood === "scary") scene.stageHints.push({ kind: "Scared" });
    } else if (!scene.stageHints.some((hint) => hint.kind === "Enter")) {
      scene.stageHints.unshift({ kind: "Enter", from: "Left" });
    }
  });

  const characters = inferCharacters(scenes, declared);
  if (!characters.length && scenes.length) {
    warnings.push("Персонажи не указаны — добавьте Characters: Имя1, Имя2 (имена = имена rig в проекте).");
  }
  if (!declared.length && characters.length) {
    warnings.push("Лучше явно: Characters: " + characters.join(", "));
  }
  const missingDialogueScenes = rawScenes.filter((block) => !extractDialogue(block.body).length && !synthesizeLinesFromProse(block.body, declared).length);
  if (missingDialogueScenes.length) {
    warnings.push(`Без реплик пропущены: ${missingDialogueScenes.map((item) => item.title).join(", ")}. Формат: «Имя: текст».`);
  }

  return {
    title,
    genre,
    atmosphere,
    characters,
    props,
    scenes,
    musicHints: scenes.map((scene) => scene.mood),
    preferCrossfade: scenes.length >= 2 && (moodGlobal === "adventure" || moodGlobal === "calm" || /реклам/i.test(genre)),
    warnings,
  };
}

export interface LocalMusicFile {
  path: string;
  name: string;
  duration?: number;
}

/** Pick a music file for a mood from a local folder listing (name heuristics). */
export function pickMusicForMood(files: LocalMusicFile[], mood: CartoonMood, used = new Set<string>()): LocalMusicFile | undefined {
  if (!files.length) return undefined;
  const keywords: Record<CartoonMood, string[]> = {
    calm: ["moss", "morning", "calm", "soft", "peace", "quiet", "утр", "спокой"],
    adventure: ["adventure", "whimsical", "quest", "travel", "дорога", "приключ"],
    funny: ["fun", "comic", "happy", "cheer", "весел"],
    scary: ["dark", "night", "scary", "tense"],
    neutral: [],
  };
  const scored = files
    .filter((file) => !used.has(file.path))
    .map((file) => {
      const name = file.name.toLowerCase();
      const hits = (keywords[mood] ?? []).filter((word) => name.includes(word)).length;
      return { file, hits };
    })
    .sort((a, b) => b.hits - a.hits);
  const best = scored.find((item) => item.hits > 0)?.file ?? files.find((file) => !used.has(file.path)) ?? files[0];
  if (best) used.add(best.path);
  return best;
}

export function planToScript(plan: PromptCartoonPlan): string {
  const lines = [
    `# ${plan.title}`,
    `Characters: ${plan.characters.join(", ")}`,
    plan.props.length ? `Props: ${plan.props.join(", ")}` : "",
    `Genre: ${plan.genre}`,
    `Atmosphere: ${plan.atmosphere}`,
    "",
  ];
  for (const scene of plan.scenes) {
    lines.push(`## ${scene.title}`);
    const remark = scene.stageHints.length ? stageHintsToRemark(scene.stageHints) : "";
    if (remark) lines.push(`(${remark})`);
    for (const line of scene.lines) lines.push(`${line.speaker}: ${line.text}`);
    lines.push("");
  }
  return `${lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n").trim()}\n`;
}

export function toAudioAsset(file: LocalMusicFile, id: string, duration: number): AudioAssetDefinition {
  return {
    id,
    name: file.name.replace(/\.[^.]+$/, ""),
    path: file.path,
    mediaType: audioMediaTypeFromPath(file.name),
    duration,
  };
}

function pushAction(
  sceneActions: SceneAction[],
  actorId: string | null,
  type: ActionType,
  duration: number,
  startTime: number,
  parameters: SceneActionParameters = {},
): void {
  sceneActions.push({
    id: createId("action"),
    actorId,
    type,
    targetActorId: null,
    duration,
    startMode: "Absolute",
    startTime,
    parameters,
  });
}

/**
 * After Script→Cartoon build: add Enter/Walk/gestures from plan + solid bg colors.
 * Background PNG asset ids are applied separately when files are loaded.
 */
export function enrichScenesFromPromptPlan(
  project: ProjectDocument,
  plan: PromptCartoonPlan,
  backgroundAssetIds?: Array<string | undefined>,
): ProjectDocument {
  const draft = structuredClone(project);
  draft.scenes?.forEach((scene, index) => {
    const planScene = plan.scenes[index];
    if (!planScene) return;

    const painted = backgroundPaintForKey(planScene.backgroundKey);
    scene.background = painted.background;
    scene.backgroundFill = painted.backgroundFill;
    const assetId = backgroundAssetIds?.[index];
    const bgAsset = assetId ? draft.assets.find((item) => item.id === assetId) : undefined;
    const bgOk = bgAsset
      && !isRigPartAssetName(bgAsset.name)
      && !isDemoBotAssetPath(bgAsset.path, bgAsset.name);
    if (bgOk && assetId) scene.backgroundAssetId = assetId;
    else delete scene.backgroundAssetId;

    const actors = scene.actors.filter((actor) => {
      const character = draft.characters.find((item) => item.id === actor.characterId);
      return character ? !isDemoBotCharacter(character) : !/demobot/i.test(actor.name);
    });
    scene.actors = actors;
    if (!actors.length) return;

    const restXs = spacedActorXs(actors.length, scene.width, DEFAULT_ACTOR_GAP);
    const restY = groundedActorY(scene.height, 1);
    // Meadow/road: stay on the left of the path (cottage art is usually on the right).
    // Cottage: stand nearer the house — not already walking into it on scene 1.
    const bias = planScene.backgroundKey === "cottage"
      ? scene.width * 0.1
      : planScene.backgroundKey === "meadow"
        ? -scene.width * 0.14
        : 0;
    actors.forEach((actor, actorIndex) => {
      const x = (restXs[actorIndex] ?? scene.width / 2) + bias;
      actor.position.x = Math.round(Math.max(scene.width * 0.16, Math.min(scene.width * 0.84, x)));
      actor.position.y = restY;
    });

    const intro: SceneAction[] = [];
    let t = 0;
    const isAd = /реклам/i.test(plan.genre);
    for (const hint of planScene.stageHints) {
      if (hint.kind === "Enter") {
        // Cartoons already stand on the path — Enter hid them off-screen (looked like a black/empty frame).
        if (!isAd) continue;
        actors.forEach((actor, actorIndex) => {
          pushAction(intro, actor.id, "Enter", 0.75, t, {
            from: hint.from ?? (actorIndex % 2 === 0 ? "Left" : "Right"),
          });
        });
        t += 0.55;
      } else if (hint.kind === "Exit") {
        actors.forEach((actor, actorIndex) => {
          pushAction(intro, actor.id, "Exit", 0.8, t + actorIndex * 0.08, {
            from: hint.from ?? (actorIndex % 2 === 0 ? "Right" : "Left"),
          });
        });
        t += 0.75;
      } else if (hint.kind === "Walk" || hint.kind === "Run") {
        // First meadow beat is “let's go visit” — don't march the cast into the cottage painting yet.
        if (!isAd && planScene.backgroundKey === "meadow" && index === 0) continue;
        const toward = hint.toward ?? "right";
        const shift = toward === "left"
          ? -scene.width * 0.06
          : toward === "center"
            ? 0
            : scene.width * 0.06;
        const destXs = shiftActorXs(
          spacedActorXs(actors.length, scene.width, DEFAULT_ACTOR_GAP),
          scene.width,
          shift + bias,
        );
        actors.forEach((actor, actorIndex) => {
          pushAction(intro, actor.id, hint.kind === "Run" ? "RunTo" : "WalkTo", hint.kind === "Run" ? 1.1 : 1.8, t, {
            x: destXs[actorIndex] ?? actor.position.x,
            y: actor.position.y,
            stopDistance: 0,
          });
        });
        t += hint.kind === "Run" ? 1.0 : 1.6;
      } else {
        const gesture = hint.kind;
        actors.forEach((actor, index) => {
          pushAction(intro, actor.id, gesture, 0.7, t + index * 0.12, { intensity: 1.1 });
        });
        t += 0.55 + Math.min(0.36, actors.length * 0.12);
      }
    }

    // Shift existing absolute talk actions forward so intro plays first.
    const shift = t > 0 ? t + 0.15 : 0;
    if (shift > 0) {
      for (const action of scene.actionSequence) {
        if (action.startMode === "Absolute") action.startTime = (action.startTime ?? 0) + shift;
      }
      for (const dialogue of scene.dialogues ?? []) dialogue.startTime += shift;
      for (const track of scene.audioTracks ?? []) {
        if (!String(track.name).startsWith("Music:")) track.startTime += shift;
      }
    }

    scene.actionSequence = [...intro, ...scene.actionSequence];
    if (!/реклам/i.test(plan.genre)) {
      applyDialogueActing(scene);
    }
    scene.generatedTimeline = new ActionCompiler().compile(scene);
    scene.duration = Math.max(scene.duration + shift, scene.generatedTimeline.duration + 0.3);
    if (!/реклам/i.test(plan.genre)) {
      applyCartoonCamera(scene, planScene.mood, index);
    }
  });

  draft.montage = syncMontageWithScenes(draft.montage, draft.scenes);
  // Live crossfade hid Pixi under a black canvas while audio kept playing. Ads may still crossfade.
  if (/реклам/i.test(plan.genre) && plan.preferCrossfade && (draft.scenes?.length ?? 0) >= 2) {
    draft.montage.transition = "crossfade";
    draft.montage.crossfadeDuration = 0.55;
  } else {
    draft.montage.transition = "cut";
    draft.montage.crossfadeDuration = 0;
  }

  placePropsByNames(draft, plan.props, {
    layout: /реклам/i.test(plan.genre) ? "ad" : "cartoon",
    replace: true,
  });
  stripAutoBannedStageJunk(draft);

  // Ads with product shots: keep heroes on the sides so screenshots stay readable.
  if (/реклам/i.test(plan.genre) && plan.props.length) {
    draft.scenes?.forEach((scene) => {
      const actors = scene.actors ?? [];
      actors.forEach((actor, index) => {
        actor.scale = Math.min(actor.scale || 1, 0.72);
        if (actors.length === 1) {
          actor.position.x = Math.round(scene.width * 0.16);
        } else {
          actor.position.x = Math.round(scene.width * (index % 2 === 0 ? 0.14 : 0.86));
        }
      });
    });
    applyAdWowMotion(draft);
    if (draft.montage) {
      draft.montage.transition = "crossfade";
      draft.montage.crossfadeDuration = Math.max(draft.montage.crossfadeDuration ?? 0.4, 0.55);
    }
  }

  const total = (draft.scenes ?? []).reduce((sum, scene) => sum + Math.max(0.1, scene.duration), 0);
  if (draft.renderSettings) {
    draft.renderSettings = {
      ...draft.renderSettings,
      duration: total,
      backgroundColor: draft.scenes?.[0]?.background?.startsWith("#")
        ? draft.scenes[0].background
        : draft.renderSettings.backgroundColor,
    };
  }

  return draft;
}

function shiftActorXs(xs: number[], sceneWidth: number, shift: number): number[] {
  if (!xs.length) return xs;
  const minX = sceneWidth * 0.16;
  const maxX = sceneWidth * 0.84;
  const moved = xs.map((x) => x + shift);
  const overflowRight = Math.max(0, Math.max(...moved) - maxX);
  const overflowLeft = Math.max(0, minX - Math.min(...moved));
  return moved.map((x) => Math.round(x - overflowRight + overflowLeft));
}

function isAutoBannedPropAsset(asset: { name: string; path: string }): boolean {
  return isRigPartAssetName(asset.name) || isDemoBotAssetPath(asset.path, asset.name);
}

function stripAutoBannedStageJunk(project: ProjectDocument): void {
  const demoIds = new Set(
    (project.characters ?? [])
      .filter((character) => isDemoBotCharacter(character))
      .map((character) => character.id),
  );
  for (const scene of project.scenes ?? []) {
    scene.actors = (scene.actors ?? []).filter((actor) => {
      if (demoIds.has(actor.characterId)) return false;
      return !/demobot/i.test(actor.name);
    });
    scene.props = (scene.props ?? []).filter((prop) => {
      const asset = project.assets.find((item) => item.id === prop.assetId);
      return asset ? !isAutoBannedPropAsset(asset) : true;
    });
  }
}

export function namesFuzzyMatch(a: string, b: string): boolean {
  const left = a.trim().toLowerCase().replace(/\s+/g, " ");
  const right = b.trim().toLowerCase().replace(/\s+/g, " ");
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

/** Prefer exact asset name; avoid loose «includes» that grab unrelated PNGs. */
export function findAssetByPropName<T extends { name: string }>(assets: T[], name: string): T | undefined {
  const needle = name.trim().toLowerCase().replace(/\s+/g, " ");
  if (!needle) return undefined;
  const exact = assets.find((item) => item.name.trim().toLowerCase().replace(/\s+/g, " ") === needle);
  if (exact) return exact;
  return assets.find((item) => {
    const label = item.name.trim().toLowerCase().replace(/\s+/g, " ");
    return label === needle
      || label.startsWith(`${needle}-`)
      || label.startsWith(`${needle}_`)
      || needle.startsWith(`${label}-`)
      || needle.startsWith(`${label}_`);
  });
}

/** Scale a still so it fits inside the frame (phone UI / banners stay readable, not 1:1 giant). */
export function fitPropScale(
  assetWidth: number,
  assetHeight: number,
  sceneWidth: number,
  sceneHeight: number,
  maxWidthFrac = 0.42,
  maxHeightFrac = 0.72,
): number {
  const w = Math.max(1, assetWidth || 1);
  const h = Math.max(1, assetHeight || 1);
  const sx = (sceneWidth * maxWidthFrac) / w;
  const sy = (sceneHeight * maxHeightFrac) / h;
  const scale = Math.min(sx, sy);
  return Math.max(0.08, Math.min(scale, 1.4));
}

export function placePropsByNames(
  project: ProjectDocument,
  propNames: string[],
  options?: { layout?: "ad" | "cartoon"; replace?: boolean },
): string[] {
  const missing: string[] = [];
  if (!project.scenes?.length) return missing;
  const layout = options?.layout ?? "cartoon";
  const replace = options?.replace !== false;
  const assets = project.assets.filter((asset) => asset.mediaType.startsWith("image/") && !isAutoBannedPropAsset(asset));
  const names = [...new Set(propNames.map((name) => name.trim()).filter(Boolean))];
  if (replace) {
    for (const scene of project.scenes) scene.props = [];
  }
  if (!names.length) return missing;

  if (layout === "ad") {
    project.scenes.forEach((scene, sceneIndex) => {
      const name = names[Math.min(sceneIndex, names.length - 1)]!;
      const asset = findAssetByPropName(assets, name);
      if (!asset) {
        if (!missing.includes(name)) missing.push(name);
        return;
      }
      const scale = fitPropScale(asset.width, asset.height, scene.width, scene.height, 0.46, 0.78);
      scene.props.push({
        id: createId("prop"),
        name: asset.name,
        assetId: asset.id,
        position: {
          x: Math.round(scene.width * 0.52),
          y: Math.round(scene.height * 0.52),
        },
        rotation: 0,
        scale: { x: scale, y: scale },
        zIndex: 55,
        opacity: 1,
        visible: true,
      });
    });
    return missing;
  }

  const limited = names.slice(0, Math.max(project.scenes.length, 1));
  project.scenes.forEach((scene, sceneIndex) => {
    const name = limited[Math.min(sceneIndex, limited.length - 1)];
    if (!name) return;
    const asset = findAssetByPropName(assets, name);
    if (!asset) {
      if (!missing.includes(name)) missing.push(name);
      return;
    }
    const scale = Math.min(0.85, fitPropScale(asset.width, asset.height, scene.width, scene.height, 0.18, 0.32));
    const side = sceneIndex % 2 === 0 ? 0.14 : 0.86;
    scene.props.push({
      id: createId("prop"),
      name: asset.name,
      assetId: asset.id,
      position: {
        x: Math.round(scene.width * side),
        y: Math.round(scene.height * 0.72),
      },
      rotation: 0,
      scale: { x: scale, y: scale },
      zIndex: 12,
      opacity: 1,
      visible: true,
    });
  });
  return missing;
}

export type PromptCheckLevel = "ok" | "warn" | "error";

export interface PromptCheckItem {
  id: string;
  level: PromptCheckLevel;
  title: string;
  detail: string;
  howToFix?: string;
}

export interface PromptReadiness {
  items: PromptCheckItem[];
  /** False only when there are no scenes to build. */
  canBuild: boolean;
  errors: number;
  warnings: number;
  oks: number;
}

const KNOWN_BEAST_NAMES = new Set(["огонёк", "огонек", "морозко", "винтик", "ember", "frost", "frostfang", "gear", "gearbot"]);

/**
 * Checklist «чего не хватает» before prompt → cartoon.
 * Deterministic, local — no network.
 */
export function analyzePromptReadiness(options: {
  plan: PromptCartoonPlan;
  characters: Array<{ id: string; name: string }>;
  assets: Array<{ name: string; mediaType: string }>;
  voicesCount: number;
  piperReady: boolean;
  generateTts: boolean;
  musicFolder: string;
  musicFileCount?: number | null;
  backgroundsAvailable?: Partial<Record<PromptBackgroundKey, boolean>>;
  dumpBackgroundCount?: number;
  dumpPropNames?: string[];
}): PromptReadiness {
  const { plan } = options;
  const items: PromptCheckItem[] = [];
  const images = options.assets.filter((asset) => asset.mediaType.startsWith("image/"));

  const lineCount = plan.scenes.reduce((sum, scene) => sum + scene.lines.length, 0);
  if (!plan.scenes.length) {
    items.push({
      id: "scenes",
      level: "error",
      title: "Нет сцен",
      detail: "Промпт не разобран в сцены с репликами.",
      howToFix: "Добавьте «## Название сцены» и строки «Имя: текст». Или абзацы с диалогами.",
    });
  } else {
    items.push({
      id: "scenes",
      level: "ok",
      title: `Сцен: ${plan.scenes.length}`,
      detail: `Реплик: ${lineCount}. Жанр: ${plan.genre}. Атмосфера: ${plan.atmosphere}.`,
    });
  }

  if (!plan.characters.length && plan.scenes.length) {
    items.push({
      id: "cast-list",
      level: "warn",
      title: "Characters не указаны",
      detail: "Герои взяты только из реплик.",
      howToFix: "В начале: Characters: Имя1, Имя2",
    });
  }

  for (const name of plan.characters) {
    const hit = options.characters.find((character) => namesFuzzyMatch(character.name, name));
    const autoBeast = KNOWN_BEAST_NAMES.has(name.trim().toLowerCase().replace(/\s+/g, ""));
    if (hit) {
      items.push({
        id: `char-${name}`,
        level: "ok",
        title: `Герой «${name}»`,
        detail: `Найден риг: ${hit.name}`,
      });
    } else if (autoBeast) {
      items.push({
        id: `char-${name}`,
        level: "warn",
        title: `Герой «${name}»`,
        detail: "Рига в проекте пока нет — при сборке подтянется AudioBeast (если папка Characters на месте).",
        howToFix: "Или заранее: Загрузить rig / «＋ Мультик» и назовите персонажа так же.",
      });
    } else {
      items.push({
        id: `char-${name}`,
        level: "error",
        title: `Нет рига «${name}»`,
        detail: "Имя в промпте должно совпадать с именем персонажа в проекте.",
        howToFix: "Загрузить rig → переименовать как в Characters:, либо поправить имя в промпте.",
      });
    }
  }

  if (plan.props.length === 0) {
    items.push({
      id: "props-none",
      level: "ok",
      title: "Предметы",
      detail: (options.dumpPropNames?.length ?? 0) > 0
        ? `В Assets/Props картинок: ${options.dumpPropNames!.length} — подберём по промпту.`
        : "Props не заданы. Можно накидать PNG в Assets/Props — подставятся сами.",
    });
  } else {
    for (const name of plan.props) {
      const hit = images.find((asset) => namesFuzzyMatch(asset.name, name));
      const dumpHit = (options.dumpPropNames ?? []).some((item) => namesFuzzyMatch(item, name));
      if (hit || dumpHit) {
        items.push({
          id: `prop-${name}`,
          level: "ok",
          title: `Предмет «${name}»`,
          detail: hit ? `Найдена картинка: ${hit.name}` : "Есть в Assets/Props — возьмём при сборке.",
        });
      } else {
        items.push({
          id: `prop-${name}`,
          level: "error",
          title: `Нет PNG «${name}»`,
          detail: "В промпте Props: имя, но такой картинки нет ни в проекте, ни в Assets/Props.",
          howToFix: "Положите файл в Assets/Props (меч.png) или Импорт PNG.",
        });
      }
    }
  }

  const bgKeys = [...new Set(plan.scenes.map((scene) => scene.backgroundKey))];
  const dumpBg = options.dumpBackgroundCount ?? 0;
  for (const key of bgKeys) {
    const available = options.backgroundsAvailable?.[key];
    const label = key === "meadow" ? "поляна" : key === "cottage" ? "домик" : key === "night" ? "ночь" : key === "studio" ? "студия" : "небо";
    const file = backgroundFileForKey(key);
    if (available === true && file) {
      items.push({
        id: `bg-${key}`,
        level: "ok",
        title: `Фон «${label}»`,
        detail: `PNG ${file} из Assets/Backgrounds.`,
      });
    } else {
      items.push({
        id: `bg-${key}`,
        level: "ok",
        title: `Фон «${label}»`,
        detail: dumpBg > 0
          ? `В Assets/Backgrounds картинок: ${dumpBg} — подберём под сцену «${label}».`
          : "Цветная сцена. Накидайте фоны в Assets/Backgrounds — подставятся сами.",
      });
    }
  }

  if (options.generateTts) {
    if (options.voicesCount <= 0) {
      items.push({
        id: "tts",
        level: "error",
        title: "Озвучка",
        detail: "Голоса не найдены, а Local TTS включён.",
        howToFix: "Перезапустите приложение или scripts\\setup-piper.ps1. Либо снимите галку Local TTS.",
      });
    } else if (!options.piperReady) {
      items.push({
        id: "tts",
        level: "error",
        title: "Озвучка",
        detail: "Piper/Chatterbox не найдены. Windows-робот отключён — без них озвучка не работает.",
        howToFix: "Voice (Chatterbox) или scripts\\setup-piper.ps1 → Tools\\piper, затем «Обновить список». Либо снимите галку Local TTS.",
      });
    } else {
      items.push({
        id: "tts",
        level: "ok",
        title: "Озвучка",
        detail: `Piper готов · голосов: ${options.voicesCount}. Назначьте голос каждому герою выше.`,
      });
    }
  } else {
    items.push({
      id: "tts",
      level: "ok",
      title: "Озвучка",
      detail: "Local TTS выключен — мультик без авто-речи (можно импортировать WAV позже).",
    });
  }

  const folder = options.musicFolder.trim();
  if (!folder) {
    items.push({
      id: "music",
      level: "warn",
      title: "Музыка",
      detail: "Папка музыки пуста — сцены без фона звука.",
      howToFix: "«Выбрать папку…» или «Через MP3…» (по файлу берётся вся папка) — либо Аудио после сборки.",
    });
  } else if (options.musicFileCount === 0) {
    items.push({
      id: "music",
      level: "warn",
      title: "Музыка",
      detail: `В папке нет аудиофайлов: ${folder}`,
      howToFix: "Выберите папку с mp3 или нажмите «Через MP3…» и укажите любой трек в нужной папке.",
    });
  } else if (options.musicFileCount == null) {
    items.push({
      id: "music",
      level: "warn",
      title: "Музыка",
      detail: `Папка: ${folder} (проверка файлов… / недоступна в браузере).`,
      howToFix: "Запускайте desktop KRX: «Выбрать папку…» или «Через MP3…».",
    });
  } else {
    items.push({
      id: "music",
      level: "ok",
      title: "Музыка",
      detail: `Файлов в папке: ${options.musicFileCount}. Подбор по настроению сцены.`,
    });
  }

  for (const warning of plan.warnings) {
    items.push({
      id: `parse-${warning.slice(0, 24)}`,
      level: "warn",
      title: "Разбор промпта",
      detail: warning,
    });
  }

  const errors = items.filter((item) => item.level === "error").length;
  const warnings = items.filter((item) => item.level === "warn").length;
  const oks = items.filter((item) => item.level === "ok").length;
  return {
    items,
    canBuild: plan.scenes.length > 0,
    errors,
    warnings,
    oks,
  };
}
