import {
  enabledSeriesEpisodes,
  episodeDuration,
  formatEpisodeFileName,
  syncSeriesWithScenes,
  validateSeries,
} from "../domain/series";
import { episodeTemplates, type EpisodeTemplateId } from "../domain/templates";
import { isExportBusy } from "../domain/renderSettings";
import { useEditor } from "../editor/EditorContext";

export function SeriesPanel() {
  const editor = useEditor();
  if (!editor.seriesPanelOpen) return null;

  const series = syncSeriesWithScenes(editor.series, editor.project.scenes, editor.project.name);
  const scenes = editor.project.scenes ?? [];
  const validation = validateSeries(editor.project);
  const busy = isExportBusy(editor.exportState.phase);
  const formatOk = editor.renderSettings.outputFormat !== "png-sequence";
  const format = editor.renderSettings.outputFormat === "webm" ? "webm" : "mp4";
  const enabled = enabledSeriesEpisodes(series);

  return (
    <div className="export-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) editor.setSeriesPanelOpen(false); }}>
      <section className="export-modal series-modal" role="dialog" aria-label="Series Pack">
        <header className="export-modal-head">
          <div>
            <strong>Series</strong>
            <small>Эпизоды → batch MP4/WebM + manifest.json. Только локальная папка, без облака.</small>
          </div>
          <button type="button" disabled={busy} onClick={() => editor.setSeriesPanelOpen(false)}>Закрыть</button>
        </header>

        <div className="export-modal-body">
          <section className="inspector-section">
            <h3>Серия</h3>
            <label className="export-field">
              <span>Имя</span>
              <input
                disabled={busy}
                value={series.name}
                onChange={(event) => editor.updateSeries({ name: event.target.value })}
              />
            </label>
            <div className="button-row">
              <button type="button" disabled={busy} onClick={editor.addSeriesEpisode}>＋ Episode</button>
              <button type="button" disabled={busy} onClick={editor.syncSeries}>Sync scenes</button>
              <button type="button" disabled={busy} onClick={editor.renumberSeries}>Renumber</button>
            </div>
            <label className="export-field">
              <span>From template</span>
              <select
                disabled={busy}
                defaultValue=""
                onChange={(event) => {
                  const value = event.target.value as EpisodeTemplateId | "";
                  if (value) editor.applyEpisodeTemplate(value);
                  event.target.value = "";
                }}
              >
                <option value="">Выберите шаблон эпизодов…</option>
                {episodeTemplates.map((item) => (
                  <option key={item.id} value={item.id}>{item.label} — {item.description}</option>
                ))}
              </select>
            </label>
          </section>

          <section className="inspector-section">
            <h3>Эпизоды ({series.episodes.length})</h3>
            <div className="montage-clip-list">
              {series.episodes.map((episode, index) => {
                const duration = episodeDuration(editor.project, episode);
                return (
                  <div key={episode.id} className={`montage-clip ${episode.enabled ? "" : "disabled"}`}>
                    <label className="export-check">
                      <input
                        type="checkbox"
                        checked={episode.enabled}
                        disabled={busy}
                        onChange={(event) => editor.updateSeriesEpisode(episode.id, { enabled: event.target.checked })}
                      />
                      <strong>E{String(episode.number).padStart(2, "0")}</strong>
                    </label>
                    <label className="export-field">
                      <span>Title</span>
                      <input
                        disabled={busy}
                        value={episode.title}
                        onChange={(event) => editor.updateSeriesEpisode(episode.id, { title: event.target.value })}
                      />
                    </label>
                    <label className="export-field">
                      <span>Number</span>
                      <input
                        type="number"
                        min={1}
                        disabled={busy}
                        value={episode.number}
                        onChange={(event) => editor.updateSeriesEpisode(episode.id, { number: Math.max(1, Number(event.target.value) || 1) })}
                      />
                    </label>
                    <p className="hint">{duration.toFixed(2)}s · file {formatEpisodeFileName(episode, format)}</p>
                    <div className="series-scene-picks">
                      {scenes.map((scene) => {
                        const checked = episode.sceneIds.includes(scene.id);
                        return (
                          <label key={scene.id} className="export-check">
                            <input
                              type="checkbox"
                              disabled={busy}
                              checked={checked}
                              onChange={(event) => {
                                const sceneIds = event.target.checked
                                  ? [...episode.sceneIds, scene.id]
                                  : episode.sceneIds.filter((id) => id !== scene.id);
                                editor.updateSeriesEpisode(episode.id, { sceneIds });
                              }}
                            />
                            {scene.name}
                          </label>
                        );
                      })}
                    </div>
                    <div className="button-row">
                      <button type="button" disabled={busy || index === 0} onClick={() => editor.moveSeriesEpisode(episode.id, -1)}>↑</button>
                      <button type="button" disabled={busy || index >= series.episodes.length - 1} onClick={() => editor.moveSeriesEpisode(episode.id, 1)}>↓</button>
                      <button type="button" className="danger" disabled={busy} onClick={() => editor.deleteSeriesEpisode(episode.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}
              {!series.episodes.length && <p className="hint">Добавьте эпизод или Sync scenes.</p>}
            </div>
          </section>

          <section className="inspector-section">
            <h3>Итог</h3>
            <div className="export-summary">
              <div><span>Enabled</span><strong>{enabled.length}</strong></div>
              <div><span>Format</span><strong>{format}</strong></div>
              <div><span>Transition</span><strong>{editor.montage.transition === "crossfade" ? "Crossfade" : "Cut"}</strong></div>
            </div>
            <p className="hint">Переходы берутся из панели Montage (cut/crossfade). Публикация = открыть папку вручную.</p>
            {!validation.ok && <div className="export-error">{validation.errors.join(" ")}</div>}
            {!formatOk && <div className="export-error">Для Series Pack выберите MP4 или WebM в панели Export.</div>}
            {editor.exportState.kind === "series" && editor.exportState.error && <div className="export-error">{editor.exportState.error}</div>}
            {editor.exportState.kind === "series" && editor.exportState.outputPath && <div className="export-output">Output: {editor.exportState.outputPath}</div>}
          </section>

          <div className="export-progress-track" aria-hidden="true">
            <div className="export-progress-fill" style={{ width: `${Math.round((editor.exportState.kind === "series" ? editor.exportState.progress : 0) * 100)}%` }} />
          </div>

          <div className="export-actions">
            <button type="button" disabled={busy || !validation.ok || !formatOk} onClick={() => void editor.exportSeriesPack()}>Export Series Pack</button>
            <button type="button" className="danger" disabled={!busy} onClick={() => editor.cancelExport()}>Cancel</button>
            <button type="button" disabled={!editor.exportState.outputPath} onClick={() => void editor.openExportOutput()}>Open Output</button>
          </div>
        </div>
      </section>
    </div>
  );
}
