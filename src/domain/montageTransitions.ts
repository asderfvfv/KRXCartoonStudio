/**
 * Catalog of montage scene-to-scene transitions (ads / shorts).
 * Overlapping kinds share `crossfadeDuration` as effect length.
 */

export const MONTAGE_TRANSITION_IDS = [
  "cut",
  "crossfade",
  "fadeBlack",
  "fadeWhite",
  "wipeLeft",
  "wipeRight",
  "wipeUp",
  "wipeDown",
  "slideLeft",
  "slideRight",
  "pushLeft",
  "zoomIn",
  "zoomOut",
  "flash",
  "circleOpen",
  "circleClose",
] as const;

export type MontageTransitionType = (typeof MONTAGE_TRANSITION_IDS)[number];

export interface MontageTransitionInfo {
  id: MontageTransitionType;
  label: string;
  hint: string;
}

export const MONTAGE_TRANSITION_CATALOG: MontageTransitionInfo[] = [
  { id: "cut", label: "Резкий", hint: "Мгновенная смена" },
  { id: "crossfade", label: "Наплыв", hint: "A растворяется в B" },
  { id: "fadeBlack", label: "Через чёрный", hint: "A → чёрный → B" },
  { id: "fadeWhite", label: "Через белый", hint: "A → белый → B" },
  { id: "wipeLeft", label: "Шторка ←", hint: "B заезжает слева" },
  { id: "wipeRight", label: "Шторка →", hint: "B заезжает справа" },
  { id: "wipeUp", label: "Шторка ↑", hint: "B снизу вверх" },
  { id: "wipeDown", label: "Шторка ↓", hint: "B сверху вниз" },
  { id: "slideLeft", label: "Сдвиг ←", hint: "B наезжает слева" },
  { id: "slideRight", label: "Сдвиг →", hint: "B наезжает справа" },
  { id: "pushLeft", label: "Выталкивание", hint: "B толкает A влево" },
  { id: "zoomIn", label: "Зум внутрь", hint: "B растёт из центра" },
  { id: "zoomOut", label: "Зум наружу", hint: "A уходит, B на месте" },
  { id: "flash", label: "Вспышка", hint: "Белая вспышка в середине" },
  { id: "circleOpen", label: "Диафрагма +", hint: "Круг раскрывается на B" },
  { id: "circleClose", label: "Диафрагма −", hint: "Круг сжимает A" },
];

const ID_SET = new Set<string>(MONTAGE_TRANSITION_IDS);

export function isMontageTransitionType(value: unknown): value is MontageTransitionType {
  return typeof value === "string" && ID_SET.has(value);
}

export function normalizeMontageTransition(value: unknown): MontageTransitionType {
  return isMontageTransitionType(value) ? value : "cut";
}

export function transitionNeedsOverlap(kind: MontageTransitionType): boolean {
  return kind !== "cut";
}

export function montageTransitionLabel(kind: MontageTransitionType): string {
  return MONTAGE_TRANSITION_CATALOG.find((item) => item.id === kind)?.label ?? kind;
}
