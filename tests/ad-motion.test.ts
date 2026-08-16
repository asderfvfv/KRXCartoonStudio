import { describe, expect, it } from "vitest";
import { applyAdWowMotion, adMotionStyleForIndex, buildAdPropMotion } from "../src/domain/adMotion";
import { createBlankProject } from "../src/domain/defaults";
import { generateStoryVariants } from "../src/domain/mindcoreStoryGen";
import { parseCartoonPrompt, placePropsByNames, enrichScenesFromPromptPlan, planToScript } from "../src/domain/promptCartoon";
import { buildCartoonFromScript, parseCartoonScript } from "../src/domain/scriptCartoon";
import { SceneRuntime } from "../src/systems/SceneRuntime";

describe("ad wow motion", () => {
  it("cycles motion styles", () => {
    expect(adMotionStyleForIndex(0)).toBe("slideIn");
    expect(adMotionStyleForIndex(2)).toBe("punchPop");
  });

  it("builds prop and camera keyframes", () => {
    const scene = createBlankProject().scenes![0]!;
    const prop = {
      id: "p1",
      name: "shot",
      assetId: "a1",
      position: { x: 960, y: 540 },
      rotation: 0,
      scale: { x: 0.5, y: 0.5 },
      zIndex: 50,
      opacity: 1,
      visible: true,
    };
    const motion = buildAdPropMotion(prop, scene, "kenBurns", 3.2);
    expect(motion.propTracks.length).toBeGreaterThan(2);
    expect(motion.cameraTracks.some((track) => track.property === "zoom")).toBe(true);
  });

  it("animates prop opacity over time in SceneRuntime", () => {
    const project = createBlankProject();
    const scene = project.scenes![0]!;
    project.assets.push({ id: "a1", name: "ui", path: "x.png", mediaType: "image/png", width: 400, height: 800 });
    scene.props = [{
      id: "p1",
      name: "ui",
      assetId: "a1",
      position: { x: 960, y: 540 },
      rotation: 0,
      scale: { x: 0.4, y: 0.4 },
      zIndex: 50,
      opacity: 1,
      visible: true,
    }];
    applyAdWowMotion(project);
    expect(scene.generatedTimeline?.propTracks?.length).toBeGreaterThan(0);
    const runtime = new SceneRuntime();
    const atStart = runtime.setTime(scene, project.characters, 0);
    const atMid = runtime.setTime(scene, project.characters, 0.6);
    expect(atStart.props[0]!.opacity).toBeLessThan(atMid.props[0]!.opacity + 0.01);
    expect(atMid.camera.zoom).not.toBe(1);
  });

  it("product-only ad prompt makes one scene per image", () => {
    const variants = generateStoryVariants({
      kind: "ad",
      strategy: "uniform",
      count: 1,
      product: "App",
      characters: [],
      props: [],
      assets: [
        { name: "a", width: 400, height: 800 },
        { name: "b", width: 400, height: 800 },
        { name: "c", width: 360, height: 720 },
        { name: "d", width: 360, height: 720 },
      ],
      seed: 11,
      withCast: false,
    });
    const plan = parseCartoonPrompt(variants[0]!.prompt);
    expect(plan.scenes.length).toBe(4);
    expect(plan.props.length).toBe(4);
    expect(plan.characters).toEqual([]);
  });

  it("enrich applies wow timeline for ads", () => {
    const plan = parseCartoonPrompt(`# Реклама: X
Props: catalog
Genre: реклама
## Хук
Титр: Смотри!
## Призыв
Титр: Жми!
`);
    const project = createBlankProject();
    project.assets.push({ id: "a1", name: "catalog", path: "c.png", mediaType: "image/png", width: 400, height: 800 });
    const parsed = parseCartoonScript(planToScript(plan));
    const built = buildCartoonFromScript(project, parsed, {
      mapping: {},
      width: 1920,
      height: 1080,
      replaceScenes: true,
    });
    const enriched = enrichScenesFromPromptPlan(built.project, plan);
    expect(enriched.scenes![0]!.generatedTimeline?.propTracks?.length).toBeGreaterThan(0);
    expect(enriched.montage?.transition).toBe("crossfade");
  });
});
