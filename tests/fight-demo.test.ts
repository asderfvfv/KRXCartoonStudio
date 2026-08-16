import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { createDefaultProject } from "../src/domain/defaults";
import { migrateProject } from "../src/domain/migration";
import {
  AUDIO_BEAST_FIGHT_CAST,
  applyAudioBeastFightDemo,
  buildAudioBeastFightScene,
  buildPackFromSpec,
} from "../src/domain/fightDemo";
import {
  AUDIO_BEAST_UNIFORM_VISIBLE_HEIGHT,
  audioBeastAssetFiles,
  audioBeastVisibleHeight,
} from "../src/domain/audioBeastCharacters";

describe("AudioBeast fight demo", () => {
  it("lists three AudioBeast monsters", () => {
    expect(AUDIO_BEAST_FIGHT_CAST.map((item) => item.name)).toEqual(["EmberPuff", "FrostFang", "GearBot"]);
  });

  it("keeps all monsters the same visible size", () => {
    const heights = AUDIO_BEAST_FIGHT_CAST.map((spec) => audioBeastVisibleHeight(spec));
    for (const h of heights) {
      expect(h).toBeCloseTo(AUDIO_BEAST_UNIFORM_VISIBLE_HEIGHT, 0);
    }
    const actors = applyAudioBeastFightDemo(
      migrateProject(createDefaultProject("Fight")),
      AUDIO_BEAST_FIGHT_CAST.map((monster) =>
        buildPackFromSpec(monster, (fileName) =>
          path.join("D:", "KRXCartoonStudio", "Characters", ...monster.folder.split("/"), "Assets", fileName),
        ),
      ),
    ).scenes![0]!.actors;
    expect(new Set(actors.map((actor) => actor.scale)).size).toBe(1);
  });

  it("builds packs from real PNG folders without character.json", () => {
    const root = path.join("D:", "KRXCartoonStudio", "Characters");
    const packs = AUDIO_BEAST_FIGHT_CAST.map((monster) => {
      const assetsDir = path.join(root, ...monster.folder.split("/"), "Assets");
      for (const file of audioBeastAssetFiles()) {
        expect(fs.existsSync(path.join(assetsDir, file)), `${monster.name}/${file}`).toBe(true);
      }
      return buildPackFromSpec(monster, (fileName) => path.join(assetsDir, fileName));
    });
    expect(packs).toHaveLength(3);
    for (const pack of packs) {
      const body = pack.character.parts.find((part) => part.id === "body")!;
      const arm = pack.character.parts.find((part) => part.id === "arm-left")!;
      const leg = pack.character.parts.find((part) => part.id === "leg-left")!;
      const bodyAsset = pack.assets.find((asset) => asset.id === body.assetId)!;
      // Children must sit in body pixel space (near body center), not tiny display coords.
      expect(arm.parentId).toBe("body");
      expect(arm.transform.x).toBeGreaterThan(bodyAsset.width * 0.02);
      expect(arm.transform.x).toBeLessThan(bodyAsset.width * 0.25);
      expect(Math.abs(arm.transform.scaleX)).toBeGreaterThan(0.25);
      expect(leg.transform.y).toBeGreaterThan(bodyAsset.height * 0.7);
      expect(arm.zIndex).toBeGreaterThan(body.zIndex);
    }
    const project = migrateProject(createDefaultProject("Fight"));
    const next = applyAudioBeastFightDemo(project, packs);
    expect(next.scenes).toHaveLength(1);
    const scene = next.scenes![0]!;
    expect(scene.actors.map((actor) => actor.name)).toEqual(["EmberPuff", "FrostFang", "GearBot"]);
    expect(scene.dialogues?.[0]?.text).toContain("Иди сюда");
    const types = scene.actionSequence.map((action) => action.type);
    expect(types).toContain("Enter");
    expect(types).toContain("RunTo");
    expect(types).toContain("Attack");
    expect(types).toContain("Hit");
    expect(types.filter((type) => type === "Attack").length).toBeGreaterThanOrEqual(3);
    // Attacks must lunge (x keyframes), not stand still waving
    const emberAttackX = scene.generatedTimeline!.actorTracks.find((track) => track.actorId === "actor-ember" && track.property === "x");
    expect(emberAttackX!.keyframes.length).toBeGreaterThan(2);
    expect(scene.generatedTimeline?.duration).toBeGreaterThan(5);
    for (const asset of next.assets.filter((item) => item.path.includes("AudioBeast"))) {
      expect(fs.existsSync(asset.path), asset.path).toBe(true);
    }
  });

  it("buildAudioBeastFightScene requires the three ids", () => {
    expect(() => buildAudioBeastFightScene([])).toThrow(/EmberPuff/);
  });
});
