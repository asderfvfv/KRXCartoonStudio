import type { AnimationClip, AnimationTrack, EasingName, EvaluatedValues, Keyframe } from "../domain/types";

export function applyEasing(name: EasingName, value: number): number {
  const t = Math.max(0, Math.min(1, value));
  if (name === "easeIn") return t * t;
  if (name === "easeOut") return 1 - (1 - t) * (1 - t);
  if (name === "easeInOut") return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
}

export function interpolateKeyframes(keyframes: Keyframe[], time: number): number | undefined {
  if (keyframes.length === 0) return undefined;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].value;
  if (time >= sorted.at(-1)!.time) return sorted.at(-1)!.value;
  const rightIndex = sorted.findIndex((keyframe) => keyframe.time >= time);
  const left = sorted[rightIndex - 1]; const right = sorted[rightIndex];
  const span = right.time - left.time;
  const progress = span <= 0 ? 1 : (time - left.time) / span;
  return left.value + (right.value - left.value) * applyEasing(right.easing, progress);
}

export class AnimationSystem {
  private time = 0;
  constructor(private clip: AnimationClip) {}
  setClip(clip: AnimationClip): void { this.clip = clip; this.time = Math.min(this.time, clip.duration); }
  setTime(timeSeconds: number): EvaluatedValues {
    this.time = this.clip.loop && this.clip.duration > 0 ? ((timeSeconds % this.clip.duration) + this.clip.duration) % this.clip.duration : Math.max(0, Math.min(this.clip.duration, timeSeconds));
    return this.evaluate(this.time);
  }
  evaluate(timeSeconds: number): EvaluatedValues {
    return this.clip.tracks.reduce<EvaluatedValues>((result, track: AnimationTrack) => {
      const value = interpolateKeyframes(track.keyframes, timeSeconds);
      if (value !== undefined) (result[track.partId] ??= {})[track.property] = value;
      return result;
    }, {});
  }
  getTime(): number { return this.time; }
}
