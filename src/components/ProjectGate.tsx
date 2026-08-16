import { useEffect, useState } from "react";
import { useEditor } from "../editor/EditorContext";
import { formatRecentOpenedAt, projectNameFromPath } from "../domain/recentProjects";

export function ProjectGate() {
  const editor = useEditor();
  const [newName, setNewName] = useState("Новый мультфильм");
  const [projectsDir, setProjectsDir] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!editor.projectGateOpen) return;
    let canceled = false;
    void (async () => {
      setRecovering(true);
      try {
        await editor.recoverAndRefreshProjects();
      } catch {
        /* status/error already set */
      } finally {
        if (!canceled) setRecovering(false);
      }
      const path = await editor.getProjectsDir();
      if (!canceled) setProjectsDir(path);
    })();
    return () => { canceled = true; };
  }, [editor, editor.projectGateOpen]);

  if (!editor.projectGateOpen) return null;

  const last = editor.recentProjects.lastPath;
  const recent = editor.recentProjects.recent;

  const createNew = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await editor.newProject(newName);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="export-modal-backdrop project-gate-backdrop" role="presentation">
      <section className="export-modal project-gate-modal" role="dialog" aria-label="Выбор проекта">
        <header className="export-modal-head">
          <div>
            <strong>KRX Cartoon Studio</strong>
            <small>
              Проекты: папка <b>release\Projects</b> (рядом со START-KRX, не внутри win-unpacked — сборка её не сотрёт).
            </small>
          </div>
          <button
            type="button"
            disabled={recovering}
            onClick={() => void editor.recoverAndRefreshProjects()}
            title="Найти .kcsproj в Projects, Загрузках, Документах"
          >
            {recovering ? "Ищу…" : "Найти проекты"}
          </button>
        </header>
        <div className="export-modal-body project-gate-body">
          {editor.projectDirty ? (
            <p className="export-error">Сейчас есть несохранённые правки — при смене проекта программа спросит подтверждение.</p>
          ) : null}

          <div className="project-gate-primary">
            <label className="project-gate-name-field">
              <span>Имя нового проекта</span>
              <input
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void createNew();
                  }
                }}
                placeholder="Новый мультфильм"
                autoFocus
              />
            </label>
            <button type="button" className="wide-button accent" disabled={creating} onClick={() => void createNew()}>
              {creating ? "Создаю…" : "Новый пустой проект"}
            </button>
            {projectsDir ? (
              <p className="project-gate-path" title={projectsDir}>
                Папка Projects: {projectsDir}
                {" · "}
                <button type="button" className="linkish" onClick={() => void editor.openProjectsFolder()}>Открыть</button>
              </p>
            ) : (
              <p className="empty-hint">Папка Projects будет рядом с START-KRX.bat.</p>
            )}
            {last ? (
              <button type="button" className="wide-button" onClick={() => void editor.openProjectAt(last)}>
                Продолжить: {projectNameFromPath(last)}
              </button>
            ) : (
              <p className="empty-hint">
                {recovering
                  ? "Ищу старые проекты в Загрузках…"
                  : "Нет последнего файла — «Найти проекты» или Открыть…"}
              </p>
            )}
          </div>
          {last ? <p className="project-gate-path" title={last}>{last}</p> : null}

          <div className="project-gate-actions">
            <button type="button" onClick={() => void editor.openProject()}>Открыть…</button>
            <button type="button" title="Демо-мультик «В гости к Винтику»" onClick={() => void editor.loadMeadowDialogueDemo({ generateTts: false })}>Демо поляна</button>
            <button type="button" onClick={() => { editor.dismissProjectGate(); editor.openToolPanel("wizard"); }}>＋ Мультик</button>
          </div>

          <label className="export-check project-gate-autosave">
            <input
              type="checkbox"
              checked={editor.autosaveEnabled}
              onChange={(event) => editor.setAutosaveEnabled(event.target.checked)}
            />
            Автосейв каждые ~45 с (нужен уже сохранённый файл)
          </label>
          <label className="export-check project-gate-autosave">
            <input
              type="checkbox"
              checked={editor.studioPrefs.autoOpenLastProject}
              onChange={(event) => editor.setStudioPrefs({ autoOpenLastProject: event.target.checked })}
            />
            При запуске сразу открывать последний проект
          </label>

          {recent.length > 0 ? (
            <div className="project-gate-recent">
              <div className="section-title"><span>Недавние</span><small>{recent.length}</small></div>
              <ul>
                {recent.map((item) => (
                  <li key={item.path}>
                    <button type="button" className="project-gate-recent-open" onClick={() => void editor.openProjectAt(item.path)} title={item.path}>
                      <strong>{item.name}</strong>
                      <small>{item.path}</small>
                      <em>{formatRecentOpenedAt(item.openedAt)}</em>
                    </button>
                    <button
                      type="button"
                      className="icon-del"
                      title="Убрать из списка"
                      onClick={() => editor.removeRecentProject(item.path)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
