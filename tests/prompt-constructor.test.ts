import { describe, expect, it } from "vitest";
import { groundedActorY, spacedActorXs } from "../src/domain/stagePlacement";
import {
  enrichScenesFromPromptPlan,
  inferStageHints,
  normalizeCastName,
  parseCartoonPrompt,
  pickMusicForMood,
  planToScript,
  suggestBackgroundKey,
  analyzePromptReadiness,
  fitPropScale,
  placePropsByNames,
  findAssetByPropName,
} from "../src/domain/promptCartoon";
import { clampSpeechRate, assignVoicesToSpeakers, assignProsodyToSpeakers, createDefaultSpeechSettings, mergeVoiceCatalog, resolveSpeakOptions, inferPiperMeta } from "../src/domain/speechSettings";
import { createDefaultProject } from "../src/domain/defaults";
import { buildCartoonFromScript, parseCartoonScript } from "../src/domain/scriptCartoon";

describe("stage placement", () => {
  it("grounds all actors on the same foot line", () => {
    const y1 = groundedActorY(1080, 1);
    const y2 = groundedActorY(1080, 1);
    expect(y1).toBe(y2);
    expect(y1).toBeGreaterThan(400);
    expect(y1).toBeLessThan(900);
  });

  it("spaces two actors far enough that AudioBeast bodies do not overlap", () => {
    const xs = spacedActorXs(2, 1920);
    expect(xs[1]! - xs[0]!).toBeGreaterThanOrEqual(560);
    expect(xs[0]!).toBeGreaterThan(200);
    expect(xs[1]!).toBeLessThan(1720);
  });
});

describe("prompt cartoon", () => {
  it("parses a RU prompt into scenes and script", () => {
    const plan = parseCartoonPrompt(`# Тест
Characters: Огонёк, Морозко
## Встреча
Огонёк: Привет!
Морозко: Пойдём в гости!
`);
    expect(plan.characters).toEqual(["Огонёк", "Морозко"]);
    expect(plan.scenes).toHaveLength(1);
    expect(planToScript(plan)).toContain("Огонёк: Привет!");
  });

  it("normalizes cast aliases and cottage/meadow backgrounds", () => {
    expect(normalizeCastName("Ember")).toBe("Огонёк");
    expect(normalizeCastName("frostfang")).toBe("Морозко");
    expect(suggestBackgroundKey("солнечная поляна", "calm")).toBe("meadow");
    expect(suggestBackgroundKey("домик Винтика на пороге", "adventure")).toBe("cottage");
  });

  it("infers walk/enter/happy from prose", () => {
    const hints = inferStageHints("Они пошли по тропинке. Огонёк машет рукой. Ура!");
    expect(hints.some((h) => h.kind === "Walk")).toBe(true);
    expect(hints.some((h) => h.kind === "Wave")).toBe(true);
    expect(hints.some((h) => h.kind === "Happy")).toBe(true);
  });

  it("infers scared / surprised from stage notes", () => {
    const hints = inferStageHints("Шорох. Тревожно. Огонёк удивляется.");
    expect(hints.some((h) => h.kind === "Scared")).toBe(true);
    expect(hints.some((h) => h.kind === "Surprised")).toBe(true);
  });

  it("infers look / center walk / cta from ad stage notes", () => {
    const hints = inferStageHints("смотри сюда, идёт к центру, жми!");
    expect(hints.some((h) => h.kind === "Wave")).toBe(true);
    expect(hints.some((h) => h.kind === "Walk")).toBe(true);
    expect(hints.some((h) => h.kind === "Happy")).toBe(true);
  });

  it("ad genre enables crossfade and enter from motion notes", () => {
    const plan = parseCartoonPrompt(`# Реклама
Characters: Огонёк, Морозко
Genre: реклама
## Хук
(входит слева, смотри)
Огонёк: Смотри сюда!

## Призыв
(прыжок, ура, жми)
Морозко: Жми!
`);
    expect(plan.preferCrossfade).toBe(true);
    expect(plan.scenes.every((scene) => scene.backgroundKey === "studio")).toBe(true);
    expect(plan.scenes[0]!.stageHints.some((h) => h.kind === "Enter")).toBe(true);
    expect(plan.scenes[0]!.stageHints.some((h) => h.kind === "Wave")).toBe(true);
    expect(plan.scenes[0]!.lines.some((line) => line.speaker.includes("("))).toBe(false);
  });

  it("fits prop scale so phone screenshots are not 1:1 giants", () => {
    expect(fitPropScale(1080, 1920, 1920, 1080, 0.46, 0.78)).toBeLessThan(0.5);
    expect(fitPropScale(200, 200, 1920, 1080)).toBeGreaterThan(0.5);
  });

  it("ad layout places one fitted prop per scene and prefers exact names", () => {
    const project = createDefaultProject();
    const sceneA = project.scenes![0]!;
    project.scenes = [
      { ...sceneA, id: "s1", name: "A", props: [{ id: "old", name: "junk", assetId: "x", position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, zIndex: 1, opacity: 1, visible: true }] },
      { ...structuredClone(sceneA), id: "s2", name: "B", props: [] },
    ];
    project.assets.push(
      { id: "a1", name: "catalog", path: "c.png", mediaType: "image/png", width: 400, height: 800 },
      { id: "a2", name: "banner", path: "b.png", mediaType: "image/png", width: 1200, height: 400 },
    );
    expect(findAssetByPropName(project.assets, "catalog")?.id).toBe("a1");
    placePropsByNames(project, ["catalog", "banner"], { layout: "ad", replace: true });
    expect(project.scenes[0]!.props).toHaveLength(1);
    expect(project.scenes[0]!.props[0]!.name).toBe("catalog");
    expect(project.scenes[0]!.props[0]!.scale.x).toBeLessThanOrEqual(1.1);
    expect(project.scenes[1]!.props[0]!.name).toBe("banner");
    expect(project.scenes[1]!.props[0]!.scale.x).toBeLessThan(1);
  });

  it("product-only ad prompt has no cast actors after build", () => {
    const plan = parseCartoonPrompt(`# Реклама: Test
Props: catalog
Genre: реклама
## Хук
Титр: Смотри сюда!
## Призыв
Титр: Жми!
`);
    expect(plan.characters).toEqual([]);
    expect(plan.preferCrossfade).toBe(true);
    const project = createDefaultProject();
    const parsed = parseCartoonScript(planToScript(plan));
    const built = buildCartoonFromScript(project, parsed, {
      mapping: {},
      width: 1920,
      height: 1080,
      replaceScenes: true,
    });
    expect(built.project.scenes![0]!.actors).toHaveLength(0);
    placePropsByNames(built.project, plan.props, { layout: "ad", replace: true });
  });

  it("splits multi-scene visit prompt with backgrounds and crossfade", () => {
    const plan = parseCartoonPrompt(`# В гости
Characters: Огонёк, Морозко, Винтик
Atmosphere: солнечная поляна

## Встреча
Огонёк: Эй, пойдём к Винтику!
Морозко: Давай!

## Домик
Огонёк: Мы на пороге домика!
Винтик: Я выхожу!
`);
    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes[0]!.backgroundKey).toBe("meadow");
    expect(plan.scenes[1]!.backgroundKey).toBe("cottage");
    expect(plan.preferCrossfade).toBe(true);
    expect(plan.scenes[0]!.stageHints.some((h) => h.kind === "Enter" || h.kind === "Walk")).toBe(true);
  });

  it("enriches built scenes with visible cast, gradient, and spaced walk", () => {
    const plan = parseCartoonPrompt(`# Тест
Characters: Огонёк, Морозко
## Поляна
Огонёк: Привет!
Морозко: Пошли!
`);
    const project = createDefaultProject();
    const base = project.characters[0]!;
    project.characters = [
      { ...base, id: "c1", name: "Огонёк" },
      { ...base, id: "c2", name: "Морозко" },
    ];
    const parsed = parseCartoonScript(planToScript(plan));
    const built = buildCartoonFromScript(project, parsed, {
      mapping: { Огонёк: "c1", Морозко: "c2" },
      width: 1920,
      height: 1080,
    });
    const enriched = enrichScenesFromPromptPlan(built.project, plan);
    const scene = enriched.scenes![0]!;
    expect(scene.actionSequence.some((a) => a.type === "Enter")).toBe(false);
    expect(scene.background).toMatch(/^#/);
    expect(scene.backgroundAssetId).toBeUndefined();
    expect(scene.actors.length).toBeGreaterThan(1);
    expect(scene.backgroundFill?.mode).toBe("gradient");
    expect(Math.abs(scene.actors[0]!.position.x - scene.actors[1]!.position.x)).toBeGreaterThanOrEqual(560);
    expect(scene.actors.every((actor) => actor.position.x > 200 && actor.position.x < 1100)).toBe(true);
    // First meadow beat must not march into the cottage side of the painting.
    expect(scene.actionSequence.some((action) => action.type === "WalkTo")).toBe(false);
    expect(enriched.montage?.transition).toBe("cut");
    expect(scene.props.every((prop) => !/body|demobot/i.test(prop.name))).toBe(true);
  });

  it("road scenes still walk with spaced destinations", () => {
    const plan = parseCartoonPrompt(`# В гости
Characters: Огонёк, Морозко
## Встреча
Огонёк: Эй!
## Дорога
Огонёк: Почти пришли.
Морозко: Сейчас позовём его.
`);
    const project = createDefaultProject();
    const base = project.characters[0]!;
    project.characters = [
      { ...base, id: "c1", name: "Огонёк" },
      { ...base, id: "c2", name: "Морозко" },
    ];
    const parsed = parseCartoonScript(planToScript(plan));
    const built = buildCartoonFromScript(project, parsed, {
      mapping: { Огонёк: "c1", Морозко: "c2" },
      width: 1920,
      height: 1080,
      replaceScenes: true,
    });
    const enriched = enrichScenesFromPromptPlan(built.project, plan);
    const road = enriched.scenes![1]!;
    const walks = road.actionSequence.filter((action) => action.type === "WalkTo");
    expect(walks.length).toBe(road.actors.length);
    expect(Math.abs((walks[0]!.parameters.x ?? 0) - (walks[1]!.parameters.x ?? 0))).toBeGreaterThanOrEqual(560);
  });

  it("treats meadow/cottage backgrounds as ready without PNG files", () => {
    const plan = parseCartoonPrompt(`# В гости
Characters: Огонёк, Винтик
Atmosphere: солнечная поляна

## Встреча
Огонёк: Пойдём к Винтику!
## Домик
Винтик: Заходите!
`);
    const readiness = analyzePromptReadiness({
      plan,
      characters: [{ id: "c1", name: "Огонёк" }, { id: "c2", name: "Винтик" }],
      assets: [],
      voicesCount: 2,
      piperReady: true,
      generateTts: false,
      musicFolder: "",
    });
    expect(readiness.items.filter((item) => item.id.startsWith("bg-")).every((item) => item.level === "ok")).toBe(true);
    expect(readiness.items.some((item) => item.id === "bg-meadow" && item.level === "warn")).toBe(false);
    expect(readiness.items.some((item) => item.id === "bg-cottage" && item.level === "warn")).toBe(false);
  });

  it("parses Props by name and places matching assets, skipping DemoBot body", () => {
    const plan = parseCartoonPrompt(`# Тест
Characters: Огонёк
Props: мяч, body
## Поляна
Огонёк: Привет!
`);
    expect(plan.props).toEqual(["мяч", "body"]);
    const project = createDefaultProject();
    project.characters = [{ ...project.characters[0]!, id: "c1", name: "Огонёк" }];
    project.assets.push({ id: "a-ball", name: "мяч", path: "D:/мяч.png", mediaType: "image/png", width: 120, height: 120 });
    const parsed = parseCartoonScript(planToScript(plan));
    const built = buildCartoonFromScript(project, parsed, {
      mapping: { Огонёк: "c1" },
      width: 1920,
      height: 1080,
    });
    const enriched = enrichScenesFromPromptPlan(built.project, plan);
    expect(enriched.scenes![0]!.props.some((prop) => prop.name === "мяч")).toBe(true);
    expect(enriched.scenes![0]!.props.some((prop) => /body|demobot/i.test(prop.name))).toBe(false);
  });

  it("picks different music by mood when possible", () => {
    const files = [
      { path: "a/Morning-in-the-Moss.mp3", name: "Morning-in-the-Moss.mp3", duration: 22 },
      { path: "a/Whimsical-Adventure.mp3", name: "Whimsical-Adventure.mp3", duration: 98 },
    ];
    const used = new Set<string>();
    const calm = pickMusicForMood(files, "calm", used);
    const adventure = pickMusicForMood(files, "adventure", used);
    expect(calm?.name).toMatch(/Moss/i);
    expect(adventure?.name).toMatch(/Adventure/i);
  });

  it("builds readiness checklist for missing props and cast", () => {
    const plan = parseCartoonPrompt(`# Т
Characters: Огонёк, Незнакомец
Props: меч
## С
Огонёк: Привет!
Незнакомец: Эй!
`);
    const readiness = analyzePromptReadiness({
      plan,
      characters: [{ id: "c1", name: "Огонёк" }],
      assets: [{ name: "hat", mediaType: "image/png" }],
      voicesCount: 2,
      piperReady: true,
      generateTts: true,
      musicFolder: "D:/music",
      musicFileCount: 3,
    });
    expect(readiness.canBuild).toBe(true);
    expect(readiness.errors).toBeGreaterThanOrEqual(2);
    expect(readiness.items.some((item) => item.id === "prop-меч" && item.level === "error")).toBe(true);
    expect(readiness.items.some((item) => item.id.startsWith("char-Незнакомец") && item.level === "error")).toBe(true);
    expect(readiness.items.some((item) => item.id.startsWith("char-Огонёк") && item.level === "ok")).toBe(true);
  });

  it("blocks TTS when Piper is missing (no Windows robot fallback)", () => {
    const plan = parseCartoonPrompt(`# Тест
Genre: сказка

## Сцена
Огонёк: Привет!
`);
    const readiness = analyzePromptReadiness({
      plan,
      characters: [{ id: "c1", name: "Огонёк" }],
      assets: [],
      voicesCount: 0,
      piperReady: false,
      generateTts: true,
      musicFolder: "",
      musicFileCount: 0,
    });
    const tts = readiness.items.find((item) => item.id === "tts");
    expect(tts?.level).toBe("error");
    expect(tts?.detail.toLowerCase()).not.toContain("sapi");
  });
});

describe("speech settings", () => {
  it("clamps rate", () => {
    expect(clampSpeechRate(99)).toBe(10);
    expect(clampSpeechRate(-99)).toBe(-10);
  });

  it("assigns voices round-robin from Piper catalog only", () => {
    const map = assignVoicesToSpeakers(
      ["A", "B"],
      [
        { name: "Piper ru_A", culture: "ru-RU", gender: "Female", engine: "piper" },
        { name: "Piper en_B", culture: "en-US", gender: "Female", engine: "piper" },
      ],
      "ru-RU",
    );
    expect(map.A).toBe("Piper ru_A");
    expect(map.B).toBe("Piper ru_A");
  });

  it("ignores legacy SAPI voices", () => {
    const map = assignVoicesToSpeakers(
      ["A", "B"],
      [
        { name: "Piper ru_RU-irina-medium", culture: "ru-RU", gender: "Female", engine: "piper" },
        { name: "Piper ru_RU-dmitri-medium", culture: "ru-RU", gender: "Male", engine: "piper" },
        { name: "Irina", culture: "ru-RU", gender: "Female", engine: "sapi" },
      ],
      "ru-RU",
      true,
    );
    expect(map.A).toContain("Piper");
    expect(map.B).toContain("Piper");
    expect(map.A).not.toBe(map.B);
  });

  it("merges custom piper voices and drops SAPI from catalog", () => {
    const settings = createDefaultSpeechSettings({
      customPiperModels: [{
        id: "1",
        name: "Piper my-voice",
        modelPath: "C:/voices/my-voice.onnx",
        culture: "ru-RU",
        gender: "Female",
      }],
    });
    const merged = mergeVoiceCatalog(
      [{ name: "Irina", culture: "ru-RU", gender: "Female", engine: "sapi" }],
      settings,
    );
    expect(merged.some((v) => v.engine === "sapi")).toBe(false);
    expect(merged.some((v) => v.name === "Piper my-voice" && v.custom)).toBe(true);
    expect(resolveSpeakOptions("A", { ...settings, voiceBySpeaker: { A: "Piper my-voice" } }, merged).piperModel)
      .toContain("my-voice.onnx");
  });

  it("infers piper meta from filename", () => {
    expect(inferPiperMeta("ru_RU-dmitri-medium").gender).toBe("Male");
    expect(inferPiperMeta("en_US-amy-medium").culture).toBe("en-US");
  });

  it("assigns different prosody per speaker", () => {
    const base = createDefaultSpeechSettings();
    const prosody = assignProsodyToSpeakers(["Огонёк", "Морозко", "Винтик"], base);
    expect(prosody.pitchBySpeaker["Огонёк"]).toBeTruthy();
    expect(prosody.pitchBySpeaker["Морозко"]).not.toBe(prosody.pitchBySpeaker["Огонёк"]);
    expect(prosody.pitchSemitonesBySpeaker["Огонёк"]).not.toBe(prosody.pitchSemitonesBySpeaker["Морозко"]);
  });
});
