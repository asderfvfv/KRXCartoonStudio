/**
 * Local phoneme → viseme lip-sync for dialogue text (RU/EN).
 * Timed across the line duration; WAV amplitude (Piper) gates/scales openness.
 */
export type VisemeId = "rest" | "closed" | "wide" | "open" | "round" | "mid";

export interface VisemePose {
  /** 0..1 mouth openness for meters / intensity. */
  open: number;
  /** Additive scaleX on Mouth (relative to 1). */
  scaleX: number;
  /** Additive scaleY on Mouth (relative to 1). */
  scaleY: number;
  rotation: number;
}

export interface VisemeSample {
  viseme: VisemeId;
  pose: VisemePose;
  /** Normalized position inside the active letter span 0..1. */
  letterProgress: number;
}

export interface VisemeSpan {
  start: number;
  end: number;
  viseme: VisemeId;
  char: string;
}

/** Preston-Blair–like shapes as scale deltas on a single Mouth PNG. */
export const VISEME_POSES: Record<VisemeId, VisemePose> = {
  rest: { open: 0, scaleX: 0, scaleY: 0, rotation: 0 },
  closed: { open: 0.06, scaleX: 0.08, scaleY: -0.42, rotation: 0 },
  wide: { open: 0.58, scaleX: 0.28, scaleY: 0.32, rotation: 0 },
  open: { open: 0.96, scaleX: -0.06, scaleY: 0.92, rotation: 0 },
  round: { open: 0.72, scaleX: -0.32, scaleY: 0.58, rotation: 3 },
  mid: { open: 0.38, scaleX: 0.04, scaleY: 0.22, rotation: 0 },
};

const OPEN_CHARS = new Set([..."аяaáàâäã"]);
const ROUND_CHARS = new Set([..."оуёюyoóòôöõuúùûüw"]);
const WIDE_CHARS = new Set([..."иыеэи́е́iíìîïeéèêëyý"]);
const CLOSED_CHARS = new Set([..."мпбmbp"]);
const MID_NARROW = new Set([..."фвfv"]);

function charToViseme(raw: string): VisemeId {
  const ch = raw.toLowerCase();
  if (!ch || /\s/.test(ch)) return "rest";
  if (/[.,!?;:…—–\-'"]/.test(ch)) return "rest";
  if (OPEN_CHARS.has(ch)) return "open";
  if (ROUND_CHARS.has(ch)) return "round";
  if (WIDE_CHARS.has(ch)) return "wide";
  if (CLOSED_CHARS.has(ch)) return "closed";
  if (MID_NARROW.has(ch)) return "mid";
  if (/[0-9]/.test(ch)) return "mid";
  // Other consonants
  if (/[a-zа-яё]/i.test(ch)) return "mid";
  return "rest";
}

/** Weight for how long a token holds in the timeline. */
function tokenWeight(ch: string, viseme: VisemeId): number {
  if (viseme === "rest") {
    if (/\s/.test(ch)) return 0.35;
    if (/[.,!?;:…]/.test(ch)) return 0.85;
    return 0.45;
  }
  if (viseme === "open" || viseme === "round") return 1.15;
  if (viseme === "closed") return 0.75;
  return 1;
}

/**
 * Build timed viseme spans for a dialogue line (local seconds 0..duration).
 * Letters are paced across the spoken duration (Piper/WAV length when synced).
 */
export function buildVisemeTimeline(text: string, duration: number): VisemeSpan[] {
  const safeDuration = Math.max(0.05, duration);
  const chars = [...(text || "")];
  if (!chars.length) {
    return [{ start: 0, end: safeDuration, viseme: "mid", char: "" }];
  }

  const tokens = chars.map((ch) => {
    const viseme = charToViseme(ch);
    return { ch, viseme, weight: tokenWeight(ch, viseme) };
  });
  const totalWeight = tokens.reduce((sum, item) => sum + item.weight, 0) || 1;
  const spans: VisemeSpan[] = [];
  let cursor = 0;
  for (const token of tokens) {
    const len = (token.weight / totalWeight) * safeDuration;
    const start = cursor;
    const end = Math.min(safeDuration, cursor + len);
    spans.push({ start, end, viseme: token.viseme, char: token.ch });
    cursor = end;
  }
  if (spans.length) {
    spans[spans.length - 1]!.end = safeDuration;
  }
  return spans;
}

export function sampleVisemeTimeline(spans: VisemeSpan[], localTime: number): VisemeSample {
  if (!spans.length) {
    return { viseme: "rest", pose: { ...VISEME_POSES.rest }, letterProgress: 0 };
  }
  const t = Math.max(0, localTime);
  let span = spans[0]!;
  for (const item of spans) {
    if (t >= item.start && t < item.end) {
      span = item;
      break;
    }
    if (t >= item.end) span = item;
  }
  const width = Math.max(1e-4, span.end - span.start);
  const letterProgress = Math.max(0, Math.min(1, (t - span.start) / width));
  // Soften edges inside a letter so jaw doesn't snap every glyph.
  const edge = letterProgress < 0.15
    ? letterProgress / 0.15
    : letterProgress > 0.85
      ? (1 - letterProgress) / 0.15
      : 1;
  const base = VISEME_POSES[span.viseme];
  const ease = 0.55 + 0.45 * edge;
  return {
    viseme: span.viseme,
    letterProgress,
    pose: {
      open: base.open * ease,
      scaleX: base.scaleX * ease,
      scaleY: base.scaleY * ease,
      rotation: base.rotation * ease,
    },
  };
}

export function sampleVisemeFromText(text: string, duration: number, localTime: number): VisemeSample {
  return sampleVisemeTimeline(buildVisemeTimeline(text, duration), localTime);
}

/**
 * Combine phoneme pose with WAV amplitude (Piper export).
 * Quiet segments close the mouth; loud segments keep viseme shape.
 */
export function applyAmplitudeToViseme(
  sample: VisemeSample,
  amplitude: number | null,
  options?: { noiseGate?: number; sensitivity?: number },
): VisemeSample {
  if (amplitude == null) return sample;
  const gate = options?.noiseGate ?? 0.08;
  const sensitivity = options?.sensitivity ?? 1;
  const amp = Math.max(0, Math.min(1, amplitude * sensitivity));
  if (amp <= gate) {
    return {
      viseme: "rest",
      letterProgress: sample.letterProgress,
      pose: { open: 0, scaleX: 0, scaleY: 0, rotation: 0 },
    };
  }
  const loud = Math.max(0, Math.min(1, (amp - gate) / Math.max(0.05, 1 - gate)));
  const mix = 0.35 + 0.65 * loud;
  return {
    ...sample,
    pose: {
      open: Math.max(0, Math.min(1, sample.pose.open * mix + loud * 0.12)),
      scaleX: sample.pose.scaleX * mix,
      scaleY: sample.pose.scaleY * (0.4 + 0.6 * mix),
      rotation: sample.pose.rotation * mix,
    },
  };
}

export function visemeLabelRu(id: VisemeId): string {
  switch (id) {
    case "rest": return "пауза";
    case "closed": return "М/П/Б";
    case "wide": return "И/Е";
    case "open": return "А";
    case "round": return "О/У";
    case "mid": return "согласн.";
    default: return id;
  }
}
