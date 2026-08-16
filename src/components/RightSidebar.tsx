import { useEffect, useState } from "react";
import { Inspector } from "./Inspector";
import { ActionPanel } from "./ActionPanel";
import { AudioPanel } from "./AudioPanel";
import { SceneLayersPanel } from "./SceneLayersPanel";
import type { RightSidebarTab } from "../domain/sceneConstructor";
import { useEditor } from "../editor/EditorContext";

export function RightSidebar() {
  const editor = useEditor();
  const [tab, setTab] = useState<RightSidebarTab>("layers");

  useEffect(() => {
    if (!editor.requestedRightTab) return;
    setTab(editor.requestedRightTab);
    editor.clearRequestedRightTab();
  }, [editor, editor.requestedRightTab]);

  return (
    <aside className="right-sidebar panel">
      <div className="panel-tabs layers-tabs">
        <button type="button" className={tab === "layers" ? "active" : ""} onClick={() => setTab("layers")}>Слои</button>
        <button type="button" className={tab === "inspector" ? "active" : ""} onClick={() => setTab("inspector")} title="X/Y, масштаб, поворот актёра и частей">
          Свойства{editor.selectedActorId || editor.selectedPropId ? " ·" : ""}
        </button>
        <button type="button" className={tab === "actions" ? "active" : ""} onClick={() => setTab("actions")}>Действия</button>
        <button type="button" className={tab === "audio" ? "active" : ""} onClick={() => setTab("audio")}>Аудио</button>
      </div>
      {tab === "layers" ? <SceneLayersPanel />
        : tab === "inspector" ? <Inspector />
          : tab === "actions" ? <ActionPanel />
            : <AudioPanel />}
    </aside>
  );
}
