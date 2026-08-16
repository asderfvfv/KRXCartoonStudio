import type { PromptBackgroundKey, PromptCartoonPlan } from "./promptCartoon";
import { isDemoBotAssetPath, isRigPartAssetName } from "./rigPartNames";

export interface LocalImageFile {
  path: string;
  name: string;
  width: number;
  height: number;
}

export const STAGE_DUMP_BACKGROUNDS = "Backgrounds";
export const STAGE_DUMP_PROPS = "Props";
export const STAGE_DUMP_AUDIO = "Audio";

const EXACT_BG: Partial<Record<PromptBackgroundKey, string>> = {
  cottage: "gear-cottage",
  meadow: "meadow-sunny",
};

const BG_KEYWORDS: Record<PromptBackgroundKey, string[]> = {
  meadow: ["meadow", "поляна", "луг", "grass", "forest", "лес", "garden", "сад", "park", "outdoor", "nature", "природ", "sunny", "поле", "троп", "road", "дорог", "дерев"],
  cottage: ["cottage", "house", "дом", "домик", "хижин", "indoor", "room", "комнат", "workshop", "мастер", "kitchen", "кухн", "interior", "порог", "изба"],
  night: ["night", "ночь", "moon", "луна", "dark", "тёмн", "темн", "star", "звёзд"],
  sky: ["sky", "небо", "cloud", "облак", "sunset", "закат"],
  studio: ["studio", "студи", "neon", "реклам", "stage", "сцен"],
};

export function dumpStem(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

/** Rig parts, DemoBot, and backdrops must never be dropped onto the stage as props. */
export function isUsableStagePropFile(file: LocalImageFile): boolean {
  const stem = dumpStem(file.name);
  if (isRigPartAssetName(stem) || isRigPartAssetName(file.name)) return false;
  if (isDemoBotAssetPath(file.path, file.name)) return false;
  if (file.width >= 960 && file.height >= 540) return false;
  return true;
}

export function usableStagePropFiles(files: LocalImageFile[]): LocalImageFile[] {
  return files.filter(isUsableStagePropFile);
}

/** Wide stills from Assets/Backgrounds only — never rig parts or character PNGs. */
export function isUsableStageBackgroundFile(file: LocalImageFile): boolean {
  const stem = dumpStem(file.name);
  if (isRigPartAssetName(stem) || isRigPartAssetName(file.name)) return false;
  if (isDemoBotAssetPath(file.path, file.name)) return false;
  if (/audiobeast|characters[\\/]/i.test(file.path)) return false;
  if (file.width < 960 || file.height < 540) return false;
  return true;
}

export function usableStageBackgroundFiles(files: LocalImageFile[]): LocalImageFile[] {
  return files.filter(isUsableStageBackgroundFile);
}

export function scoreDumpName(fileName: string, keywords: string[]): number {
  const name = fileName.toLowerCase();
  return keywords.reduce((sum, word) => sum + (name.includes(word) ? 1 : 0), 0);
}

/** Prefer keyword hits, then larger pictures (real backdrops, not icons). */
export function pickBackgroundFromDump(
  files: LocalImageFile[],
  key: PromptBackgroundKey,
  used = new Set<string>(),
): LocalImageFile | undefined {
  const unused = files.filter((file) => !used.has(file.path));
  if (!unused.length) return undefined;
  const exact = EXACT_BG[key];
  if (exact) {
    const named = unused.find((file) => dumpStem(file.name).toLowerCase() === exact);
    if (named) {
      used.add(named.path);
      return named;
    }
  }
  const keywords = BG_KEYWORDS[key] ?? [];
  const scored = unused
    .map((file) => ({
      file,
      hits: scoreDumpName(`${file.name} ${dumpStem(file.name)}`, keywords),
      area: Math.max(1, file.width) * Math.max(1, file.height),
    }))
    .sort((a, b) => b.hits - a.hits || b.area - a.area);
  const best = scored.find((item) => item.hits > 0)?.file;
  if (best) {
    used.add(best.path);
    return best;
  }
  return undefined;
}

export function matchDumpProp(
  files: LocalImageFile[],
  needle: string,
  used = new Set<string>(),
): LocalImageFile | undefined {
  const want = needle.trim().toLowerCase().replace(/\s+/g, " ");
  if (!want) return undefined;
  const unused = files.filter((file) => !used.has(file.path));
  const exact = unused.find((file) => dumpStem(file.name).toLowerCase() === want);
  if (exact) {
    used.add(exact.path);
    return exact;
  }
  const loose = unused.find((file) => {
    const stem = dumpStem(file.name).toLowerCase();
    return stem.includes(want) || want.includes(stem);
  });
  if (loose) used.add(loose.path);
  return loose;
}

/**
 * Declared Props stay first. If none, only dump files whose names appear in the prompt.
 * Never leftover-fill unused files (that dropped DemoBot `body` onto the meadow).
 */
export function resolvePromptPropNames(
  plan: PromptCartoonPlan,
  dumpProps: LocalImageFile[],
): string[] {
  const pool = usableStagePropFiles(dumpProps);
  if (plan.props.length) return [...plan.props];
  if (!pool.length) return [];
  const used = new Set<string>();
  const names: string[] = [];
  const hay = `${plan.title} ${plan.atmosphere} ${plan.genre} ${plan.scenes.map((scene) => `${scene.title} ${scene.summary} ${scene.lines.map((line) => line.text).join(" ")}`).join(" ")}`.toLowerCase();
  for (const file of pool) {
    const stem = dumpStem(file.name);
    if (!stem || used.has(file.path)) continue;
    if (hay.includes(stem.toLowerCase())) {
      used.add(file.path);
      names.push(stem);
    }
  }
  return names;
}
