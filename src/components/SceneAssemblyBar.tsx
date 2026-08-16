import { useRef, useState, type DragEvent } from "react";
import {
  DEFAULT_CROSSFADE_DURATION,
  effectiveCrossfadeDuration,
  MONTAGE_TRANSITION_CATALOG,
  montageTotalDuration,
  montageTransitionLabel,
  normalizeCrossfadeDuration,
  normalizeMontageTransition,
  resolveMontageSegments,
  scenePlaybackDuration,
  transitionNeedsOverlap,
} from "../domain/montage";
import { sceneTemplates, type SceneTemplateId } from "../domain/templates";
import { useEditor } from "../editor/EditorContext";

export function SceneAssemblyBar() {
  const editor = useEditor();
  const scenes = editor.project.scenes ?? [];
  const clips = editor.montage.clips;
  const transition = normalizeMontageTransition(editor.montage.transition);
  const crossfade = normalizeCrossfadeDuration(editor.montage.crossfadeDuration ?? DEFAULT_CROSSFADE_DURATION);
  const crossfadeEffective = effectiveCrossfadeDuration(editor.project);
  const total = montageTotalDuration(editor.project);
  const segments = resolveMontageSegments(editor.project);
  const enabledCount = clips.filter((clip) => clip.enabled).length;
  const dragClipId = useRef<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const onDragStart = (clipId: string) => (event: DragEvent) => {
    dragClipId.current = clipId;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/montage-clip", clipId);
  };

  const onDragOver = (index: number) => (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropIndex(index);
  };

  const onDrop = (index: number) => (event: DragEvent) => {
    event.preventDefault();
    const clipId = event.dataTransfer.getData("text/montage-clip") || dragClipId.current;
    setDropIndex(null);
    dragClipId.current = null;
    if (clipId) editor.reorderMontageClipTo(clipId, index);
  };

  const onDragEnd = () => {
    dragClipId.current = null;
    setDropIndex(null);
  };

  return (
    <section className="scene-assembly panel" aria-label="Сборка сцен">
      <div className="scene-assembly-head">
        <div>
          <strong>Сцены и переходы</strong>
          <small>
            {enabledCount}/{clips.length} в монтаже · {total.toFixed(1)}s
            {` · ${montageTransitionLabel(transition)}`}
            {transitionNeedsOverlap(transition) ? ` ${crossfadeEffective.toFixed(2)}s` : ""}
            {" · перетащите карточки для порядка"}
          </small>
        </div>
        <div className="scene-assembly-actions">
          <button type="button" title="Новая пустая сцена" onClick={editor.newScene}>＋ Сцена</button>
          <button type="button" onClick={editor.duplicateScene}>Дублировать</button>
          <button type="button" onClick={editor.renameScene}>Имя…</button>
          <button type="button" className="danger" title="Удалить текущую сцену" onClick={() => void editor.deleteScene()}>Удалить</button>
          <select
            defaultValue=""
            title="Шаблон сцены"
            onChange={(event) => {
              const value = event.target.value as SceneTemplateId | "";
              if (value) editor.newSceneFromTemplate(value);
              event.target.value = "";
            }}
          >
            <option value="">Шаблон…</option>
            {sceneTemplates.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <button
            type="button"
            className={editor.montageMode ? "active" : ""}
            title="Проигрывать все включённые сцены подряд"
            onClick={() => editor.setMontageMode(!editor.montageMode)}
          >
            {editor.montageMode ? "Монтаж ▶ вкл" : "Монтаж ▶"}
          </button>
          <button type="button" onClick={() => editor.openToolPanel("montage")}>Монтаж / экспорт…</button>
        </div>
      </div>

      <div className="scene-assembly-flow" role="list" onDragLeave={() => setDropIndex(null)}>
        {clips.map((clip, index) => {
          const scene = scenes.find((item) => item.id === clip.sceneId);
          if (!scene) return null;
          const active = scene.id === editor.currentSceneId;
          const duration = scenePlaybackDuration(scene);
          const segment = segments.find((item) => item.scene.id === scene.id);
          const showBridge = index < clips.length - 1;

          return (
            <div key={clip.id} className="scene-flow-item" role="listitem">
              <div
                className={`scene-chip ${active ? "active" : ""} ${clip.enabled ? "" : "disabled"} ${dropIndex === index ? "drop-target" : ""}`}
                draggable
                onDragStart={onDragStart(clip.id)}
                onDragOver={onDragOver(index)}
                onDrop={onDrop(index)}
                onDragEnd={onDragEnd}
              >
                <button
                  type="button"
                  className="scene-chip-main"
                  onClick={() => editor.setCurrentSceneId(scene.id)}
                  onDoubleClick={() => editor.jumpToMontageScene(scene.id)}
                  title="Клик — открыть · Двойной клик — прыжок в Монтаж ▶"
                >
                  <strong>{index + 1}. {scene.name}</strong>
                  <small>
                    {duration.toFixed(1)} с · {scene.actors.length} акт.
                    {segment ? ` · @${segment.offset.toFixed(1)} с` : ""}
                  </small>
                </button>
                <label className="scene-chip-enable" title="Включить в монтаж">
                  <input
                    type="checkbox"
                    checked={clip.enabled}
                    onChange={(event) => editor.toggleMontageClip(clip.id, event.target.checked)}
                  />
                  <span>вкл</span>
                </label>
                <div className="scene-chip-order">
                  <button type="button" disabled={index === 0} onClick={() => editor.moveMontageClipUp(clip.id)} title="Выше">↑</button>
                  <button type="button" disabled={index >= clips.length - 1} onClick={() => editor.moveMontageClipDown(clip.id)} title="Ниже">↓</button>
                </div>
              </div>

              {showBridge && (
                <div className={`scene-bridge ${transition}`} title={transition === "crossfade" ? `Плавный ${crossfadeEffective.toFixed(2)} с` : "Резкий"}>
                  <span className="scene-bridge-line" />
                  <span className="scene-bridge-label">{transition === "crossfade" ? `плавн. ${crossfadeEffective.toFixed(2)} с` : "резкий"}</span>
                  <span className="scene-bridge-line" />
                </div>
              )}
            </div>
          );
        })}
        {!clips.length && <p className="hint">Нет сцен — нажмите «＋ Сцена».</p>}
      </div>

      <div className="scene-assembly-transition">
        <span>Переход</span>
        <select
          value={transition}
          title="Общий переход между сценами"
          onChange={(event) => editor.updateMontageSettings({ transition: normalizeMontageTransition(event.target.value) })}
        >
          {MONTAGE_TRANSITION_CATALOG.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        {transitionNeedsOverlap(transition) && (
          <label className="scene-xf-field">
            <span>{crossfade.toFixed(2)} с → факт. {crossfadeEffective.toFixed(2)} с</span>
            <input
              type="range"
              min={0.05}
              max={3}
              step={0.05}
              value={crossfade}
              onChange={(event) => editor.updateMontageSettings({ crossfadeDuration: Number(event.target.value) })}
            />
          </label>
        )}
        <button type="button" onClick={() => editor.openToolPanel("montage")}>Все эффекты…</button>
        <button type="button" onClick={editor.syncMontage}>Синхр.</button>
        <button type="button" onClick={editor.resetMontageOrder}>Сброс порядка</button>
        <small className="hint">Стыки: Монтаж → сетка эффектов (wipe/zoom/flash…). Сначала анимация в сцене, потом «Монтаж ▶»</small>
      </div>
    </section>
  );
}
