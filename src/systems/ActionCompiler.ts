import { createId } from "../domain/ids";
import type { Actor, ActorAnimatableProperty, ActorTrack, ActionType, FacingDirection, GeneratedSceneTimeline, MotionName, NumericKeyframe, Scene, SceneAction } from "../domain/types";

interface ScheduledAction { action: SceneAction; start: number; end: number }

const motionActions = new Set<ActionType>(["Idle", "Wave", "Talk", "Happy", "Angry", "Surprised", "Scared", "Laugh", "Jump", "Attack", "Hit", "Fall"]);
const easing = "easeInOut" as const;

function hashActions(actions: SceneAction[]): string {
  const input = JSON.stringify(actions); let hash = 2166136261;
  for (let index = 0; index < input.length; index++) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
}

export function scheduleActions(actions: SceneAction[]): ScheduledAction[] {
  const result: ScheduledAction[] = []; let cursor = 0; let previousStart = 0; let previous: ScheduledAction | undefined;
  for (const action of actions) {
    let start = action.startMode === "Absolute" ? Math.max(0, action.startTime ?? 0) : action.startMode === "WithPrevious" ? previousStart : cursor;
    if (action.startMode === "WithPrevious" && previous?.action.type === "Attack" && (action.type === "Hit" || action.type === "CameraShake")) start = previous.start + previous.action.duration * .62;
    const scheduled = { action, start, end: start + Math.max(.01, action.duration) }; result.push(scheduled); previousStart = start; previous = scheduled; cursor = Math.max(cursor, scheduled.end);
  }
  return result;
}

export class ActionCompiler {
  compile(scene: Scene): GeneratedSceneTimeline {
    const scheduled = scheduleActions(scene.actionSequence); const actorTracks: ActorTrack[] = []; const motionSegments: GeneratedSceneTimeline["motionSegments"] = []; const cameraTracks: GeneratedSceneTimeline["cameraTracks"] = []; const facingChanges: GeneratedSceneTimeline["facingChanges"] = [];
    const states = new Map(scene.actors.map((actor) => [actor.id, { x: actor.position.x, y: actor.position.y, rotation: actor.rotation, scale: actor.scale, opacity: actor.opacity ?? 1, facing: actor.facingDirection }]));
    const addActorKeys = (actorId: string, property: ActorAnimatableProperty, keys: Array<[number, number]>) => {
      let track = actorTracks.find((candidate) => candidate.actorId === actorId && candidate.property === property); if (!track) { track = { id: createId("actor-track"), actorId, property, keyframes: [] }; actorTracks.push(track); }
      for (const [time, value] of keys) { const existing = track.keyframes.find((key) => Math.abs(key.time - time) < .00001); if (existing) existing.value = value; else track.keyframes.push({ id: createId("scene-key"), time, value, easing }); }
      track.keyframes.sort((a, b) => a.time - b.time);
    };
    const setFacing = (actor: Actor, targetX: number, time: number) => { const state = states.get(actor.id)!; const direction: FacingDirection = targetX < state.x ? "Left" : "Right"; state.facing = direction; facingChanges.push({ actorId: actor.id, time, direction }); };
    for (const item of scheduled) {
      const action = item.action; const actor = scene.actors.find((candidate) => candidate.id === action.actorId); const state = actor ? states.get(actor.id) : undefined; const target = scene.actors.find((candidate) => candidate.id === action.targetActorId);
      if (action.type === "CameraShake") { const strength = action.parameters.intensity ?? 18; cameraTracks.push({ id: createId("camera-track"), property: "shake", keyframes: [{ id: createId("camera-key"), time: item.start, value: 0, easing }, { id: createId("camera-key"), time: item.start + action.duration * .15, value: strength, easing }, { id: createId("camera-key"), time: item.end, value: 0, easing }] }); continue; }
      if (!actor || !state) continue;
      if (action.type === "Enter") {
        const from = action.parameters.from ?? "Left"; const startX = from === "Left" ? -220 : from === "Right" ? scene.width + 220 : state.x; const startY = from === "Top" ? -300 : from === "Bottom" ? scene.height + 300 : state.y;
        setFacing(actor, state.x, item.start); addActorKeys(actor.id, "x", [[item.start, startX], [item.end, state.x]]); addActorKeys(actor.id, "y", [[item.start, startY], [item.end, state.y]]); addActorKeys(actor.id, "opacity", [[item.start, 0], [item.start + .05, 1]]);
        motionSegments.push({ id: createId("motion"), actorId: actor.id, motion: "Walk", start: item.start, duration: action.duration, intensity: 1 });
      } else if (action.type === "Exit") {
        const to = action.parameters.from ?? "Right"; const endX = to === "Left" ? -220 : to === "Right" ? scene.width + 220 : state.x; const endY = to === "Top" ? -300 : to === "Bottom" ? scene.height + 300 : state.y;
        setFacing(actor, endX, item.start); addActorKeys(actor.id, "x", [[item.start, state.x], [item.end, endX]]); addActorKeys(actor.id, "y", [[item.start, state.y], [item.end, endY]]); addActorKeys(actor.id, "opacity", [[item.end - .05, 1], [item.end, 0]]); state.x = endX; state.y = endY; motionSegments.push({ id: createId("motion"), actorId: actor.id, motion: "Walk", start: item.start, duration: action.duration, intensity: 1 });
      } else if (["MoveTo", "WalkTo", "RunTo"].includes(action.type)) {
        const stop = action.parameters.stopDistance ?? 190; let endX = action.parameters.x ?? state.x; let endY = action.parameters.y ?? state.y;
        if (target) {
          const targetState = states.get(target.id) ?? { x: target.position.x, y: target.position.y };
          endX = targetState.x + (state.x < targetState.x ? -stop : stop);
          endY = targetState.y;
        } else {
          // Keep feet on the same ground line unless Y was explicit.
          if (action.parameters.y === undefined) endY = state.y;
        }
        // Anti-overlap only for “approach actor” WalkTo (stopDistance > 0).
        // Freehand path uses stopDistance: 0 — never shove X off the drawn line.
        if (stop > 0) {
          const minGap = Math.max(160, Math.min(stop, 240));
          for (const [otherId, other] of states) {
            if (otherId === actor.id) continue;
            if (Math.abs(endX - other.x) < minGap) {
              endX = other.x + (endX >= other.x ? minGap : -minGap);
            }
          }
          endX = Math.max(80, Math.min(scene.width - 80, endX));
        }
        setFacing(actor, endX, item.start); addActorKeys(actor.id, "x", [[item.start, state.x], [item.end, endX]]); addActorKeys(actor.id, "y", [[item.start, state.y], [item.end, endY]]); state.x = endX; state.y = endY;
        if (action.type !== "MoveTo") motionSegments.push({ id: createId("motion"), actorId: actor.id, motion: action.type === "RunTo" ? "Run" : "Walk", start: item.start, duration: action.duration, intensity: 1 });
      } else if (action.type === "Face" || action.type === "LookAt") {
        const targetState = target ? states.get(target.id) : undefined;
        const direction = targetState ? (targetState.x < state.x ? "Left" : "Right") : action.parameters.direction ?? state.facing; state.facing = direction; facingChanges.push({ actorId: actor.id, time: item.start, direction });
      } else if (action.type === "Attack") {
        if (target) {
          const targetState = states.get(target.id) ?? { x: target.position.x, y: target.position.y };
          setFacing(actor, targetState.x, item.start);
          const contact = action.parameters.stopDistance ?? 118;
          const contactX = state.x <= targetState.x ? targetState.x - contact : targetState.x + contact;
          const toward = contactX >= state.x ? 1 : -1;
          const windup = action.parameters.distance ?? 42;
          const backX = state.x - toward * windup;
          const tBack = item.start + action.duration * 0.28;
          const tHit = item.start + action.duration * 0.55;
          addActorKeys(actor.id, "x", [[item.start, state.x], [tBack, backX], [tHit, contactX], [item.end, contactX]]);
          // slight hop into the strike
          addActorKeys(actor.id, "y", [[item.start, state.y], [tBack, state.y + 8], [tHit, state.y - 18], [item.end, state.y]]);
          state.x = contactX;
        }
        motionSegments.push({ id: createId("motion"), actorId: actor.id, motion: "Attack", start: item.start, duration: action.duration, intensity: action.parameters.intensity ?? 1.35 });
      } else if (action.type === "Hit") {
        const direction = action.parameters.direction ?? state.facing; const delta = (direction === "Right" ? 1 : -1) * (action.parameters.distance ?? 75);
        const mid = item.start + action.duration * 0.4;
        addActorKeys(actor.id, "x", [[item.start, state.x], [mid, state.x + delta * 0.7], [item.end, state.x + delta]]);
        // Return to ground Y — do not permanently raise actor (looked like floating).
        addActorKeys(actor.id, "y", [[item.start, state.y], [mid, state.y - 28], [item.end, state.y]]);
        addActorKeys(actor.id, "rotation", [[item.start, state.rotation], [mid, state.rotation + (direction === "Right" ? 12 : -12)], [item.end, state.rotation]]);
        state.x += delta;
        motionSegments.push({ id: createId("motion"), actorId: actor.id, motion: "Hit", start: item.start, duration: action.duration, intensity: action.parameters.intensity ?? 1.25 });
      } else if (action.type === "Fall") {
        const direction = action.parameters.direction ?? "Right";
        const delta = (direction === "Left" ? -1 : 1) * (action.parameters.distance ?? 120);
        const spin = direction === "Left" ? -95 : 95;
        addActorKeys(actor.id, "x", [[item.start, state.x], [item.end, state.x + delta]]);
        addActorKeys(actor.id, "y", [[item.start, state.y], [item.start + action.duration * 0.35, state.y - 40], [item.end, state.y + 40]]);
        addActorKeys(actor.id, "rotation", [[item.start, state.rotation], [item.end, state.rotation + spin]]);
        state.x += delta; state.y += 40; state.rotation += spin;
        motionSegments.push({ id: createId("motion"), actorId: actor.id, motion: "Fall", start: item.start, duration: action.duration, intensity: 1, hold: true });
      } else if (motionActions.has(action.type)) {
        motionSegments.push({ id: createId("motion"), actorId: actor.id, motion: action.type as MotionName, start: item.start, duration: action.duration, intensity: action.parameters.intensity ?? 1, hold: ["Angry", "Happy", "Scared"].includes(action.type) });
      }
    }
    const duration = Math.max(scene.duration, ...scheduled.map((item) => item.end), 1);
    return { version: 1, duration, actorTracks, cameraTracks, propTracks: [], motionSegments, facingChanges, sourceHash: hashActions(scene.actionSequence), manualEdits: false };
  }
}

export function actionSequenceHash(actions: SceneAction[]): string { return hashActions(actions); }
