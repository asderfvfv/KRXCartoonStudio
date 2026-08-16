import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import { AUDIO_BEAST_FIGHT_CAST, audioBeastAssetFiles } from "../src/domain/audioBeastCharacters";
import { buildPackFromSpec } from "../src/domain/fightDemo";
import {
  MEADOW_CAST_NAMES,
  MEADOW_DIALOGUE_SCRIPT,
  applyMeadowDialogueDemo,
  buildMeadowDialogueScene,
} from "../src/domain/meadowDialogue";

describe("Visit cartoon episode", () => {
  it("has Russian cast and visit script", () => {
    expect(MEADOW_CAST_NAMES.gear).toBe("Винтик");
    expect(MEADOW_DIALOGUE_SCRIPT).toContain("В гости к Винтику");
    expect(MEADOW_DIALOGUE_SCRIPT).toContain("Домик Винтика");
  });

  it("builds 3 scenes with per-scene music beds", () => {
    const root = path.join("D:", "KRXCartoonStudio", "Characters");
    const packs = AUDIO_BEAST_FIGHT_CAST.map((monster) => {
      const assetsDir = path.join(root, ...monster.folder.split("/"), "Assets");
      for (const file of audioBeastAssetFiles()) {
        expect(fs.existsSync(path.join(assetsDir, file))).toBe(true);
      }
      return buildPackFromSpec(monster, (fileName) => path.join(assetsDir, fileName));
    });
    const meadow = path.join("D:", "KRXCartoonStudio", "Assets", "Backgrounds", "meadow-sunny.png");
    const house = path.join("D:", "KRXCartoonStudio", "Assets", "Backgrounds", "gear-cottage.png");
    const meetMusic = path.join("D:", "KRXCartoonStudio", "Assets", "Audio", "Morning-in-the-Moss.mp3");
    const roadMusic = path.join("D:", "KRXCartoonStudio", "Assets", "Audio", "Whimsical-Adventure.mp3");
    expect(fs.existsSync(meadow)).toBe(true);
    expect(fs.existsSync(house)).toBe(true);
    expect(fs.existsSync(meetMusic)).toBe(true);
    expect(fs.existsSync(roadMusic)).toBe(true);

    const next = applyMeadowDialogueDemo(migrateProject(createDefaultProject("Visit")), packs, {
      meadowBackground: { path: meadow, width: 1536, height: 1024 },
      houseBackground: { path: house, width: 1536, height: 1024 },
      musicMeet: {
        id: "audio-moss",
        name: "Morning in the Moss",
        path: meetMusic,
        mediaType: "audio/mpeg",
        duration: 22.2,
      },
      musicRoad: {
        id: "audio-adventure",
        name: "Whimsical Adventure",
        path: roadMusic,
        mediaType: "audio/mpeg",
        duration: 98.04,
      },
    });

    expect(next.scenes).toHaveLength(3);
    expect(next.scenes!.map((scene) => scene.name)).toEqual([
      "1. Встреча на поляне",
      "2. Дорога в гости",
      "3. Домик Винтика",
    ]);
    expect(next.montage?.transition).toBe("crossfade");

    const meetTracks = next.scenes![0]!.audioTracks!.filter((track) => track.name.startsWith("Music:"));
    const roadTracks = next.scenes![1]!.audioTracks!.filter((track) => track.name.startsWith("Music:"));
    const houseTracks = next.scenes![2]!.audioTracks!.filter((track) => track.name.startsWith("Music:"));
    expect(meetTracks[0]!.assetId).toBe("audio-moss");
    expect(roadTracks[0]!.assetId).toBe("audio-adventure");
    expect(houseTracks[0]!.assetId).toBe("audio-moss");
    expect(meetTracks[0]!.assetId).not.toBe(roadTracks[0]!.assetId);

    expect(next.scenes![2]!.actors.map((actor) => actor.name)).toEqual(["Огонёк", "Морозко", "Винтик"]);
    expect(next.scenes![0]!.actors).toHaveLength(2);
    expect(next.scenes![2]!.dialogues!.some((line) => line.text.includes("выходи"))).toBe(true);
  });

  it("requires the three AudioBeast characters", () => {
    expect(() => buildMeadowDialogueScene([])).toThrow(/Огонёк/);
  });
});
