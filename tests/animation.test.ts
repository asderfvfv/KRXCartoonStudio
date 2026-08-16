import { describe, expect, it } from "vitest";
import { AnimationSystem, applyEasing, interpolateKeyframes } from "../src/systems/AnimationSystem";
import type { AnimationClip, EasingName, Keyframe } from "../src/domain/types";

const keys: Keyframe[] = [{ id: "a", time: 0, value: 0, easing: "linear" }, { id: "b", time: 1, value: 100, easing: "linear" }];

describe("keyframe animation", () => {
  it("interpolates values by continuous time, independently of FPS", () => {
    expect(interpolateKeyframes(keys, 0.537)).toBeCloseTo(53.7);
    expect(interpolateKeyframes(keys, -1)).toBe(0); expect(interpolateKeyframes(keys, 4)).toBe(100);
  });
  it.each<[EasingName, number]>([["linear", .25], ["easeIn", .0625], ["easeOut", .4375], ["easeInOut", .125]])("evaluates %s", (name, expected) => expect(applyEasing(name, .25)).toBeCloseTo(expected));
  it("deterministically evaluates an entire clip at an exact time", () => {
    const clip: AnimationClip = { id: "c", name: "Test", duration: 2, loop: false, tracks: [{ id: "t", partId: "arm", property: "rotation", keyframes: keys }] };
    const system = new AnimationSystem(clip);
    expect(system.setTime(.5).arm.rotation).toBeCloseTo(50); expect(system.setTime(.5)).toEqual(system.setTime(.5));
  });
});
