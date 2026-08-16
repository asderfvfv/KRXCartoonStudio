/**
 * Local “wow” motion for product ads: Ken Burns, slide-in, punch zoom, shake.
 * No cloud — keyframes only.
 */
import { createId } from "./ids";
import type {
  CameraTrack,
  EasingName,
  GeneratedSceneTimeline,
  NumericKeyframe,
  ProjectDocument,
  PropTrack,
  Scene,
  SceneProp,
} from "./types";
import { ActionCompiler } from "../systems/ActionCompiler";

const ease: EasingName = "easeInOut";
const easeOut: EasingName = "easeOut";
const easeIn: EasingName = "easeIn";

function key(time: number, value: number, easing: EasingName = ease): NumericKeyframe {
  return { id: createId("ad-key"), time, value, easing };
}

function propTrack(propId: string, property: PropTrack["property"], keys: NumericKeyframe[]): PropTrack {
  return { id: createId("prop-track"), propId, property, keyframes: keys };
}

function cameraTrack(property: CameraTrack["property"], keys: NumericKeyframe[]): CameraTrack {
  return { id: createId("camera-track"), property, keyframes: keys };
}

export type AdMotionStyle = "slideIn" | "kenBurns" | "punchPop" | "spinIn" | "riseFlash";

export function adMotionStyleForIndex(index: number): AdMotionStyle {
  const styles: AdMotionStyle[] = ["slideIn", "kenBurns", "punchPop", "spinIn", "riseFlash"];
  return styles[index % styles.length]!;
}

/** Build prop + camera keyframes for one ad still. */
export function buildAdPropMotion(
  prop: SceneProp,
  scene: Scene,
  style: AdMotionStyle,
  duration: number,
): { propTracks: PropTrack[]; cameraTracks: CameraTrack[] } {
  const cx = prop.position.x;
  const cy = prop.position.y;
  const sx = prop.scale.x;
  const sy = prop.scale.y;
  const end = Math.max(1.6, duration);
  const mid = end * 0.45;
  const propTracks: PropTrack[] = [];
  const cameraTracks: CameraTrack[] = [];
  const camX = scene.width / 2;
  const camY = scene.height / 2;

  if (style === "slideIn") {
    const fromX = cx - scene.width * 0.55;
    propTracks.push(
      propTrack(prop.id, "x", [key(0, fromX, easeOut), key(0.55, cx + 18, easeOut), key(0.85, cx, ease)]),
      propTrack(prop.id, "y", [key(0, cy), key(end, cy)]),
      propTrack(prop.id, "opacity", [key(0, 0, easeOut), key(0.25, 1), key(end * 0.88, 1), key(end, 0.92)]),
      propTrack(prop.id, "scaleX", [key(0, sx * 0.82, easeOut), key(0.55, sx * 1.06, easeOut), key(0.9, sx, ease)]),
      propTrack(prop.id, "scaleY", [key(0, sy * 0.82, easeOut), key(0.55, sy * 1.06, easeOut), key(0.9, sy, ease)]),
    );
    cameraTracks.push(
      cameraTrack("zoom", [key(0, 1.0), key(end * 0.7, 1.14, ease), key(end, 1.18)]),
      cameraTrack("x", [key(0, camX - 40), key(end, camX + 20, ease)]),
      cameraTrack("y", [key(0, camY), key(end, camY)]),
      cameraTrack("shake", [key(0, 0), key(0.5, 0), key(0.58, 10, easeOut), key(0.9, 0)]),
    );
  } else if (style === "kenBurns") {
    propTracks.push(
      propTrack(prop.id, "x", [key(0, cx - 30), key(end, cx + 36, ease)]),
      propTrack(prop.id, "y", [key(0, cy + 20), key(end, cy - 24, ease)]),
      propTrack(prop.id, "opacity", [key(0, 0), key(0.2, 1, easeOut), key(end * 0.9, 1), key(end, 0.95)]),
      propTrack(prop.id, "scaleX", [key(0, sx * 0.92), key(end, sx * 1.12, ease)]),
      propTrack(prop.id, "scaleY", [key(0, sy * 0.92), key(end, sy * 1.12, ease)]),
    );
    cameraTracks.push(
      cameraTrack("zoom", [key(0, 1.05), key(end, 1.22, ease)]),
      cameraTrack("x", [key(0, camX + 30), key(end, camX - 25, ease)]),
      cameraTrack("y", [key(0, camY - 15), key(end, camY + 18, ease)]),
    );
  } else if (style === "punchPop") {
    propTracks.push(
      propTrack(prop.id, "x", [key(0, cx), key(end, cx)]),
      propTrack(prop.id, "y", [key(0, cy + 80, easeOut), key(0.4, cy - 12, easeOut), key(0.65, cy, ease)]),
      propTrack(prop.id, "opacity", [key(0, 0), key(0.15, 1, easeOut), key(end, 1)]),
      propTrack(prop.id, "scaleX", [
        key(0, sx * 0.55, easeOut),
        key(0.35, sx * 1.18, easeOut),
        key(0.55, sx * 0.96, ease),
        key(0.75, sx * 1.04, ease),
        key(1.0, sx, ease),
      ]),
      propTrack(prop.id, "scaleY", [
        key(0, sy * 0.55, easeOut),
        key(0.35, sy * 1.18, easeOut),
        key(0.55, sy * 0.96, ease),
        key(0.75, sy * 1.04, ease),
        key(1.0, sy, ease),
      ]),
    );
    cameraTracks.push(
      cameraTrack("zoom", [key(0, 0.92), key(0.4, 1.16, easeOut), key(mid, 1.08, ease), key(end, 1.12)]),
      cameraTrack("shake", [key(0, 0), key(0.32, 0), key(0.4, 14, easeOut), key(0.7, 0)]),
    );
  } else if (style === "spinIn") {
    propTracks.push(
      propTrack(prop.id, "x", [key(0, cx + scene.width * 0.4, easeOut), key(0.6, cx, ease)]),
      propTrack(prop.id, "y", [key(0, cy - 40), key(0.6, cy, ease)]),
      propTrack(prop.id, "rotation", [key(0, -18, easeOut), key(0.55, 4, easeOut), key(0.85, 0, ease)]),
      propTrack(prop.id, "opacity", [key(0, 0), key(0.2, 1, easeOut), key(end, 1)]),
      propTrack(prop.id, "scaleX", [key(0, sx * 0.7), key(0.5, sx * 1.08, easeOut), key(0.85, sx, ease)]),
      propTrack(prop.id, "scaleY", [key(0, sy * 0.7), key(0.5, sy * 1.08, easeOut), key(0.85, sy, ease)]),
    );
    cameraTracks.push(
      cameraTrack("zoom", [key(0, 1.0), key(end * 0.6, 1.15, ease), key(end, 1.2)]),
      cameraTrack("rotation", [key(0, -1.5), key(0.7, 0.4, ease), key(end, 0)]),
      cameraTrack("shake", [key(0.45, 0), key(0.55, 8, easeOut), key(0.85, 0)]),
    );
  } else {
    // riseFlash
    propTracks.push(
      propTrack(prop.id, "x", [key(0, cx), key(end, cx)]),
      propTrack(prop.id, "y", [key(0, cy + scene.height * 0.35, easeOut), key(0.5, cy, ease)]),
      propTrack(prop.id, "opacity", [key(0, 0), key(0.18, 1), key(end * 0.85, 1), key(end, 0.9, easeIn)]),
      propTrack(prop.id, "scaleX", [key(0, sx * 1.25), key(0.45, sx * 0.98, easeOut), key(0.7, sx * 1.06), key(1.0, sx)]),
      propTrack(prop.id, "scaleY", [key(0, sy * 1.25), key(0.45, sy * 0.98, easeOut), key(0.7, sy * 1.06), key(1.0, sy)]),
    );
    cameraTracks.push(
      cameraTrack("zoom", [key(0, 1.25), key(0.5, 1.05, easeOut), key(end, 1.18, ease)]),
      cameraTrack("y", [key(0, camY + 40), key(0.5, camY, easeOut), key(end, camY - 10)]),
      cameraTrack("shake", [key(0.15, 0), key(0.28, 12, easeOut), key(0.55, 0)]),
    );
  }

  return { propTracks, cameraTracks };
}

/** Apply wow motion to every ad scene that has props. */
export function applyAdWowMotion(project: ProjectDocument): void {
  if (!project.scenes?.length) return;
  const compiler = new ActionCompiler();
  project.scenes.forEach((scene, index) => {
    if (!scene.props.length) return;
    const duration = Math.max(scene.duration, 3.2);
    scene.duration = duration;
    const base = compiler.compile(scene);
    const propTracks: PropTrack[] = [];
    const cameraTracks: CameraTrack[] = [...base.cameraTracks];

    scene.props.forEach((prop, propIndex) => {
      const style = adMotionStyleForIndex(index + propIndex);
      const motion = buildAdPropMotion(prop, scene, style, duration);
      propTracks.push(...motion.propTracks);
      // One camera vibe per scene — from the featured (first) prop.
      if (propIndex === 0) cameraTracks.push(...motion.cameraTracks);
    });

    const timeline: GeneratedSceneTimeline = {
      ...base,
      duration: Math.max(base.duration, duration),
      cameraTracks,
      propTracks,
      sourceHash: `${base.sourceHash}-adwow${index}`,
    };
    scene.generatedTimeline = timeline;
    scene.duration = Math.max(scene.duration, timeline.duration);
  });

  if (project.montage && (project.scenes?.length ?? 0) >= 2) {
    project.montage.transition = "crossfade";
    project.montage.crossfadeDuration = Math.max(project.montage.crossfadeDuration ?? 0.4, 0.55);
  }
  if (project.renderSettings && project.scenes) {
    project.renderSettings.duration = project.scenes.reduce((sum, scene) => sum + Math.max(0.1, scene.duration), 0);
  }
}
