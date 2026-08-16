import { useState } from "react";
import type { ActionStartMode, ActionType, FacingDirection, SceneAction } from "../domain/types";
import { useEditor } from "../editor/EditorContext";
import { actionSequenceHash } from "../systems/ActionCompiler";

const actionTypes: ActionType[] = ["Enter", "Exit", "MoveTo", "WalkTo", "RunTo", "Face", "LookAt", "Idle", "Wave", "Talk", "Happy", "Angry", "Surprised", "Scared", "Laugh", "Jump", "Attack", "Hit", "Fall", "Wait", "CameraShake"];

const actionTypeLabels: Record<ActionType, string> = {
  Enter: "Вход",
  Exit: "Выход",
  MoveTo: "Перемещение",
  WalkTo: "Ходьба к",
  RunTo: "Бег к",
  Face: "Повернуться",
  LookAt: "Смотреть на",
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
  Hit: "Получил удар",
  Fall: "Падение",
  Wait: "Пауза",
  CameraShake: "Тряска камеры",
};

const startModeLabels: Record<ActionStartMode, string> = {
  AfterPrevious: "После предыдущего",
  WithPrevious: "Вместе с предыдущим",
  Absolute: "В абсолютное время",
};

function ActionCard({ action, index }: { action: SceneAction; index: number }) {
  const editor = useEditor();
  const actors = editor.currentScene.actors;
  const update = editor.updateAction;
  return (
    <div className="action-card">
      <div className="action-card-head">
        <span className="action-index">{index + 1}</span>
        <select value={action.type} onChange={(event) => update(action.id, { type: event.target.value as ActionType, actorId: event.target.value === "CameraShake" ? null : action.actorId ?? actors[0]?.id ?? null })}>
          {actionTypes.map((type) => <option key={type} value={type}>{actionTypeLabels[type]}</option>)}
        </select>
        <div className="action-buttons">
          <button type="button" onClick={() => editor.moveAction(action.id, -1)}>↑</button>
          <button type="button" onClick={() => editor.moveAction(action.id, 1)}>↓</button>
          <button type="button" onClick={() => editor.duplicateAction(action.id)}>⧉</button>
          <button type="button" className="danger" onClick={() => editor.deleteAction(action.id)}>×</button>
        </div>
      </div>
      <div className="action-fields">
        <label>Актёр
          <select value={action.actorId ?? ""} disabled={action.type === "CameraShake"} onChange={(event) => update(action.id, { actorId: event.target.value || null })}>
            <option value="">Камера</option>
            {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
          </select>
        </label>
        <label>Цель
          <select value={action.targetActorId ?? ""} onChange={(event) => update(action.id, { targetActorId: event.target.value || null })}>
            <option value="">Нет</option>
            {actors.filter((actor) => actor.id !== action.actorId).map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
          </select>
        </label>
        <label>Длит. (с)
          <input type="number" min="0.05" step="0.05" value={action.duration} onChange={(event) => update(action.id, { duration: Math.max(.05, Number(event.target.value)) })} />
        </label>
        <label>Старт
          <select value={action.startMode} onChange={(event) => update(action.id, { startMode: event.target.value as ActionStartMode })}>
            {(Object.keys(startModeLabels) as ActionStartMode[]).map((mode) => (
              <option key={mode} value={mode}>{startModeLabels[mode]}</option>
            ))}
          </select>
        </label>
        {action.startMode === "Absolute" && (
          <label>Время
            <input type="number" min="0" step="0.1" value={action.startTime ?? 0} onChange={(event) => update(action.id, { startTime: Number(event.target.value) })} />
          </label>
        )}
        {(["Enter", "Exit"].includes(action.type)) && (
          <label>Откуда
            <select value={action.parameters.from ?? "Left"} onChange={(event) => update(action.id, { parameters: { from: event.target.value as "Left" | "Right" | "Top" | "Bottom" } })}>
              <option value="Left">Слева</option>
              <option value="Right">Справа</option>
              <option value="Top">Сверху</option>
              <option value="Bottom">Снизу</option>
            </select>
          </label>
        )}
        {(["Face", "Hit", "Fall"].includes(action.type)) && (
          <label>Направление
            <select value={action.parameters.direction ?? "Right"} onChange={(event) => update(action.id, { parameters: { direction: event.target.value as FacingDirection } })}>
              <option value="Left">Влево</option>
              <option value="Right">Вправо</option>
            </select>
          </label>
        )}
        {action.type === "CameraShake" && (
          <label>Сила
            <input type="number" min="0" step="1" value={action.parameters.intensity ?? 18} onChange={(event) => update(action.id, { parameters: { intensity: Number(event.target.value) } })} />
          </label>
        )}
      </div>
    </div>
  );
}

export function ActionPanel() {
  const editor = useEditor();
  const [newType, setNewType] = useState<ActionType>("Idle");
  const stale = editor.currentScene.generatedTimeline && editor.currentScene.generatedTimeline.sourceHash !== actionSequenceHash(editor.currentScene.actionSequence);
  return (
    <div className="action-panel">
      <div className="action-panel-summary">
        <div>
          <strong>Действия сцены</strong>
          <small>По очереди и параллельно</small>
        </div>
        <span>{editor.currentScene.actionSequence.length} шт.</span>
      </div>
      <div className="action-add">
        <select value={newType} onChange={(event) => setNewType(event.target.value as ActionType)}>
          {actionTypes.map((type) => <option key={type} value={type}>{actionTypeLabels[type]}</option>)}
        </select>
        <button type="button" onClick={() => editor.addAction(newType)}>＋ Добавить</button>
      </div>
      <div className="action-list">
        {editor.currentScene.actionSequence.map((action, index) => <ActionCard key={action.id} action={action} index={index} />)}
        {!editor.currentScene.actionSequence.length && <div className="empty-state">Добавьте действия, затем нажмите «Собрать Timeline».</div>}
      </div>
      <div className="build-timeline">
        <button type="button" onClick={() => editor.buildTimeline()}>⚙ Собрать Timeline</button>
        <small>
          {editor.currentScene.generatedTimeline?.manualEdits
            ? "Ручные ключи защищены"
            : stale
              ? "Действия изменились"
              : editor.currentScene.generatedTimeline
                ? "Timeline актуален"
                : "Ещё не собран"}
        </small>
      </div>
      <p className="hint">Или: панель «Режиссёр» + инструмент «Путь» (W) на сцене — действия с абсолютным временем и автосборкой.</p>
    </div>
  );
}
