/**
 * Same logic as src/domain/pngRigAliases.ts — kept in electron/ because
 * electron tsc rootDir cannot import from ../src.
 */
export type RigPngSlot =
  | "body"
  | "head"
  | "eye-left"
  | "eye-right"
  | "mouth"
  | "arm-left"
  | "arm-right"
  | "hand-left"
  | "hand-right"
  | "leg-left"
  | "leg-right";

export const RIG_SLOT_ALIASES: Record<RigPngSlot, string[]> = {
  body: [
    "body", "torso", "trunk", "chest",
    "тело", "туловище", "торс", "корпус", "груд", "грудак",
  ],
  head: [
    "head", "face", "skull",
    "голова", "башка", "башк", "головашка", "морда", "лицо", "череп",
  ],
  "eye-left": [
    "eye-left", "eye-l", "lefteye", "left-eye", "eye",
    "глаз-левый", "глаз-л", "глазл", "левый-глаз", "левыйглаз", "глаз", "око",
  ],
  "eye-right": [
    "eye-right", "eye-r", "righteye", "right-eye",
    "глаз-правый", "глаз-п", "глазп", "правый-глаз", "правыйглаз",
  ],
  mouth: [
    "mouth", "lips", "jaw",
    "рот", "губы", "пасть", "челюсть", "рот-открыт",
  ],
  "arm-left": [
    "arm-left", "arm-l", "leftarm", "left-arm", "arm",
    "рука-левая", "рука-л", "левая-рука", "леваярука", "рука", "ручина",
  ],
  "arm-right": [
    "arm-right", "arm-r", "rightarm", "right-arm",
    "рука-правая", "рука-п", "правая-рука", "праваярука",
  ],
  "hand-left": [
    "hand-left", "hand-l", "lefthand", "left-hand", "hand",
    "кисть-левая", "кисть-л", "левая-кисть", "ладонь-л", "ладонь", "кисть", "рука-кисть",
  ],
  "hand-right": [
    "hand-right", "hand-r", "righthand", "right-hand",
    "кисть-правая", "кисть-п", "правая-кисть", "ладонь-п",
  ],
  "leg-left": [
    "leg-left", "leg-l", "leftleg", "left-leg", "leg", "foot-left", "foot",
    "нога-левая", "нога-л", "левая-нога", "леваянога", "нога", "стопа", "стопа-л",
  ],
  "leg-right": [
    "leg-right", "leg-r", "rightleg", "right-leg", "foot-right",
    "нога-правая", "нога-п", "правая-нога", "праваянога", "стопа-п",
  ],
};

const LEFT_HINT = /(^|[-_\s])(left|л|лев|левая|левый|левое)($|[-_\s])/i;
const RIGHT_HINT = /(^|[-_\s])(right|п|прав|правая|правый|правое)($|[-_\s])/i;

export function normalizePngStem(fileName: string): string {
  return fileName
    .trim()
    .toLowerCase()
    .replace(/\.(png|jpg|jpeg|webp)$/i, "")
    .replace(/[_\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function tokensOf(stem: string): string[] {
  return stem.split("-").filter(Boolean);
}

function aliasHitsStem(stem: string, alias: string): boolean {
  if (stem === alias) return true;
  if (stem.startsWith(`${alias}-`) || stem.endsWith(`-${alias}`)) return true;
  const aliasTokens = tokensOf(alias);
  const stemTokens = tokensOf(stem);
  if (aliasTokens.length && aliasTokens.every((token) => stemTokens.includes(token))) return true;
  if (!alias.includes("-") && stemTokens.includes(alias)) return true;
  if (!alias.includes("-") && alias.length >= 3 && stem.startsWith(alias)) return true;
  return false;
}

function sideScore(stem: string, slot: RigPngSlot): number {
  const wantsLeft = slot.includes("left");
  const wantsRight = slot.includes("right");
  if (!wantsLeft && !wantsRight) return 0;
  const hasLeft = LEFT_HINT.test(stem) || /(-|^)(л|left)(-|$)/i.test(stem);
  const hasRight = RIGHT_HINT.test(stem) || /(-|^)(п|right)(-|$)/i.test(stem);
  if (wantsLeft && hasLeft && !hasRight) return 3;
  if (wantsRight && hasRight && !hasLeft) return 3;
  if (wantsLeft && hasRight) return -5;
  if (wantsRight && hasLeft) return -5;
  return 0;
}

export function matchPngStemToRigSlot(fileName: string): RigPngSlot | null {
  const stem = normalizePngStem(fileName);
  if (!stem) return null;
  let best: { slot: RigPngSlot; score: number } | null = null;
  for (const slot of Object.keys(RIG_SLOT_ALIASES) as RigPngSlot[]) {
    for (const alias of RIG_SLOT_ALIASES[slot]) {
      if (!aliasHitsStem(stem, alias)) continue;
      const score = alias.length * 10 + sideScore(stem, slot) + (stem === alias ? 50 : 0);
      if (!best || score > best.score) best = { slot, score };
    }
  }
  return best?.slot ?? null;
}

export type NamedPng = { path: string; name: string };

export function pickPngForRigSlot(
  files: NamedPng[],
  slot: RigPngSlot,
  used: Set<string> = new Set(),
): NamedPng | null {
  let best: { file: NamedPng; score: number } | null = null;
  for (const file of files) {
    if (used.has(file.path)) continue;
    const stem = normalizePngStem(file.name);
    const matched = matchPngStemToRigSlot(file.name);
    if (matched !== slot) {
      const generics: Partial<Record<RigPngSlot, RigPngSlot>> = {
        "eye-right": "eye-left",
        "arm-right": "arm-left",
        "hand-right": "hand-left",
        "leg-right": "leg-left",
      };
      if (generics[slot] !== matched) continue;
      if (sideScore(stem, slot) < 0) continue;
    }
    let score = 0;
    for (const alias of RIG_SLOT_ALIASES[slot]) {
      if (aliasHitsStem(stem, alias)) score = Math.max(score, alias.length * 10 + (stem === alias ? 50 : 0));
    }
    score += sideScore(stem, slot);
    if (!best || score > best.score) best = { file, score };
  }
  return best?.file ?? null;
}

export function describeRequiredRigParts(): string {
  return "тело/body · голова/башка/head · глаз/eye · рот/mouth · рука/arm · нога/leg (лево/право по желанию)";
}
