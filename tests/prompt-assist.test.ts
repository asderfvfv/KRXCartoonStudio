import { describe, expect, it } from "vitest";
import {
  analyzePromptInlineHints,
  applyAutocomplete,
  buildProjectPromptCatalog,
  getPromptAutocomplete,
  insertCharactersFromProject,
  insertChipIntoPrompt,
  insertNameAtCaret,
} from "../src/domain/promptAssist";

describe("prompt assist autocomplete", () => {
  const catalog = buildProjectPromptCatalog({
    characters: [{ name: "Огонёк" }, { name: "Морозко" }, { name: "Винтик" }],
    assets: [
      { name: "sword", mediaType: "image/png" },
      { name: "hat", mediaType: "image/png" },
      { name: "theme.mp3", mediaType: "audio/mpeg" },
    ],
  });

  it("builds catalog from characters and image assets only", () => {
    expect(catalog.filter((item) => item.kind === "character").map((item) => item.value)).toEqual([
      "Огонёк",
      "Морозко",
      "Винтик",
    ]);
    expect(catalog.filter((item) => item.kind === "prop").map((item) => item.value)).toEqual(["sword", "hat"]);
  });

  it("suggests characters on Characters line", () => {
    const text = "Characters: Ог\n";
    const caret = "Characters: Ог".length;
    const result = getPromptAutocomplete({ text, caret, catalog });
    expect(result?.context).toBe("characters");
    expect(result?.items.some((item) => item.value === "Огонёк")).toBe(true);
    const applied = applyAutocomplete(text, result!.replaceFrom, result!.replaceTo, "Огонёк");
    expect(applied.text.startsWith("Characters: Огонёк")).toBe(true);
  });

  it("suggests props on Props line", () => {
    const text = "Props: sw";
    const result = getPromptAutocomplete({ text, caret: text.length, catalog });
    expect(result?.context).toBe("props");
    expect(result?.items[0]?.value).toBe("sword");
  });

  it("suggests speaker names at line start", () => {
    const text = "## Сцена\nМор";
    const result = getPromptAutocomplete({ text, caret: text.length, catalog });
    expect(result?.context).toBe("speaker");
    expect(result?.items[0]?.value).toBe("Морозко: ");
  });

  it("inserts Characters line from project", () => {
    const next = insertCharactersFromProject("# Мультик\n\n## Сцена\n", ["Огонёк", "Винтик"]);
    expect(next).toContain("Characters: Огонёк, Винтик");
  });

  it("chip insert into Characters list adds comma", () => {
    const text = "Characters: Огонёк";
    const next = insertNameAtCaret(text, text.length, "Морозко");
    expect(next.text).toBe("Characters: Огонёк, Морозко");
  });

  it("excludes rig part assets from prop catalog", () => {
    const mixed = buildProjectPromptCatalog({
      characters: [{ name: "Огонёк" }],
      assets: [
        { name: "body", mediaType: "image/png" },
        { name: "leg-left", mediaType: "image/png" },
        { name: "sword", mediaType: "image/png" },
        { name: "meadow-sunny", mediaType: "image/png" },
      ],
    });
    expect(mixed.filter((item) => item.kind === "prop").map((item) => item.value)).toEqual([
      "sword",
      "meadow-sunny",
    ]);
  });

  it("chip buttons append into Characters / Props lines", () => {
    const base = "# Мультик\n\n## Сцена\nОгонёк: Привет!\n";
    const withHero = insertChipIntoPrompt(base, 0, "Морозко", "character");
    expect(withHero.text).toContain("Characters: Морозко");
    expect(withHero.text).not.toMatch(/^Морозко/m);
    const withProp = insertChipIntoPrompt(withHero.text, 0, "sword", "prop");
    expect(withProp.text).toContain("Props: sword");
  });

  it("emits inline tips for missing Characters", () => {
    const hints = analyzePromptInlineHints({
      text: "## Сцена\nОгонёк: Привет!\n",
      characters: [{ name: "Огонёк" }],
      assets: [],
    });
    expect(hints.some((item) => item.id === "insert-cast")).toBe(true);
  });
});
