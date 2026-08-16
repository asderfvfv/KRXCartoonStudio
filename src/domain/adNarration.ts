/**
 * Natural narration for ads & cartoons — Chatterbox first, then Piper. Windows SAPI is disabled.
 */
import { resolveEmotionParams, type VoiceProfile } from "./voiceStudio";
import type { SpeakOptions, SpeechVoiceInfo } from "./speechSettings";

export type AdVoiceMode = "natural" | "piper" | "off";

export interface AdVoicePick {
  mode: AdVoiceMode;
  label: string;
  detail: string;
}

export function recommendAdVoiceMode(options: {
  chatterboxInstalled: boolean;
  hasVoiceProfile: boolean;
  hasPiper: boolean;
}): AdVoicePick {
  if (options.chatterboxInstalled) {
    return {
      mode: "natural",
      label: "Живой голос (Chatterbox)",
      detail: options.hasVoiceProfile
        ? "Натуральный диктор по вашему Voice-профилю (excited)."
        : "Натуральный диктор Chatterbox. Для своего тембра добавьте профиль в Voice.",
    };
  }
  if (options.hasPiper) {
    return {
      mode: "piper",
      label: "Piper (нейронный)",
      detail: "Нейронный Piper. Для совсем живого тембра поставьте voice-engine (Chatterbox).",
    };
  }
  return {
    mode: "off",
    label: "Без озвучки",
    detail: "Робот Windows отключён. Поставьте Chatterbox (Voice) или Piper (setup-piper.ps1).",
  };
}

export function pickPiperVoice(voices: SpeechVoiceInfo[]): SpeechVoiceInfo | null {
  const piper = voices.filter((voice) => voice.engine === "piper");
  const ru = piper.find((voice) => /ru/i.test(voice.culture || "") || /ru/i.test(voice.name));
  return ru ?? piper[0] ?? null;
}

export function piperSpeakOptions(voice: SpeechVoiceInfo | null): SpeakOptions {
  return {
    voiceName: voice?.name,
    piperModel: voice?.modelPath,
    // Slightly slower / calmer — less “cartoon robot”
    rate: -2,
    pitch: "-2%",
    pitchSemitones: 0,
  };
}

export function adNarrationEmotion(): "excited" {
  return "excited";
}

export function chatterboxParamsForAd(profile: VoiceProfile | null | undefined) {
  return resolveEmotionParams(adNarrationEmotion(), profile);
}

/** One short punchy line per scene reads better with natural TTS. */
export function compressAdCaption(text: string, maxLen = 72): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > 24 ? cut.slice(0, at) : cut).trim()}…`;
}
