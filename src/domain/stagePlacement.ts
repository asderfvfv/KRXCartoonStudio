/**
 * Shared stage placement — keep feet on one ground line, prevent overlaps.
 */
import { AUDIO_BEAST_UNIFORM_VISIBLE_HEIGHT } from "./audioBeastCharacters";

/** Feet sit on this fraction of canvas height (meadow path / cottage porch). */
export const DEFAULT_FOOT_LINE = 0.88;

/** Horizontal gap between actor roots (px at 1920). Wider than AudioBeast body+arms. */
export const DEFAULT_ACTOR_GAP = 640;

/** On-screen character stack height used for grounding (same for equal-sized cast). */
export function characterStackHeight(actorScale = 1): number {
  // Slightly under-estimate so feet land on the path (over-estimate → float in air).
  return Math.round(AUDIO_BEAST_UNIFORM_VISIBLE_HEIGHT * actorScale * 0.98);
}

/** Actor root Y so feet rest on the foot line (not floating). */
export function groundedActorY(canvasHeight: number, actorScale = 1, footLine = DEFAULT_FOOT_LINE): number {
  const feetY = canvasHeight * footLine;
  return Math.round(feetY - characterStackHeight(actorScale));
}

/** Place N actors left→right with fixed gap, centered, kept inside the frame. */
export function spacedActorXs(count: number, canvasWidth: number, gap = DEFAULT_ACTOR_GAP): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.round(canvasWidth * 0.5)];
  const margin = canvasWidth * 0.16;
  const usable = Math.max(gap, canvasWidth - margin * 2);
  const actualGap = Math.min(gap, usable / (count - 1));
  const span = actualGap * (count - 1);
  const start = Math.max(margin, (canvasWidth - span) / 2);
  return Array.from({ length: count }, (_, index) => Math.round(start + index * actualGap));
}
