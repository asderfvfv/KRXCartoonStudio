import { useState, type DragEvent, type ReactNode } from "react";
import type { RigPart } from "../domain/types";
import { scenePlaybackDuration } from "../domain/montage";
import { sceneTemplates, type SceneTemplateId } from "../domain/templates";
import { useEditor } from "../editor/EditorContext";
import {
  useLeftSidebarLayout,
  type LeftSidebarSectionId,
} from "../editor/useLeftSidebarLayout";
import { GestureLibraryPane } from "./GestureLibraryPane";
import { AssetBrowser } from "./AssetBrowser";

function HierarchyNode({ part, depth }: { part: RigPart; depth: number }) {
  const { currentCharacter, selectedPartId, setSelectedPartId, commit, changeParent } = useEditor();
  const children = currentCharacter.parts.filter((item) => item.parentId === part.id).sort((a, b) => a.zIndex - b.zIndex);
  const rename = () => {
    const name = window.prompt("Новое имя части (слой)", part.name)?.trim();
    if (name && name !== part.name) {
      commit("Переименован слой", (draft) => {
        const target = draft.characters.find((character) => character.id === currentCharacter.id)?.parts.find((item) => item.id === part.id);
        if (target) target.name = name;
      });
    }
  };
  const toggle = (field: "visible" | "locked", event: React.MouseEvent) => {
    event.stopPropagation();
    commit(`Изменено ${field}`, (draft) => {
      const target = draft.characters.find((character) => character.id === currentCharacter.id)?.parts.find((item) => item.id === part.id);
      if (target) target[field] = !target[field];
    });
  };
  const drop = (event: DragEvent) => {
    event.preventDefault();
    const childId = event.dataTransfer.getData("text/rig-part");
    if (childId) changeParent(childId, part.id);
  };
  return (
    <>
      <div
        className={`tree-row ${selectedPartId === part.id ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => setSelectedPartId(part.id)}
        onDoubleClick={rename}
        draggable
        onDragStart={(event) => event.dataTransfer.setData("text/rig-part", part.id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
      >
        <span className="tree-branch">{children.length ? "▾" : "·"}</span>
        <button className="icon-button" title="Видимость слоя" onClick={(event) => toggle("visible", event)}>{part.visible ? "◉" : "○"}</button>
        <span className="tree-name">{part.name}</span>
        <span className="role-chip">{part.semanticRole ?? "None"}</span>
        <button className="icon-button" title="Блокировка" onClick={(event) => toggle("locked", event)}>{part.locked ? "▣" : "□"}</button>
      </div>
      {children.map((child) => <HierarchyNode key={child.id} part={child} depth={depth + 1} />)}
    </>
  );
}

function SidebarPane({
  id,
  title,
  meta,
  height,
  collapsed,
  fill,
  splitter,
  resizeHint,
  onToggle,
  onResizeStart,
  onNudgeHeight,
  children,
}: {
  id: LeftSidebarSectionId;
  title: string;
  meta?: string | number;
  height?: number;
  collapsed: boolean;
  fill?: boolean;
  /** Where the drag handle sits relative to the body */
  splitter?: "below" | "above";
  resizeHint?: string;
  onToggle(): void;
  onResizeStart?(clientY: number): void;
  onNudgeHeight?(delta: number): void;
  children: ReactNode;
}) {
  const handle = onResizeStart && splitter ? (
    <div
      className={`sidebar-splitter${resizeHint ? " labeled" : ""}`}
      title="Потяните вверх/вниз — изменить высоту"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
        onResizeStart(event.clientY);
      }}
    >
      {resizeHint ? <span>{resizeHint}</span> : null}
    </div>
  ) : null;

  const bodyStyle = fill
    ? { flex: 1, minHeight: height ?? 200 }
    : height == null
      ? undefined
      : { height };

  return (
    <section className={`sidebar-pane${fill ? " fill" : " fixed"}${collapsed ? " collapsed" : ""}`} data-section={id}>
      <div className="sidebar-pane-head-row">
        <button type="button" className="sidebar-pane-head" title="Клик — свернуть/развернуть" onClick={onToggle}>
          <span className="sidebar-pane-chevron">{collapsed ? "▸" : "▾"}</span>
          <span className="sidebar-pane-title">{title}</span>
          {meta != null ? <small>{meta}</small> : null}
        </button>
        {onNudgeHeight && !collapsed ? (
          <div className="sidebar-pane-size">
            <button type="button" title="Сделать блок ниже" onClick={() => onNudgeHeight(-48)}>▴</button>
            <button type="button" title="Сделать блок выше" onClick={() => onNudgeHeight(48)}>▾</button>
          </div>
        ) : null}
      </div>
      {!collapsed && splitter === "above" ? handle : null}
      {!collapsed && (
        <div className="sidebar-pane-body" style={bodyStyle}>
          {children}
        </div>
      )}
      {!collapsed && splitter === "below" ? handle : null}
    </section>
  );
}

export function LeftSidebar() {
  const [tab, setTab] = useState<"assets" | "characters">("assets");
  const editor = useEditor();
  const layout = useLeftSidebarLayout();
  const roots = editor.currentCharacter.parts.filter((part) => !part.parentId).sort((a, b) => a.zIndex - b.zIndex);

  return (
    <aside className="left-sidebar panel">
      <p className="stage-howto">
        <strong>Библиотека картинок:</strong> «Импорт PNG» → выбери карточку → «＋ На сцену» (предмет) или «Фон».
        Двойной клик по карточке тоже кладёт предмет. Фильтр «В риге» = части тела персонажа, не декорации.
      </p>

      <div className="left-sidebar-panes">
        <SidebarPane
          id="scenes"
          title="Сцены"
          meta={editor.project.scenes?.length ?? 0}
          height={layout.heights.scenes}
          collapsed={layout.collapsed.scenes}
          splitter="below"
          onToggle={() => layout.toggleCollapsed("scenes")}
          onResizeStart={(y) => layout.beginResizeBelow("scenes", y)}
        >
          <div className="scene-list pane-scroll">
            {editor.montage.clips.map((clip, index) => {
              const scene = editor.project.scenes?.find((item) => item.id === clip.sceneId);
              if (!scene) return null;
              return (
                <div key={scene.id} className={`scene-row${scene.id === editor.currentSceneId ? " active" : ""}`}>
                  <button
                    type="button"
                    className={scene.id === editor.currentSceneId ? "active" : ""}
                    onClick={() => editor.setCurrentSceneId(scene.id)}
                  >
                    <span>{index + 1}. {scene.name}{clip.enabled ? "" : " (выкл)"}</span>
                    <small>{scene.actors.length} акт. · {scenePlaybackDuration(scene).toFixed(1)}с</small>
                  </button>
                  <button
                    type="button"
                    className="danger icon-del"
                    title="Удалить сцену"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void editor.deleteScene(scene.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {!editor.project.scenes?.length && <p className="empty-hint">Нет сцен</p>}
          </div>
          <div className="scene-actions">
            <button type="button" title="Новая пустая сцена" onClick={editor.newScene}>＋ Сцена</button>
            <button type="button" onClick={editor.duplicateScene}>Копия</button>
            <button type="button" onClick={editor.renameScene}>Имя</button>
            <button type="button" className="danger" title="Удалить выбранную сцену" onClick={() => void editor.deleteScene()}>Удалить</button>
          </div>
          <div className="actor-add">
            <select
              defaultValue=""
              title="Новая сцена из шаблона"
              onChange={(event) => {
                const value = event.target.value as SceneTemplateId | "";
                if (value) editor.newSceneFromTemplate(value);
                event.target.value = "";
              }}
            >
              <option value="">＋ Сцена из шаблона…</option>
              {sceneTemplates.map((item) => (
                <option key={item.id} value={item.id}>{item.label} — {item.description}</option>
              ))}
            </select>
          </div>
        </SidebarPane>

        <SidebarPane
          id="actors"
          title="Актёры на сцене"
          meta={editor.currentScene.actors.length}
          height={layout.heights.actors}
          collapsed={layout.collapsed.actors}
          splitter="below"
          onToggle={() => layout.toggleCollapsed("actors")}
          onResizeStart={(y) => layout.beginResizeBelow("actors", y)}
        >
          <div className="actor-list pane-scroll">
            {editor.currentScene.actors.map((actor) => (
              <div key={actor.id} className="actor-row">
                <button type="button" className={actor.id === editor.selectedActorId ? "active" : ""} onClick={() => { editor.setSelectedActorId(actor.id); editor.setTool("move"); }}>
                  <span className="actor-dot" style={{ background: actor.tint ?? "#5eb5c0" }} />
                  <span><strong>{actor.name}</strong><small>{actor.facingDirection === "Left" ? "влево" : "вправо"} · {actor.scale.toFixed(2)}×</small></span>
                </button>
                <button type="button" className="danger icon-del" title="Удалить со сцены" onClick={() => editor.deleteActor(actor.id)}>×</button>
              </div>
            ))}
            {!editor.currentScene.actors.length && (
              <p className="empty-hint">Пусто — «2. Актёр» сверху: Огонёк / Морозко / Винтик</p>
            )}
          </div>
          <div className="actor-add">
            <div className="button-row" style={{ flexWrap: "wrap", marginBottom: 6 }}>
              <button type="button" title="Готовый герой из программы" onClick={() => void editor.addBundledCharacterToScene("AudioBeast/EmberPuff")}>＋ Огонёк</button>
              <button type="button" onClick={() => void editor.addBundledCharacterToScene("AudioBeast/FrostFang")}>＋ Морозко</button>
              <button type="button" onClick={() => void editor.addBundledCharacterToScene("AudioBeast/GearBot")}>＋ Винтик</button>
            </div>
            <select
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) {
                  editor.addActor(event.target.value);
                  editor.setTool("move");
                }
                event.target.value = "";
              }}
            >
              <option value="">＋ Из проекта…</option>
              {editor.project.characters
                .filter((character) => (character.parts?.length ?? 0) > 0 && character.name !== "DemoBot")
                .map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
            </select>
          </div>
        </SidebarPane>

        <SidebarPane
          id="props"
          title="Предметы / библиотека"
          meta={editor.currentScene.props.length}
          height={layout.heights.props}
          collapsed={layout.collapsed.props}
          splitter="below"
          resizeHint="↕ раздвинуть предметы / картинки"
          onToggle={() => layout.toggleCollapsed("props")}
          onResizeStart={(y) => layout.beginResizeBelow("props", y)}
          onNudgeHeight={(delta) => layout.nudgeSectionHeight("props", delta)}
        >
          <div className={`prop-list${editor.currentScene.props.length ? " pane-scroll has-items" : " is-empty"}`}>
            {editor.currentScene.props.map((prop) => (
              <div key={prop.id} className="actor-row">
                <button type="button" className={prop.id === editor.selectedPropId ? "active" : ""} onClick={() => { editor.setSelectedPropId(prop.id); editor.setTool("move"); }}>
                  <span>{prop.name}</span>
                  <small>z {prop.zIndex}</small>
                </button>
                <button type="button" className="danger icon-del" title="Удалить" onClick={() => editor.deleteProp(prop.id)}>×</button>
              </div>
            ))}
            {!editor.currentScene.props.length && <p className="empty-hint">Нет предметов — Библиотека: двойной клик или «＋ Предмет на сцену». Фон — «Сделать фоном»</p>}
          </div>
          {editor.currentScene.backgroundAssetId ? (
            <div className="library-actions">
              <button type="button" className="danger" onClick={editor.clearSceneBackground}>Убрать фон сцены</button>
            </div>
          ) : null}
          <div className="panel-tabs">
            <button type="button" className={tab === "assets" ? "active" : ""} onClick={() => setTab("assets")}>Библиотека</button>
            <button type="button" className={tab === "characters" ? "active" : ""} onClick={() => setTab("characters")}>Слои персонажа</button>
          </div>
          {tab === "characters" && (
            <div className="library-actions">
              <button type="button" onClick={() => editor.openToolPanel("character")}>Создатель</button>
              <button type="button" onClick={editor.createCharacter}>Новый персонаж</button>
            </div>
          )}
          {tab === "assets" && <AssetBrowser />}
          {tab === "characters" && (
            <>
              <div className="hierarchy pane-scroll">
                <div className="character-root"><span>◇</span><strong>{editor.currentCharacter.name}</strong></div>
                {roots.map((part) => <HierarchyNode key={part.id} part={part} depth={0} />)}
                {!roots.length && <p className="empty-hint">Нет частей — Создатель или папка PNG (body/eye/mouth…)</p>}
              </div>
              <div className="character-actions">
                <button type="button" onClick={() => void editor.saveCharacter()}>Сохранить</button>
                <button type="button" onClick={() => void editor.loadCharacterPngFolder()}>Папка PNG…</button>
                <button type="button" onClick={() => void editor.loadCharacter()}>JSON / PNG…</button>
              </div>
            </>
          )}
        </SidebarPane>

        <SidebarPane
          id="motions"
          title="Жесты / клипы"
          meta="анимация"
          height={layout.heights.motions}
          collapsed={layout.collapsed.motions}
          splitter="below"
          resizeHint="↕ раздвинуть жесты"
          onToggle={() => layout.toggleCollapsed("motions")}
          onResizeStart={(y) => layout.beginResizeBelow("motions", y)}
          onNudgeHeight={(delta) => layout.nudgeSectionHeight("motions", delta)}
        >
          <GestureLibraryPane />
        </SidebarPane>
      </div>
    </aside>
  );
}
