import type { CharacterDefinition, Scene, SceneRuntimeState } from "../domain/types";
import {
  createDefaultLipSyncSettings,
  dialogueLocalToAssetTime,
  evaluateMouthPose,
  type LipSyncSettings,
} from "../domain/audio";
import { findPartByRole } from "../domain/semantic";
import {
  createEmptyMouthSet,
  resolveMouthPartId,
  type CartoonVisemeId,
} from "../domain/visemeSystem";
import { amplitudeEnvelopeCache } from "./AmplitudeEnvelopeCache";

export interface LipSyncRuntimeOptions {
  lipSync?: LipSyncSettings;
}

/** Applies forced-alignment / phoneme mouth shapes from Timeline clock. */
export function applyLipSyncToRuntime(
  state: SceneRuntimeState,
  scene: Scene,
  characters: CharacterDefinition[],
  timeSeconds: number,
  options?: LipSyncRuntimeOptions,
): SceneRuntimeState {
  const lipSync = createDefaultLipSyncSettings(options?.lipSync ?? scene.lipSyncSettings);
  if (!lipSync.enabled) return state;

  const nextActors = { ...state.actors };
  let changed = false;

  for (const actor of scene.actors) {
    const result = evaluateMouthPose(timeSeconds, scene.dialogues, {
      actorId: actor.id,
      lipSync,
      resolveAmplitude: (line, localTime) => {
        if (!line.audioTrackId) return null;
        const track = scene.audioTracks?.find((item) => item.id === line.audioTrackId);
        if (!track || track.muted) return null;
        const sampleTime = dialogueLocalToAssetTime(line, track, localTime);
        if (sampleTime == null) return null;
        const value = amplitudeEnvelopeCache.sampleSmoothed(
          track.assetId,
          sampleTime,
          lipSync.sensitivity,
          lipSync.smoothing,
        );
        if (value == null) return null;
        return value * Math.max(0, Math.min(1, track.volume));
      },
    });

    const character = characters.find((item) => item.id === actor.characterId);
    if (!character) continue;
    const mouthSet = character.mouthSet ?? createEmptyMouthSet({
      mode: "basic",
      primaryMouthPartId: findPartByRole(character, "Mouth")?.id ?? null,
    });
    if (mouthSet.mode === "disabled") continue;

    const cartoon: CartoonVisemeId = result.cartoonViseme ?? (result.open > 0.08 ? "A" : "REST");
    const resolved = resolveMouthPartId(mouthSet, cartoon);
    const actorState = nextActors[actor.id];
    if (!actorState) continue;

    const mouthParts = character.parts.filter((part) => part.semanticRole === "Mouth");
    const mappedIds = new Set<string>();
    for (const id of Object.values(mouthSet.advancedMapping ?? {})) if (id) mappedIds.add(id);
    for (const id of Object.values(mouthSet.basicMapping ?? {})) if (id) mappedIds.add(id);
    if (mouthSet.primaryMouthPartId) mappedIds.add(mouthSet.primaryMouthPartId);
    for (const part of mouthParts) mappedIds.add(part.id);

    const rig = { ...actorState.rig };
    let actorChanged = false;

    // Advanced/basic multi-sprite: show only active mouth part; never hide all.
    if (!resolved.useScaleFallback && resolved.partId && mappedIds.size > 1) {
      let anyVisible = false;
      for (const partId of mappedIds) {
        const part = character.parts.find((item) => item.id === partId);
        if (!part) continue;
        const show = partId === resolved.partId;
        if (show) anyVisible = true;
        const prev = rig[partId] ?? {};
        const nextVisible = show;
        // Store visibility via opacity so Pixi path that reads opacity works; also scale tiny when hidden.
        rig[partId] = {
          ...prev,
          opacity: nextVisible ? (part.opacity ?? 1) : 0.001,
          scaleX: part.transform.scaleX || 1,
          scaleY: part.transform.scaleY || 1,
        };
        actorChanged = true;
      }
      if (!anyVisible) {
        const fallback = findPartByRole(character, "Mouth") ?? character.parts.find((p) => p.id === resolved.partId);
        if (fallback) {
          rig[fallback.id] = {
            ...rig[fallback.id],
            opacity: fallback.opacity ?? 1,
          };
        }
      }
    } else {
      // Scale fallback on single Mouth / Head — never invisible
      if (result.open <= 0.001 && Math.abs(result.pose.scaleY) < 0.01 && Math.abs(result.pose.scaleX) < 0.01) {
        // reset mouth scales toward bind when resting
        const mouth = findPartByRole(character, "Mouth");
        if (mouth && rig[mouth.id]) {
          const base = mouth.transform;
          rig[mouth.id] = {
            ...rig[mouth.id],
            scaleX: base.scaleX || 1,
            scaleY: base.scaleY || 1,
            opacity: mouth.opacity ?? 1,
          };
          actorChanged = true;
        }
      } else {
        const mouth = character.parts.find((p) => p.id === resolved.partId) ?? findPartByRole(character, "Mouth");
        const target = mouth ?? findPartByRole(character, "Head");
        if (target) {
          const strength = mouth ? 1 : 0.22;
          const baseScaleY = target.transform.scaleY || 1;
          const baseScaleX = target.transform.scaleX || 1;
          const baseRot = target.transform.rotation || 0;
          rig[target.id] = {
            ...rig[target.id],
            scaleY: baseScaleY * (1 + result.pose.scaleY * strength),
            scaleX: baseScaleX * (1 + result.pose.scaleX * strength),
            rotation: baseRot + result.pose.rotation * strength,
            opacity: target.opacity ?? 1,
          };
          actorChanged = true;
        }
      }
    }

    if (actorChanged) {
      nextActors[actor.id] = { ...actorState, rig };
      changed = true;
    }
  }

  return changed ? { ...state, actors: nextActors } : state;
}
