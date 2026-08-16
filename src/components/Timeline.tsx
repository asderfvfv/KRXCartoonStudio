import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ActionType, ActorAnimatableProperty, EasingName, MotionName, NumericKeyframe } from "../domain/types";
import {
  createDefaultLipSyncSettings,
  dialogueLocalToAssetTime,
  estimateSpeechDuration,
  evaluateMouthPose,
} from "../domain/audio";
import { visemeLabelRu } from "../domain/phonemeLipSync";
import { createId } from "../domain/ids";
import { listMontageTransitions, resolveMontageSegments } from "../domain/montage";
import { upsertActorPropertyKey } from "../domain/timelineKeys";
import { useEditor } from "../editor/EditorContext";
import { amplitudeEnvelopeCache } from "../systems/AmplitudeEnvelopeCache";
import { TimelineWaveform } from "./TimelineWaveform";
import { TimelineCurveGraph } from "./TimelineCurveGraph";
import { EASING_LABELS_RU, MOTION_LABELS_RU } from "../domain/gestureLibrary";
import type { Keyframe } from "../domain/types";

const easings: EasingName[] = ["linear", "easeIn", "easeOut", "easeInOut"];
const propertyLabels: Record<ActorAnimatableProperty, string> = {
  x: "X (влево/вправо)",
  y: "Y (вверх/вниз)",
  rotation: "поворот",
  scale: "масштаб",
  opacity: "видимость (0=нет, 1=есть)",
};

const timelineGestureLabels: Partial<Record<ActionType | MotionName, string>> = {
  Idle: "Стойка",
  Walk: "Ходьба",
  Run: "Бег",
  Wave: "Машет",
  Talk: "Говорит",
  Happy: "Радость",
  Angry: "Злость",
  Surprised: "Удивл.",
  Scared: "Страх",
  Laugh: "Смех",
  Jump: "Прыжок",
  Attack: "Удар",
  Hit: "Ударён",
  Fall: "Падение",
  Wait: "Пауза",
};

/** Animations the user paints onto a timeline range (not auto). */
const TIMELINE_BODY_MOTIONS: MotionName[] = [
  "Idle", "Walk", "Run", "Wave", "Talk", "Happy", "Angry", "Surprised", "Scared", "Laugh", "Jump",
];

type SelectedKey = { kind: "actor" | "camera" | "clip"; trackId: string; keyId: string };
type KeyClipboard = { kind: SelectedKey["kind"]; trackId: string; value: number; easing: EasingName };
type SelectedMedia = { kind: "dialogue" | "audio"; id: string };
type MediaDrag = {
  kind: "dialogue" | "audio";
  id: string;
  startClientX: number;
  startTime: number;
  laneWidth: number;
  linkMove: boolean;
  currentTime: number;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function nearlyEqual(a: number, b: number, eps = 0.04): boolean {
  return Math.abs(a - b) <= eps;
}

export function Timeline() {
  const editor = useEditor();
  const [mode, setMode] = useState<"scene" | "clip">("scene");
  const [selectedKey, setSelectedKey] = useState<SelectedKey | null>(null);
  const [selectedMotionId, setSelectedMotionId] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(null);
  const [actorProperty, setActorProperty] = useState<ActorAnimatableProperty>("x");
  const [clipboard, setClipboard] = useState<KeyClipboard | null>(null);
  const [envelopeRevision, setEnvelopeRevision] = useState(0);
  const [mediaDrag, setMediaDrag] = useState<MediaDrag | null>(null);
  /** Mark-in for placing an animation on a timeline range (От → playhead → кнопка). */
  const [animMarkIn, setAnimMarkIn] = useState<number | null>(null);
  /** Armed animation: drag on «Анимация» lane to paint the range. */
  const [paintMotion, setPaintMotion] = useState<MotionName | null>(null);
  const [paintDrag, setPaintDrag] = useState<{ start: number; end: number } | null>(null);
  const paintDragRef = useRef(paintDrag);
  paintDragRef.current = paintDrag;
  const paintMotionRef = useRef(paintMotion);
  paintMotionRef.current = paintMotion;
  const clipboardRef = useRef(clipboard);
  clipboardRef.current = clipboard;
  const selectedKeyRef = useRef(selectedKey);
  selectedKeyRef.current = selectedKey;
  const selectedMediaRef = useRef(selectedMedia);
  selectedMediaRef.current = selectedMedia;
  const selectedMotionIdRef = useRef(selectedMotionId);
  selectedMotionIdRef.current = selectedMotionId;
  const mediaDragRef = useRef(mediaDrag);
  mediaDragRef.current = mediaDrag;
  const mediaDragMovedRef = useRef(false);

  useEffect(() => {
    if (!editor.requestedTimelineMode) return;
    setMode(editor.requestedTimelineMode);
    if (editor.requestedTimelineMode === "scene") editor.setPreviewMotion(null);
    editor.clearRequestedTimelineMode();
  }, [editor, editor.requestedTimelineMode]);

  const timeline = editor.currentScene.generatedTimeline;
  const duration = mode === "scene" ? editor.playbackDuration : editor.currentClip.duration;
  const frameStep = 1 / Math.max(1, editor.project.fps);
  const dialogues = useMemo(
    () => [...(editor.currentScene.dialogues ?? [])].sort((a, b) => a.startTime - b.startTime),
    [editor.currentScene.dialogues],
  );
  const audioTracks = useMemo(
    () => [...(editor.currentScene.audioTracks ?? [])].sort((a, b) => a.startTime - b.startTime),
    [editor.currentScene.audioTracks],
  );
  const montageSegments = useMemo(
    () => (editor.montageMode ? resolveMontageSegments(editor.project) : []),
    [editor.montageMode, editor.project],
  );
  const montageTransitions = useMemo(
    () => (editor.montageMode ? listMontageTransitions(editor.project) : []),
    [editor.montageMode, editor.project],
  );
  const lipSync = useMemo(
    () => createDefaultLipSyncSettings(editor.currentScene.lipSyncSettings),
    [editor.currentScene.lipSyncSettings],
  );

  useEffect(() => {
    void editor.ensureAmplitudeEnvelopes().then(() => setEnvelopeRevision((value) => value + 1));
  }, [editor, editor.currentScene.audioTracks, editor.project.audioAssets]);

  const mouthPose = useMemo(() => {
    if (!lipSync.enabled || mode !== "scene") {
      return { open: 0, label: "" };
    }
    const result = evaluateMouthPose(editor.sceneTime, editor.currentScene.dialogues, {
      actorId: editor.selectedActorId ?? undefined,
      lipSync,
      resolveAmplitude: (line, localTime) => {
        if (!line.audioTrackId) return null;
        const track = editor.currentScene.audioTracks?.find((item) => item.id === line.audioTrackId);
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
    return {
      open: result.open,
      label: result.open > 0.02 ? (result.label || visemeLabelRu(result.viseme)) : "",
    };
  }, [
    editor.currentScene.audioTracks,
    editor.currentScene.dialogues,
    editor.sceneTime,
    editor.selectedActorId,
    envelopeRevision,
    lipSync,
    mode,
  ]);
  const mouthOpen = mouthPose.open;

  const sceneRows = useMemo(() => timeline ? [
    ...timeline.actorTracks.map((track) => ({
      id: track.id,
      label: editor.currentScene.actors.find((actor) => actor.id === track.actorId)?.name ?? track.actorId,
      property: track.property,
      keys: track.keyframes,
      kind: "actor" as const,
    })),
    ...timeline.cameraTracks.map((track) => ({
      id: track.id,
      label: "Камера",
      property: track.property,
      keys: track.keyframes,
      kind: "camera" as const,
    })),
  ] : [], [editor.currentScene.actors, timeline]);
  const clipRows = editor.currentClip.tracks.map((track) => ({
    id: track.id,
    label: editor.currentCharacter.parts.find((part) => part.id === track.partId)?.name ?? track.partId,
    property: track.property,
    keys: track.keyframes,
    kind: "clip" as const,
  }));
  const rows = mode === "scene" ? sceneRows : clipRows;
  const selectedTrack = selectedKey ? rows.find((row) => row.id === selectedKey.trackId) : undefined;
  const selectedFrame = selectedTrack?.keys.find((key) => key.id === selectedKey?.keyId);
  const selectedMotion = timeline?.motionSegments.find((segment) => segment.id === selectedMotionId);
  const selectedDialogue = selectedMedia?.kind === "dialogue"
    ? dialogues.find((line) => line.id === selectedMedia.id)
    : undefined;
  const selectedAudio = selectedMedia?.kind === "audio"
    ? audioTracks.find((track) => track.id === selectedMedia.id)
    : undefined;

  const updateFrame = (field: "time" | "value" | "easing", value: number | EasingName) => {
    if (!selectedKey) return;
    editor.commit("Ключ Timeline изменён", (draft) => {
      if (selectedKey.kind === "clip") {
        const key = draft.animationClips.find((clip) => clip.id === editor.currentClip.id)!.tracks.find((track) => track.id === selectedKey.trackId)!.keyframes.find((item) => item.id === selectedKey.keyId)!;
        if (field === "easing") key.easing = value as EasingName;
        else key[field] = Number(value);
      } else {
        const generated = draft.scenes!.find((scene) => scene.id === editor.currentScene.id)!.generatedTimeline!;
        const tracks = selectedKey.kind === "actor" ? generated.actorTracks : generated.cameraTracks;
        const key = tracks.find((track) => track.id === selectedKey.trackId)!.keyframes.find((item) => item.id === selectedKey.keyId)!;
        if (field === "easing") key.easing = value as EasingName;
        else key[field] = Number(value);
        generated.manualEdits = true;
      }
    });
  };

  const addActorKey = () => {
    if (!editor.selectedActorId) {
      editor.setStatus("Сначала выберите актёра на сцене");
      return;
    }
    const actor = editor.currentScene.actors.find((item) => item.id === editor.selectedActorId);
    if (!actor) return;
    const baseValue = actorProperty === "x" || actorProperty === "y"
      ? actor.position[actorProperty]
      : actorProperty === "opacity"
        ? actor.opacity ?? 1
        : actor[actorProperty];
    const at = editor.time;
    editor.commit("Ключ актёра добавлен", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
      upsertActorPropertyKey(scene, actor.id, actorProperty, at, baseValue);
    });
    editor.setStatus(`Ключ «${propertyLabels[actorProperty]}» @ ${at.toFixed(2)}с — ◆ на дорожке`);
  };

  const pasteKeyAtPlayhead = () => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const at = editor.time;
    if (clip.kind === "clip") {
      editor.commit("Ключ вставлен", (draft) => {
        const track = draft.animationClips.find((item) => item.id === editor.currentClip.id)?.tracks.find((item) => item.id === clip.trackId);
        if (!track) return;
        const existing = track.keyframes.find((key) => Math.abs(key.time - at) < 0.0001);
        if (existing) {
          existing.value = clip.value;
          existing.easing = clip.easing;
          setSelectedKey({ kind: "clip", trackId: track.id, keyId: existing.id });
        } else {
          const id = createId("key");
          track.keyframes.push({ id, time: Math.max(0, Math.min(editor.currentClip.duration, at)), value: clip.value, easing: clip.easing });
          track.keyframes.sort((a, b) => a.time - b.time);
          setSelectedKey({ kind: "clip", trackId: track.id, keyId: id });
        }
      });
      return;
    }
    editor.commit("Ключ вставлен", (draft) => {
      const generated = draft.scenes!.find((scene) => scene.id === editor.currentScene.id)?.generatedTimeline;
      if (!generated) return;
      const tracks = clip.kind === "actor" ? generated.actorTracks : generated.cameraTracks;
      const track = tracks.find((item) => item.id === clip.trackId);
      if (!track) return;
      const existing = track.keyframes.find((key) => Math.abs(key.time - at) < 0.0001);
      if (existing) {
        existing.value = clip.value;
        existing.easing = clip.easing;
        setSelectedKey({ kind: clip.kind, trackId: track.id, keyId: existing.id });
      } else {
        const id = createId("manual-key");
        track.keyframes.push({ id, time: Math.max(0, at), value: clip.value, easing: clip.easing });
        track.keyframes.sort((a, b) => a.time - b.time);
        setSelectedKey({ kind: clip.kind, trackId: track.id, keyId: id });
      }
      generated.manualEdits = true;
    });
  };

  const deleteSelectedKey = () => {
    const key = selectedKeyRef.current;
    if (!key) return;
    if (key.kind === "clip") {
      editor.deleteKeyframe(key.trackId, key.keyId);
      setSelectedKey(null);
      return;
    }
    editor.commit("Ключ удалён", (draft) => {
      const generated = draft.scenes!.find((scene) => scene.id === editor.currentScene.id)?.generatedTimeline;
      if (!generated) return;
      const tracks = key.kind === "actor" ? generated.actorTracks : generated.cameraTracks;
      const track = tracks.find((item) => item.id === key.trackId);
      if (!track) return;
      track.keyframes = track.keyframes.filter((item) => item.id !== key.keyId);
      generated.manualEdits = true;
    });
    setSelectedKey(null);
  };

  const deleteSelectedMedia = (withLinkedDialogues = false) => {
    const media = selectedMediaRef.current;
    if (!media) return false;
    if (media.kind === "audio") {
      if (withLinkedDialogues) {
        const linked = (editor.currentScene.dialogues ?? [])
          .filter((line) => line.audioTrackId === media.id)
          .map((line) => line.id);
        for (const id of linked) editor.deleteDialogue(id);
      }
      editor.deleteAudioTrack(media.id);
    } else {
      editor.deleteDialogue(media.id);
    }
    setSelectedMedia(null);
    return true;
  };

  const deleteSelectedMotion = () => {
    const id = selectedMotionIdRef.current;
    if (!id) return false;
    editor.commit("Жест удалён с Timeline", (draft) => {
      const generated = draft.scenes!.find((scene) => scene.id === editor.currentScene.id)?.generatedTimeline;
      if (!generated) return;
      generated.motionSegments = generated.motionSegments.filter((item) => item.id !== id);
      generated.manualEdits = true;
    });
    setSelectedMotionId(null);
    return true;
  };

  const clearAllSceneAudio = () => {
    if (!audioTracks.length && !dialogues.length) return;
    if (!window.confirm("Удалить все аудиодорожки и реплики с этой сцены?")) return;
    editor.commit("Аудио и реплики сцены очищены", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
      scene.audioTracks = [];
      scene.dialogues = [];
    });
    editor.audioEngine.pauseAll();
    setSelectedMedia(null);
  };

  const clearAnimSelection = () => {
    setSelectedKey(null);
    setSelectedMotionId(null);
  };

  const beginMediaDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: "dialogue" | "audio",
    id: string,
    startTime: number,
  ) => {
    if (event.button !== 0) return;
    const lane = (event.currentTarget.closest(".track-lane") as HTMLElement | null);
    const laneWidth = lane?.clientWidth || 1;
    event.currentTarget.setPointerCapture(event.pointerId);
    mediaDragMovedRef.current = false;
    setMediaDrag({
      kind,
      id,
      startClientX: event.clientX,
      startTime,
      laneWidth,
      linkMove: event.shiftKey,
      currentTime: startTime,
    });
    setSelectedMedia({ kind, id });
    clearAnimSelection();
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = mediaDragRef.current;
      if (!drag) return;
      const dt = ((event.clientX - drag.startClientX) / Math.max(1, drag.laneWidth)) * duration;
      if (Math.abs(dt) > 0.002) mediaDragMovedRef.current = true;
      const next = Math.max(0, Math.min(Math.max(0, duration - 0.05), drag.startTime + dt));
      setMediaDrag({ ...drag, currentTime: next });
    };
    const onUp = () => {
      const drag = mediaDragRef.current;
      if (!drag) return;
      const delta = drag.currentTime - drag.startTime;
      if (!mediaDragMovedRef.current || Math.abs(delta) < 0.0005) {
        setMediaDrag(null);
        editor.setPlaying(false);
        editor.setTime(drag.startTime);
        return;
      }
      if (drag.kind === "dialogue") {
        editor.commit("Реплика сдвинута", (draft) => {
          const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
          const line = scene.dialogues?.find((item) => item.id === drag.id);
          if (!line) return;
          line.startTime = drag.currentTime;
          if (drag.linkMove && line.audioTrackId) {
            const track = scene.audioTracks?.find((item) => item.id === line.audioTrackId);
            if (track) track.startTime = Math.max(0, track.startTime + delta);
          }
        });
      } else {
        editor.commit("Аудио сдвинуто", (draft) => {
          const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
          const track = scene.audioTracks?.find((item) => item.id === drag.id);
          if (!track) return;
          track.startTime = drag.currentTime;
          if (drag.linkMove) {
            for (const line of scene.dialogues ?? []) {
              if (line.audioTrackId === track.id) line.startTime = Math.max(0, line.startTime + delta);
            }
          }
        });
      }
      editor.setPlaying(false);
      editor.setTime(drag.currentTime);
      setMediaDrag(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [duration, editor]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "c") {
        if (!selectedKeyRef.current) return;
        event.preventDefault();
        const key = selectedKeyRef.current;
        const row = (mode === "scene" ? sceneRows : clipRows).find((item) => item.id === key.trackId);
        const frame = row?.keys.find((item) => item.id === key.keyId);
        if (!frame) return;
        setClipboard({ kind: key.kind, trackId: key.trackId, value: frame.value, easing: frame.easing });
        return;
      }
      if (mod && event.key.toLowerCase() === "v") {
        if (!clipboardRef.current) return;
        event.preventDefault();
        pasteKeyAtPlayhead();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && !mod) {
        if (selectedMediaRef.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          deleteSelectedMedia(false);
          return;
        }
        if (selectedMotionIdRef.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          deleteSelectedMotion();
          return;
        }
        if (selectedKeyRef.current) {
          event.preventDefault();
          event.stopImmediatePropagation();
          deleteSelectedKey();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const handleCopyClick = () => {
    if (!selectedKey || !selectedFrame) return;
    setClipboard({ kind: selectedKey.kind, trackId: selectedKey.trackId, value: selectedFrame.value, easing: selectedFrame.easing });
  };

  const mediaStart = (kind: "dialogue" | "audio", id: string, fallback: number) => {
    if (mediaDrag && mediaDrag.kind === kind && mediaDrag.id === id) return mediaDrag.currentTime;
    return fallback;
  };

  return (
    <section className="timeline panel">
      <div className="timeline-toolbar">
        <button title="Стоп" onClick={() => { editor.setPlaying(false); editor.setTime(0); }}>■</button>
        <button className={editor.playing ? "active" : ""} title={editor.playing ? "Пауза" : "Пуск"} onClick={() => editor.setPlaying(!editor.playing)}>{editor.playing ? "Ⅱ" : "▶"}</button>
        <label className="loop-control"><input type="checkbox" checked={editor.loop} onChange={(event) => editor.setLoop(event.target.checked)} /> Цикл</label>
        <label className="loop-control" title="Играть все сцены монтажа подряд"><input type="checkbox" checked={editor.montageMode} onChange={(event) => editor.setMontageMode(event.target.checked)} /> Монтаж</label>
        <label className="loop-control" title="Призраки позы до/после ползунка (синий = прошлое, зелёный = будущее)">
          <input type="checkbox" checked={editor.onionSkinEnabled} onChange={(event) => editor.setOnionSkinEnabled(event.target.checked)} /> Onion
        </label>
        <label className="loop-control" title="При перемещении актёра автоматически пишет ключи X/Y на ползунке">
          <input
            type="checkbox"
            checked={editor.studioPrefs.autoKey !== false}
            onChange={(event) => editor.setStudioPrefs({ ...editor.studioPrefs, autoKey: event.target.checked })}
          /> Автоключ
        </label>
        <select value={mode} onChange={(event) => {
          const next = event.target.value as "scene" | "clip";
          setMode(next);
          if (next === "scene") editor.setPreviewMotion(null);
          else editor.setPreviewMotion((["Idle", "Wave"].includes(editor.currentClip.name) ? editor.currentClip.name : null) as MotionName | null);
        }} title="Таймлайн сцены или правка клипа жеста">
          <option value="scene">Таймлайн</option>
          <option value="clip">Клип жеста</option>
        </select>
        {mode === "clip" && (
          <select value={editor.currentClipId} onChange={(event) => {
            editor.setCurrentClipId(event.target.value);
            const clip = editor.project.animationClips.find((item) => item.id === event.target.value);
            editor.setPreviewMotion((clip && ["Idle", "Wave"].includes(clip.name) ? clip.name : null) as MotionName | null);
          }}>
            {editor.project.animationClips.map((clip) => (
              <option value={clip.id} key={clip.id}>{MOTION_LABELS_RU[clip.name as MotionName] ?? clip.name}</option>
            ))}
          </select>
        )}
        <label className="duration-control" title="Длина текущей сцены">
          <span>Длина</span>
          <input
            type="number"
            min={0.5}
            max={600}
            step={0.5}
            value={Number(editor.currentScene.duration.toFixed(2))}
            onChange={(event) => editor.setSceneDuration(Number(event.target.value))}
          />
          <span>с</span>
        </label>
        <span className="time-readout">{editor.time.toFixed(2)} с <small>/ {duration.toFixed(1)} с{editor.montageMode ? ` · сцена ${editor.sceneTime.toFixed(1)}с` : ""}{editor.montageBlend != null ? ` · XF ${(editor.montageBlend * 100).toFixed(0)}%` : ""}</small></span>
        <span className="fps-readout">{editor.project.fps} fps</span>
        {mode === "scene" && (
          <div className="lipsync-meter" title={lipSync.enabled ? (mouthPose.label ? `Визема: ${mouthPose.label}` : "Фонемы + WAV на playhead") : "Lip-sync выкл — вкладка Аудио"}>
            <span>Рот</span>
            <div className="lipsync-meter-bar" aria-hidden>
              <div style={{ width: `${Math.round(Math.max(0, Math.min(1, mouthOpen)) * 100)}%` }} />
            </div>
            <small>{lipSync.enabled ? (mouthPose.label ? `${mouthPose.label} ${Math.round(mouthOpen * 100)}%` : `${Math.round(mouthOpen * 100)}%`) : "выкл"}</small>
          </div>
        )}
        {mode === "scene" && (
          <div className="manual-key-add" title="1) Ползунок на время  2) Сдвиньте актёра / масштаб  3) Выберите свойство  4) «＋ Ключ» → ◆ на шкале">
            <select value={actorProperty} onChange={(event) => setActorProperty(event.target.value as ActorAnimatableProperty)}>
              {(Object.keys(propertyLabels) as ActorAnimatableProperty[]).map((property) => (
                <option key={property} value={property}>{propertyLabels[property]}</option>
              ))}
            </select>
            <button
              type="button"
              className="accent"
              disabled={!editor.selectedActorId}
              onClick={addActorKey}
              title={!editor.selectedActorId ? "Выберите актёра" : `Ключ «${propertyLabels[actorProperty]}» на ${editor.time.toFixed(2)}с`}
            >
              ＋ Ключ
            </button>
          </div>
        )}
        {mode === "scene" && (
          <button type="button" title="Собрать ролик: Экспорт" onClick={() => editor.openToolPanel("export")}>
            Экспорт…
          </button>
        )}
      </div>

      {mode === "scene" && (
        <div className="timeline-recipe" aria-label="Как поставить анимацию">
          <strong>Анимация вручную:</strong>
          <span>1) ползунок на начало → «От»</span>
          <span>2) ползунок на конец</span>
          <span>3) кнопка Ходьба / Машет / …</span>
          <span>или выбери кнопку и тяни мышью по дорожке «Анимация»</span>
        </div>
      )}

      {mode === "scene" && (
        <div className="timeline-director-row" aria-label="Анимация на участок">
          <span className="timeline-director-label">Анимация</span>
          <button
            type="button"
            className={animMarkIn != null ? "active" : ""}
            title="Запомнить начало участка (текущее время)"
            onClick={() => {
              setAnimMarkIn(editor.time);
              editor.setStatus(`Отметка «От» @ ${editor.time.toFixed(2)}с — подвиньте ползунок на конец и нажмите анимацию`);
            }}
          >
            От {animMarkIn != null ? animMarkIn.toFixed(1) : "…"}с
          </button>
          <button
            type="button"
            disabled={animMarkIn == null}
            title="Сбросить отметку начала"
            onClick={() => setAnimMarkIn(null)}
          >
            Сброс
          </button>
          {TIMELINE_BODY_MOTIONS.map((motion) => (
            <button
              key={motion}
              type="button"
              className={paintMotion === motion ? "active" : ""}
              disabled={!editor.selectedActorId}
              title={
                !editor.selectedActorId
                  ? "Сначала кликните героя"
                  : animMarkIn != null
                    ? `Поставить «${timelineGestureLabels[motion]}» с ${Math.min(animMarkIn, editor.time).toFixed(1)}с до ${Math.max(animMarkIn, editor.time).toFixed(1)}с`
                    : `Клик = вставить на ползунок · или выбери и тяни по дорожке «Анимация»`
              }
              onClick={() => {
                if (!editor.selectedActorId) return;
                if (animMarkIn != null) {
                  const start = Math.min(animMarkIn, editor.time);
                  const end = Math.max(animMarkIn, editor.time);
                  const span = Math.max(0.15, end - start);
                  editor.insertMotionSegment(motion, { startTime: start, duration: span });
                  setAnimMarkIn(null);
                  setPaintMotion(null);
                  return;
                }
                // Arm paint mode + place short default at playhead if already armed same
                if (paintMotion === motion) {
                  editor.insertMotionSegment(motion, { startTime: editor.time, duration: motion === "Walk" || motion === "Run" ? 2 : 1 });
                  setPaintMotion(null);
                } else {
                  setPaintMotion(motion);
                  editor.setStatus(`«${timelineGestureLabels[motion]}» выбрана — тяните мышью по дорожке «Анимация» или нажмите ещё раз для вставки @ ${editor.time.toFixed(1)}с`);
                }
              }}
            >
              {timelineGestureLabels[motion] ?? motion}
            </button>
          ))}
          <button
            type="button"
            className={editor.tool === "path" ? "active" : ""}
            disabled={!editor.selectedActorId}
            title="Нарисовать путь на сцене (и ходьбу по линии)"
            onClick={() => editor.setTool("path")}
          >
            Путь на сцене
          </button>
          <span className="timeline-dir-sep" aria-hidden="true" />
          <button type="button" title="Импорт WAV/MP3" onClick={() => void editor.importAudio()}>＋ Аудио</button>
          <button type="button" title="Новая реплика" onClick={() => editor.addDialogue()}>＋ Реплика</button>
          <button
            type="button"
            className="danger"
            disabled={!audioTracks.length && !dialogues.length}
            title="Удалить весь звук и реплики сцены"
            onClick={clearAllSceneAudio}
          >
            Очистить звук
          </button>
        </div>
      )}

      {(editor.project.scenes?.length ?? 0) > 1 && (
        <div className="timeline-scene-strip" aria-label="Сцены мультика">
          <span className="timeline-director-label">Сцены</span>
          {(editor.project.scenes ?? []).map((scene, index) => (
            <button
              key={scene.id}
              type="button"
              className={scene.id === editor.currentSceneId ? "active" : ""}
              title={`${scene.name}: ${scene.duration.toFixed(1)}с`}
              onClick={() => {
                if (editor.montageMode) editor.jumpToMontageScene(scene.id);
                else editor.setCurrentSceneId(scene.id);
              }}
            >
              {index + 1}. {scene.name} · {scene.duration.toFixed(0)}с
            </button>
          ))}
          {!editor.montageMode && (
            <small className="timeline-manual-hint" title="Включите «Монтаж» сверху">Монтаж = подряд</small>
          )}
        </div>
      )}

      <div className="scrubber timeline-ruler-wrap">
        {editor.montageMode && duration > 0 && (
          <div className="montage-scrub-markers" aria-hidden="true">
            {montageSegments.map((segment) => (
              <div
                key={segment.scene.id}
                className={`montage-scrub-seg${segment.scene.id === editor.currentSceneId ? " current" : ""}`}
                style={{
                  left: `${(segment.offset / duration) * 100}%`,
                  width: `${(segment.duration / duration) * 100}%`,
                }}
                title={`${segment.scene.name}: ${segment.duration.toFixed(1)}с`}
              >
                <span>{segment.scene.name} {segment.duration.toFixed(0)}с</span>
              </div>
            ))}
            {montageTransitions.map((marker) => (
              <button
                key={`mt-${marker.index}`}
                type="button"
                className={`montage-scrub-xf ${marker.kind}`}
                style={{
                  left: `${(marker.mid / duration) * 100}%`,
                  width: marker.kind === "crossfade" && marker.end > marker.start
                    ? `${Math.max(0.8, ((marker.end - marker.start) / duration) * 100)}%`
                    : undefined,
                }}
                title={
                  marker.kind === "crossfade"
                    ? `Плавный ${marker.fromName} → ${marker.toName}`
                    : `Резкий ${marker.fromName} → ${marker.toName}`
                }
                onClick={() => {
                  editor.setPlaying(false);
                  editor.setTime(marker.mid);
                }}
              />
            ))}
          </div>
        )}
        <div
          className="timeline-ruler"
          role="slider"
          aria-label="Время на шкале"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={Math.min(editor.time, duration)}
          tabIndex={0}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
            editor.setPlaying(false);
            editor.setTime(ratio * duration);
          }}
        >
          {Array.from({ length: Math.floor(duration) + 1 }, (_, second) => (
            <span
              key={second}
              className="timeline-ruler-tick"
              style={{ left: `${duration > 0 ? (second / duration) * 100 : 0}%` }}
            >
              {second}с
            </span>
          ))}
          <span
            className="timeline-ruler-playhead"
            style={{ left: `${duration > 0 ? (Math.min(editor.time, duration) / duration) * 100 : 0}%` }}
          />
        </div>
        <input
          className="timeline-scrub-range"
          aria-label="Ползунок времени"
          type="range"
          min={0}
          max={duration}
          step={0.001}
          value={Math.min(editor.time, duration)}
          onChange={(event) => { editor.setPlaying(false); editor.setTime(Number(event.target.value)); }}
        />
      </div>

      <div className="track-area">
        <div className="track-labels">
          {mode === "scene" && editor.currentScene.actors.map((actor, index) => (
            <div
              className={`track-label actor-label${editor.selectedActorId === actor.id ? " selected" : ""}`}
              key={`actor-label-${actor.id}`}
              title="Видеодорожка актёра — как V1 в Premiere"
            >
              <strong>V{index + 1} {actor.name}</strong>
              <span>видео</span>
            </div>
          ))}
          {!!rows.length && <div className="track-header-spacer" key="spacer-keys" />}
          {rows.map((row) => (
            <div className="track-label key-label" key={row.id}>
              <strong>{row.label}</strong>
              <span>{row.property}</span>
            </div>
          ))}
          {mode === "scene" && editor.selectedActorId && (
            <>
              <div className="track-header-spacer" key="spacer-motion" />
              <div className="track-label motion-label paint">
                <strong>Анимация</strong>
                <span>{paintMotion ? (timelineGestureLabels[paintMotion] ?? paintMotion) : "участок"}</span>
              </div>
            </>
          )}
          {mode === "scene" && timeline?.motionSegments
            .filter((segment) => !editor.selectedActorId || segment.actorId === editor.selectedActorId)
            .map((segment) => (
            <div className="track-label motion-label" key={`ml-${segment.id}`}>
              <strong>{timelineGestureLabels[segment.motion] ?? segment.motion}</strong>
              <span>{editor.currentScene.actors.find((actor) => actor.id === segment.actorId)?.name ?? "жест"}</span>
            </div>
          ))}
          {mode === "scene" && !!audioTracks.length && <div className="track-header-spacer" key="spacer-audio" />}
          {mode === "scene" && audioTracks.map((track, index) => (
            <div className="track-label audio-label" key={`label-${track.id}`}>
              <strong>A{index + 1} {track.muted ? "🔇 " : ""}{track.name}</strong>
              <span>аудио</span>
              <button
                type="button"
                className="danger track-label-del"
                title="Удалить дорожку (Del)"
                onClick={() => {
                  setSelectedMedia({ kind: "audio", id: track.id });
                  clearAnimSelection();
                  editor.deleteAudioTrack(track.id);
                  setSelectedMedia(null);
                }}
              >
                ×
              </button>
            </div>
          ))}
          {mode === "scene" && (
            <>
              <div className="track-header-spacer" key="spacer-dialogue" />
              <div className="track-label dialogue-label">
                <strong>Реплики</strong>
                <span>{dialogues.length}</span>
              </div>
            </>
          )}
        </div>
        <div className="track-lanes">
          <div
            className="timeline-playhead-line"
            style={{ left: `${duration > 0 ? (Math.min(editor.time, duration) / duration) * 100 : 0}%` }}
            aria-hidden="true"
          />
          {mode === "scene" && editor.currentScene.actors.map((actor) => (
            <div className="track-lane actor-lane" key={`actor-lane-${actor.id}`}>
              <button
                type="button"
                className={`actor-block${editor.selectedActorId === actor.id ? " selected" : ""}`}
                style={{ left: "0%", width: "100%" }}
                title={`${actor.name}. Клик — выбрать. 2× клик — ключ. Желтый ◆ = ключ анимации.`}
                onClick={() => {
                  editor.setSelectedActorId(actor.id);
                  clearAnimSelection();
                  setSelectedMedia(null);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  editor.setSelectedActorId(actor.id);
                  addActorKey();
                }}
              >
                <span className="actor-block-label">{actor.name}</span>
              </button>
              {timeline?.actorTracks
                .filter((track) => track.actorId === actor.id)
                .flatMap((track) => track.keyframes.map((key) => (
                  <button
                    key={`${track.id}-${key.id}`}
                    type="button"
                    className={`keyframe on-clip${selectedKey?.keyId === key.id ? " selected" : ""}`}
                    style={{ left: `${(key.time / duration) * 100}%` }}
                    title={`${track.property} @ ${key.time.toFixed(2)}с = ${key.value} · ПКМ — удалить`}
                    onClick={() => {
                      setSelectedKey({ kind: "actor", trackId: track.id, keyId: key.id });
                      setSelectedMotionId(null);
                      setSelectedMedia(null);
                      editor.setTime(key.time);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      editor.setTime(key.time);
                      setSelectedKey({ kind: "actor", trackId: track.id, keyId: key.id });
                      editor.commit("Ключ удалён", (draft) => {
                        const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id);
                        const row = scene?.generatedTimeline?.actorTracks.find((item) => item.id === track.id);
                        if (!row) return;
                        row.keyframes = row.keyframes.filter((item) => item.id !== key.id);
                        if (scene?.generatedTimeline) scene.generatedTimeline.manualEdits = true;
                      });
                      setSelectedKey(null);
                      editor.setStatus(`Удалён ключ ${track.property} @ ${key.time.toFixed(2)}с`);
                    }}
                  >
                    ◆
                  </button>
                )))}
            </div>
          ))}
          {!!rows.length && <div className="track-header-spacer" key="lane-spacer-keys" />}
          {rows.map((row) => (
            <div className="track-lane key-lane" key={row.id}>
              {row.keys.map((key: NumericKeyframe) => (
                <button
                  key={key.id}
                  className={`keyframe ${selectedKey?.keyId === key.id ? "selected" : ""}`}
                  style={{ left: `${(key.time / duration) * 100}%` }}
                  title={`${key.time.toFixed(3)}с · ${key.value} · ${key.easing}`}
                  onClick={() => { setSelectedKey({ kind: row.kind, trackId: row.id, keyId: key.id }); setSelectedMotionId(null); setSelectedMedia(null); editor.setTime(key.time); }}
                >
                  ◆
                </button>
              ))}
            </div>
          ))}
          {mode === "scene" && editor.selectedActorId && (
            <div className="track-header-spacer" key="lane-spacer-motion" />
          )}
          {mode === "scene" && editor.selectedActorId && (
            <div
              className={`track-lane motion-lane paint-lane${paintMotion ? " armed" : ""}`}
              title={paintMotion ? `Тяните, чтобы поставить «${timelineGestureLabels[paintMotion]}»` : "Выберите анимацию сверху, затем тяните здесь"}
              onPointerDown={(event) => {
                if (!paintMotion || !editor.selectedActorId) return;
                if (event.button !== 0) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
                const t = ratio * duration;
                const next = { start: t, end: t };
                paintDragRef.current = next;
                setPaintDrag(next);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!paintDragRef.current) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
                const end = ratio * duration;
                const next = { start: paintDragRef.current.start, end };
                paintDragRef.current = next;
                setPaintDrag(next);
              }}
              onPointerUp={(event) => {
                const drag = paintDragRef.current;
                const motion = paintMotionRef.current;
                paintDragRef.current = null;
                setPaintDrag(null);
                if (!drag || !motion) return;
                const start = Math.min(drag.start, drag.end);
                const end = Math.max(drag.start, drag.end);
                const span = Math.max(0.15, end - start);
                editor.insertMotionSegment(motion, { startTime: start, duration: span });
                setPaintMotion(null);
                setAnimMarkIn(null);
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  // ignore
                }
              }}
            >
              {paintDrag && (
                <div
                  className="motion-block paint-preview"
                  style={{
                    left: `${(Math.min(paintDrag.start, paintDrag.end) / duration) * 100}%`,
                    width: `${Math.max(1.2, (Math.abs(paintDrag.end - paintDrag.start) / duration) * 100)}%`,
                  }}
                >
                  {timelineGestureLabels[paintMotion!] ?? paintMotion}
                </div>
              )}
              {animMarkIn != null && (
                <div
                  className="anim-mark-in"
                  style={{ left: `${(animMarkIn / duration) * 100}%` }}
                  title={`От ${animMarkIn.toFixed(2)}с`}
                />
              )}
            </div>
          )}
          {mode === "scene" && timeline?.motionSegments
            .filter((segment) => !editor.selectedActorId || segment.actorId === editor.selectedActorId)
            .map((segment) => (
            <div className="track-lane motion-lane" key={segment.id}>
              <button
                type="button"
                className={`motion-block ${selectedMotionId === segment.id ? "selected" : ""}`}
                style={{ left: `${(segment.start / duration) * 100}%`, width: `${Math.max(1.2, (segment.duration / duration) * 100)}%` }}
                title={`${timelineGestureLabels[segment.motion] ?? segment.motion} · ПКМ удалить · тяните край длительности внизу`}
                onClick={() => { setSelectedMotionId(segment.id); setSelectedKey(null); setSelectedMedia(null); editor.setTime(segment.start); }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setSelectedMotionId(segment.id);
                  editor.commit("Анимация удалена с таймлайна", (draft) => {
                    const generated = draft.scenes!.find((scene) => scene.id === editor.currentScene.id)?.generatedTimeline;
                    if (!generated) return;
                    generated.motionSegments = generated.motionSegments.filter((item) => item.id !== segment.id);
                    generated.manualEdits = true;
                  });
                  setSelectedMotionId(null);
                  editor.setStatus("Анимация удалена");
                }}
              >
                {timelineGestureLabels[segment.motion] ?? segment.motion}
              </button>
            </div>
          ))}
          {mode === "scene" && !!audioTracks.length && <div className="track-header-spacer" key="lane-spacer-audio" />}
          {mode === "scene" && audioTracks.map((track) => {
            const start = mediaStart("audio", track.id, track.startTime);
            const hasWave = amplitudeEnvelopeCache.has(track.assetId);
            const linkedCount = dialogues.filter((line) => line.audioTrackId === track.id).length;
            return (
              <div className="track-lane audio-lane" key={`lane-${track.id}`}>
                <button
                  type="button"
                  className={`audio-block${selectedMedia?.kind === "audio" && selectedMedia.id === track.id ? " selected" : ""}${track.muted ? " muted" : ""}`}
                  style={{
                    left: `${(start / duration) * 100}%`,
                    width: `${Math.max(1.8, (Math.max(0.2, track.duration) / duration) * 100)}%`,
                  }}
                  title={`${track.name}\n${start.toFixed(2)}с · ${track.duration.toFixed(2)}с${hasWave ? " · волна" : " · нет волны"}${linkedCount ? ` · реплик: ${linkedCount}` : ""}\nТяните мышью · Shift = вместе с репликами · Del = удалить`}
                  onPointerDown={(event) => beginMediaDrag(event, "audio", track.id, track.startTime)}
                  onClick={(event) => {
                    if (mediaDragMovedRef.current) {
                      mediaDragMovedRef.current = false;
                      return;
                    }
                    event.preventDefault();
                    setSelectedMedia({ kind: "audio", id: track.id });
                    clearAnimSelection();
                    editor.setPlaying(false);
                    editor.setTime(start);
                  }}
                >
                  <TimelineWaveform
                    assetId={track.assetId}
                    trimStart={track.trimStart ?? 0}
                    duration={track.duration}
                    volume={track.volume}
                    muted={track.muted}
                    revision={envelopeRevision}
                  />
                  <span className="audio-block-label">{track.name}</span>
                </button>
              </div>
            );
          })}
          {mode === "scene" && <div className="track-header-spacer" key="lane-spacer-dialogue" />}
          {mode === "scene" && (
            <div className="track-lane dialogue-lane">
              {dialogues.map((line) => {
                const actorName = editor.currentScene.actors.find((actor) => actor.id === line.actorId)?.name;
                const label = (line.text || "…").trim().slice(0, 28);
                const start = mediaStart("dialogue", line.id, line.startTime);
                const linked = line.audioTrackId
                  ? audioTracks.find((track) => track.id === line.audioTrackId)
                  : undefined;
                const inSync = linked
                  ? nearlyEqual(linked.startTime, line.startTime) && nearlyEqual(linked.duration, line.duration, 0.08)
                  : false;
                const active = editor.sceneTime >= line.startTime && editor.sceneTime < line.startTime + Math.max(0.05, line.duration);
                return (
                  <button
                    key={line.id}
                    type="button"
                    className={`dialogue-block${selectedMedia?.kind === "dialogue" && selectedMedia.id === line.id ? " selected" : ""}${active ? " active" : ""}${linked ? (inSync ? " linked" : " unsynced") : ""}`}
                    style={{
                      left: `${(start / duration) * 100}%`,
                      width: `${Math.max(1.5, (Math.max(0.2, line.duration) / duration) * 100)}%`,
                    }}
                    title={`${actorName ? `${actorName}: ` : ""}${line.text}\n${start.toFixed(2)}с · ${line.duration.toFixed(2)}с${linked ? (inSync ? " · синхрон с аудио" : " · не синхрон — Sync") : " · без аудио"}\nLipSync: ${line.lipSyncStatus ?? "—"}\nТяните мышью · Shift = вместе с аудио`}
                    onPointerDown={(event) => beginMediaDrag(event, "dialogue", line.id, line.startTime)}
                    onClick={(event) => {
                      if (mediaDragMovedRef.current) {
                        mediaDragMovedRef.current = false;
                        return;
                      }
                      event.preventDefault();
                      setSelectedMedia({ kind: "dialogue", id: line.id });
                      clearAnimSelection();
                      editor.setPlaying(false);
                      editor.setTime(start);
                      if (line.actorId) editor.setSelectedActorId(line.actorId);
                      editor.requestRightTab("audio");
                    }}
                  >
                    {linked ? (inSync ? "🔗 " : "⚠ ") : ""}{actorName ? `${actorName}: ${label}` : label}
                    {line.lipSync?.cues?.length ? (
                      <span className="lipsync-cue-strip" aria-hidden>
                        {line.lipSync.cues.slice(0, 16).map((cue, index) => (
                          <em key={`${line.id}-c-${index}`} style={{ flex: Math.max(0.08, cue.duration) }}>{cue.viseme.slice(0, 3)}</em>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              {!dialogues.length && <span className="dialogue-empty">Нет реплик — Аудио / Промпт / Мастер</span>}
            </div>
          )}
        </div>
        {!rows.length && !timeline?.motionSegments.length && mode === "scene" && !dialogues.length && !audioTracks.length && !editor.currentScene.actors.length && (
          <div className="empty-tracks">Актёры — «2. Актёр» / слева · звук — «＋ Аудио» · речь — «＋ Реплика» → текст → «Озвучить» · длина справа · сцены подряд = «Монтаж»</div>
        )}
      </div>

      <div className="keyframe-editor">
        {selectedFrame && selectedKey && (
          <>
            <strong>Ключ</strong>
            <label>Время <input type="number" min={0} max={duration} step={0.01} value={selectedFrame.time} onChange={(event) => updateFrame("time", Number(event.target.value))} /></label>
            <label>Значение <input type="number" step={0.1} value={selectedFrame.value} onChange={(event) => updateFrame("value", Number(event.target.value))} /></label>
            <select value={selectedFrame.easing} onChange={(event) => updateFrame("easing", event.target.value as EasingName)}>
              {easings.map((item) => <option key={item} value={item}>{EASING_LABELS_RU[item]}</option>)}
            </select>
            <button type="button" title="Ctrl+C" onClick={handleCopyClick}>Копия</button>
            <button type="button" title="Вставить на ползунок (Ctrl+V)" disabled={!clipboard} onClick={pasteKeyAtPlayhead}>Вставить</button>
            <button type="button" className="danger" title="Delete" onClick={deleteSelectedKey}>Удалить</button>
          </>
        )}
        {selectedFrame && selectedKey && selectedTrack && (
          <TimelineCurveGraph
            keyframes={selectedTrack.keys as Keyframe[]}
            selectedKeyId={selectedKey.keyId}
            duration={duration}
            playhead={editor.time}
            selectedEasing={selectedFrame.easing}
            onSeek={(time) => editor.setTime(time)}
            onChangeEasing={(easing) => updateFrame("easing", easing)}
          />
        )}
        {selectedMotion && (
          <>
            <strong>{selectedMotion.motion}</strong>
            <label>Старт <input type="number" step={0.01} value={selectedMotion.start} onChange={(event) => editor.commit("Старт жеста изменён", (draft) => {
              const motion = draft.scenes!.find((scene) => scene.id === editor.currentScene.id)!.generatedTimeline!.motionSegments.find((item) => item.id === selectedMotion.id)!;
              motion.start = Number(event.target.value);
              draft.scenes!.find((scene) => scene.id === editor.currentScene.id)!.generatedTimeline!.manualEdits = true;
            })} /></label>
            <label>Длит. <input type="number" step={0.01} value={selectedMotion.duration} onChange={(event) => editor.commit("Длительность жеста изменена", (draft) => {
              const generated = draft.scenes!.find((scene) => scene.id === editor.currentScene.id)!.generatedTimeline!;
              const motion = generated.motionSegments.find((item) => item.id === selectedMotion.id)!;
              motion.duration = Number(event.target.value);
              generated.manualEdits = true;
            })} /></label>
            <button type="button" className="danger" title="Delete" onClick={() => deleteSelectedMotion()}>Удалить жест</button>
          </>
        )}
        {selectedDialogue && (
          <>
            <strong>Реплика</strong>
            <label className="dialogue-text-edit">
              Текст
              <textarea
                rows={2}
                value={selectedDialogue.text}
                placeholder="Что говорит персонаж…"
                onChange={(event) => editor.updateDialogue(selectedDialogue.id, {
                  text: event.target.value,
                  duration: Math.max(0.4, estimateSpeechDuration(event.target.value)),
                })}
              />
            </label>
            <label>
              Актёр
              <select
                value={selectedDialogue.actorId ?? ""}
                onChange={(event) => editor.updateDialogue(selectedDialogue.id, { actorId: event.target.value || null })}
              >
                <option value="">—</option>
                {editor.currentScene.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>{actor.name}</option>
                ))}
              </select>
            </label>
            <label>Старт <input type="number" min={0} step={frameStep} value={Number(selectedDialogue.startTime.toFixed(3))} onChange={(event) => editor.updateDialogue(selectedDialogue.id, { startTime: Number(event.target.value) })} /></label>
            <label>Длит. <input type="number" min={0.05} step={frameStep} value={Number(selectedDialogue.duration.toFixed(3))} onChange={(event) => editor.updateDialogue(selectedDialogue.id, { duration: Number(event.target.value) })} /></label>
            <button type="button" title="Piper / Voice → WAV на Timeline" onClick={() => void editor.synthesizeDialogueLine(selectedDialogue.id)}>Озвучить</button>
            <button type="button" title="Голос и модели — панель Voice" onClick={() => editor.openToolPanel("voice")}>Голос…</button>
            <button type="button" title="−1 кадр" onClick={() => editor.updateDialogue(selectedDialogue.id, { startTime: Math.max(0, selectedDialogue.startTime - frameStep) })}>−кадр</button>
            <button type="button" title="+1 кадр" onClick={() => editor.updateDialogue(selectedDialogue.id, { startTime: selectedDialogue.startTime + frameStep })}>+кадр</button>
            <button type="button" disabled={!selectedDialogue.audioTrackId} title="Выровнять старт/длину по связанному аудио" onClick={() => editor.syncDialogueToLinkedTrack(selectedDialogue.id)}>Sync к аудио</button>
            <button type="button" className="danger" title="Delete" onClick={() => deleteSelectedMedia(false)}>Удалить</button>
            <small className="timeline-media-note">
              {selectedDialogue.audioTrackId ? "есть звук" : "пока только текст/субтитры"} · LS:{selectedDialogue.lipSyncStatus ?? "—"}
              {selectedDialogue.lipSync?.cues?.length ? ` (${selectedDialogue.lipSync.cues.length})` : ""}
            </small>
            {selectedDialogue.lipSync?.cues?.length ? (
              <label>
                Cue viseme
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const index = Number(event.target.selectedOptions[0]?.dataset.index);
                    const viseme = event.target.value;
                    event.target.value = "";
                    if (!Number.isFinite(index) || !viseme || !selectedDialogue.lipSync) return;
                    const cues = selectedDialogue.lipSync.cues.map((cue, i) => (
                      i === index ? { ...cue, viseme: viseme as import("../domain/visemeSystem").CartoonVisemeId, manual: true } : cue
                    ));
                    editor.updateDialogueLipSync(selectedDialogue.id, {
                      ...selectedDialogue.lipSync,
                      cues,
                      manuallyEdited: true,
                    }, "ready");
                  }}
                >
                  <option value="">править…</option>
                  {selectedDialogue.lipSync.cues.map((cue, index) => (
                    <optgroup key={`og-${index}`} label={`#${index} ${cue.viseme} @${cue.time.toFixed(2)}`}>
                      {(["REST", "A", "E", "I", "O", "U", "MBP", "FV", "L", "WQ", "CONSONANT", "CHJSH"] as const).map((id) => (
                        <option key={`${index}-${id}`} value={id} data-index={index}>{id}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            ) : null}
          </>
        )}
        {selectedAudio && (
          <>
            <strong>Аудио</strong>
            <label>Старт <input type="number" min={0} step={frameStep} value={Number(selectedAudio.startTime.toFixed(3))} onChange={(event) => editor.updateAudioTrack(selectedAudio.id, { startTime: Number(event.target.value) })} /></label>
            <label>Длит. <input type="number" min={0.05} step={frameStep} value={Number(selectedAudio.duration.toFixed(3))} onChange={(event) => editor.updateAudioTrack(selectedAudio.id, { duration: Number(event.target.value) })} /></label>
            <button type="button" title="−1 кадр" onClick={() => editor.updateAudioTrack(selectedAudio.id, { startTime: Math.max(0, selectedAudio.startTime - frameStep) })}>−кадр</button>
            <button type="button" title="+1 кадр" onClick={() => editor.updateAudioTrack(selectedAudio.id, { startTime: selectedAudio.startTime + frameStep })}>+кадр</button>
            <label className="loop-control"><input type="checkbox" checked={selectedAudio.muted} onChange={(event) => editor.updateAudioTrack(selectedAudio.id, { muted: event.target.checked })} /> Mute</label>
            <button type="button" className="danger" title="Delete" onClick={() => deleteSelectedMedia(false)}>Удалить</button>
            {dialogues.some((line) => line.audioTrackId === selectedAudio.id) ? (
              <button type="button" className="danger" title="Удалить дорожку и связанные реплики" onClick={() => deleteSelectedMedia(true)}>Удалить + реплики</button>
            ) : null}
            <small className="timeline-media-note">{amplitudeEnvelopeCache.has(selectedAudio.assetId) ? "волна есть" : "волна строится из WAV/MP3 на диске"} · Del</small>
          </>
        )}
        {!selectedFrame && !selectedMotion && !selectedDialogue && !selectedAudio && (
          <span className="timeline-hint">
            Ctrl+Z отмена · ◆ ключ · V1/A1 дорожки · ▶ Play · Экспорт
            {clipboard ? " · буфер ключа готов" : ""}
          </span>
        )}
      </div>
    </section>
  );
}
