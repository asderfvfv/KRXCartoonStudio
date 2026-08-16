import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import {
  SCRIPT_CARTOON_SCHEMA_VERSION,
  autoMapScriptCharacters,
  buildCartoonFromScript,
  collectScriptLinesForTts,
  parseCartoonScript,
  validateScriptMapping,
} from "../src/domain/scriptCartoon";
import { createId } from "../src/domain/ids";

describe("Stage 12 Script → Cartoon", () => {
  it("parses scenes, speakers and character header", () => {
    const parsed = parseCartoonScript(`# Show
Characters: Alice, Bob

## Park
Alice: Hello there!
Bob: Hi Alice.

## Road
Alice: Let's go.
`);
    expect(parsed.title).toBe("Show");
    expect(parsed.declaredCharacters).toEqual(["Alice", "Bob"]);
    expect(parsed.scenes).toHaveLength(2);
    expect(parsed.scenes[0].title).toBe("Park");
    expect(parsed.scenes[0].lines).toHaveLength(2);
    expect(parsed.speakers).toEqual(["Alice", "Bob"]);
    expect(collectScriptLinesForTts(parsed)).toHaveLength(3);
  });

  it("does not treat Props/Genre/Atmosphere as speakers", () => {
    const parsed = parseCartoonScript(`# Show
Characters: Alice
Props: sword
Genre: сказка
Atmosphere: солнечная поляна

## Park
Alice: Hello!
`);
    expect(parsed.speakers).toEqual(["Alice"]);
    expect(parsed.scenes[0]!.lines.every((line) => line.speaker === "Alice" || line.speaker === null)).toBe(true);
  });

  it("splits scenes on blank lines when no headers", () => {
    const parsed = parseCartoonScript(`Hero: One
Hero: Two

Hero: Three
`);
    expect(parsed.scenes).toHaveLength(2);
    expect(parsed.scenes[0].lines).toHaveLength(2);
    expect(parsed.scenes[1].lines).toHaveLength(1);
  });

  it("maps speakers and builds local cartoon scenes with dialogues", () => {
    const project = migrateProject(createDefaultProject("Script Test"));
    const second = structuredClone(project.characters[0]);
    second.id = createId("character");
    second.name = "Friend";
    project.characters.push(second);

    const parsed = parseCartoonScript(`## A
DemoBot: Привет
Friend: Пока
`);
    const mapping = autoMapScriptCharacters(parsed.speakers, project.characters);
    expect(validateScriptMapping(parsed.speakers, mapping, project.characters).ok).toBe(true);

    const built = buildCartoonFromScript(project, parsed, {
      mapping,
      width: 1280,
      height: 720,
      replaceScenes: true,
      subtitles: true,
      ttsClips: [{
        sceneIndex: 0,
        lineIndex: 0,
        path: "C:/tmp/a.wav",
        duration: 1.2,
      }],
    });

    expect(built.sceneIds).toHaveLength(1);
    expect(built.project.scenes).toHaveLength(1);
    const scene = built.project.scenes![0];
    expect(scene.actors.length).toBe(2);
    expect(scene.dialogues).toHaveLength(2);
    expect(scene.audioTracks).toHaveLength(1);
    expect(scene.dialogues![0].audioTrackId).toBeTruthy();
    expect(scene.subtitleSettings?.showSpeaker).toBe(true);
    expect(scene.actionSequence.some((action) => action.type === "Talk")).toBe(true);
    expect(built.project.montage?.clips.length).toBe(1);
    expect(built.project.schemaVersion ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("does not silently map Огонёк to DemoBot", () => {
    const project = migrateProject(createDefaultProject("Only Demo"));
    const mapping = autoMapScriptCharacters(["Огонёк", "Морозко"], project.characters);
    expect(mapping["Огонёк"]).toBeUndefined();
    expect(mapping["Морозко"]).toBeUndefined();
  });

  it("maps Огонёк to a real named rig, not DemoBot", () => {
    const project = migrateProject(createDefaultProject("Mix"));
    const ember = structuredClone(project.characters[0]!);
    ember.id = "character-emberpuff";
    ember.name = "Огонёк";
    project.characters.push(ember);
    const mapping = autoMapScriptCharacters(["Огонёк", "Friend"], project.characters);
    expect(mapping["Огонёк"]).toBe("character-emberpuff");
    expect(mapping["Friend"]).toBe("character-emberpuff");
    expect(mapping["Friend"]).not.toBe(project.characters.find((c) => c.name === "DemoBot")?.id);
  });

  it("migrates schema >= 11", () => {
    const old = createDefaultProject("Legacy Script");
    delete (old as { schemaVersion?: unknown }).schemaVersion;
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(SCRIPT_CARTOON_SCHEMA_VERSION);
  });
});
