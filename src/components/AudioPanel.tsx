import {
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
  estimateSpeechDuration,
  getActiveSubtitleText,
  wrapSubtitleLines,
  type DialogueLine,
  type SceneAudioTrack,
  type SubtitleSettings,
} from "../domain/audio";
import { useEditor } from "../editor/EditorContext";

export function AudioPanel() {
  const editor = useEditor();
  const scene = editor.currentScene;
  const tracks = scene.audioTracks ?? [];
  const dialogues = scene.dialogues ?? [];
  const subtitles = createDefaultSubtitleSettings(scene.subtitleSettings);
  const lipSync = createDefaultLipSyncSettings(scene.lipSyncSettings);
  const assets = editor.project.audioAssets ?? [];

  return (
    <div className="audio-panel">
      <section className="inspector-section">
        <h3>Аудио / реплики</h3>
        <p className="hint">
          <strong>Реплика</strong> — это текст: субтитры на экране + основа для губ.
          Чтобы персонаж <em>говорил голосом</em>: напишите текст → «Озвучить» под Timeline или «Локальный TTS» / Voice сверху.
          Голос выбирается в панели <strong>Voice</strong> (Piper / Chatterbox).
        </p>
        <div className="button-row">
          <button type="button" onClick={() => void editor.importAudio()}>Импорт аудио</button>
          <button type="button" onClick={() => void editor.synthesizeDialogue()}>Локальный TTS → дорожка</button>
          <button type="button" onClick={() => editor.openToolPanel("voice")}>Voice Studio</button>
        </div>
        <label className="export-field">
          <span>Скорость TTS: {editor.speechSettings.rate}</span>
          <input
            type="range"
            min={-10}
            max={10}
            step={1}
            value={editor.speechSettings.rate}
            onChange={(event) => editor.setSpeechSettings({ rate: Number(event.target.value) })}
          />
        </label>
      </section>

      <section className="inspector-section">
        <h3>Аудиодорожки ({tracks.length})</h3>
        {tracks.length === 0 && <p className="hint">Нет дорожек. Импортируйте файл или создайте TTS.</p>}
        {tracks.map((track) => {
          const asset = assets.find((item) => item.id === track.assetId);
          return (
            <div key={track.id} className="audio-card">
              <strong>{track.name}</strong>
              <small>{asset?.name ?? track.assetId}</small>
              <label className="export-field"><span>Старт</span><input type="number" min={0} step={0.01} value={track.startTime} onChange={(event) => editor.updateAudioTrack(track.id, { startTime: Number(event.target.value) })} /></label>
              <label className="export-field"><span>Длительность</span><input type="number" min={0.05} step={0.01} value={track.duration} onChange={(event) => editor.updateAudioTrack(track.id, { duration: Number(event.target.value) })} /></label>
              <label className="export-field"><span>Громкость</span><input type="number" min={0} max={1} step={0.05} value={track.volume} onChange={(event) => editor.updateAudioTrack(track.id, { volume: Number(event.target.value) })} /></label>
              <label className="export-check"><input type="checkbox" checked={track.muted} onChange={(event) => editor.updateAudioTrack(track.id, { muted: event.target.checked })} /> Без звука</label>
              <button type="button" className="danger" onClick={() => editor.deleteAudioTrack(track.id)}>Удалить</button>
            </div>
          );
        })}
      </section>

      <section className="inspector-section">
        <h3>Реплики ({dialogues.length})</h3>
        <button type="button" className="wide-button" onClick={() => editor.addDialogue()}>＋ Реплика</button>
        {dialogues.map((line) => (
          <div key={line.id} className="audio-card">
            <label className="export-field">
              <span>Актёр</span>
              <select value={line.actorId ?? ""} onChange={(event) => editor.updateDialogue(line.id, { actorId: event.target.value || null })}>
                <option value="">—</option>
                {scene.actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
              </select>
            </label>
            <label className="export-field"><span>Текст</span><textarea rows={3} value={line.text} onChange={(event) => editor.updateDialogue(line.id, { text: event.target.value, duration: estimateSpeechDuration(event.target.value) })} /></label>
            <label className="export-field"><span>Старт</span><input type="number" min={0} step={0.01} value={line.startTime} onChange={(event) => editor.updateDialogue(line.id, { startTime: Number(event.target.value) })} /></label>
            <label className="export-field"><span>Длительность</span><input type="number" min={0.1} step={0.01} value={line.duration} onChange={(event) => editor.updateDialogue(line.id, { duration: Number(event.target.value) })} /></label>
            <label className="export-field">
              <span>Связанное аудио</span>
              <select value={line.audioTrackId ?? ""} onChange={(event) => editor.updateDialogue(line.id, { audioTrackId: event.target.value || null })}>
                <option value="">—</option>
                {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            </label>
            <div className="button-row">
              <button type="button" onClick={() => void editor.synthesizeDialogueLine(line.id)}>Озвучить</button>
              <button type="button" disabled={!line.audioTrackId} onClick={() => editor.syncDialogueToLinkedTrack(line.id)}>Sync к дорожке</button>
              <button type="button" className="danger" onClick={() => editor.deleteDialogue(line.id)}>Удалить</button>
            </div>
          </div>
        ))}
      </section>

      <section className="inspector-section">
        <h3>Lip Sync (рот)</h3>
        <p className="hint">Фонемы из текста реплики (А/О/И/М…) + WAV от Piper закрывает паузы. На Timeline — «Рот» и визема.</p>
        <label className="export-check"><input type="checkbox" checked={lipSync.enabled} onChange={(event) => editor.updateLipSyncSettings({ ...lipSync, enabled: event.target.checked })} /> Включён</label>
        <label className="export-check"><input type="checkbox" checked={lipSync.phonemeDriven} onChange={(event) => editor.updateLipSyncSettings({ ...lipSync, phonemeDriven: event.target.checked })} /> Фонемы / виземы (текст)</label>
        <label className="export-check"><input type="checkbox" checked={lipSync.preferAmplitude} onChange={(event) => editor.updateLipSyncSettings({ ...lipSync, preferAmplitude: event.target.checked })} /> WAV-амплитуда (Piper) как гейт</label>
        <label className="export-check"><input type="checkbox" checked={lipSync.textDriven} onChange={(event) => editor.updateLipSyncSettings({ ...lipSync, textDriven: event.target.checked })} /> Запасной пульс (если фонемы выкл.)</label>
        <label className="export-field"><span>Чувствительность</span><input type="number" min={0.25} max={3} step={0.05} value={lipSync.sensitivity} onChange={(event) => editor.updateLipSyncSettings({ ...lipSync, sensitivity: Number(event.target.value) })} /></label>
        <label className="export-field"><span>Сглаживание</span><input type="number" min={0} max={1} step={0.05} value={lipSync.smoothing} onChange={(event) => editor.updateLipSyncSettings({ ...lipSync, smoothing: Number(event.target.value) })} /></label>
        <label className="export-field"><span>Шумовой порог</span><input type="number" min={0} max={0.5} step={0.01} value={lipSync.noiseGate} onChange={(event) => editor.updateLipSyncSettings({ ...lipSync, noiseGate: Number(event.target.value) })} /></label>
        <button type="button" onClick={() => void editor.ensureAmplitudeEnvelopes()}>Пересчитать волны</button>
      </section>

      <section className="inspector-section">
        <h3>Субтитры</h3>
        <label className="export-check"><input type="checkbox" checked={subtitles.enabled} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, enabled: event.target.checked })} /> В превью</label>
        <label className="export-check"><input type="checkbox" checked={subtitles.showInExport} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, showInExport: event.target.checked })} /> В кадрах экспорта</label>
        <label className="export-check"><input type="checkbox" checked={subtitles.showSpeaker} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, showSpeaker: event.target.checked })} /> Имя говорящего</label>
        <label className="export-check"><input type="checkbox" checked={subtitles.backgroundEnabled} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, backgroundEnabled: event.target.checked })} /> Подложка</label>
        <label className="export-field"><span>Размер шрифта</span><input type="number" min={16} max={96} value={subtitles.fontSize} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, fontSize: Number(event.target.value) })} /></label>
        <label className="export-field"><span>Отступ снизу</span><input type="number" min={16} max={240} value={subtitles.bottomOffset} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, bottomOffset: Number(event.target.value) })} /></label>
        <label className="export-field"><span>Ширина %</span><input type="number" min={40} max={98} value={Math.round(subtitles.maxWidthPct * 100)} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, maxWidthPct: Number(event.target.value) / 100 })} /></label>
        <label className="export-field"><span>Символов / строка</span><input type="number" min={16} max={80} value={subtitles.maxCharsPerLine} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, maxCharsPerLine: Number(event.target.value) })} /></label>
        <label className="export-field"><span>Цвет текста</span><input type="color" value={subtitles.textColor} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, textColor: event.target.value })} /></label>
        <label className="export-field"><span>Цвет фона</span><input type="color" value={subtitles.backgroundColor} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, backgroundColor: event.target.value })} /></label>
        <label className="export-field"><span>Прозрачность фона</span><input type="number" min={0} max={1} step={0.05} value={subtitles.backgroundOpacity} onChange={(event) => editor.updateSubtitleSettings({ ...subtitles, backgroundOpacity: Number(event.target.value) })} /></label>
        <button type="button" onClick={() => void editor.exportSubtitlesSrt()}>Экспорт SRT…</button>
        {subtitles.enabled && (() => {
          const preview = getActiveSubtitleText(dialogues, editor.sceneTime, { showSpeaker: subtitles.showSpeaker, actors: scene.actors });
          return preview
            ? <p className="hint">Сейчас: {wrapSubtitleLines(preview, subtitles.maxCharsPerLine).join(" · ")}</p>
            : <p className="hint">Сейчас нет активной реплики на playhead.</p>;
        })()}
      </section>
    </div>
  );
}

export type { DialogueLine, SceneAudioTrack, SubtitleSettings };
