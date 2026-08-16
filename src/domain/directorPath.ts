/**
 * Director path → sparse X/Y keys + Walk/Run (manual montage).
 */
import { createId } from "./ids";
import type { ActionType, SceneAction, Vec2 } from "./types";

export type DirectorLocomotion = "Walk" | "Run";

export const WALK_SPEED_PX_PER_SEC = 280;
export const RUN_SPEED_PX_PER_SEC = 480;
export const PATH_MIN_POINT_DISTANCE = 24;
export const PATH_MIN_SEGMENT_DURATION = 0.12;
/** Ramer–Douglas–Peucker tolerance (px) — keeps the drawn shape, drops jitter. */
export const PATH_RDP_EPSILON = 16;
/** Hard cap so the timeline never fills with diamonds. */
export const PATH_MAX_KEYS = 18;

export const DIRECTOR_GESTURES: ActionType[] = [
  "Idle",
  "Wave",
  "Talk",
  "Happy",
  "Angry",
  "Surprised",
  "Scared",
  "Laugh",
  "Jump",
  "Attack",
  "Hit",
  "Fall",
  "Wait",
];

export function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

/** Drop near-duplicate samples from a freehand polyline. */
export function simplifyPolyline(points: Vec2[], minDistance = PATH_MIN_POINT_DISTANCE): Vec2[] {
  if (points.length <= 1) return points.map((point) => ({ ...point }));
  const result: Vec2[] = [{ ...points[0]! }];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const last = result[result.length - 1]!;
    if (distance(last, point) >= minDistance) result.push({ ...point });
  }
  const end = points[points.length - 1]!;
  const last = result[result.length - 1]!;
  if (distance(last, end) > 0.5) result.push({ ...end });
  return result;
}

function perpendicularDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const proj = { x: start.x + t * dx, y: start.y + t * dy };
  return distance(point, proj);
}

/** Ramer–Douglas–Peucker — keeps corners of the drawn path, removes shake. */
export function rdpSimplify(points: Vec2[], epsilon = PATH_RDP_EPSILON): Vec2[] {
  if (points.length < 3) return points.map((point) => ({ ...point }));
  let maxDist = 0;
  let maxIndex = 0;
  const start = points[0]!;
  const end = points[points.length - 1]!;
  for (let index = 1; index < points.length - 1; index += 1) {
    const dist = perpendicularDistance(points[index]!, start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = index;
    }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIndex + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIndex), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [{ ...start }, { ...end }];
}

/** Evenly thin a polyline down to at most `maxPoints` (always keeps ends). */
export function decimatePolyline(points: Vec2[], maxPoints: number): Vec2[] {
  if (points.length <= maxPoints || maxPoints < 2) return points.map((point) => ({ ...point }));
  const result: Vec2[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const src = Math.round((index / (maxPoints - 1)) * (points.length - 1));
    result.push({ ...points[src]! });
  }
  return result;
}

/**
 * Optional: flatten nearly-horizontal paths to a ground line (AI walks).
 * Freehand «Путь» should NOT use this — it makes the actor miss the yellow stroke.
 */
export function groundPathPoints(points: Vec2[], groundY: number, horizontalRatio = 0.35): Vec2[] {
  if (points.length < 2) return points.map((point) => ({ x: point.x, y: groundY }));
  let totalX = 0;
  let totalY = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalX += Math.abs(points[index]!.x - points[index - 1]!.x);
    totalY += Math.abs(points[index]!.y - points[index - 1]!.y);
  }
  if (totalX < 1 || totalY / totalX <= horizontalRatio) {
    return points.map((point) => ({ x: point.x, y: groundY }));
  }
  return points.map((point) => ({ ...point }));
}

export function pathDurationSeconds(points: Vec2[], mode: DirectorLocomotion): number {
  if (points.length < 2) return PATH_MIN_SEGMENT_DURATION;
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1]!, points[index]!);
  }
  const speed = mode === "Run" ? RUN_SPEED_PX_PER_SEC : WALK_SPEED_PX_PER_SEC;
  return Math.max(PATH_MIN_SEGMENT_DURATION, length / speed);
}

export function segmentDuration(from: Vec2, to: Vec2, mode: DirectorLocomotion): number {
  const speed = mode === "Run" ? RUN_SPEED_PX_PER_SEC : WALK_SPEED_PX_PER_SEC;
  return Math.max(PATH_MIN_SEGMENT_DURATION, distance(from, to) / speed);
}

export interface PathPoseKey {
  time: number;
  x: number;
  y: number;
}

export interface BakedDirectorPath {
  points: Vec2[];
  keys: PathPoseKey[];
  startTime: number;
  duration: number;
  motion: "Walk" | "Run";
}

/** Simplify freehand stroke → sparse timed poses (few ◆ on the timeline). */
export function bakeDirectorPath(
  rawPoints: Vec2[],
  options: { mode: DirectorLocomotion; startTime: number; maxKeys?: number },
): BakedDirectorPath | null {
  const maxKeys = options.maxKeys ?? PATH_MAX_KEYS;
  let points = simplifyPolyline(rawPoints, PATH_MIN_POINT_DISTANCE);
  points = rdpSimplify(points, PATH_RDP_EPSILON);
  points = decimatePolyline(points, maxKeys);
  if (points.length < 2) return null;

  const keys: PathPoseKey[] = [];
  let cursor = Math.max(0, options.startTime);
  keys.push({ time: cursor, x: points[0]!.x, y: points[0]!.y });
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    cursor += segmentDuration(from, to, options.mode);
    keys.push({ time: cursor, x: to.x, y: to.y });
  }
  return {
    points,
    keys,
    startTime: Math.max(0, options.startTime),
    duration: cursor - Math.max(0, options.startTime),
    motion: options.mode === "Run" ? "Run" : "Walk",
  };
}

export interface BuildPathActionsOptions {
  actorId: string;
  points: Vec2[];
  mode: DirectorLocomotion;
  startTime: number;
  groundY: number;
  /** When true (default false for freehand), flatten Y to groundY. */
  lockGroundY?: boolean;
  createActionId?: () => string;
}

/** Convert polyline into Absolute WalkTo/RunTo chain (legacy / AI). Prefer bakeDirectorPath for freehand. */
export function buildPathActions(options: BuildPathActionsOptions): SceneAction[] {
  const id = options.createActionId ?? (() => createId("action"));
  let points = simplifyPolyline(options.points);
  points = rdpSimplify(points, PATH_RDP_EPSILON);
  points = decimatePolyline(points, PATH_MAX_KEYS);
  if (options.lockGroundY !== false) {
    // Legacy default kept for tests that expect grounding — freehand commit uses bakeDirectorPath instead.
    points = groundPathPoints(points, options.groundY);
  }
  if (points.length < 2) return [];

  const actionType: ActionType = options.mode === "Run" ? "RunTo" : "WalkTo";
  const actions: SceneAction[] = [];
  let cursor = Math.max(0, options.startTime);

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const duration = segmentDuration(from, to, options.mode);
    actions.push({
      id: id(),
      actorId: options.actorId,
      type: actionType,
      targetActorId: null,
      duration,
      startMode: "Absolute",
      startTime: cursor,
      parameters: {
        x: to.x,
        y: to.y,
        stopDistance: 0,
      },
    });
    cursor += duration;
  }
  return actions;
}

export function defaultGestureDuration(type: ActionType): number {
  switch (type) {
    case "Talk":
      return 1.4;
    case "Jump":
      return 0.7;
    case "Attack":
    case "Hit":
      return 0.65;
    case "Fall":
      return 0.9;
    case "Wait":
      return 0.5;
    case "Idle":
      return 1;
    default:
      return 0.85;
  }
}

export function buildGestureAction(
  actorId: string,
  type: ActionType,
  startTime: number,
  duration = defaultGestureDuration(type),
): SceneAction {
  return {
    id: createId("action"),
    actorId: type === "CameraShake" ? null : actorId,
    type,
    targetActorId: null,
    duration: Math.max(0.05, duration),
    startMode: "Absolute",
    startTime: Math.max(0, startTime),
    parameters: type === "CameraShake" ? { intensity: 18 } : {},
  };
}
