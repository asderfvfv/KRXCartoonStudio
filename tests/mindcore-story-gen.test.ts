import { describe, expect, it } from "vitest";
import { generateStoryVariants, thinkDirectorBrain, classifyStoryMedia, weightedSample } from "../src/domain/mindcoreStoryGen";

class SeqRng {
  constructor(private values: number[], private i = 0) {}
  next() {
    const value = this.values[this.i % this.values.length] ?? 0;
    this.i += 1;
    return value;
  }
}

describe("mindcore story generator", () => {
  it("weightedSample picks without replacement", () => {
    const rng = new SeqRng([0.01, 0.01, 0.01]);
    const picked = weightedSample(["a", "b", "c", "d"], [1, 1, 1, 1], 3, rng);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it("builds unique cartoon prompts with Characters and scenes", () => {
    const variants = generateStoryVariants({
      kind: "cartoon",
      strategy: "mixed",
      count: 3,
      characters: ["Огонёк", "Морозко", "Винтик"],
      props: [],
      seed: 42,
    });
    expect(variants.length).toBe(3);
    for (const item of variants) {
      expect(item.prompt).toMatch(/^# /m);
      expect(item.prompt).toMatch(/Characters:/);
      expect(item.prompt).toMatch(/## /);
      expect(item.prompt).toMatch(/:\s.+/);
      expect(item.prompt).toMatch(/^\(/m);
      expect(item.thoughts.length).toBeGreaterThanOrEqual(5);
    }
    const keys = new Set(variants.map((item) => item.prompt));
    expect(keys.size).toBe(variants.length);
  });

  it("picks visit beat and weaves idea + mentioned cast", () => {
    const variants = generateStoryVariants({
      kind: "cartoon",
      strategy: "uniform",
      count: 1,
      idea: "в гости к Винтику",
      characters: ["Огонёк", "Морозко", "Винтик"],
      props: [],
      seed: 99,
    });
    expect(variants[0]!.beatIds[0]).toBe("visit");
    expect(variants[0]!.prompt).toMatch(/Винтик/);
    expect(variants[0]!.prompt.toLowerCase()).toMatch(/гост/);
    expect(variants[0]!.characters).toContain("Винтик");
  });

  it("weaves dropped prop name into cartoon dialogue", () => {
    const variants = generateStoryVariants({
      kind: "cartoon",
      strategy: "uniform",
      count: 1,
      idea: "клад",
      characters: ["Огонёк", "Морозко"],
      props: ["treasure-map"],
      assets: [{ name: "treasure-map", width: 400, height: 400 }],
      seed: 5,
    });
    expect(variants[0]!.beatIds[0]).toBe("treasure");
    expect(variants[0]!.prompt).toMatch(/treasure map/i);
    expect(variants[0]!.prompt).toMatch(/^Props:/m);
  });

  it("thinkDirectorBrain prefers idea-matched cartoon over a random first draw", () => {
    const brain = thinkDirectorBrain({
      kind: "cartoon",
      strategy: "mixed",
      count: 3,
      idea: "ночь и фонарь",
      characters: ["Огонёк", "Морозко", "Винтик"],
      props: [],
      seed: 11,
    });
    expect(brain.variant?.beatIds[0]).toBe("night");
    expect(brain.thoughts.some((line) => /ночн|ночь|шаблон/i.test(line))).toBe(true);
  });

  it("ad mode inserts product into hook-product-cta structure", () => {
    const variants = generateStoryVariants({
      kind: "ad",
      strategy: "coverage",
      count: 2,
      product: "Крумбикс",
      characters: ["Огонёк", "Винтик"],
      props: ["meadow-sunny"],
      assets: [{ name: "phone-ui", width: 400, height: 800 }],
      seed: 7,
      withCast: false,
    });
    expect(variants.length).toBeGreaterThanOrEqual(1);
    expect(variants[0]!.prompt).toContain("Крумбикс");
    expect(variants[0]!.prompt).toMatch(/Genre:\s*реклама/);
    expect(variants[0]!.prompt).toMatch(/## /);
    expect(variants[0]!.prompt).not.toMatch(/^Characters:/m);
    expect(variants[0]!.prompt).toMatch(/^Титр:/m);
    expect(variants[0]!.characters).toEqual([]);
  });

  it("ad withCast still puts named heroes when asked", () => {
    const variants = generateStoryVariants({
      kind: "ad",
      strategy: "uniform",
      count: 1,
      product: "Крумбикс",
      characters: ["Огонёк", "Винтик"],
      props: [],
      assets: [{ name: "phone-ui", width: 400, height: 800 }],
      seed: 9,
      withCast: true,
    });
    expect(variants[0]!.prompt).toMatch(/^Characters:/m);
    expect(variants[0]!.characters.length).toBeGreaterThanOrEqual(2);
  });

  it("thinkDirectorBrain returns step thoughts and a prompt", () => {
    const brain = thinkDirectorBrain({
      kind: "ad",
      strategy: "hot",
      count: 1,
      product: "Крумбикс",
      characters: ["Огонёк", "Винтик"],
      props: ["box"],
      assets: [{ name: "box", width: 400, height: 400 }],
      seed: 3,
      withCast: false,
    });
    expect(brain.variant).toBeTruthy();
    expect(brain.thoughts.some((line) => /без героев/i.test(line))).toBe(true);
    expect(brain.variant!.prompt).toContain("Крумбикс");
    expect(brain.variant!.prompt).not.toMatch(/^Characters:/m);
  });

  it("classifyStoryMedia keeps only a few product shots, not wide backgrounds", () => {
    const classified = classifyStoryMedia([
      { name: "wide-bg", width: 1920, height: 1080 },
      { name: "box-product", width: 400, height: 800 },
      { name: "menu", width: 360, height: 720 },
      { name: "extra1", width: 200, height: 200 },
      { name: "extra2", width: 200, height: 200 },
      { name: "extra3", width: 200, height: 200 },
    ], "ad");
    expect(classified.backgrounds).toEqual(["wide-bg"]);
    expect(classified.props[0]).toBe("box-product");
    expect(classified.props.length).toBeLessThanOrEqual(6);
    expect(classified.productHint).toBe("box product");
  });

  it("does not dump empty picks as invented props", () => {
    const variants = generateStoryVariants({
      kind: "ad",
      strategy: "uniform",
      count: 1,
      characters: ["Огонёк", "Винтик"],
      props: [],
      assets: [],
      seed: 1,
    });
    expect(variants[0]!.prompt).not.toMatch(/^Props:/m);
  });
});
