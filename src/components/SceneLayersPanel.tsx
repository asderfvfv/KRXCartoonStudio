import { useEditor } from "../editor/EditorContext";

type AlignMode = "center" | "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter";

export function SceneLayersPanel() {
  const editor = useEditor();
  const scene = editor.currentScene;
  const propsSorted = [...scene.props].sort((a, b) => b.zIndex - a.zIndex);
  const actors = scene.actors;

  const align = (mode: AlignMode) => editor.alignSelection(mode);

  return (
    <div className="scene-layers-panel">
      <div className="section-title"><span>Слои сцены</span><small>{actors.length + propsSorted.length}</small></div>

      <div className="layers-align">
        <span>Выровнять выбранное на кадре</span>
        <button type="button" title="В центр кадра" disabled={!editor.selectedPropId && !editor.selectedActorId} onClick={() => align("center")}>Центр</button>
        <button type="button" title="Прижать влево" disabled={!editor.selectedPropId && !editor.selectedActorId} onClick={() => align("left")}>Влево</button>
        <button type="button" title="Прижать вправо" disabled={!editor.selectedPropId && !editor.selectedActorId} onClick={() => align("right")}>Вправо</button>
        <button type="button" title="Прижать вверх" disabled={!editor.selectedPropId && !editor.selectedActorId} onClick={() => align("top")}>Вверх</button>
        <button type="button" title="Прижать вниз" disabled={!editor.selectedPropId && !editor.selectedActorId} onClick={() => align("bottom")}>Вниз</button>
      </div>

      <p className="hint layers-hint">
        Порядок показа: у предмета число <strong>Z</strong> (больше = ближе к зрителю). Актёры ≈ Z 100.
        Дерево перед героем → Z предмета выше 100. Кнопки ↑↓ двигают слой.
      </p>

      <div className="layers-group-label">Предметы</div>
      <div className="layers-list">
        {propsSorted.map((prop) => (
          <div
            key={prop.id}
            className={`layers-row${prop.id === editor.selectedPropId ? " selected" : ""}`}
          >
            <button
              type="button"
              className="layers-main"
              onClick={() => { editor.setSelectedPropId(prop.id); editor.setTool("move"); }}
            >
              <span className={`layers-vis${prop.visible ? "" : " off"}`}>{prop.visible ? "◉" : "○"}</span>
              <span className="layers-name">{prop.name}</span>
              <small>z {prop.zIndex}</small>
            </button>
            <button type="button" title="Видимость" onClick={() => editor.setPropVisible(prop.id, !prop.visible)}>{prop.visible ? "👁" : "–"}</button>
            <button type="button" title="Выше" onClick={() => editor.nudgePropLayer(prop.id, 10)}>↑</button>
            <button type="button" title="Ниже" onClick={() => editor.nudgePropLayer(prop.id, -10)}>↓</button>
            <button type="button" title="Копия" onClick={() => editor.duplicateProp(prop.id)}>⧉</button>
            <button type="button" className="danger" title="Удалить" onClick={() => editor.deleteProp(prop.id)}>×</button>
          </div>
        ))}
        {!propsSorted.length && <p className="empty-hint">Нет предметов — Импорт PNG → ＋</p>}
      </div>

      <div className="layers-group-label">Актёры</div>
      <div className="layers-list">
        {[...actors].reverse().map((actor, reverseIndex) => {
          const index = actors.length - 1 - reverseIndex;
          return (
            <div
              key={actor.id}
              className={`layers-row${actor.id === editor.selectedActorId ? " selected" : ""}`}
            >
              <button
                type="button"
                className="layers-main"
                onClick={() => { editor.setSelectedActorId(actor.id); editor.setTool("move"); }}
              >
                <span className={`layers-vis${actor.visible ? "" : " off"}`}>{actor.visible ? "◉" : "○"}</span>
                <span className="layers-name">{actor.name}</span>
                <small>#{index + 1}</small>
              </button>
              <button type="button" title="Видимость" onClick={() => editor.setActorVisible(actor.id, !actor.visible)}>{actor.visible ? "👁" : "–"}</button>
              <button type="button" title="Ближе (выше в списке)" onClick={() => editor.reorderActor(actor.id, 1)}>↑</button>
              <button type="button" title="Дальше" onClick={() => editor.reorderActor(actor.id, -1)}>↓</button>
              <button type="button" title="Копия" onClick={() => editor.duplicateActor(actor.id)}>⧉</button>
              <button type="button" className="danger" title="Удалить" onClick={() => editor.deleteActor(actor.id)}>×</button>
            </div>
          );
        })}
        {!actors.length && <p className="empty-hint">Нет актёров на сцене</p>}
      </div>
    </div>
  );
}
