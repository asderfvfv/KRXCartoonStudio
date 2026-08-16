import { DIRECTOR_GESTURES, type DirectorLocomotion } from "../domain/directorPath";
import type { ActionType } from "../domain/types";
import { actionSequenceHash } from "../systems/ActionCompiler";
import { useEditor } from "../editor/EditorContext";

const GESTURE_LABELS: Partial<Record<ActionType, string>> = {
  Idle: "Стойка",
  Wave: "Машет",
  Talk: "Говорит",
  Happy: "Радость",
  Angry: "Злость",
  Surprised: "Удивление",
  Scared: "Страх",
  Laugh: "Смех",
  Jump: "Прыжок",
  Attack: "Удар",
  Hit: "Получил",
  Fall: "Падение",
  Wait: "Пауза",
};

export function DirectorBar() {
  const editor = useEditor();
  const actors = editor.currentScene.actors;
  const stale = Boolean(
    editor.currentScene.generatedTimeline
    && editor.currentScene.generatedTimeline.sourceHash !== actionSequenceHash(editor.currentScene.actionSequence),
  );

  return (
    <section className="director-bar panel" aria-label="Режиссёр">
      <div className="director-bar-head">
        <strong>Режиссёр</strong>
        <small>Вручную: актёр слева · фон/предметы в Библиотеке · звук на Timeline (＋ Аудио / Del) · жесты здесь · «Собрать Timeline»</small>
      </div>

      <div className="director-row">
        <label className="director-field">
          <span>Актёр</span>
          <select
            value={editor.selectedActorId ?? ""}
            onChange={(event) => editor.setSelectedActorId(event.target.value || null)}
          >
            <option value="">— выберите —</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>{actor.name}</option>
            ))}
          </select>
        </label>

        <div className="director-loco">
          <span>Путь</span>
          {(["Walk", "Run"] as DirectorLocomotion[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={editor.directorLocomotion === mode ? "active" : ""}
              onClick={() => editor.setDirectorLocomotion(mode)}
            >
              {mode === "Walk" ? "Ходьба" : "Бег"}
            </button>
          ))}
          <button
            type="button"
            className={editor.tool === "path" ? "active" : ""}
            title="Нарисуйте путь мышкой на сцене"
            onClick={() => editor.setTool("path")}
          >
            Путь (W)
          </button>
        </div>

        <div className="director-meta">
          <span>@{editor.time.toFixed(2)} с</span>
          <button type="button" onClick={() => editor.buildTimeline({ resetPlayhead: false })}>
            Собрать Timeline
          </button>
          <button type="button" title="F1" onClick={() => editor.openToolPanel("help")}>Помощь</button>
          <small className={stale ? "warn" : ""}>
            {editor.currentScene.generatedTimeline?.manualEdits
              ? "ручные ключи"
              : stale
                ? "действия ≠ Timeline"
                : editor.currentScene.generatedTimeline
                  ? "готово"
                  : "нет Timeline"}
          </small>
        </div>
      </div>

      <div className="director-gestures">
        {DIRECTOR_GESTURES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={!editor.selectedActorId}
            title={`Вставить «${GESTURE_LABELS[type] ?? type}» на ${editor.time.toFixed(2)} с`}
            onClick={() => editor.insertDirectorAction(type)}
          >
            {GESTURE_LABELS[type] ?? type}
          </button>
        ))}
      </div>
    </section>
  );
}
