import {
  applyPlatformExportPreset,
  applyRenderPreset,
  buildCurrentFrameFileName,
  buildSequenceFolderName,
  buildVideoFileName,
  calculateFrameCount,
  isExportBusy,
  renderPresets,
  validateRenderSettings,
  videoQualityPresets,
  type OutputFormat,
  type RenderPresetId,
  type VideoCodec,
  type VideoQualityId,
} from "../domain/renderSettings";
import { useEditor } from "../editor/EditorContext";

const PLATFORM_PRESETS: { id: RenderPresetId; title: string; subtitle: string }[] = [
  { id: "youtube-fullhd", title: "YouTube", subtitle: "Full HD 16:9" },
  { id: "youtube-shorts", title: "Shorts", subtitle: "Вертикаль 9:16" },
  { id: "square", title: "Квадрат", subtitle: "1:1 соцсети" },
  { id: "hd", title: "HD 720p", subtitle: "Быстрый черновик" },
];

export function ExportPanel() {
  const editor = useEditor();
  if (!editor.exportPanelOpen) return null;
  const settings = editor.renderSettings;
  const validation = validateRenderSettings(settings);
  const frames = calculateFrameCount(settings.duration, settings.fps);
  const busy = isExportBusy(editor.exportState.phase);
  const elapsed = editor.exportState.startedAt ? Math.max(0, (Date.now() - editor.exportState.startedAt) / 1000) : 0;
  const previewName =
    settings.outputFormat === "png-sequence"
      ? buildSequenceFolderName(editor.project.name, editor.currentScene.name)
      : settings.outputFormat === "webm" || settings.outputFormat === "mp4"
        ? buildVideoFileName(editor.project.name, editor.currentScene.name, settings.outputFormat)
        : buildCurrentFrameFileName(editor.project.name, editor.currentScene.name, editor.time);

  return (
    <div className="export-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) editor.setExportPanelOpen(false); }}>
      <section className="export-modal" role="dialog" aria-label="Экспорт / рендер">
        <header className="export-modal-head">
          <div>
            <strong>Экспорт / рендер</strong>
            <small>Локальный экспорт сцены или переход к монтажу всего фильма</small>
          </div>
          <button type="button" disabled={busy} onClick={() => editor.setExportPanelOpen(false)}>Закрыть</button>
        </header>

        <div className="export-modal-body">
          <section className="inspector-section">
            <h3>Пресеты платформ</h3>
            <div className="platform-preset-row">
              {PLATFORM_PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`platform-preset-btn ${settings.preset === item.id ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => editor.updateRenderSettings(applyPlatformExportPreset(settings, item.id))}
                >
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </button>
              ))}
            </div>
          </section>

          <label className="export-field">
            <span>Пресет размера</span>
            <select
              value={settings.preset}
              disabled={busy}
              onChange={(event) => editor.updateRenderSettings(applyRenderPreset(settings, event.target.value as RenderPresetId))}
            >
              {renderPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </label>

          <div className="export-grid">
            <label className="export-field"><span>Ширина</span><input type="number" min={64} max={4096} disabled={busy} value={settings.canvasWidth} onChange={(event) => editor.updateRenderSettings({ ...settings, preset: "custom", canvasWidth: Number(event.target.value) })} /></label>
            <label className="export-field"><span>Высота</span><input type="number" min={64} max={4096} disabled={busy} value={settings.canvasHeight} onChange={(event) => editor.updateRenderSettings({ ...settings, preset: "custom", canvasHeight: Number(event.target.value) })} /></label>
            <label className="export-field"><span>Кадр/с</span><input type="number" min={1} max={60} disabled={busy} value={settings.fps} onChange={(event) => editor.updateRenderSettings({ ...settings, fps: Number(event.target.value) })} /></label>
            <label className="export-field"><span>Длительность (с)</span><input type="number" min={0.01} step={0.01} disabled={busy} value={settings.duration} onChange={(event) => editor.updateRenderSettings({ ...settings, duration: Number(event.target.value) })} /></label>
          </div>

          <div className="export-grid">
            <label className="export-field">
              <span>Фон сцены</span>
              <input
                type="color"
                disabled={busy || settings.transparentBackground}
                value={toColorInput(settings.backgroundColor)}
                title="Меняется сразу на холсте текущей сцены — Save не нужен"
                onChange={(event) => editor.updateRenderSettings({ ...settings, backgroundColor: event.target.value })}
              />
            </label>
            <label className="export-check"><input type="checkbox" disabled={busy} checked={settings.transparentBackground} onChange={(event) => editor.updateRenderSettings({ ...settings, transparentBackground: event.target.checked })} /> Прозрачный фон (экспорт)</label>
            <label className="export-field">
              <span>Формат</span>
              <select disabled={busy} value={settings.outputFormat} onChange={(event) => editor.updateRenderSettings({ ...settings, outputFormat: event.target.value as OutputFormat, videoCodec: event.target.value === "webm" ? "vp9" : "h264" })}>
                <option value="mp4">MP4 / H.264</option>
                <option value="webm">WebM / VP9</option>
                <option value="png-sequence">PNG-последовательность</option>
              </select>
            </label>
            <label className="export-field">
              <span>Качество видео</span>
              <select disabled={busy} value={settings.videoQuality} onChange={(event) => editor.updateRenderSettings({ ...settings, videoQuality: event.target.value as VideoQualityId })}>
                {videoQualityPresets.map((item) => <option key={item.id} value={item.id}>{item.label} (CRF {item.crf})</option>)}
              </select>
            </label>
          </div>
          <p className="hint">Цвет фона применяется сразу к текущей сцене. Закрыть = достаточно, отдельной кнопки «Сохранить» нет (проект — Ctrl+S).</p>

          <div className="export-grid">
            <label className="export-field">
              <span>Кодек</span>
              <select disabled={busy || settings.outputFormat === "png-sequence"} value={settings.videoCodec} onChange={(event) => editor.updateRenderSettings({ ...settings, videoCodec: event.target.value as VideoCodec })}>
                <option value="h264">H.264</option>
                <option value="vp9">VP9</option>
                <option value="vp8">VP8</option>
              </select>
            </label>
            <label className="export-field grow">
              <span>Папка вывода</span>
              <div className="export-inline">
                <input type="text" disabled={busy} value={settings.outputDirectory} placeholder="Не задана" onChange={(event) => editor.updateRenderSettings({ ...settings, outputDirectory: event.target.value })} />
                <button type="button" disabled={busy} onClick={() => void editor.chooseExportDirectory()}>…</button>
              </div>
            </label>
          </div>

          <div className="export-toggles">
            <label className="export-check" title="Только подсказка на превью, в MP4 не рисуется">
              <input type="checkbox" checked={settings.showSafeFrame} onChange={(event) => editor.updateRenderSettings({ ...settings, showSafeFrame: event.target.checked })} /> Рамка кадра (превью)
            </label>
            <label className="export-check" title="Зона действия — не в файл">
              <input type="checkbox" checked={settings.showActionSafe} onChange={(event) => editor.updateRenderSettings({ ...settings, showActionSafe: event.target.checked })} /> Action safe
            </label>
            <label className="export-check" title="Зона титров — не в файл">
              <input type="checkbox" checked={settings.showTitleSafe} onChange={(event) => editor.updateRenderSettings({ ...settings, showTitleSafe: event.target.checked })} /> Title safe
            </label>
            <button type="button" title="Подтянуть длительность и цвет из текущей сцены в настройки экспорта" onClick={() => editor.updateRenderSettings({ ...settings, duration: Math.max(0.01, editor.currentScene.duration), backgroundColor: editor.currentScene.background })}>Взять из сцены</button>
          </div>
          <p className="hint">Рамки — только сетка на экране (TV/телефон). В готовое видео не попадают. Выключите, если мешают.</p>

          <div className="export-summary">
            <div><span>Кадры</span><strong>{frames}</strong></div>
            <div><span>Имя файла</span><strong title={previewName}>{previewName}</strong></div>
            <div><span>Текущий кадр</span><strong>{editor.exportState.currentFrame} / {editor.exportState.totalFrames || frames}</strong></div>
            <div><span>Прогресс</span><strong>{Math.round(editor.exportState.progress * 100)}%</strong></div>
            <div><span>Прошло</span><strong>{elapsed.toFixed(1)} с</strong></div>
            <div><span>Статус</span><strong>{phaseLabel(editor.exportState.phase)}</strong></div>
          </div>

          {!validation.ok && <div className="export-error">{validation.errors.join(" ")}</div>}
          {editor.exportState.error && (
            <div className="export-error export-error-rich">
              {editor.exportState.error.split("\n").map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}
          {editor.exportState.outputPath && <div className="export-output">Файл: {editor.exportState.outputPath}</div>}
          {editor.exportState.ffmpegLogPath && <div className="export-output">Лог FFmpeg: {editor.exportState.ffmpegLogPath}</div>}
          {editor.error && !editor.exportState.error && (
            <div className="export-error export-error-rich">
              {editor.error.split("\n").map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}

          <div className="export-progress-track" aria-hidden="true"><div className="export-progress-fill" style={{ width: `${Math.round(editor.exportState.progress * 100)}%` }} /></div>

          <div className="export-actions">
            <button type="button" disabled={busy || !validation.ok} onClick={() => void editor.exportCurrentFrame()}>Экспорт кадра</button>
            <button type="button" disabled={busy || !validation.ok} onClick={() => void editor.exportPngSequence()}>Экспорт PNG-последовательности</button>
            <button type="button" disabled={busy || !validation.ok || settings.outputFormat === "png-sequence"} onClick={() => void editor.exportVideo()}>Экспорт видео</button>
            <button type="button" disabled={busy} onClick={() => { editor.setExportPanelOpen(false); editor.setMontagePanelOpen(true); }}>Монтаж…</button>
            <button type="button" className="danger" disabled={!busy} onClick={() => editor.cancelExport()}>Отмена</button>
            <button type="button" disabled={!editor.exportState.outputPath} onClick={() => void editor.openExportOutput()}>Открыть папку</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function phaseLabel(phase: string): string {
  switch (phase) {
    case "idle": return "ожидание";
    case "preparing": return "подготовка";
    case "renderingFrames": return "кадры";
    case "encodingVideo": return "кодирование";
    case "completed": return "готово";
    case "cancelled": return "отменено";
    case "failed": return "ошибка";
    default: return phase;
  }
}

function toColorInput(value: string): string {
  const hex = value.startsWith("#") ? value.slice(0, 7) : `#${value.slice(0, 6)}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#dfe9e7";
}
