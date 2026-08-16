/**
 * Local speech settings — Piper neural voices + manual rate (no cloud, no Windows SAPI).
 * Custom realistic voices = user-added Piper .onnx models (offline).
 */
export interface SpeechVoiceInfo {
  name: string;
  culture: string;
  gender: string;
  /** Only Piper is supported (legacy "sapi" values are filtered out). */
  engine?: "piper" | "sapi";
  /** Absolute path to .onnx for Piper voices */
  modelPath?: string;
  /** User-imported voice */
  custom?: boolean;
}

export interface CustomPiperVoice {
  id: string;
  /** Shown in UI / voice list (usually "Piper …") */
  name: string;
  modelPath: string;
  culture: string;
  gender: string;
}

export interface SpeakOptions {
  /** Piper voice name */
  voiceName?: string;
  /** Rate -10..10 (negative = slower). Maps to Piper length_scale. */
  rate?: number;
  /** Pitch tweak label (kept for UI; Piper uses length_scale + ffmpeg semitones) */
  pitch?: string;
  /** Extra pitch shift in semitones via local ffmpeg */
  pitchSemitones?: number;
  /** Piper model path override */
  piperModel?: string;
}

export interface CartoonSpeechSettings {
  /** Global default rate -10..10 */
  rate: number;
  /** Prefer culture when auto-picking */
  preferCulture: string;
  /** Prefer Piper neural voices when installed (always true in practice — SAPI removed) */
  preferPiper: boolean;
  /** Speaker display name → voice name */
  voiceBySpeaker: Record<string, string>;
  /** Speaker → rate override */
  rateBySpeaker: Record<string, number>;
  /** Speaker → pitch label */
  pitchBySpeaker: Record<string, string>;
  /** Speaker → ffmpeg semitone shift */
  pitchSemitonesBySpeaker: Record<string, number>;
  /** User-imported Piper models (persisted) */
  customPiperModels: CustomPiperVoice[];
  /** Extra folders to scan for .onnx */
  extraPiperFolders: string[];
}

const SPEECH_STORAGE_KEY = "kcs-speech-settings-v1";

/** Distinct character “timbres” when only 1–2 voices exist. */
const PROSODY_PRESETS: Array<{ pitch: string; semitones: number; rateBias: number }> = [
  { pitch: "+6%", semitones: 2, rateBias: 0 },
  { pitch: "-10%", semitones: -3, rateBias: -1 },
  { pitch: "-4%", semitones: -1, rateBias: 1 },
  { pitch: "+10%", semitones: 3, rateBias: -2 },
  { pitch: "-14%", semitones: -4, rateBias: 0 },
  { pitch: "+2%", semitones: 1, rateBias: -1 },
];

export function createDefaultSpeechSettings(partial?: Partial<CartoonSpeechSettings>): CartoonSpeechSettings {
  return {
    rate: -3,
    preferCulture: "ru-RU",
    preferPiper: true,
    voiceBySpeaker: {},
    rateBySpeaker: {},
    pitchBySpeaker: {},
    pitchSemitonesBySpeaker: {},
    ...partial,
    customPiperModels: partial?.customPiperModels ?? [],
    extraPiperFolders: partial?.extraPiperFolders ?? [],
  };
}

export function clampSpeechRate(rate: number): number {
  if (!Number.isFinite(rate)) return -3;
  return Math.max(-10, Math.min(10, Math.round(rate)));
}

export function prosodyForSpeakerIndex(index: number): { pitch: string; semitones: number; rateBias: number } {
  return PROSODY_PRESETS[Math.abs(index) % PROSODY_PRESETS.length]!;
}

/** Infer culture/gender from Piper model basename (e.g. ru_RU-irina-medium). */
export function inferPiperMeta(baseName: string): { culture: string; gender: string } {
  const base = baseName.replace(/\.onnx$/i, "");
  const culture = /^ru/i.test(base) ? "ru-RU"
    : /^en/i.test(base) ? "en-US"
      : /^de/i.test(base) ? "de-DE"
        : /^es/i.test(base) ? "es-ES"
          : "und";
  const gender = /dmitri|ruslan|denis|male|alexander|ryan|alan|joe/i.test(base) ? "Male" : "Female";
  return { culture, gender };
}

export function piperVoiceNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.onnx$/i, "");
  return `Piper ${base}`;
}

/** Merge system voices + custom models. SAPI rows are dropped. */
export function mergeVoiceCatalog(
  systemVoices: SpeechVoiceInfo[],
  settings: CartoonSpeechSettings,
): SpeechVoiceInfo[] {
  const byKey = new Map<string, SpeechVoiceInfo>();
  const keyOf = (voice: SpeechVoiceInfo) => (voice.modelPath ? `m:${voice.modelPath}` : `n:${voice.name}`).toLowerCase();

  for (const voice of systemVoices) {
    if (voice.engine === "sapi") continue;
    byKey.set(keyOf(voice), { ...voice, engine: voice.engine ?? "piper" });
  }
  for (const custom of settings.customPiperModels) {
    const voice: SpeechVoiceInfo = {
      name: custom.name,
      culture: custom.culture,
      gender: custom.gender,
      engine: "piper",
      modelPath: custom.modelPath,
      custom: true,
    };
    byKey.set(keyOf(voice), voice);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** Pick distinct Piper voices for speakers (RU first). Never uses Windows SAPI. */
export function assignVoicesToSpeakers(
  speakers: string[],
  voices: SpeechVoiceInfo[],
  preferCulture = "ru-RU",
  _preferPiper = true,
): Record<string, string> {
  const culturePrefix = preferCulture.toLowerCase().slice(0, 2);
  const piper = voices.filter((voice) => voice.engine !== "sapi");
  const culturePool = piper.filter((voice) => voice.culture.toLowerCase().startsWith(culturePrefix));
  const pool = culturePool.length ? culturePool : piper;
  const map: Record<string, string> = {};
  speakers.forEach((speaker, index) => {
    const voice = pool[index % pool.length] ?? pool[0];
    if (voice) map[speaker] = voice.name;
  });
  return map;
}

/** Fill missing rate/pitch profiles so cast members sound different. */
export function assignProsodyToSpeakers(
  speakers: string[],
  settings: CartoonSpeechSettings,
): Pick<CartoonSpeechSettings, "rateBySpeaker" | "pitchBySpeaker" | "pitchSemitonesBySpeaker"> {
  const rateBySpeaker = { ...settings.rateBySpeaker };
  const pitchBySpeaker = { ...settings.pitchBySpeaker };
  const pitchSemitonesBySpeaker = { ...settings.pitchSemitonesBySpeaker };
  speakers.forEach((speaker, index) => {
    const preset = prosodyForSpeakerIndex(index);
    if (rateBySpeaker[speaker] === undefined) {
      rateBySpeaker[speaker] = clampSpeechRate(settings.rate + preset.rateBias);
    }
    if (!pitchBySpeaker[speaker]) pitchBySpeaker[speaker] = preset.pitch;
    if (pitchSemitonesBySpeaker[speaker] === undefined) {
      pitchSemitonesBySpeaker[speaker] = preset.semitones;
    }
  });
  return { rateBySpeaker, pitchBySpeaker, pitchSemitonesBySpeaker };
}

export function resolveSpeakOptions(
  speaker: string,
  settings: CartoonSpeechSettings,
  voices: SpeechVoiceInfo[] = [],
): SpeakOptions {
  const voiceName = settings.voiceBySpeaker[speaker] || undefined;
  const catalog = mergeVoiceCatalog(voices, settings);
  const voice = catalog.find((item) => item.name === voiceName)
    ?? settings.customPiperModels.find((item) => item.name === voiceName);
  const rate = settings.rateBySpeaker[speaker] ?? settings.rate;
  const modelPath = voice && "modelPath" in voice ? voice.modelPath : undefined;
  return {
    voiceName,
    rate,
    pitch: settings.pitchBySpeaker[speaker] || "-2%",
    pitchSemitones: settings.pitchSemitonesBySpeaker[speaker] ?? 0,
    piperModel: modelPath,
  };
}

/** Map rate (-10..10) → Piper length_scale (higher = slower). */
export function rateToPiperLengthScale(rate: number): number {
  const clamped = clampSpeechRate(rate);
  // 0 → 1.0, -10 → 1.55, +10 → 0.65
  return Math.max(0.55, Math.min(1.7, 1 - clamped * 0.045));
}

export function loadSpeechSettingsFromStorage(): CartoonSpeechSettings {
  try {
    if (typeof localStorage === "undefined") return createDefaultSpeechSettings();
    const raw = localStorage.getItem(SPEECH_STORAGE_KEY);
    if (!raw) return createDefaultSpeechSettings();
    const parsed = JSON.parse(raw) as Partial<CartoonSpeechSettings>;
    return createDefaultSpeechSettings({
      ...parsed,
      rate: clampSpeechRate(Number(parsed.rate ?? -3)),
      customPiperModels: Array.isArray(parsed.customPiperModels) ? parsed.customPiperModels.filter((item) => item?.modelPath && item?.name) : [],
      extraPiperFolders: Array.isArray(parsed.extraPiperFolders)
        ? [...new Set(parsed.extraPiperFolders.map(String).filter(Boolean))]
        : [],
      voiceBySpeaker: parsed.voiceBySpeaker && typeof parsed.voiceBySpeaker === "object" ? parsed.voiceBySpeaker : {},
      rateBySpeaker: parsed.rateBySpeaker && typeof parsed.rateBySpeaker === "object" ? parsed.rateBySpeaker : {},
      pitchBySpeaker: parsed.pitchBySpeaker && typeof parsed.pitchBySpeaker === "object" ? parsed.pitchBySpeaker : {},
      pitchSemitonesBySpeaker: parsed.pitchSemitonesBySpeaker && typeof parsed.pitchSemitonesBySpeaker === "object"
        ? parsed.pitchSemitonesBySpeaker
        : {},
    });
  } catch {
    return createDefaultSpeechSettings();
  }
}

export function saveSpeechSettingsToStorage(settings: CartoonSpeechSettings): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SPEECH_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private mode
  }
}

export function upsertCustomPiperVoice(
  settings: CartoonSpeechSettings,
  voice: Omit<CustomPiperVoice, "id"> & { id?: string },
): CartoonSpeechSettings {
  const id = voice.id ?? `pv-${Date.now().toString(36)}`;
  const next: CustomPiperVoice = {
    id,
    name: voice.name,
    modelPath: voice.modelPath,
    culture: voice.culture,
    gender: voice.gender,
  };
  const list = settings.customPiperModels.filter((item) => item.modelPath !== next.modelPath && item.name !== next.name);
  return { ...settings, customPiperModels: [...list, next] };
}

export function removeCustomPiperVoice(settings: CartoonSpeechSettings, id: string): CartoonSpeechSettings {
  return {
    ...settings,
    customPiperModels: settings.customPiperModels.filter((item) => item.id !== id),
  };
}
