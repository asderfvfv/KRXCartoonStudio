/** Cartoon viseme lip-sync: forced-alignment cues + mouth set mapping. */

export const AUTO_LIPSYNC_SCHEMA_VERSION = 13;

export const CARTOON_VISEMES = [
  "REST",
  "A",
  "E",
  "I",
  "O",
  "U",
  "MBP",
  "FV",
  "L",
  "WQ",
  "CONSONANT",
  "CHJSH",
] as const;

export type CartoonVisemeId = (typeof CARTOON_VISEMES)[number];

export const BASIC_MOUTH_SHAPES = ["REST", "OPEN", "WIDE", "ROUND", "CLOSED"] as const;
export type BasicMouthShape = (typeof BASIC_MOUTH_SHAPES)[number];

export type MouthLipSyncMode = "disabled" | "basic" | "advanced" | "simple";

export type LipSyncGenStatus = "not_generated" | "processing" | "ready" | "outdated" | "failed";

export interface VisemeCue {
  time: number;
  duration: number;
  viseme: CartoonVisemeId;
  confidence?: number;
  token?: string;
  /** Manual edit flag — protects against auto overwrite. */
  manual?: boolean;
}

export interface LipSyncData {
  version: number;
  audioPath: string;
  text: string;
  duration: number;
  cues: VisemeCue[];
  engine?: string;
  language?: string;
  /** Hash/fingerprint of audioPath+text used to detect outdated. */
  sourceKey?: string;
  /** True when user edited cues after auto gen. */
  manuallyEdited?: boolean;
}

export interface MouthSetDefinition {
  mode: MouthLipSyncMode;
  /** Advanced: cartoon viseme → partId */
  advancedMapping?: Partial<Record<CartoonVisemeId, string>>;
  /** Basic: shape → partId */
  basicMapping?: Partial<Record<BasicMouthShape, string>>;
  /** Primary single Mouth part id (simple/basic scale fallback). */
  primaryMouthPartId?: string | null;
  anticipation?: number;
  minCueDuration?: number;
}

export const VISEME_TO_BASIC: Record<CartoonVisemeId, BasicMouthShape> = {
  REST: "REST",
  A: "OPEN",
  E: "WIDE",
  I: "WIDE",
  O: "ROUND",
  U: "ROUND",
  MBP: "CLOSED",
  FV: "CLOSED",
  L: "WIDE",
  WQ: "ROUND",
  CONSONANT: "CLOSED",
  CHJSH: "WIDE",
};

/** Scale deltas when only one Mouth sprite exists (basic/simple). */
export const BASIC_SHAPE_POSE: Record<BasicMouthShape, { open: number; scaleX: number; scaleY: number; rotation: number }> = {
  REST: { open: 0, scaleX: 0, scaleY: 0, rotation: 0 },
  CLOSED: { open: 0.06, scaleX: 0.08, scaleY: -0.42, rotation: 0 },
  OPEN: { open: 0.96, scaleX: -0.06, scaleY: 0.92, rotation: 0 },
  WIDE: { open: 0.58, scaleX: 0.28, scaleY: 0.32, rotation: 0 },
  ROUND: { open: 0.72, scaleX: -0.32, scaleY: 0.58, rotation: 3 },
};

const OPEN_A = new Set([..."аяaáàâäã"]);
const ROUND_O = new Set([..."оёoóòôöõ"]);
const ROUND_U = new Set([..."уюuúùûüw"]);
const WIDE_E = new Set([..."еэeéèêë"]);
const WIDE_I = new Set([..."иыiíìîïyý"]);
const MBP = new Set([..."мбпmbp"]);
const FV = new Set([..."фвfv"]);
const LSET = new Set([..."лl"]);
const CHJSH = new Set([..."чжшщ"]);

export function charToCartoonViseme(raw: string): CartoonVisemeId {
  const ch = (raw || "").toLowerCase();
  if (!ch || /\s/.test(ch) || /[.,!?;:…—–\-'«»"()]/.test(ch)) return "REST";
  if (MBP.has(ch)) return "MBP";
  if (FV.has(ch)) return "FV";
  if (LSET.has(ch)) return "L";
  if (CHJSH.has(ch) || ch === "дж") return "CHJSH";
  if (OPEN_A.has(ch)) return "A";
  if (ROUND_O.has(ch)) return "O";
  if (ROUND_U.has(ch)) return "U";
  if (WIDE_E.has(ch)) return "E";
  if (WIDE_I.has(ch)) return "I";
  if (ch === "q" || ch === "w") return "WQ";
  if (/[a-zа-яё]/i.test(ch)) return "CONSONANT";
  return "REST";
}

export function lipSyncSourceKey(audioPath: string, text: string): string {
  return `${audioPath.trim()}||${text.trim()}`;
}

export function isLipSyncOutdated(data: LipSyncData | null | undefined, audioPath: string, text: string): boolean {
  if (!data?.cues?.length) return true;
  const key = data.sourceKey ?? lipSyncSourceKey(data.audioPath, data.text);
  return key !== lipSyncSourceKey(audioPath, text);
}

export function createEmptyMouthSet(partial?: Partial<MouthSetDefinition>): MouthSetDefinition {
  return {
    mode: "basic",
    advancedMapping: {},
    basicMapping: {},
    primaryMouthPartId: null,
    anticipation: 0.03,
    minCueDuration: 0.045,
    ...partial,
  };
}

export function createEmptyLipSyncData(
  partial: Partial<LipSyncData> & Pick<LipSyncData, "audioPath" | "text" | "duration">,
): LipSyncData {
  return {
    version: 1,
    cues: [],
    sourceKey: lipSyncSourceKey(partial.audioPath, partial.text),
    manuallyEdited: false,
    ...partial,
  };
}

export function smoothVisemeCues(
  cues: VisemeCue[],
  options?: { minDuration?: number },
): VisemeCue[] {
  const minDuration = options?.minDuration ?? 0.045;
  if (!cues.length) return [];
  const merged: VisemeCue[] = [];
  for (const cue of cues) {
    const dur = Math.max(0, cue.duration);
    if (dur < minDuration && cue.viseme !== "REST" && merged.length) {
      merged[merged.length - 1]!.duration += dur;
      continue;
    }
    const last = merged[merged.length - 1];
    if (last && last.viseme === cue.viseme && !cue.manual && !last.manual) {
      last.duration += dur;
      continue;
    }
    merged.push({ ...cue, duration: dur });
  }
  let t = 0;
  return merged.map((cue) => {
    const next = { ...cue, time: Number(t.toFixed(4)), duration: Number(Math.max(0.02, cue.duration).toFixed(4)) };
    t += next.duration;
    return next;
  });
}

export function sampleVisemeCue(cues: VisemeCue[] | undefined, localTime: number): VisemeCue | null {
  if (!cues?.length) return null;
  const t = Math.max(0, localTime);
  for (const cue of cues) {
    const end = cue.time + Math.max(0.01, cue.duration);
    if (t >= cue.time && t < end) return cue;
  }
  const last = cues[cues.length - 1]!;
  if (t >= last.time) return last;
  return cues[0] ?? null;
}

export function resolveMouthPartId(
  mouthSet: MouthSetDefinition | null | undefined,
  viseme: CartoonVisemeId,
): { partId: string | null; basicShape: BasicMouthShape; useScaleFallback: boolean } {
  const set = mouthSet ?? createEmptyMouthSet();
  const basicShape = VISEME_TO_BASIC[viseme] ?? "REST";
  if (set.mode === "disabled") {
    return { partId: null, basicShape: "REST", useScaleFallback: false };
  }
  if (set.mode === "advanced") {
    const partId = set.advancedMapping?.[viseme]
      ?? set.advancedMapping?.[viseme === "REST" ? "REST" : "A"]
      ?? set.primaryMouthPartId
      ?? null;
    // If mapping points to different parts, switch visibility; else scale fallback
    const mappedCount = Object.values(set.advancedMapping ?? {}).filter(Boolean).length;
    return { partId, basicShape, useScaleFallback: mappedCount <= 1 };
  }
  if (set.mode === "basic") {
    const partId = set.basicMapping?.[basicShape]
      ?? set.basicMapping?.REST
      ?? set.primaryMouthPartId
      ?? null;
    const mappedCount = Object.values(set.basicMapping ?? {}).filter(Boolean).length;
    return { partId, basicShape, useScaleFallback: mappedCount <= 1 };
  }
  // simple
  return { partId: set.primaryMouthPartId ?? null, basicShape: basicShape === "REST" ? "REST" : "OPEN", useScaleFallback: true };
}

export function fallbackVisemeFromAmplitude(amplitude: number, noiseGate = 0.08): CartoonVisemeId {
  if (amplitude < noiseGate) return "REST";
  return "A";
}

export function isCartoonViseme(value: string): value is CartoonVisemeId {
  return (CARTOON_VISEMES as readonly string[]).includes(value);
}
