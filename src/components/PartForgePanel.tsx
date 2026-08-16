import type { SocketType } from "../domain/types";
import { attachmentLibrary } from "../domain/attachments";
import { useEditor } from "../editor/EditorContext";

const socketTypes: SocketType[] = ["HeadTop", "Mouth", "HandLeft", "HandRight", "FootLeft", "FootRight", "Custom"];

function NumberField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange(value: number): void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function PartForgePanel() {
  const editor = useEditor();
  if (!editor.partForgeOpen) return null;

  const actor = editor.currentScene.actors.find((item) => item.id === editor.selectedActorId);
  const character = editor.currentCharacter;
  const attachments = (editor.currentScene.attachments ?? []).filter((item) => !editor.selectedActorId || item.actorId === editor.selectedActorId);
  const selected = (editor.currentScene.attachments ?? []).find((item) => item.id === editor.selectedAttachmentId);
  const sockets = character.sockets ?? [];

  return (
    <div className="export-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) editor.setPartForgeOpen(false); }}>
      <section className="export-modal partforge-modal" role="dialog" aria-label="PartForge">
        <header className="export-modal-head">
          <div>
            <strong>PartForge</strong>
            <small>Объекты на sockets: библиотека, PNG/asset, пресеты, окно видимости. Локально.</small>
          </div>
          <button type="button" onClick={() => editor.setPartForgeOpen(false)}>Закрыть</button>
        </header>

        <div className="export-modal-body partforge-body">
          <section className="inspector-section">
            <h3>Actor</h3>
            <p className="hint">{actor ? `${actor.name} · ${character.name}` : "Выберите Actor на сцене."}</p>
            <label className="export-field">
              <span>Цвет библиотеки</span>
              <input type="color" value={editor.partForgeColor} onChange={(event) => editor.setPartForgeColor(event.target.value)} />
            </label>
          </section>

          <section className="inspector-section">
            <h3>Библиотека ({attachmentLibrary.length})</h3>
            <div className="partforge-library-grid">
              {attachmentLibrary.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!editor.selectedActorId}
                  title={`${item.label} → ${item.preferredSocket}`}
                  onClick={() => editor.addAttachmentFromLibrary(item.id)}
                >
                  <strong>{item.label}</strong>
                  <small>{item.preferredSocket}</small>
                </button>
              ))}
            </div>
            <label className="select-field">
              <span>From project asset</span>
              <select
                defaultValue=""
                disabled={!editor.selectedActorId}
                onChange={(event) => {
                  if (event.target.value) editor.addAttachmentFromAsset(event.target.value);
                  event.target.value = "";
                }}
              >
                <option value="">＋ Attach PNG/SVG asset…</option>
                {editor.project.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
              </select>
            </label>
          </section>

          <section className="inspector-section">
            <h3>На сцене ({attachments.length})</h3>
            <div className="socket-list">
              {attachments.map((item) => (
                <button key={item.id} type="button" className={item.id === editor.selectedAttachmentId ? "active" : ""} onClick={() => editor.setSelectedAttachmentId(item.id)}>
                  {item.name}<small>{item.socketType}{item.startTime != null || item.endTime != null ? " · timed" : ""}</small>
                </button>
              ))}
              {!attachments.length && <p className="hint">Пока нет attachments у выбранного Actor.</p>}
            </div>
            <div className="button-row">
              <button type="button" disabled={!selected} onClick={() => editor.duplicateSelectedAttachment()}>Duplicate</button>
              <button type="button" disabled={!selected} onClick={() => editor.saveSelectedAttachmentPreset()}>Save Preset</button>
              <button type="button" className="danger" disabled={!selected} onClick={() => selected && editor.deleteAttachment(selected.id)}>Delete</button>
            </div>
          </section>

          {selected && (
            <section className="inspector-section">
              <h3>Редактор: {selected.name}</h3>
              <label className="export-field">
                <span>Имя</span>
                <input value={selected.name} onChange={(event) => editor.updateAttachment(selected.id, { name: event.target.value })} />
              </label>
              <label className="select-field">
                <span>Socket type</span>
                <select value={selected.socketType} onChange={(event) => editor.updateAttachment(selected.id, { socketType: event.target.value as SocketType, socketId: null })}>
                  {socketTypes.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <label className="select-field">
                <span>Exact socket</span>
                <select
                  value={selected.socketId ?? ""}
                  onChange={(event) => editor.updateAttachment(selected.id, { socketId: event.target.value || null })}
                >
                  <option value="">По типу ({selected.socketType})</option>
                  {sockets.map((socket) => <option key={socket.id} value={socket.id}>{socket.name} · {socket.type}</option>)}
                </select>
              </label>
              <div className="field-grid">
                <NumberField label="Off X" value={selected.offset.x} onChange={(value) => editor.updateAttachment(selected.id, { offset: { ...selected.offset, x: value } })} />
                <NumberField label="Off Y" value={selected.offset.y} onChange={(value) => editor.updateAttachment(selected.id, { offset: { ...selected.offset, y: value } })} />
                <NumberField label="Rot" value={selected.rotation} step={0.5} onChange={(value) => editor.updateAttachment(selected.id, { rotation: value })} />
                <NumberField label="Scale X" value={selected.scale.x} step={0.05} onChange={(value) => editor.updateAttachment(selected.id, { scale: { ...selected.scale, x: value } })} />
                <NumberField label="Scale Y" value={selected.scale.y} step={0.05} onChange={(value) => editor.updateAttachment(selected.id, { scale: { ...selected.scale, y: value } })} />
                <NumberField label="Anchor X" value={selected.anchor.x} step={0.05} onChange={(value) => editor.updateAttachment(selected.id, { anchor: { ...selected.anchor, x: value } })} />
                <NumberField label="Anchor Y" value={selected.anchor.y} step={0.05} onChange={(value) => editor.updateAttachment(selected.id, { anchor: { ...selected.anchor, y: value } })} />
                <NumberField label="Z" value={selected.zIndex} onChange={(value) => editor.updateAttachment(selected.id, { zIndex: Math.round(value) })} />
                <NumberField label="Opacity" value={selected.opacity} step={0.05} onChange={(value) => editor.updateAttachment(selected.id, { opacity: Math.max(0, Math.min(1, value)) })} />
                <NumberField label="Start (s)" value={selected.startTime ?? 0} step={0.05} onChange={(value) => editor.updateAttachment(selected.id, { startTime: value })} />
                <NumberField label="End (s)" value={selected.endTime ?? editor.currentScene.duration} step={0.05} onChange={(value) => editor.updateAttachment(selected.id, { endTime: value })} />
              </div>
              <div className="checks">
                <label><input type="checkbox" checked={selected.visible} onChange={(event) => editor.updateAttachment(selected.id, { visible: event.target.checked })} /> Visible</label>
                <label><input type="checkbox" checked={Boolean(selected.flipX)} onChange={(event) => editor.updateAttachment(selected.id, { flipX: event.target.checked })} /> Flip X</label>
                <label><input type="checkbox" checked={Boolean(selected.flipY)} onChange={(event) => editor.updateAttachment(selected.id, { flipY: event.target.checked })} /> Flip Y</label>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.startTime == null && selected.endTime == null}
                    onChange={(event) => {
                      if (event.target.checked) editor.updateAttachment(selected.id, { startTime: null, endTime: null });
                      else editor.updateAttachment(selected.id, { startTime: 0, endTime: editor.currentScene.duration });
                    }}
                  /> Always on timeline
                </label>
              </div>
            </section>
          )}

          <section className="inspector-section">
            <h3>Пресеты проекта ({editor.attachmentPresets.length})</h3>
            <p className="hint">Сохраняются в .kcsproj. Asset должен остаться в проекте.</p>
            <div className="socket-list">
              {editor.attachmentPresets.map((preset) => (
                <div key={preset.id} className="partforge-preset-row">
                  <button type="button" disabled={!editor.selectedActorId} onClick={() => editor.applyAttachmentPreset(preset.id)}>
                    {preset.name}<small>{preset.socketType} · {preset.kind}</small>
                  </button>
                  <button type="button" className="danger" onClick={() => editor.deleteAttachmentPreset(preset.id)}>×</button>
                </div>
              ))}
              {!editor.attachmentPresets.length && <p className="hint">Нет пресетов — выберите attachment и Save Preset.</p>}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
