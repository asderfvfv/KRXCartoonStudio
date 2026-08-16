import { describe, expect, it } from "vitest";
import { parseCartoonPrompt } from "../src/domain/promptCartoon";
import {
  matchDumpProp,
  pickBackgroundFromDump,
  resolvePromptPropNames,
  usableStageBackgroundFiles,
  type LocalImageFile,
} from "../src/domain/stageDump";

const files = (names: Array<[string, number, number]>): LocalImageFile[] =>
  names.map(([name, width, height]) => ({ path: `D:/${name}`, name, width, height }));

describe("stage dump picker", () => {
  it("picks meadow vs cottage from dump file names", () => {
    const pool = files([
      ["поляна-утро.png", 1920, 1080],
      ["домик-винтика.jpg", 1600, 900],
      ["icon.png", 64, 64],
    ]);
    const used = new Set<string>();
    expect(pickBackgroundFromDump(pool, "meadow", used)?.name).toMatch(/поляна/i);
    expect(pickBackgroundFromDump(pool, "cottage", used)?.name).toMatch(/домик/i);
  });

  it("matches declared prop names to dump files", () => {
    const pool = files([["меч.png", 200, 80], ["мяч.png", 120, 120]]);
    const used = new Set<string>();
    expect(matchDumpProp(pool, "меч", used)?.name).toBe("меч.png");
    expect(matchDumpProp(pool, "мяч", used)?.name).toBe("мяч.png");
  });

  it("fills empty Props from dump names mentioned in the prompt", () => {
    const plan = parseCartoonPrompt(`# В гости
Characters: Огонёк
## Поляна
Огонёк: Держи мяч!
## Домик
Огонёк: Где меч?
`);
    const names = resolvePromptPropNames(plan, files([["мяч.png", 100, 100], ["меч.png", 80, 200], ["камень.png", 90, 90]]));
    expect(names).toContain("мяч");
    expect(names).toContain("меч");
    expect(names).not.toContain("камень");
  });

  it("never auto-fills DemoBot or rig parts as props", () => {
    const plan = parseCartoonPrompt(`# В гости
Characters: Огонёк
## Поляна
Огонёк: Пойдём к Винтику в гости!
`);
    const junk: LocalImageFile[] = [
      { path: "builtin://demobot/body.svg", name: "body", width: 220, height: 310 },
      { path: "builtin://demobot/head.svg", name: "head", width: 240, height: 210 },
      { path: "D:/frost-body.png", name: "body.png", width: 400, height: 600 },
    ];
    expect(resolvePromptPropNames(plan, junk)).toEqual([]);
  });

  it("never uses character body PNGs as a meadow backdrop", () => {
    const pool = [
      { path: "D:/Characters/AudioBeast/FrostFang/Assets/body.png", name: "body.png", width: 1254, height: 1254 },
      { path: "D:/Characters/AudioBeast/EmberPuff/Assets/body.png", name: "body.png", width: 453, height: 511 },
    ];
    expect(usableStageBackgroundFiles(pool)).toEqual([]);
    expect(pickBackgroundFromDump(pool, "meadow")).toBeUndefined();
  });
});
