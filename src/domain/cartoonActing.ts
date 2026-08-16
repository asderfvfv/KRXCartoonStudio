/**
 * Local prompt→cartoon acting: per-line gestures, listener LookAt, camera, TTS emotion.
 * No cloud.
 */
import { createId } from "./ids";
import type {
  ActionType,
  CameraTrack,
  EasingName,
  NumericKeyframe,
  Scene,
  SceneAction,
  SceneActionParameters,
} from "./types";
import { ActionCompiler } from "../systems/ActionCompiler";
import type { VoiceEmotion } from "./voiceStudio";

export type ActingMood = "calm" | "adventure" | "funny" | "scary" | "neutral";

export type LineGesture = Extract<ActionType, "Wave" | "Happy" | "Jump" | "Angry" | "Laugh" | "Surprised" | "Scared">;

const ease: EasingName = "easeInOut";

function key(time: number, value: number, easing: EasingName = ease): NumericKeyframe {
  return { id: createId("cam-key"), time, value, easing };
}

function cam(property: CameraTrack["property"], keys: NumericKeyframe[]): CameraTrack {
  return { id: createId("camera-track"), property, keyframes: keys };
}

export function gestureFromDialogue(text: string): LineGesture | null {
  const lower = text.toLowerCase();
  if (/прыг|jump/.test(lower)) return "Jump";
  if (/ха-ха|хе-хе|смех|laugh|хаха/.test(lower)) return "Laugh";
  if (/зл|сердит|не слушал|хватит|angry/.test(lower)) return "Angry";
  if (/страш|боюсь|боит|темн|шорох|scared/.test(lower)) return "Scared";
  if (/\bого\b|удив|неужели|что\?|surprised/.test(lower)) return "Surprised";
  if (/ура|рад|счаст|йе+|улыб|счастлив/.test(lower)) return "Happy";
  if (/привет|эй[,!]|здравств|маш|смотри сюда|помаха/.test(lower)) return "Wave";
  if (/[!]{2,}|\bдавай\b/.test(lower)) return "Happy";
  return null;
}

export function emotionFromDialogue(text: string, mood: ActingMood = "neutral"): VoiceEmotion {
  const gesture = gestureFromDialogue(text);
  if (gesture === "Angry") return "angry";
  if (gesture === "Laugh" || gesture === "Happy") return "happy";
  if (gesture === "Scared") return "scared";
  if (gesture === "Surprised") return "surprised";
  if (gesture === "Jump") return "excited";
  if (gesture === "Wave") return "happy";
  if (mood === "funny") return "happy";
  if (mood === "scary") return "scared";
  if (mood === "adventure") return "excited";
  if (mood === "calm") return "neutral";
  if (/[!]/.test(text)) return "excited";
  return "neutral";
}

function pushAbsolute(
  actions: SceneAction[],
  actorId: string | null,
  type: ActionType,
  duration: number,
  startTime: number,
  parameters: SceneActionParameters = {},
  targetActorId: string | null = null,
): void {
  actions.push({
    id: createId("action"),
    actorId,
    type,
    targetActorId,
    duration,
    startMode: "Absolute",
    startTime,
    parameters,
  });
}

/** Speaker plays a matching gesture; others look at the speaker. Jump/Happy can shake the camera. */
export function applyDialogueActing(scene: Scene): void {
  const actors = scene.actors ?? [];
  const dialogues = scene.dialogues ?? [];
  if (!actors.length || !dialogues.length) return;

  for (const line of dialogues) {
    if (!line.actorId) continue;
    const gesture = gestureFromDialogue(line.text);
    const t = line.startTime;
    const span = Math.max(0.45, Math.min(0.95, line.duration * 0.55));
    if (gesture) {
      pushAbsolute(scene.actionSequence, line.actorId, gesture, span, t + 0.04, { intensity: 1.15 });
      line.emotion = emotionFromDialogue(line.text);
    } else if (!line.emotion) {
      line.emotion = emotionFromDialogue(line.text);
    }
    for (const other of actors) {
      if (other.id === line.actorId) continue;
      pushAbsolute(scene.actionSequence, other.id, "LookAt", 0.25, t, {}, line.actorId);
    }
    if (gesture === "Jump" || (gesture === "Happy" && /ура|йе/.test(line.text.toLowerCase()))) {
      pushAbsolute(scene.actionSequence, null, "CameraShake", 0.35, t + 0.08, { intensity: 16 });
    }
  }
}

/** Keep the full stage in frame — no zoom crop that hid the meadow/cast. */
export function applyCartoonCamera(scene: Scene, _mood: ActingMood, sceneIndex = 0): void {
  const duration = Math.max(scene.duration, 2.4);
  const cx = scene.width / 2;
  const cy = scene.height / 2;
  const compiler = new ActionCompiler();
  const base = compiler.compile(scene);
  const cameraTracks: CameraTrack[] = [
    cam("zoom", [key(0, 1), key(duration, 1, ease)]),
    cam("x", [key(0, cx), key(duration, cx, ease)]),
    cam("y", [key(0, cy), key(duration, cy, ease)]),
    cam("shake", [key(0, 0), key(duration, 0)]),
  ];
  scene.generatedTimeline = {
    ...base,
    duration: Math.max(base.duration, duration),
    cameraTracks: [...base.cameraTracks, ...cameraTracks],
    sourceHash: `${base.sourceHash}-cam${sceneIndex}`,
  };
  scene.duration = Math.max(scene.duration, scene.generatedTimeline.duration);
}
