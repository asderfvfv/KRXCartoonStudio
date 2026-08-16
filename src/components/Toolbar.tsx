import { useEditor } from "../editor/EditorContext";

const Button = ({ title, label, onClick, disabled }: { title: string; label: string; onClick(): void; disabled?: boolean }) => (
  <button className="toolbar-button" title={title} onClick={onClick} disabled={disabled}>{label}</button>
);

export function Toolbar() {
  const editor = useEditor();
  const recent = editor.recentProjects.recent;
  return <header className="toolbar">
    <div className="brand" title="Esc — закрыть панель · Пробел — пуск/пауза · Ctrl+S — сохранить">
      <span className="brand-mark">K</span>
      <span>KRX Cartoon Studio</span>
      <em>UX</em>
    </div>
    <div className="toolbar-group">
      <Button label="＋ Новый" title="Новый проект" onClick={editor.newProject} />
      <Button label="Открыть" title="Открыть проект" onClick={() => void editor.openProject()} />
      <Button label="Сохранить" title="Сохранить (Ctrl+S)" onClick={() => void editor.saveProject()} />
      <Button label="Как…" title="Сохранить как (Ctrl+Shift+S)" onClick={() => void editor.saveProject(true)} />
      <Button label="Проекты" title="Выбор проекта / недавние" onClick={editor.openProjectGate} />
      {recent.length > 0 ? (
        <select
          className="toolbar-recent"
          defaultValue=""
          title="Недавние проекты"
          onChange={(event) => {
            const path = event.target.value;
            event.target.value = "";
            if (path) void editor.openProjectAt(path);
          }}
        >
          <option value="">Недавние…</option>
          {recent.map((item) => (
            <option key={item.path} value={item.path}>{item.name}</option>
          ))}
        </select>
      ) : null}
    </div>
    <span className="toolbar-divider" />
    <div className="toolbar-group">
      <Button label="↶ Назад" title={editor.canUndo ? `Отменить: ${editor.undoLabel ?? "правка"} (Ctrl+Z)` : "Нечего отменять"} onClick={editor.undo} disabled={!editor.canUndo} />
      <Button label="↷ Вперёд" title={editor.canRedo ? "Повторить (Ctrl+Y)" : "Нечего повторять"} onClick={editor.redo} disabled={!editor.canRedo} />
    </div>
    <span className="toolbar-divider" />
    <div className="toolbar-group">
      <Button label="＋ Мультик" title="Мастер: новый мультик за 5 шагов" onClick={() => editor.openToolPanel("wizard")} />
      <Button label="Промпт" title="Промпт → мультик (локально)" onClick={() => editor.openToolPanel("script")} />
      <Button label="Персонаж" title="Создатель персонажа" onClick={() => editor.openToolPanel("character")} />
      <Button label="Навески" title="PartForge — навески и сокеты" onClick={() => editor.openToolPanel("partforge")} />
      <Button label="Монтаж" title="Монтаж сцен" onClick={() => editor.openToolPanel("montage")} />
      <Button label="Серия" title="Пакет серии" onClick={() => editor.openToolPanel("series")} />
      <Button label="Экспорт" title="Экспорт / рендер" onClick={() => editor.openToolPanel("export")} />
      <Button label="Voice" title="Voice Studio — локальный Chatterbox TTS" onClick={() => editor.openToolPanel("voice")} />
      <Button label="Помощь" title="Инструкция по программе (F1)" onClick={() => editor.openToolPanel("help")} />
    </div>
    <div className="project-title">
      <strong>{editor.project.name}{editor.projectDirty ? " •" : ""}</strong>
      <span title={editor.projectPath ?? undefined}>
        {editor.projectPath
          ? (editor.projectDirty
            ? (editor.autosaveEnabled ? "Не сохранено · автосейв вкл." : "Не сохранено")
            : (editor.lastAutosaveAt ? `Сохранено · авто ${new Date(editor.lastAutosaveAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Сохранено"))
          : "Несохранённый проект — Ctrl+S один раз для автосейва"}
      </span>
    </div>
  </header>;
}
