/**
 * Local scene background fills: vivid swatches, named presets, solid / vertical gradient.
 * No cloud APIs — colors live in the project document.
 */

export const SCENE_BACKGROUND_SCHEMA_VERSION = 14;

export type SceneBackgroundFill =
  | { mode: "solid" }
  | {
      mode: "gradient";
      top: string;
      bottom: string;
      /** 0..1 — where ground/bottom color starts (sky above). Default 0.55. */
      horizon?: number;
      /** 0..0.35 — soft blend around horizon. 0 = sharp sky|ground split. */
      softness?: number;
    };

export interface SceneBackgroundSwatch {
  id: string;
  label: string;
  color: string;
  category: "sky" | "grass" | "sunset" | "night" | "room" | "neon" | "warm" | "cool";
}

export interface SceneBackgroundPreset {
  id: string;
  label: string;
  fill: SceneBackgroundFill;
  /** Canonical hex for Scene.background (solid color or gradient top). */
  background: string;
}

const HEX = /^#([0-9a-fA-F]{6})$/;

export function normalizeHexColor(value: string, fallback = "#87b86a"): string {
  const raw = value.trim();
  if (HEX.test(raw)) return raw.toLowerCase();
  if (/^#([0-9a-fA-F]{3})$/.test(raw)) {
    const h = raw.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
  }
  return fallback;
}

export function clampHorizon(value: number | undefined, fallback = 0.55): number {
  const n = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(0.05, Math.min(0.95, n));
}

export function clampSoftness(value: number | undefined, fallback = 0.08): number {
  const n = Number.isFinite(value) ? Number(value) : fallback;
  return Math.max(0, Math.min(0.35, n));
}

export function createSolidBackgroundFill(): SceneBackgroundFill {
  return { mode: "solid" };
}

export function createGradientBackgroundFill(
  top: string,
  bottom: string,
  horizon?: number,
  softness?: number,
): Extract<SceneBackgroundFill, { mode: "gradient" }> {
  return {
    mode: "gradient",
    top: normalizeHexColor(top),
    bottom: normalizeHexColor(bottom),
    horizon: clampHorizon(horizon),
    softness: clampSoftness(softness, 0.08),
  };
}

/** Resolve fill for a scene; defaults to solid from `background`. */
export function resolveSceneBackgroundFill(
  background: string,
  fill?: SceneBackgroundFill | null,
): SceneBackgroundFill {
  if (!fill || fill.mode === "solid") return createSolidBackgroundFill();
  return createGradientBackgroundFill(fill.top, fill.bottom, fill.horizon, fill.softness);
}

/** Hex stored on Scene.background for export / legacy. */
export function backgroundHexFromFill(background: string, fill?: SceneBackgroundFill | null): string {
  const resolved = resolveSceneBackgroundFill(background, fill);
  if (resolved.mode === "gradient") return resolved.top;
  return normalizeHexColor(background);
}

export function applySolidColor(color: string): { background: string; backgroundFill: SceneBackgroundFill } {
  const background = normalizeHexColor(color);
  return { background, backgroundFill: createSolidBackgroundFill() };
}

export function applyGradientColors(
  top: string,
  bottom: string,
  horizon?: number,
  softness?: number,
): { background: string; backgroundFill: SceneBackgroundFill } {
  const fill = createGradientBackgroundFill(top, bottom, horizon, softness);
  return { background: fill.top, backgroundFill: fill };
}

export function applyBackgroundPreset(
  preset: SceneBackgroundPreset,
): { background: string; backgroundFill: SceneBackgroundFill } {
  if (preset.fill.mode === "gradient") {
    return applyGradientColors(
      preset.fill.top,
      preset.fill.bottom,
      preset.fill.horizon,
      preset.fill.softness,
    );
  }
  return applySolidColor(preset.background);
}

/** Ensure scene fill is valid after load/migration. */
export function normalizeSceneBackgroundFields(scene: {
  background: string;
  backgroundFill?: SceneBackgroundFill;
}): void {
  scene.background = normalizeHexColor(scene.background ?? "#87b86a");
  if (!scene.backgroundFill) {
    scene.backgroundFill = createSolidBackgroundFill();
    return;
  }
  if (scene.backgroundFill.mode === "gradient") {
    const gradient = createGradientBackgroundFill(
      scene.backgroundFill.top,
      scene.backgroundFill.bottom,
      scene.backgroundFill.horizon,
      scene.backgroundFill.softness,
    );
    scene.backgroundFill = gradient;
    scene.background = gradient.top;
  } else {
    scene.backgroundFill = createSolidBackgroundFill();
  }
}

export const SCENE_BACKGROUND_SWATCHES: SceneBackgroundSwatch[] = [
  // sky
  { id: "sky-bright", label: "Яркое небо", color: "#4db8ff", category: "sky" },
  { id: "sky-day", label: "День", color: "#87ceeb", category: "sky" },
  { id: "sky-soft", label: "Мягкое", color: "#a8d8f0", category: "sky" },
  { id: "sky-aqua", label: "Аква", color: "#3ecfcf", category: "sky" },
  { id: "sky-indigo", label: "Индиго", color: "#5b7cfa", category: "sky" },
  { id: "sky-violet", label: "Фиолет", color: "#7a6cff", category: "sky" },
  // grass
  { id: "grass-lime", label: "Лайм", color: "#8fd94a", category: "grass" },
  { id: "grass-meadow", label: "Поляна", color: "#87b86a", category: "grass" },
  { id: "grass-deep", label: "Трава", color: "#3f9b4a", category: "grass" },
  { id: "grass-forest", label: "Лес", color: "#2d6b3a", category: "grass" },
  { id: "grass-mint", label: "Мята", color: "#5ecf9a", category: "grass" },
  { id: "grass-olive", label: "Олива", color: "#8a9a3c", category: "grass" },
  // sunset
  { id: "sun-gold", label: "Золото", color: "#ffb347", category: "sunset" },
  { id: "sun-orange", label: "Закат", color: "#ff7a3d", category: "sunset" },
  { id: "sun-coral", label: "Коралл", color: "#ff6b6b", category: "sunset" },
  { id: "sun-peach", label: "Персик", color: "#ffb4a2", category: "sunset" },
  { id: "sun-amber", label: "Янтарь", color: "#f5a623", category: "sunset" },
  { id: "sun-rose", label: "Роза", color: "#ff5c8a", category: "sunset" },
  // night
  { id: "night-navy", label: "Ночь", color: "#1a2433", category: "night" },
  { id: "night-blue", label: "Синяя ночь", color: "#1e3a5f", category: "night" },
  { id: "night-purple", label: "Ночной фиолет", color: "#2a1f4d", category: "night" },
  { id: "night-teal", label: "Тёмный тил", color: "#0f3d3e", category: "night" },
  { id: "night-ink", label: "Чернила", color: "#12151c", category: "night" },
  { id: "night-dusk", label: "Сумерки", color: "#3d2a5c", category: "night" },
  // room
  { id: "room-cream", label: "Крем", color: "#f3e6c8", category: "room" },
  { id: "room-sand", label: "Песок", color: "#e2c48a", category: "room" },
  { id: "room-wood", label: "Дерево", color: "#c4a574", category: "room" },
  { id: "room-brick", label: "Кирпич", color: "#c45c4a", category: "room" },
  { id: "room-stone", label: "Камень", color: "#9aa3ad", category: "room" },
  { id: "room-paper", label: "Бумага", color: "#fff4e0", category: "room" },
  // neon
  { id: "neon-pink", label: "Неон розовый", color: "#ff2d95", category: "neon" },
  { id: "neon-cyan", label: "Неон циан", color: "#00e5ff", category: "neon" },
  { id: "neon-lime", label: "Неон лайм", color: "#b8ff2e", category: "neon" },
  { id: "neon-purple", label: "Неон фиолет", color: "#b14dff", category: "neon" },
  { id: "neon-orange", label: "Неон оранж", color: "#ff9f1c", category: "neon" },
  { id: "neon-blue", label: "Неон синий", color: "#3d7bff", category: "neon" },
  // warm / cool extras
  { id: "warm-red", label: "Алый", color: "#e63946", category: "warm" },
  { id: "warm-brown", label: "Шоколад", color: "#7a4e2d", category: "warm" },
  { id: "warm-yellow", label: "Солнце", color: "#ffe066", category: "warm" },
  { id: "cool-ice", label: "Лёд", color: "#c8f0ff", category: "cool" },
  { id: "cool-steel", label: "Сталь", color: "#6b7c8a", category: "cool" },
  { id: "cool-sea", label: "Море", color: "#1f7a8c", category: "cool" },
  { id: "cool-fog", label: "Туман", color: "#d5dde3", category: "cool" },
  { id: "cool-slate", label: "Сланец", color: "#4a5568", category: "cool" },
];

export const SCENE_BACKGROUND_PRESETS: SceneBackgroundPreset[] = [
  {
    id: "meadow-day",
    label: "Поляна",
    background: "#87b86a",
    fill: createSolidBackgroundFill(),
  },
  {
    id: "sky-clear",
    label: "Небо",
    background: "#4db8ff",
    fill: createSolidBackgroundFill(),
  },
  {
    id: "cottage-warm",
    label: "Домик",
    background: "#c4a574",
    fill: createSolidBackgroundFill(),
  },
  {
    id: "night-solid",
    label: "Ночь",
    background: "#1a2433",
    fill: createSolidBackgroundFill(),
  },
  {
    id: "sunset-solid",
    label: "Закат",
    background: "#ff7a3d",
    fill: createSolidBackgroundFill(),
  },
  {
    id: "neon-stage",
    label: "Неон",
    background: "#2a1f4d",
    fill: createSolidBackgroundFill(),
  },
  {
    id: "grad-sky",
    label: "Небо → горизонт",
    background: "#4db8ff",
    fill: createGradientBackgroundFill("#4db8ff", "#c8f0ff", 0.72, 0.12),
  },
  {
    id: "grad-meadow",
    label: "Небо → трава",
    background: "#87ceeb",
    fill: createGradientBackgroundFill("#87ceeb", "#3f9b4a", 0.55, 0.04),
  },
  {
    id: "grad-sunset",
    label: "Закат",
    background: "#ffb347",
    fill: createGradientBackgroundFill("#ffb347", "#ff5c8a", 0.5, 0.1),
  },
  {
    id: "grad-night",
    label: "Ночное небо",
    background: "#1e3a5f",
    fill: createGradientBackgroundFill("#1e3a5f", "#12151c", 0.6, 0.08),
  },
  {
    id: "grad-room",
    label: "Комната",
    background: "#fff4e0",
    fill: createGradientBackgroundFill("#fff4e0", "#c4a574", 0.7, 0.05),
  },
  {
    id: "grad-neon",
    label: "Неон сцена",
    background: "#b14dff",
    fill: createGradientBackgroundFill("#b14dff", "#00e5ff", 0.5, 0.15),
  },
];

/** Default vivid fills for scene templates. */
export function templateBackgroundFor(templateId: string): {
  background: string;
  backgroundFill: SceneBackgroundFill;
} {
  switch (templateId) {
    case "dialogue":
      return applyBackgroundPreset(SCENE_BACKGROUND_PRESETS.find((p) => p.id === "grad-meadow")!);
    case "action":
      return applyBackgroundPreset(SCENE_BACKGROUND_PRESETS.find((p) => p.id === "grad-sunset")!);
    case "duo":
      return applySolidColor("#4db8ff");
    case "solo":
      return applySolidColor("#87b86a");
    case "empty":
    default:
      return applySolidColor("#5ecf9a");
  }
}

export const SWATCH_CATEGORY_LABELS: Record<SceneBackgroundSwatch["category"], string> = {
  sky: "Небо",
  grass: "Трава",
  sunset: "Закат",
  night: "Ночь",
  room: "Комната",
  neon: "Неон",
  warm: "Тёплые",
  cool: "Холодные",
};
