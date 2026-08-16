import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  DEFAULT_CROSSFADE_DURATION,
  effectiveCrossfadeDuration,
  listMontageTransitions,
  MONTAGE_TRANSITION_CATALOG,
  montageTotalDuration,
  montageTransitionLabel,
  normalizeCrossfadeDuration,
  normalizeMontageTransition,
  resolveMontageSegments,
  scenePlaybackDuration,
  transitionNeedsOverlap,
  validateMontage,
  type MontageTransitionMarker,
} from "../domain/montage";
import {
  applyPlatformExportPreset,
  calculateFrameCount,
  isExportBusy,
  type RenderPresetId,
} from "../domain/renderSettings";
import { useEditor } from "../editor/EditorContext";

const PLATFORM_PRESETS: { id: RenderPresetId; title: string; subtitle: string }[] = [
  { id: "youtube-fullhd", title: "YouTube", subtitle: "1920×1080 · 16:9" },
  { id: "youtube-shorts", title: "Shorts", subtitle: "1080×1920 · 9:16" },
  { id: "square", title: "Квадрат", subtitle: "1080×1080 · 1:1" },
];

export function MontagePanel() {
  const editor = useEditor();
  const dragClipId = useRef<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [previewUntil, setPreviewUntil] = useState<number | null>(null);

  useEffect(() => {
    if (previewUntil == null || !editor.playing) return;
    if (editor.time >= previewUntil) {
      editor.setPlaying(false);
      editor.setTime(previewUntil);
      setPreviewUntil(null);
    }
  }, [editor, editor.playing, editor.time, previewUntil]);

  if (!editor.montagePanelOpen) return null;

  const scenes = editor.project.scenes ?? [];
  const clips = editor.montage.clips;
  const segments = resolveMontageSegments(editor.project);
  const transitions = listMontageTransitions(editor.project);
  const totalDuration = montageTotalDuration(editor.project);
  const frames = calculateFrameCount(totalDuration, editor.renderSettings.fps);
  const validation = validateMontage(editor.project);
  const busy = isExportBusy(editor.exportState.phase);
  const formatOk = editor.renderSettings.outputFormat !== "png-sequence";
  const transition = normalizeMontageTransition(editor.montage.transition);
  const crossfadeRequested = normalizeCrossfadeDuration(editor.montage.crossfadeDuration ?? DEFAULT_CROSSFADE_DURATION);
  const crossfadeEffective = effectiveCrossfadeDuration(editor.project);
  const preset = editor.renderSettings.preset;

  const jumpToTransition = (marker: MontageTransitionMarker) => {
    setPreviewUntil(null);
    editor.setMontageMode(true);
    editor.setPlaying(false);
    editor.setTime(marker.mid);
  };

  const playTransition = (marker: MontageTransitionMarker) => {
    const pad = 0.2;
    const from = Math.max(0, marker.start - pad);
    const until = Math.min(totalDuration, Math.max(marker.end, marker.mid) + pad);
    editor.setMontageMode(true);
    editor.setLoop(false);
    editor.setPlaying(false);
    editor.setTime(from);
    setPreviewUntil(until);
    requestAnimationFrame(() => editor.setPlaying(true));
  };

  return (
    <div className="export-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) editor.setMontagePanelOpen(false); }}>
      <section className="export-modal montage-modal" role="dialog" aria-label="Монтаж сцен">
        <header className="export-modal-head">
          <div>
            <strong>Монтаж сцен</strong>
            <small>Превью переходов · пресеты YouTube / Shorts · экспорт одного ролика. Локально.</small>
          </div>
          <button type="button" disabled={busy} onClick={() => editor.setMontagePanelOpen(false)}>Закрыть</button>
        </header>

        <div className="export-modal-body">
          <section className="inspector-section">
            <h3>Лента монтажа ({clips.length})</h3>
            <p className="hint">Перетащите строки для порядка. Галочка — сцена в фильме. «К ползунку» — прыжок на Timeline в режиме монтажа.</p>
            <div className="button-row">
              <button type="button" disabled={busy} onClick={editor.syncMontage}>Синхр. со сценами</button>
              <button type="button" disabled={busy} onClick={editor.resetMontageOrder}>Сброс порядка</button>
              <button
                type="button"
                className={editor.montageMode ? "active" : ""}
                disabled={busy}
                onClick={() => editor.setMontageMode(!editor.montageMode)}
              >
                {editor.montageMode ? "Монтаж ▶ вкл" : "Включить Монтаж ▶"}
              </button>
            </div>

            {segments.length > 0 && totalDuration > 0 && (
              <div className="montage-filmstrip" aria-label="Схема фильма">
                {segments.map((segment) => {
                  const widthPct = (segment.duration / totalDuration) * 100;
                  return (
                    <button
                      key={segment.scene.id}
                      type="button"
                      className="montage-filmstrip-seg"
                      style={{ flexGrow: Math.max(0.08, widthPct), flexBasis: 0 }}
                      title={`${segment.scene.name} · ${segment.duration.toFixed(2)} с @ ${segment.offset.toFixed(2)} с`}
                      disabled={busy}
                      onClick={() => {
                        editor.setMontageMode(true);
                        editor.setPlaying(false);
                        editor.setTime(segment.offset + Math.min(0.05, segment.duration * 0.1));
                      }}
                    >
                      <span>{segment.scene.name}</span>
                      <small>{segment.duration.toFixed(1)}с</small>
                    </button>
                  );
                })}
                {transitions.map((marker) => {
                  const left = totalDuration > 0 ? (marker.mid / totalDuration) * 100 : 0;
                  const span = marker.kind === "crossfade" && marker.end > marker.start
                    ? ((marker.end - marker.start) / totalDuration) * 100
                    : 0;
                  return (
                    <button
                      key={`xf-${marker.index}`}
                      type="button"
                      className={`montage-filmstrip-xf ${marker.kind}`}
                      style={{
                        left: `${left}%`,
                        width: span > 0 ? `${Math.max(1.2, span)}%` : undefined,
                        transform: span > 0 ? "translateX(-50%)" : "translateX(-50%)",
                      }}
                      title={
                        marker.kind === "crossfade"
                          ? `Плавный: ${marker.fromName} → ${marker.toName} @ ${marker.mid.toFixed(2)} с`
                          : `Резкий: ${marker.fromName} → ${marker.toName} @ ${marker.mid.toFixed(2)} с`
                      }
                      disabled={busy}
                      onClick={() => jumpToTransition(marker)}
                    >
                      {marker.kind === "crossfade" ? "XF" : "✂"}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="montage-clip-list">
              {clips.map((clip, index) => {
                const scene = scenes.find((item) => item.id === clip.sceneId);
                const duration = scene ? scenePlaybackDuration(scene) : 0;
                const segment = scene ? segments.find((item) => item.scene.id === scene.id) : undefined;
                const segmentIndex = scene ? segments.findIndex((item) => item.scene.id === scene.id) : -1;
                const bridge = segmentIndex >= 0 ? transitions.find((item) => item.index === segmentIndex) : undefined;
                return (
                  <div
                    key={clip.id}
                    className={`montage-clip ${clip.enabled ? "" : "disabled"} ${dropIndex === index ? "drop-target" : ""}`}
                    draggable={!busy}
                    onDragStart={(event: DragEvent) => {
                      dragClipId.current = clip.id;
                      event.dataTransfer.setData("text/montage-clip", clip.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(event: DragEvent) => {
                      event.preventDefault();
                      setDropIndex(index);
                    }}
                    onDrop={(event: DragEvent) => {
                      event.preventDefault();
                      const id = event.dataTransfer.getData("text/montage-clip") || dragClipId.current;
                      setDropIndex(null);
                      if (id) editor.reorderMontageClipTo(id, index);
                    }}
                    onDragEnd={() => { dragClipId.current = null; setDropIndex(null); }}
                  >
                    <label className="export-check">
                      <input
                        type="checkbox"
                        checked={clip.enabled}
                        disabled={busy}
                        onChange={(event) => editor.toggleMontageClip(clip.id, event.target.checked)}
                      />
                      <strong>{index + 1}. {scene?.name ?? clip.sceneId}</strong>
                    </label>
                    <small>
                      {duration.toFixed(2)}s · {scene?.actors.length ?? 0} акт.
                      {segment ? ` · старт @ ${segment.offset.toFixed(2)}s` : ""}
                    </small>
                    <div className="button-row">
                      <button type="button" disabled={busy || index === 0} onClick={() => editor.moveMontageClipUp(clip.id)}>↑</button>
                      <button type="button" disabled={busy || index >= clips.length - 1} onClick={() => editor.moveMontageClipDown(clip.id)}>↓</button>
                      <button
                        type="button"
                        disabled={busy || !scene}
                        onClick={() => scene && editor.setCurrentSceneId(scene.id)}
                      >
                        Открыть
                      </button>
                      <button
                        type="button"
                        disabled={busy || !scene}
                        onClick={() => scene && editor.jumpToMontageScene(scene.id)}
                      >
                        К ползунку
                      </button>
                    </div>
                    {bridge && (
                      <div className="montage-clip-bridge">
                        <label className="export-field">
                          <span>→ переход к следующей</span>
                          <select
                            disabled={busy}
                            value={clip.transitionOut ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              editor.setMontageClipTransitionOut(
                                clip.id,
                                value ? normalizeMontageTransition(value) : null,
                              );
                            }}
                          >
                            <option value="">Как общий ({montageTransitionLabel(transition)})</option>
                            {MONTAGE_TRANSITION_CATALOG.map((item) => (
                              <option key={item.id} value={item.id}>{item.label}</option>
                            ))}
                          </select>
                        </label>
                        <span>
                          {transitionNeedsOverlap(bridge.kind)
                            ? `${montageTransitionLabel(bridge.kind)} ${(bridge.end - bridge.start).toFixed(2)} с @ ${bridge.mid.toFixed(2)} с`
                            : `Резкий @ ${bridge.mid.toFixed(2)} с`}
                        </span>
                        <div className="button-row">
                          <button type="button" disabled={busy} onClick={() => jumpToTransition(bridge)}>Превью середины</button>
                          <button type="button" disabled={busy} onClick={() => playTransition(bridge)}>Проиграть переход</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="inspector-section">
            <h3>Переходы (реклама / монтаж)</h3>
            <p className="hint">
              Общий стиль для всех стыков. На каждой сцене можно задать свой «→ переход».
              Длительность — для любых эффектов кроме резкого. Превью = экспорт (Canvas).
            </p>
            <div className="montage-transition-grid">
              {MONTAGE_TRANSITION_CATALOG.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`montage-transition-chip ${transition === item.id ? "active" : ""}`}
                  disabled={busy}
                  title={item.hint}
                  onClick={() => editor.updateMontageSettings({ transition: item.id })}
                >
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </button>
              ))}
            </div>
            <div className={`montage-xf-preview ${transition}`} aria-hidden="true">
              <div className="montage-xf-a"><span>A</span></div>
              <div className="montage-xf-b"><span>B</span></div>
            </div>
            <label className="field">
              <span>Длительность перехода (с)</span>
              <input
                type="number"
                min={0}
                max={30}
                step={0.05}
                disabled={busy || !transitionNeedsOverlap(transition)}
                value={crossfadeRequested}
                onChange={(event) => editor.updateMontageSettings({ crossfadeDuration: Number(event.target.value) || 0 })}
              />
            </label>
            {transitionNeedsOverlap(transition) && (
              <p className="hint">
                Макс. overlap на шкале: {crossfadeEffective.toFixed(2)} с (не больше половины короткой соседней сцены).
                Общая длина фильма сокращается на перекрытие.
              </p>
            )}
            {transitions.length > 0 && (
              <div className="montage-transition-list">
                {transitions.map((marker) => (
                  <div key={marker.index} className="montage-transition-row">
                    <span>
                      {marker.index + 1}→{marker.index + 2}: {marker.fromName} → {marker.toName}
                      {" · "}
                      {transitionNeedsOverlap(marker.kind)
                        ? `${montageTransitionLabel(marker.kind)} ${((marker.end - marker.start)).toFixed(2)} с`
                        : "cut"}
                    </span>
                    <button type="button" disabled={busy} onClick={() => jumpToTransition(marker)}>Середина</button>
                    <button type="button" disabled={busy} onClick={() => playTransition(marker)}>▶</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="inspector-section">
            <h3>Пресет кадра (YouTube / Shorts)</h3>
            <p className="hint">Задаёт размер, FPS, MP4/H.264 и безопасные рамки. То же — в панели «Экспорт».</p>
            <div className="platform-preset-row">
              {PLATFORM_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`platform-preset-btn ${preset === item.id ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => editor.updateRenderSettings(applyPlatformExportPreset(editor.renderSettings, item.id))}
                >
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </button>
              ))}
            </div>
            <small className="hint">
              Сейчас: {editor.renderSettings.canvasWidth}×{editor.renderSettings.canvasHeight}
              {" · "}{editor.renderSettings.fps} кадр/с
              {" · "}{editor.renderSettings.outputFormat}
            </small>
          </section>

          <section className="inspector-section">
            <h3>Итог фильма</h3>
            <div className="export-summary">
              <div><span>Сцен вкл.</span><strong>{segments.length}</strong></div>
              <div><span>Длительность</span><strong>{totalDuration.toFixed(2)} с</strong></div>
              <div><span>Кадры @ {editor.renderSettings.fps} кадр/с</span><strong>{frames}</strong></div>
              <div><span>Переход</span><strong>{montageTransitionLabel(transition)}{transitionNeedsOverlap(transition) ? ` ${crossfadeEffective.toFixed(2)} с` : ""}</strong></div>
              <div><span>Формат</span><strong>{editor.renderSettings.outputFormat}</strong></div>
            </div>
            {!validation.ok && <div className="export-error">{validation.errors.join(" ")}</div>}
            {!formatOk && <div className="export-error">Для видео монтажа выберите MP4 или WebM в панели «Экспорт».</div>}
            {editor.exportState.kind === "montage" && editor.exportState.error && <div className="export-error">{editor.exportState.error}</div>}
            {editor.exportState.kind === "montage" && editor.exportState.outputPath && <div className="export-output">Файл: {editor.exportState.outputPath}</div>}
          </section>

          <div className="export-progress-track" aria-hidden="true">
            <div className="export-progress-fill" style={{ width: `${Math.round((editor.exportState.kind === "montage" ? editor.exportState.progress : 0) * 100)}%` }} />
          </div>

          <div className="export-actions">
            <button type="button" disabled={busy || !validation.ok || !formatOk} onClick={() => void editor.exportMontageVideo()}>Экспорт видео монтажа</button>
            <button type="button" disabled={busy || !validation.ok} onClick={() => void editor.exportMontagePngSequence()}>Экспорт PNG-последовательности</button>
            <button type="button" className="danger" disabled={!busy} onClick={() => editor.cancelExport()}>Отмена</button>
            <button type="button" disabled={!editor.exportState.outputPath} onClick={() => void editor.openExportOutput()}>Открыть папку</button>
          </div>
        </div>
      </section>
    </div>
  );
}
