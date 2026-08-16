import { FillGradient, Graphics } from "pixi.js";
import type { SceneBackgroundFill } from "../domain/sceneBackgrounds";
import { clampHorizon, clampSoftness, resolveSceneBackgroundFill } from "../domain/sceneBackgrounds";

/** Paint solid or sky/ground fill into a Graphics for the scene frame. */
export function paintSceneBackgroundGraphics(
  graphics: Graphics,
  width: number,
  height: number,
  background: string,
  fill?: SceneBackgroundFill | null,
): Graphics {
  const resolved = resolveSceneBackgroundFill(background, fill);
  graphics.clear();
  graphics.rect(0, 0, width, height);
  if (resolved.mode === "gradient") {
    const horizon = clampHorizon(resolved.horizon);
    const softness = clampSoftness(resolved.softness, 0.08);
    const soft = Math.min(softness, Math.min(horizon - 0.02, 1 - horizon - 0.02));
    const a = Math.max(0, horizon - soft);
    const b = Math.min(1, horizon + soft);
    const gradient = new FillGradient({
      type: "linear",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0, color: resolved.top },
        { offset: a, color: resolved.top },
        { offset: b, color: resolved.bottom },
        { offset: 1, color: resolved.bottom },
      ],
      textureSpace: "local",
    });
    graphics.fill(gradient);
  } else {
    graphics.fill(background);
  }
  return graphics;
}
