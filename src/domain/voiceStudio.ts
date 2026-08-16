/** Voice Studio — local Chatterbox Multilingual profiles & emotion presets. */

export const VOICE_STUDIO_SCHEMA_VERSION = 12;

/** Official Multilingual language ids (Chatterbox SUPPORTED_LANGUAGES). */
export const CHATTERBOX_LANGUAGES: Record<string, string> = {
  ar: "Arabic",
  da: "Danish",
  de: "German",
  el: "Greek",
  en: "English",
  es: "Spanish",
  fi: "Finnish",
  fr: "French",
  he: "Hebrew",
  hi: "Hindi",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  ms: "Malay",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ru: "Russian",
  sv: "Swedish",
  sw: "Swahili",
  tr: "Turkish",
  zh: "Chinese",
};

export const VOICE_EMOTIONS = [
  "neutral",
  "happy",
  "excited",
  "angry",
  "sad",
  "scared",
  "whisper",
  "shout",
  "surprised",
  "evil",
] as const;

export type VoiceEmotion = (typeof VOICE_EMOTIONS)[number];

export const VOICE_EMOTION_LABELS_RU: Record<VoiceEmotion, string> = {
  neutral: "Neutral",
  happy: "Happy",
  excited: "Excited",
  angry: "Angry",
  sad: "Sad",
  scared: "Scared",
  whisper: "Whisper",
  shout: "Shout",
  surprised: "Surprised",
  evil: "Evil",
};

/**
 * Real Chatterbox Multilingual generate() knobs only (exaggeration, cfg_weight).
 * Based on official tips: expressive → higher exaggeration (~0.7+), lower cfg (~0.3).
 */
export const EMOTION_CHATTERBOX_PARAMS: Record<VoiceEmotion, { exaggeration: number; cfgWeight: number }> = {
  neutral: { exaggeration: 0.5, cfgWeight: 0.5 },
  happy: { exaggeration: 0.65, cfgWeight: 0.35 },
  excited: { exaggeration: 0.75, cfgWeight: 0.3 },
  angry: { exaggeration: 0.75, cfgWeight: 0.3 },
  sad: { exaggeration: 0.4, cfgWeight: 0.5 },
  scared: { exaggeration: 0.7, cfgWeight: 0.35 },
  whisper: { exaggeration: 0.35, cfgWeight: 0.55 },
  shout: { exaggeration: 0.85, cfgWeight: 0.25 },
  surprised: { exaggeration: 0.7, cfgWeight: 0.35 },
  evil: { exaggeration: 0.8, cfgWeight: 0.3 },
};

export interface VoiceEmotionReference {
  emotion: VoiceEmotion;
  /** Project-relative path, e.g. Voices/Max/References/happy.wav */
  path: string;
}

export interface VoiceProfile {
  id: string;
  name: string;
  /** Chatterbox language_id, e.g. "ru" */
  languageId: string;
  /** Primary / neutral reference (project-relative). */
  referencePath: string;
  emotionReferences: VoiceEmotionReference[];
  /** Optional profile defaults (real Chatterbox params). */
  exaggeration?: number;
  cfgWeight?: number;
}

export interface VoiceTake {
  id: string;
  takeIndex: number;
  text: string;
  emotion: VoiceEmotion;
  languageId: string;
  voiceProfileId: string;
  actorId: string | null;
  /** Absolute or project-relative WAV path */
  audioPath: string;
  duration: number;
  createdAt: number;
  exaggeration: number;
  cfgWeight: number;
  /** Per-take forced-alignment lip sync (never share across takes). */
  lipSync?: import("./visemeSystem").LipSyncData | null;
  lipSyncStatus?: import("./visemeSystem").LipSyncGenStatus | null;
  lipSyncError?: string | null;
}

export function createEmptyVoiceProfile(
  partial: Partial<VoiceProfile> & Pick<VoiceProfile, "id" | "name" | "referencePath">,
): VoiceProfile {
  return {
    languageId: "ru",
    emotionReferences: [],
    ...partial,
  };
}

export function resolveEmotionReference(
  profile: VoiceProfile | null | undefined,
  emotion: VoiceEmotion,
): string | null {
  if (!profile) return null;
  const exact = profile.emotionReferences.find((item) => item.emotion === emotion);
  if (exact?.path) return exact.path;
  if (emotion !== "neutral") {
    const neutral = profile.emotionReferences.find((item) => item.emotion === "neutral");
    if (neutral?.path) return neutral.path;
  }
  return profile.referencePath || null;
}

export function resolveEmotionParams(
  emotion: VoiceEmotion,
  profile?: VoiceProfile | null,
): { exaggeration: number; cfgWeight: number } {
  const base = EMOTION_CHATTERBOX_PARAMS[emotion] ?? EMOTION_CHATTERBOX_PARAMS.neutral;
  return {
    exaggeration: profile?.exaggeration ?? base.exaggeration,
    cfgWeight: profile?.cfgWeight ?? base.cfgWeight,
  };
}

export function isVoiceEmotion(value: string): value is VoiceEmotion {
  return (VOICE_EMOTIONS as readonly string[]).includes(value);
}
