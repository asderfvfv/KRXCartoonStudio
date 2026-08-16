import type { AssetDefinition, ProjectDocument, Scene } from "./types";

export type AssetBrowserFilter = "all" | "props" | "backgrounds" | "characters" | "unused";

export interface AssetUsage {
  asProp: number;
  asBackground: number;
  asCharacterPart: number;
  asAttachment: number;
  total: number;
}

export function classifyAssetKind(asset: AssetDefinition): "background" | "prop" | "other" {
  const name = asset.name.toLowerCase();
  if (
    name.includes("background")
    || name.includes("фон")
    || name.includes("bg")
    || name.includes("sky")
    || name.includes("meadow")
    || name.includes("cottage")
  ) {
    return "background";
  }
  if (asset.width >= 960 && asset.height >= 540) return "background";
  if (asset.width * asset.height >= 400_000) return "background";
  return "prop";
}

export function collectAssetUsage(project: ProjectDocument, assetId: string): AssetUsage {
  let asProp = 0;
  let asBackground = 0;
  let asCharacterPart = 0;
  let asAttachment = 0;
  for (const scene of project.scenes ?? []) {
    if (scene.backgroundAssetId === assetId) asBackground += 1;
    for (const prop of scene.props) {
      if (prop.assetId === assetId) asProp += 1;
    }
    for (const attachment of scene.attachments ?? []) {
      if (attachment.assetId === assetId) asAttachment += 1;
    }
  }
  for (const character of project.characters) {
    for (const part of character.parts) {
      if (part.assetId === assetId) asCharacterPart += 1;
    }
  }
  return {
    asProp,
    asBackground,
    asCharacterPart,
    asAttachment,
    total: asProp + asBackground + asCharacterPart + asAttachment,
  };
}

export function filterProjectAssets(
  project: ProjectDocument,
  options: { query?: string; filter?: AssetBrowserFilter },
): AssetDefinition[] {
  const query = (options.query ?? "").trim().toLowerCase();
  const filter = options.filter ?? "all";
  return (project.assets ?? []).filter((asset) => {
    if (query) {
      const display = assetDisplayName(asset).toLowerCase();
      if (!asset.name.toLowerCase().includes(query) && !asset.id.toLowerCase().includes(query) && !display.includes(query)) {
        return false;
      }
    }
    const usage = collectAssetUsage(project, asset.id);
    const kind = classifyAssetKind(asset);
    if (filter === "props") return kind === "prop" || usage.asProp > 0;
    if (filter === "backgrounds") return kind === "background" || usage.asBackground > 0;
    if (filter === "characters") return usage.asCharacterPart > 0;
    if (filter === "unused") return usage.total === 0;
    return true;
  });
}

export function assetUsageLabel(usage: AssetUsage): string {
  if (usage.total === 0) return "не используется";
  const bits: string[] = [];
  if (usage.asBackground) bits.push(`фон×${usage.asBackground}`);
  if (usage.asProp) bits.push(`предмет×${usage.asProp}`);
  if (usage.asCharacterPart) bits.push(`риг×${usage.asCharacterPart}`);
  if (usage.asAttachment) bits.push(`навеска×${usage.asAttachment}`);
  return bits.join(" · ");
}

/** Human-readable name for library cards (DemoBot parts → Russian). */
export function assetDisplayName(asset: AssetDefinition): string {
  const key = asset.name.trim().toLowerCase();
  const map: Record<string, string> = {
    body: "Тело",
    head: "Голова",
    "eye-left": "Глаз Л",
    "eye-right": "Глаз П",
    "arm-left": "Рука Л",
    "arm-right": "Рука П",
    "hand-left": "Кисть Л",
    "hand-right": "Кисть П",
    "leg-left": "Нога Л",
    "leg-right": "Нога П",
    "meadow-sunny": "Поляна",
    "gear-cottage": "Домик",
  };
  return map[key] ?? asset.name;
}

export function assetRoleHint(project: ProjectDocument, assetId: string): string {
  const usage = collectAssetUsage(project, assetId);
  if (usage.asBackground) return "фон сцены";
  if (usage.asProp) return "предмет на сцене";
  if (usage.asAttachment) return "навеска";
  if (usage.asCharacterPart) return "часть персонажа (риг)";
  const asset = project.assets.find((item) => item.id === assetId);
  if (!asset) return "картинка";
  if (classifyAssetKind(asset) === "background") return "похоже на фон";
  return "свободная картинка";
}

export function sceneUsesAsset(scene: Scene, assetId: string): boolean {
  if (scene.backgroundAssetId === assetId) return true;
  if (scene.props.some((prop) => prop.assetId === assetId)) return true;
  return (scene.attachments ?? []).some((item) => item.assetId === assetId);
}
