import { useEffect, useMemo, useState } from "react";
import {
  assetDisplayName,
  assetRoleHint,
  assetUsageLabel,
  collectAssetUsage,
  filterProjectAssets,
  type AssetBrowserFilter,
} from "../domain/assetBrowser";
import { createId } from "../domain/ids";
import { useEditor } from "../editor/EditorContext";

const FILTERS: Array<{ id: AssetBrowserFilter; label: string }> = [
  { id: "all", label: "Все" },
  { id: "props", label: "Предметы" },
  { id: "backgrounds", label: "Фоны" },
  { id: "characters", label: "Части рига" },
  { id: "unused", label: "Свободные" },
];

export function AssetBrowser() {
  const editor = useEditor();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AssetBrowserFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const assets = useMemo(
    () => filterProjectAssets(editor.project, { query, filter }),
    [editor.project, filter, query],
  );

  useEffect(() => {
    let canceled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const asset of editor.project.assets) {
        try {
          const url = await (window.kcs?.readAsset(asset.path, editor.projectPath)
            ?? Promise.resolve(asset.path.startsWith("data:") ? asset.path : asset.path.replace("builtin://", "/")));
          if (canceled) return;
          next[asset.id] = url;
        } catch {
          /* skip broken thumb */
        }
      }
      if (!canceled) setThumbs(next);
    })();
    return () => { canceled = true; };
  }, [editor.project.assets, editor.projectPath]);

  const addProp = (assetId: string) => {
    const id = createId("prop");
    editor.commit("Предмет добавлен", (draft) => {
      const asset = draft.assets.find((item) => item.id === assetId)!;
      draft.scenes!.find((item) => item.id === editor.currentScene.id)!.props.push({
        id,
        name: assetDisplayName(asset),
        assetId,
        position: { x: editor.currentScene.width / 2, y: editor.currentScene.height / 2 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20 + editor.currentScene.props.length,
      });
    });
    editor.setSelectedPropId(id);
    editor.setTool("move");
  };

  const setBackground = (assetId: string) => {
    editor.commit("Background назначен", (draft) => {
      draft.scenes!.find((item) => item.id === editor.currentScene.id)!.backgroundAssetId = assetId;
    });
  };

  const selected = editor.project.assets.find((item) => item.id === selectedId) ?? assets[0] ?? null;
  const selectedUsage = selected ? collectAssetUsage(editor.project, selected.id) : null;

  return (
    <div className="asset-browser">
      <p className="asset-browser-guide">
        На сцену вручную: <strong>Фон</strong> / <strong>＋ Предмет</strong> · актёры — список выше · звук — Timeline или вкладка Аудио
      </p>
      <div className="asset-browser-toolbar">
        <input
          type="search"
          placeholder="Поиск…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Поиск картинок"
        />
        <button type="button" onClick={() => void editor.importPng()}>Импорт PNG</button>
      </div>
      <div className="asset-browser-filters">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filter === "characters" && (
        <p className="asset-browser-note">
          Части персонажа (тело, руки…). Для дороги/дерева — «Импорт PNG».
        </p>
      )}

      {!assets.length ? (
        <p className="empty-hint">Нет картинок — нажми «Импорт PNG».</p>
      ) : (
        <div className="asset-browser-list">
          {assets.map((asset) => {
            const active = selected?.id === asset.id;
            const label = assetDisplayName(asset);
            const role = assetRoleHint(editor.project, asset.id);
            return (
              <button
                key={asset.id}
                type="button"
                className={`asset-row-card${active ? " active" : ""}`}
                title={`${label} · ${role}`}
                onClick={() => setSelectedId(asset.id)}
                onDoubleClick={() => addProp(asset.id)}
              >
                <span className="asset-row-thumb">
                  {thumbs[asset.id] ? (
                    <img src={thumbs[asset.id]} alt="" draggable={false} />
                  ) : (
                    <span>—</span>
                  )}
                </span>
                <span className="asset-row-text">
                  <strong>{label}</strong>
                  <small>{role}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {selected && selectedUsage && (
        <div className="asset-browser-detail">
          <div className="asset-browser-detail-meta">
            <strong>{assetDisplayName(selected)}</strong>
            <small>
              {assetRoleHint(editor.project, selected.id)} · {selected.width}×{selected.height}
              {selectedUsage.total ? ` · ${assetUsageLabel(selectedUsage)}` : ""}
            </small>
            <div className="asset-browser-detail-actions">
              <button type="button" onClick={() => addProp(selected.id)}>＋ Предмет на сцену</button>
              <button type="button" onClick={() => setBackground(selected.id)}>Сделать фоном</button>
              <button type="button" className="danger" onClick={() => void editor.deleteAsset(selected.id)}>Удалить из библиотеки</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
