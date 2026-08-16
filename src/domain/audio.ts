import {
  applyAmplitudeToViseme,
  sampleVisemeFromText,
  type VisemeId,
  type VisemePose,
  type VisemeSample,
} from "./phonemeLipSync";
import {
  BASIC_SHAPE_POSE,
  VISEME_TO_BASIC,
  sampleVisemeCue,
  type CartoonVisemeId,
} from "./visemeSystem";

export const AUDIO_SCHEMA_VERSION = 3;
export const LIPSYNC_SCHEMA_VERSION = 4;
/** Lip sync polish + richer subtitle styling / SRT. */
export const LIPSUB_POLISH_SCHEMA_VERSION = 10;

export type AudioMediaType = "audio/wav" | "audio/mpeg" | "audio/ogg" | "audio/mp4" | "audio/flac";

export function audioMediaTypeFromPath(filePath: string): AudioMediaType {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".m4a") || lower.endsWith(".mp4")) return "audio/mp4";
  if (lower.endsWith(".flac")) return "audio/flac";
  return "audio/mpeg";
}

const AUDIO_FILE_EXT = /\.(mp3|wav|ogg|m4a|flac)$/i;

/** If the user picked an MP3/WAV file, take its parent folder. Folder paths stay as-is. */
export function folderFromAudioPath(target: string): string {
  const trimmed = target.trim();
  if (!trimmed || !AUDIO_FILE_EXT.test(trimmed)) return trimmed;
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  return cut <= 0 ? trimmed : trimmed.slice(0, cut);
}

export interface AudioAssetDefinition {
  id: string;
  name: string;
  path: string;
  mediaType: AudioMediaType;
  duration: number;
}

export interface SceneAudioTrack {
  id: string;
  name: string;
  assetId: string;
  startTime: number;
  trimStart: number;
  duration: number;
  volume: number;
  muted: boolean;
}

export interface DialogueLine {
  id: string;
  actorId: string | null;
  text: string;
  startTime: number;
  duration: number;
  audioTrackId?: string | null;
  /** Voice Studio / Chatterbox metadata (optional; old projects omit these). */
  voiceProfileId?: string | null;
  emotion?: string | null;
  audioPath?: string | null;
  takeIndex?: number | null;
  takeId?: string | null;
  /** Forced-alignment lip sync for this dialogue take/clip. */
  lipSync?: import("./visemeSystem").LipSyncData | null;
  lipSyncStatus?: import("./visemeSystem").LipSyncGenStatus | null;
}

export interface SubtitleSettings {
  enabled: boolean;
  showInExport: boolean;
  fontSize: number;
  bottomOffset: number;
  textColor: string;
  backgroundEnabled: boolean;
  backgroundColor: string;
  backgroundOpacity: number;
  maxWidthPct: number;
  showSpeaker: boolean;
  maxCharsPerLine: number;
}

export interface LipSyncSettings {
  /** Apply mouth motion from dialogues. */
  enabled: boolean;
  /** Prefer WAV amplitude envelope when linked audio is available. */
  preferAmplitude: boolean;
  /** 0.25…3 — scales amplitude mouth open. */
  sensitivity: number;
  /** 0…1 — average envelope over a short window (deterministic). */
  smoothing: number;
  /** 0…0.5 — amplitudes below this become closed mouth. */
  noiseGate: number;
  /** When no WAV amplitude / phonemes off — legacy vowel pulse from text. */
  textDriven: boolean;
  /**
   * Phoneme/viseme shapes from dialogue text (RU/EN), timed to line duration.
   * With linked Piper/WAV + preferAmplitude, amplitude gates quiet gaps.
   */
  phonemeDriven: boolean;
}

export function createDefaultSubtitleSettings(partial?: Partial<SubtitleSettings>): SubtitleSettings {
  return {
    enabled: true,
    showInExport: true,
    fontSize: 42,
    bottomOffset: 64,
    textColor: "#ffffff",
    backgroundEnabled: true,
    backgroundColor: "#000000",
    backgroundOpacity: 0.62,
    maxWidthPct: 0.85,
    showSpeaker: false,
    maxCharsPerLine: 42,
    ...partial,
  };
}

export function createDefaultLipSyncSettings(partial?: Partial<LipSyncSettings>): LipSyncSettings {
  return {
    enabled: true,
    preferAmplitude: true,
    sensitivity: 1,
    smoothing: 0.45,
    noiseGate: 0.08,
    textDriven: true,
    phonemeDriven: true,
    ...partial,
  };
}

export function createEmptyAudioTrack(partial: Partial<SceneAudioTrack> & Pick<SceneAudioTrack, "id" | "assetId" | "name">): SceneAudioTrack {
  return {
    startTime: 0,
    trimStart: 0,
    duration: Math.max(0.1, partial.duration ?? 1),
    volume: 1,
    muted: false,
    ...partial,
  };
}

export function createEmptyDialogue(partial: Partial<DialogueLine> & Pick<DialogueLine, "id" | "text">): DialogueLine {
  return {
    actorId: null,
    startTime: 0,
    duration: Math.max(0.2, partial.duration ?? 2),
    audioTrackId: null,
    ...partial,
  };
}

/** Active dialogues overlapping time (inclusive start, exclusive end unless zero-length). */
export function getActiveDialogues(dialogues: DialogueLine[] | undefined, timeSeconds: number): DialogueLine[] {
  if (!dialogues?.length) return [];
  return dialogues.filter((line) => {
    const end = line.startTime + Math.max(0.05, line.duration);
    return timeSeconds >= line.startTime && timeSeconds < end;
  });
}

export function actorDisplayName(
  actorId: string | null | undefined,
  actors?: Array<{ id: string; name: string }> | null,
): string | null {
  if (!actorId || !actors?.length) return null;
  return actors.find((actor) => actor.id === actorId)?.name ?? null;
}

export function formatDialogueCaption(
  line: DialogueLine,
  options?: { showSpeaker?: boolean; actors?: Array<{ id: string; name: string }> | null },
): string {
  const text = line.text.trim();
  if (!text) return "";
  if (!options?.showSpeaker) return text;
  const speaker = actorDisplayName(line.actorId, options.actors);
  return speaker ? `${speaker}: ${text}` : text;
}

export function getActiveSubtitleText(
  dialogues: DialogueLine[] | undefined,
  timeSeconds: number,
  options?: { showSpeaker?: boolean; actors?: Array<{ id: string; name: string }> | null },
): string | null {
  const active = getActiveDialogues(dialogues, timeSeconds);
  if (!active.length) return null;
  const parts = active.map((line) => formatDialogueCaption(line, options)).filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

/** Wrap a caption into lines by approximate character budget (word-aware). */
export function wrapSubtitleLines(text: string, maxCharsPerLine = 42): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const limit = Math.max(12, Math.min(120, Math.round(maxCharsPerLine)));
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (word.length <= limit) {
      current = word;
    } else {
      for (let i = 0; i < word.length; i += limit) lines.push(word.slice(i, i + limit));
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function formatSrtTimestamp(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/** Build a local SubRip (.srt) string from scene dialogues. */
export function buildSrtFromDialogues(
  dialogues: DialogueLine[] | undefined,
  options?: { showSpeaker?: boolean; actors?: Array<{ id: string; name: string }> | null },
): string {
  const lines = [...(dialogues ?? [])]
    .filter((line) => line.text.trim())
    .sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  return lines.map((line, index) => {
    const start = formatSrtTimestamp(line.startTime);
    const end = formatSrtTimestamp(line.startTime + Math.max(0.05, line.duration));
    const caption = wrapSubtitleLines(formatDialogueCaption(line, options), 42).join("\n");
    return `${index + 1}\n${start} --> ${end}\n${caption}\n`;
  }).join("\n");
}

/** Align dialogue start/duration to a linked audio track. */
export function syncDialogueToTrack(line: DialogueLine, track: SceneAudioTrack | undefined): DialogueLine {
  if (!track) return line;
  return {
    ...line,
    startTime: Math.max(0, track.startTime),
    duration: Math.max(0.1, track.duration),
  };
}

/**
 * Map dialogue local time → audio asset time using track start/trim.
 * Returns null when outside the audible track window.
 */
export function dialogueLocalToAssetTime(
  line: DialogueLine,
  track: SceneAudioTrack,
  localTime: number,
): number | null {
  const sceneTime = line.startTime + localTime;
  const assetTime = sceneTime - track.startTime + (track.trimStart ?? 0);
  if (assetTime < -0.02) return null;
  if (assetTime > track.duration + (track.trimStart ?? 0) + 0.05) return null;
  return Math.max(0, assetTime);
}

export interface MouthOpenOptions {
  /** If set, only dialogues for this actor (or actorId=null) contribute. */
  actorId?: string | null;
  lipSync?: LipSyncSettings;
  /**
   * Optional WAV amplitude sampler for a dialogue at local dialogue time (seconds from line start).
   * Return null to fall back to dialogue pulse / phonemes-only.
   */
  resolveAmplitude?(dialogue: DialogueLine, localTime: number): number | null;
}

export interface MouthPoseResult {
  open: number;
  viseme: VisemeId;
  pose: VisemePose;
  cartoonViseme?: CartoonVisemeId;
  label?: string;
  dialogueId?: string;
}

function isOpenMouthChar(ch: string): boolean {
  return "аеёиоуыэюяaeiouyа́е́и́о́у́ы́э́ю́я́".includes(ch);
}

function isClosedMouthChar(ch: string): boolean {
  return "мпбфвmbpvfw".includes(ch);
}

/** Text-shaped mouth pulse (vowels open, bilabials closed). Local-only heuristic. */
export function dialogueTextPulse(local: number, duration: number, text: string): number {
  const safeDuration = Math.max(0.05, duration);
  const fadeIn = Math.min(1, local / 0.08);
  const fadeOut = Math.min(1, Math.max(0, safeDuration - local) / 0.1);
  const chars = [...text.replace(/\s+/g, "")];
  if (!chars.length) {
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin(local * Math.PI * 6));
    return pulse * fadeIn * fadeOut;
  }
  const t = Math.min(0.999, Math.max(0, local) / safeDuration);
  const index = Math.min(chars.length - 1, Math.floor(t * chars.length));
  const ch = chars[index]!.toLowerCase();
  const open = isOpenMouthChar(ch) ? 0.92 : isClosedMouthChar(ch) ? 0.12 : 0.48;
  const micro = 0.85 + 0.15 * Math.abs(Math.sin(local * Math.PI * 8));
  return open * micro * fadeIn * fadeOut;
}

function dialoguePulse(local: number, duration: number): number {
  const pulse = 0.35 + 0.65 * Math.abs(Math.sin(local * Math.PI * 6));
  const fadeIn = Math.min(1, local / 0.08);
  const fadeOut = Math.min(1, Math.max(0, duration - local) / 0.1);
  return pulse * fadeIn * fadeOut;
}

function lineEnvelope(local: number, duration: number): number {
  const fadeIn = Math.min(1, local / 0.06);
  const fadeOut = Math.min(1, Math.max(0, duration - local) / 0.09);
  return fadeIn * fadeOut;
}

function sampleLineViseme(
  line: DialogueLine,
  local: number,
  settings: LipSyncSettings,
  resolveAmplitude?: MouthOpenOptions["resolveAmplitude"],
): VisemeSample {
  let sample = sampleVisemeFromText(line.text, line.duration, local);
  const envelope = lineEnvelope(local, line.duration);
  sample = {
    ...sample,
    pose: {
      open: sample.pose.open * envelope,
      scaleX: sample.pose.scaleX * envelope,
      scaleY: sample.pose.scaleY * envelope,
      rotation: sample.pose.rotation * envelope,
    },
  };
  if (settings.preferAmplitude && resolveAmplitude) {
    const amplitude = resolveAmplitude(line, local);
    if (amplitude != null) {
      sample = applyAmplitudeToViseme(sample, amplitude, {
        noiseGate: settings.noiseGate,
        sensitivity: settings.sensitivity,
      });
    }
  }
  return sample;
}

/**
 * Phoneme/viseme mouth pose for the loudest active dialogue of an actor.
 * Prefer forced-alignment LipSyncData cues when present; else text phonemes / amplitude.
 */
export function evaluateMouthPose(
  timeSeconds: number,
  dialogues: DialogueLine[] | undefined,
  options?: MouthOpenOptions,
): MouthPoseResult {
  const rest: MouthPoseResult = {
    open: 0,
    viseme: "rest",
    pose: { open: 0, scaleX: 0, scaleY: 0, rotation: 0 },
    cartoonViseme: "REST",
  };
  const settings = createDefaultLipSyncSettings(options?.lipSync);
  if (!settings.enabled) return rest;
  const active = getActiveDialogues(dialogues, timeSeconds).filter((line) => {
    if (options?.actorId === undefined) return true;
    return line.actorId == null || line.actorId === options.actorId;
  });
  if (!active.length) return rest;

  // Prefer forced-alignment cues (Take LipSyncData)
  for (const line of active) {
    if (line.lipSyncStatus === "ready" && line.lipSync?.cues?.length) {
      const local = Math.max(0, timeSeconds - line.startTime);
      const cue = sampleVisemeCue(line.lipSync.cues, local);
      if (cue) {
        const basic = VISEME_TO_BASIC[cue.viseme] ?? "REST";
        const pose = BASIC_SHAPE_POSE[basic];
        let open = pose.open;
        if (settings.preferAmplitude && options?.resolveAmplitude) {
          const amplitude = options.resolveAmplitude(line, local);
          if (amplitude != null && amplitude <= settings.noiseGate && cue.viseme !== "MBP") {
            open = 0;
          } else if (amplitude != null) {
            open = Math.max(open * 0.35, open * Math.min(1, amplitude * settings.sensitivity));
          }
        }
        const legacyViseme: VisemeId =
          basic === "OPEN" ? "open"
            : basic === "WIDE" ? "wide"
              : basic === "ROUND" ? "round"
                : basic === "CLOSED" ? "closed"
                  : "rest";
        return {
          open,
          viseme: legacyViseme,
          pose: { ...pose, open },
          cartoonViseme: cue.viseme,
          label: cue.viseme,
          dialogueId: line.id,
        };
      }
    }
  }

  if (!settings.phonemeDriven) {
    const open = evaluateMouthOpenLegacy(timeSeconds, active, settings, options?.resolveAmplitude);
    return {
      open,
      viseme: open > 0.55 ? "open" : open > 0.2 ? "mid" : open > 0.05 ? "closed" : "rest",
      pose: { open, scaleX: open * -0.12, scaleY: open * 0.75, rotation: 0 },
      cartoonViseme: open > settings.noiseGate ? "A" : "REST",
    };
  }

  let best: VisemeSample | null = null;
  let bestLine: DialogueLine | null = null;
  for (const line of active) {
    const local = Math.max(0, timeSeconds - line.startTime);
    const sample = sampleLineViseme(line, local, settings, options?.resolveAmplitude);
    if (!best || sample.pose.open > best.pose.open) {
      best = sample;
      bestLine = line;
    }
  }
  if (!best) return rest;
  return {
    open: Math.max(0, Math.min(1, best.pose.open)),
    viseme: best.viseme,
    pose: best.pose,
    label: best.viseme,
    dialogueId: bestLine?.id,
  };
}

/** Legacy amplitude / text-pulse path (phonemeDriven=false). */
function evaluateMouthOpenLegacy(
  timeSeconds: number,
  active: DialogueLine[],
  settings: LipSyncSettings,
  resolveAmplitude?: MouthOpenOptions["resolveAmplitude"],
): number {
  let open = 0;
  for (const line of active) {
    const local = Math.max(0, timeSeconds - line.startTime);
    let amount = settings.textDriven
      ? dialogueTextPulse(local, line.duration, line.text)
      : dialoguePulse(local, line.duration);
    if (settings.preferAmplitude && resolveAmplitude) {
      const amplitude = resolveAmplitude(line, local);
      if (amplitude != null) {
        const gated = amplitude <= settings.noiseGate ? 0 : amplitude;
        const fadeIn = Math.min(1, local / 0.05);
        const fadeOut = Math.min(1, Math.max(0, line.duration - local) / 0.08);
        amount = Math.max(gated > 0 ? 0.04 : 0, gated) * fadeIn * fadeOut;
      }
    }
    open = Math.max(open, amount);
  }
  return Math.max(0, Math.min(1, open));
}

/**
 * Local lip-sync mouth open 0..1.
 * Default: phoneme visemes (+ WAV gate when Piper/linked WAV). Legacy pulse when phonemeDriven=false.
 */
export function evaluateMouthOpen(
  timeSeconds: number,
  dialogues: DialogueLine[] | undefined,
  options?: MouthOpenOptions,
): number {
  return evaluateMouthPose(timeSeconds, dialogues, options).open;
}

export type { VisemeId, VisemePose, VisemeSample };
export function tracksActiveAt(tracks: SceneAudioTrack[] | undefined, timeSeconds: number): SceneAudioTrack[] {
  if (!tracks?.length) return [];
  return tracks.filter((track) => {
    if (track.muted || track.volume <= 0) return false;
    const end = track.startTime + Math.max(0.01, track.duration);
    return timeSeconds >= track.startTime && timeSeconds < end;
  });
}

export function validateAudioTrack(track: Partial<SceneAudioTrack>): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!track.assetId) errors.push("Аудиодорожка без asset.");
  if (!Number.isFinite(track.startTime) || (track.startTime ?? 0) < 0) errors.push("startTime должен быть ≥ 0.");
  if (!Number.isFinite(track.duration) || (track.duration ?? 0) <= 0) errors.push("duration должен быть > 0.");
  if (!Number.isFinite(track.volume) || (track.volume ?? 0) < 0 || (track.volume ?? 0) > 1) errors.push("volume должен быть 0…1.");
  return { ok: errors.length === 0, errors };
}

export function estimateSpeechDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(0.8, Math.min(30, words * 0.42 + 0.4));
}
