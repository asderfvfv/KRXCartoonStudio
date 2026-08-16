import type { CharacterDefinition, EvaluatedValues, MotionName, RigPart, SemanticRole, Transform } from "../domain/types";
import { captureBindPose, findPartByRole } from "../domain/semantic";

export interface MotionDefinition { name: MotionName; label: string; category: "locomotion" | "gesture" | "emotion" | "reaction"; loop: boolean }

export const motionLibrary: MotionDefinition[] = [
  { name: "Idle", label: "Idle", category: "locomotion", loop: true }, { name: "Walk", label: "Walk", category: "locomotion", loop: true }, { name: "Run", label: "Run", category: "locomotion", loop: true },
  { name: "Wave", label: "Wave", category: "gesture", loop: true }, { name: "Talk", label: "Talk", category: "gesture", loop: true }, { name: "Happy", label: "Happy", category: "emotion", loop: false },
  { name: "Angry", label: "Angry", category: "emotion", loop: false }, { name: "Surprised", label: "Surprised", category: "emotion", loop: false }, { name: "Scared", label: "Scared", category: "emotion", loop: false },
  { name: "Laugh", label: "Laugh", category: "gesture", loop: true }, { name: "Jump", label: "Jump", category: "locomotion", loop: false }, { name: "Attack", label: "Attack", category: "gesture", loop: false },
  { name: "Hit", label: "Hit", category: "reaction", loop: false }, { name: "Fall", label: "Fall", category: "reaction", loop: false },
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export class MotionLibrary {
  evaluate(character: CharacterDefinition, motion: MotionName, normalizedTime: number, intensity = 1): EvaluatedValues {
    const t = clamp(normalizedTime); const phase = t * Math.PI * 2; const result: EvaluatedValues = {};
    const bind = character.bindPose ?? captureBindPose(character);
    const apply = (role: SemanticRole, values: Partial<Transform> & { opacity?: number }) => {
      const part = findPartByRole(character, role); if (!part) return; const base = bind[part.id]; if (!base) return;
      const output: Record<string, number> = {};
      for (const [key, relative] of Object.entries(values)) {
        if (relative === undefined) continue;
        const baseValue = key === "opacity" ? base.opacity : base.transform[key as keyof Transform]; output[key] = baseValue + relative * intensity;
      }
      result[part.id] = { ...(result[part.id] ?? {}), ...output };
    };
    const bodyRole: SemanticRole = findPartByRole(character, "Body") ? "Body" : "Root";
    if (motion === "Idle") { apply(bodyRole, { y: Math.sin(phase) * 4, scaleY: Math.sin(phase) * .012 }); apply("Head", { rotation: Math.sin(phase + .4) * 1.5, y: Math.sin(phase) * 1.5 }); }
    if (motion === "Walk" || motion === "Run") {
      const amount = motion === "Run" ? 1.45 : 1;
      const swing = Math.sin(phase) * (motion === "Run" ? 28 : 20) * amount;
      // Weight shift + tiny vertical (feet stay planted — no big hop).
      const bob = Math.abs(Math.sin(phase)) * (motion === "Run" ? -2.2 : -1.2);
      const sway = Math.sin(phase) * (motion === "Run" ? 3.5 : 2.2) * amount;
      apply(bodyRole, { x: sway, y: bob, rotation: Math.sin(phase) * 1.4 * amount });
      apply("Head", { y: -bob * 0.15, rotation: Math.sin(phase + 0.3) * 1.6 });
      apply("ArmLeft", { rotation: -swing * 0.9 });
      apply("ArmRight", { rotation: swing * 0.9 });
      apply("LegLeft", { rotation: swing });
      apply("LegRight", { rotation: -swing });
      apply("FootLeft", { rotation: -swing * 0.25 });
      apply("FootRight", { rotation: swing * 0.25 });
    }
    if (motion === "Wave") { apply("ArmRight", { rotation: -48 + Math.sin(phase * 2) * 24 }); apply("HandRight", { rotation: Math.sin(phase * 2 + .7) * 14 }); apply("Head", { rotation: -3 }); }
    if (motion === "Talk") { apply("Head", { rotation: Math.sin(phase * 1.5) * 3, y: Math.sin(phase * 2) * 2 }); apply("ArmLeft", { rotation: Math.sin(phase) * 9 }); apply("ArmRight", { rotation: -12 + Math.sin(phase + 1.2) * 12 }); }
    if (motion === "Happy") { const p = ease(Math.min(t * 3, 1)); apply(bodyRole, { y: -8 * p, scaleY: .025 * p }); apply("Head", { rotation: Math.sin(phase) * 3 }); apply("ArmLeft", { rotation: 22 * p }); apply("ArmRight", { rotation: -22 * p }); }
    if (motion === "Angry") { const p = ease(Math.min(t * 4, 1)); apply(bodyRole, { y: 5 * p, rotation: Math.sin(phase * 3) * .8 }); apply("Head", { rotation: -5 * p }); apply("ArmLeft", { rotation: -18 * p }); apply("ArmRight", { rotation: 18 * p }); }
    if (motion === "Surprised") { const p = Math.sin(Math.PI * t); apply(bodyRole, { y: -18 * p, scaleX: .06 * p, scaleY: .08 * p }); apply("Head", { y: -12 * p }); apply("ArmLeft", { rotation: 34 * p }); apply("ArmRight", { rotation: -34 * p }); }
    if (motion === "Scared") { apply(bodyRole, { x: Math.sin(phase * 5) * 4, scaleY: -.035 * ease(t) }); apply("Head", { rotation: Math.sin(phase * 5) * 2 }); apply("ArmLeft", { rotation: -28 * ease(t) }); apply("ArmRight", { rotation: 28 * ease(t) }); }
    if (motion === "Laugh") { apply(bodyRole, { y: Math.abs(Math.sin(phase * 2)) * -9, rotation: Math.sin(phase * 2) * 2 }); apply("Head", { rotation: Math.sin(phase * 2 + .5) * 5 }); apply("ArmLeft", { rotation: -12 + Math.sin(phase) * 8 }); apply("ArmRight", { rotation: 12 - Math.sin(phase) * 8 }); }
    if (motion === "Jump") { const jump = -Math.sin(Math.PI * t) * 90; apply(bodyRole, { y: jump, scaleY: Math.sin(phase) * .04 }); apply("ArmLeft", { rotation: -45 * Math.sin(Math.PI * t) }); apply("ArmRight", { rotation: 45 * Math.sin(Math.PI * t) }); }
    if (motion === "Attack") {
      const wind = t < 0.28 ? ease(t / 0.28) : 1;
      const strike = t < 0.28 ? 0 : ease(Math.min(1, (t - 0.28) / 0.32));
      const settle = t < 0.6 ? 0 : ease((t - 0.6) / 0.4);
      const punch = -55 * wind + 145 * strike - 35 * settle;
      apply(bodyRole, { rotation: -10 * wind + 22 * strike - 6 * settle, x: -12 * wind + 36 * strike, y: 10 * wind - 16 * strike });
      apply("ArmRight", { rotation: punch });
      apply("ArmLeft", { rotation: 18 * wind - 40 * strike });
      apply("Head", { rotation: -6 * wind + 14 * strike });
      apply("LegLeft", { rotation: -14 * strike });
      apply("LegRight", { rotation: 16 * wind - 8 * strike });
    }
    if (motion === "Hit") {
      const p = Math.sin(Math.PI * t);
      apply(bodyRole, { x: 38 * p, rotation: 18 * p, y: -12 * p, scaleX: 0.04 * p });
      apply("Head", { rotation: 22 * p, x: 10 * p });
      apply("ArmLeft", { rotation: -40 * p });
      apply("ArmRight", { rotation: 40 * p });
      apply("LegLeft", { rotation: 18 * p });
      apply("LegRight", { rotation: -12 * p });
    }
    if (motion === "Fall") {
      const p = ease(t);
      apply(bodyRole, { rotation: 70 * p, y: 40 * p, x: 40 * p, scaleY: -0.04 * p });
      apply("Head", { rotation: 18 * p });
      apply("ArmLeft", { rotation: -50 * p });
      apply("ArmRight", { rotation: 55 * p });
      apply("LegLeft", { rotation: -25 * p });
      apply("LegRight", { rotation: 30 * p });
    }
    return result;
  }
}

export function applyMotionToParts(character: CharacterDefinition, motion: MotionName, normalizedTime: number, intensity = 1): RigPart[] {
  const values = new MotionLibrary().evaluate(character, motion, normalizedTime, intensity);
  return character.parts.map((part) => ({ ...part, transform: { ...part.transform, ...values[part.id] }, opacity: values[part.id]?.opacity ?? part.opacity }));
}
