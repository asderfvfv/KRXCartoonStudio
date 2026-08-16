import { useMemo, useState } from "react";
import {
  CATEGORY_LABELS_RU,
  listBuiltinGestures,
  listProjectClips,
  MOTION_LABELS_RU,
  type GestureCategory,
} from "../domain/gestureLibrary";
import type { MotionName } from "../domain/types";
import { useEditor } from "../editor/EditorContext";

type LibTab = "builtin" | "clips";

const CATEGORY_ORDER: GestureCategory[] = ["locomotion", "gesture", "emotion", "reaction"];

export function GestureLibraryPane() {
  const editor = useEditor();
  const [tab, setTab] = useState<LibTab>("builtin");
  const builtins = useMemo(() => listBuiltinGestures(), []);
  const clips = useMemo(() => listProjectClips(editor.project), [editor.project]);

  const byCategory = useMemo(() => {
    const map = new Map<GestureCategory, typeof builtins>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const item of builtins) {
      map.get(item.category)!.push(item);
    }
    return map;
  }, [builtins]);

  return (
    <div className="gesture-library pane-scroll">
      <p className="gesture-library-intro">
        Готовые движения персонажа: машет, идёт, радуется… Выбери актёра → ▶ превью или «Timeline» на ползунок.
        Жёлтая полоска / ▴▾ у заголовка — раздвинуть блок.
      </p>
      <div className="gesture-library-tabs">
        <button type="button" className={tab === "builtin" ? "active" : ""} onClick={() => setTab("builtin")}>Встроенные жесты</button>
        <button type="button" className={tab === "clips" ? "active" : ""} onClick={() => setTab("clips")}>Мои клипы</button>
      </div>

      {tab === "builtin" && (
        <div className="gesture-library-body">
          {CATEGORY_ORDER.map((category) => {
            const items = byCategory.get(category) ?? [];
            if (!items.length) return null;
            return (
              <div key={category} className="gesture-category">
                <small>{CATEGORY_LABELS_RU[category]}</small>
                <div className="gesture-cards">
                  {items.map((gesture) => (
                    <div key={gesture.name} className={`gesture-card${editor.previewMotion === gesture.name ? " active" : ""}`}>
                      <strong>{gesture.labelRu}</strong>
                      <div className="gesture-card-actions">
                        <button
                          type="button"
                          title="Превью на выбранном актёре"
                          className={editor.previewMotion === gesture.name ? "active" : ""}
                          onClick={() => editor.setPreviewMotion(editor.previewMotion === gesture.name ? null : gesture.name)}
                        >
                          ▶
                        </button>
                        <button
                          type="button"
                          title="Вставить на Timeline (playhead)"
                          onClick={() => editor.insertGestureAtPlayhead(gesture.name)}
                        >
                          Timeline
                        </button>
                        <button
                          type="button"
                          title="Открыть клип (запечь при необходимости)"
                          onClick={() => editor.openBuiltinGestureClip(gesture.name)}
                        >
                          Клип
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "clips" && (
        <div className="gesture-library-body">
          {!clips.length && <p className="empty-hint">Нет клипов — «Подготовить клипы» или «＋ Из позы»</p>}
          <div className="gesture-cards">
            {clips.map((clip) => {
              const motionName = clip.name as MotionName;
              const canPreview = Boolean(MOTION_LABELS_RU[motionName]);
              return (
                <div key={clip.id} className={`gesture-card${editor.currentClipId === clip.id ? " active" : ""}`}>
                  <strong>{clip.labelRu}</strong>
                  <small>{clip.generated ? "запечён" : "проект"} · {clip.duration.toFixed(1)}с · {clip.tracks.length} дор.</small>
                  <div className="gesture-card-actions">
                    <button
                      type="button"
                      title="Превью, если имя = Motion"
                      disabled={!canPreview}
                      onClick={() => {
                        if (!canPreview) return;
                        editor.setPreviewMotion(editor.previewMotion === motionName ? null : motionName);
                      }}
                    >
                      ▶
                    </button>
                    <button type="button" title="Открыть в Timeline" onClick={() => editor.openGestureClip(clip.id)}>Открыть</button>
                    <button type="button" title="Копия" onClick={() => editor.duplicateGestureClip(clip.id)}>Копия</button>
                    <button type="button" title="Имя…" onClick={() => editor.renameGestureClip(clip.id)}>Имя…</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="gesture-library-footer">
        <button type="button" onClick={editor.ensureGestureClips}>Подготовить клипы</button>
        <button type="button" onClick={() => editor.createPoseClip()}>＋ Из позы</button>
        <button type="button" onClick={() => editor.duplicateGestureClip()}>Копия клипа</button>
        <button type="button" onClick={() => editor.renameGestureClip()}>Имя…</button>
      </div>
    </div>
  );
}
