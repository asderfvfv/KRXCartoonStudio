import type { Actor, RigPart, RigSocket, SceneCamera, SceneProp, SemanticRole, SocketType, Transform, Vec2 } from "../domain/types";
import { attachmentLibrary } from "../domain/attachments";
import { builtInPosePresets } from "../domain/posePresets";
import { semanticRoles } from "../domain/semantic";
import { useEditor } from "../editor/EditorContext";
import { SceneBackgroundPanel } from "./SceneBackgroundPanel";
import { syncActorTransformKeysAtTime } from "../domain/timelineKeys";

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange(value: number): void; step?: number }) {
  return <label className="number-field"><span>{label}</span><input type="number" value={Number.isFinite(value) ? Number(value.toFixed(3)) : 0} step={step} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} /></label>;
}

export function Inspector() {
  const editor = useEditor();
  const actor = editor.currentScene.actors.find((item) => item.id === editor.selectedActorId);
  const prop = editor.currentScene.props.find((item) => item.id === editor.selectedPropId);
  const part = editor.selectedPart;
  const socket = editor.currentCharacter.sockets?.find((item) => item.id === editor.selectedSocketId);
  const attachments = (editor.currentScene.attachments ?? []).filter((item) => !editor.selectedActorId || item.actorId === editor.selectedActorId);
  const selectedAttachment = (editor.currentScene.attachments ?? []).find((item) => item.id === editor.selectedAttachmentId);
  const updateActor = (label: string, callback: (target: Actor) => void) => {
    if (!actor) return;
    editor.commit(label, (draft) => {
      const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
      const target = scene.actors.find((item) => item.id === actor.id);
      if (!target) return;
      callback(target);
      if (editor.studioPrefs.autoKey !== false) {
        syncActorTransformKeysAtTime(scene, target.id, editor.sceneTime, {
          x: target.position.x,
          y: target.position.y,
          scale: target.scale,
          rotation: target.rotation,
        });
      }
    });
  };
  const updatePart = (label: string, callback: (target: RigPart) => void) => {
    if (!part) return;
    editor.commit(label, (draft) => {
      const target = draft.characters.find((character) => character.id === editor.currentCharacter.id)!.parts.find((item) => item.id === part.id);
      if (target) callback(target);
    });
  };
  const updateSocket = (label: string, callback: (target: RigSocket) => void) => {
    if (!socket) return;
    editor.commit(label, (draft) => {
      const target = draft.characters.find((character) => character.id === editor.currentCharacter.id)!.sockets!.find((item) => item.id === socket.id);
      if (target) callback(target);
    });
  };
  const updateProp = (label: string, callback: (target: SceneProp) => void) => {
    if (!prop) return;
    editor.commit(label, (draft) => {
      const target = draft.scenes!.find((scene) => scene.id === editor.currentScene.id)!.props.find((item) => item.id === prop.id);
      if (target) callback(target);
    });
  };
  const updateCamera = (key: keyof SceneCamera, value: number) => editor.commit(`Camera ${key}`, (draft) => {
    draft.scenes!.find((scene) => scene.id === editor.currentScene.id)!.camera[key] = value;
  });

  return (
    <div className="inspector stage2-inspector">
      <div className="panel-heading">{actor ? `Актёр · ${actor.name}` : prop ? `Предмет · ${prop.name}` : "Сцена · фон"}</div>

      {!actor && !prop && (
        <>
          <p className="hint">Клик по пустому месту сцены снимает персонажа. Здесь — фон и камера.</p>
          <SceneBackgroundPanel />
        </>
      )}

      {actor && (
        <section className="inspector-section">
          <h3>Размер и положение</h3>
          <div className="field-grid">
            <NumberField label="X" value={actor.position.x} onChange={(value) => updateActor("Actor X", (target) => { target.position.x = value; })} />
            <NumberField label="Y" value={actor.position.y} onChange={(value) => updateActor("Actor Y", (target) => { target.position.y = value; })} />
            <NumberField label="Масштаб" value={actor.scale} step={.05} onChange={(value) => updateActor("Actor scale", (target) => { target.scale = Math.max(.05, value); })} />
            <NumberField label="Поворот" value={actor.rotation} step={.5} onChange={(value) => updateActor("Actor rotation", (target) => { target.rotation = value; })} />
          </div>
          <label className="select-field">
            <span>Направление</span>
            <select value={actor.facingDirection} onChange={(event) => updateActor("Actor facing", (target) => { target.facingDirection = event.target.value as Actor["facingDirection"]; })}>
              <option value="Left">Влево</option>
              <option value="Right">Вправо</option>
            </select>
          </label>
          <div className="checks"><label><input type="checkbox" checked={actor.visible} onChange={() => updateActor("Actor visibility", (target) => { target.visible = !target.visible; })} /> Видимый на сцене</label></div>
          <p className="hint">Показать/спрятать по времени: ключ «Прозрачность» (0 = нет, 1 = есть) на таймлайне.</p>
          <button type="button" className="wide-button danger" onClick={() => editor.deleteActor(actor.id)}>Удалить актёра со сцены</button>
        </section>
      )}

      {prop && (
        <section className="inspector-section">
          <h3>Предмет · {prop.name}</h3>
          <p className="hint">Тащите инструментом <strong>G</strong>. Числа ниже — точная правка.</p>
          <div className="field-grid">
            <NumberField label="X" value={prop.position.x} onChange={(value) => updateProp("Prop X", (target) => { target.position.x = value; })} />
            <NumberField label="Y" value={prop.position.y} onChange={(value) => updateProp("Prop Y", (target) => { target.position.y = value; })} />
            <NumberField label="Масштаб X" value={prop.scale.x} step={.05} onChange={(value) => updateProp("Prop scale X", (target) => { target.scale.x = value; })} />
            <NumberField label="Масштаб Y" value={prop.scale.y} step={.05} onChange={(value) => updateProp("Prop scale Y", (target) => { target.scale.y = value; })} />
            <NumberField label="Поворот" value={prop.rotation} step={.5} onChange={(value) => updateProp("Prop rotation", (target) => { target.rotation = value; })} />
            <NumberField label="Слой Z" value={prop.zIndex} onChange={(value) => updateProp("Prop z-order", (target) => { target.zIndex = Math.round(value); })} />
            <NumberField label="Прозрачность" value={prop.opacity} step={.05} onChange={(value) => updateProp("Prop opacity", (target) => { target.opacity = Math.max(0, Math.min(1, value)); })} />
          </div>
          <div className="checks"><label><input type="checkbox" checked={prop.visible} onChange={() => updateProp("Prop visibility", (target) => { target.visible = !target.visible; })} /> Видимый</label></div>
          <button type="button" className="wide-button danger" onClick={() => editor.deleteProp(prop.id)}>Удалить предмет со сцены</button>
          <p className="hint">На сцене: G — двигать, S — масштаб, R — поворот, ПКМ — меню, Del — удалить.</p>
        </section>
      )}

      <section className="inspector-section">
        <h3>Сцена / камера</h3>
        <div className="field-grid">
          <NumberField label="Кам X" value={editor.currentScene.camera.x} onChange={(value) => updateCamera("x", value)} />
          <NumberField label="Кам Y" value={editor.currentScene.camera.y} onChange={(value) => updateCamera("y", value)} />
          <NumberField label="Зум" value={editor.currentScene.camera.zoom} step={.05} onChange={(value) => updateCamera("zoom", Math.max(.05, value))} />
          <NumberField label="Поворот" value={editor.currentScene.camera.rotation} step={.5} onChange={(value) => updateCamera("rotation", value)} />
          <NumberField label="Длина (с)" value={editor.currentScene.duration} step={0.5} onChange={(value) => editor.setSceneDuration(value)} />
        </div>
      </section>

      {(actor || prop) && <SceneBackgroundPanel />}

      <section className="inspector-section">
        <h3>Навески</h3>
        <p className="hint">Быстрый доступ. Полный редактор — «Навески» (PartForge).</p>
        <button type="button" className="wide-button" onClick={() => editor.openToolPanel("partforge")}>Открыть редактор навесок</button>
        <div className="button-row">
          {attachmentLibrary.slice(0, 4).map((item) => (
            <button key={item.id} type="button" disabled={!editor.selectedActorId} onClick={() => editor.addAttachmentFromLibrary(item.id)}>{item.label}</button>
          ))}
        </div>
        <label className="select-field">
          <span>Из картинки</span>
          <select defaultValue="" disabled={!editor.selectedActorId} onChange={(event) => { if (event.target.value) editor.addAttachmentFromAsset(event.target.value); event.target.value = ""; }}>
            <option value="">＋ Прикрепить картинку…</option>
            {editor.project.assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
          </select>
        </label>
        <div className="socket-list">
          {attachments.map((item) => (
            <button key={item.id} className={item.id === editor.selectedAttachmentId ? "active" : ""} onClick={() => editor.setSelectedAttachmentId(item.id)}>
              {item.name}<small>{item.socketType}</small>
            </button>
          ))}
        </div>
        {selectedAttachment && (
          <>
            <label className="select-field">
              <span>Сокет</span>
              <select value={selectedAttachment.socketType} onChange={(event) => editor.updateAttachment(selectedAttachment.id, { socketType: event.target.value as SocketType, socketId: null })}>
                {(["HeadTop", "Mouth", "HandLeft", "HandRight", "FootLeft", "FootRight", "Custom"] as SocketType[]).map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <div className="field-grid">
              <NumberField label="Сдвиг X" value={selectedAttachment.offset.x} onChange={(value) => editor.updateAttachment(selectedAttachment.id, { offset: { ...selectedAttachment.offset, x: value } })} />
              <NumberField label="Сдвиг Y" value={selectedAttachment.offset.y} onChange={(value) => editor.updateAttachment(selectedAttachment.id, { offset: { ...selectedAttachment.offset, y: value } })} />
              <NumberField label="Поворот" value={selectedAttachment.rotation} step={.5} onChange={(value) => editor.updateAttachment(selectedAttachment.id, { rotation: value })} />
              <NumberField label="Масштаб" value={selectedAttachment.scale.x} step={.05} onChange={(value) => editor.updateAttachment(selectedAttachment.id, { scale: { x: value, y: value } })} />
              <NumberField label="Слой Z" value={selectedAttachment.zIndex} onChange={(value) => editor.updateAttachment(selectedAttachment.id, { zIndex: Math.round(value) })} />
              <NumberField label="Прозрачность" value={selectedAttachment.opacity} step={.05} onChange={(value) => editor.updateAttachment(selectedAttachment.id, { opacity: Math.max(0, Math.min(1, value)) })} />
            </div>
            <div className="checks"><label><input type="checkbox" checked={selectedAttachment.visible} onChange={(event) => editor.updateAttachment(selectedAttachment.id, { visible: event.target.checked })} /> Видимый</label></div>
            <button type="button" className="wide-button danger" onClick={() => editor.deleteAttachment(selectedAttachment.id)}>Удалить навеску</button>
          </>
        )}
      </section>

      <section className="inspector-section bind-pose-section">
        <h3>Позы и базовая стойка</h3>
        <div className="pose-preset-grid">
          {builtInPosePresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="pose-preset-btn"
              title={preset.labelRu}
              onClick={() => editor.applyPosePreset(preset.id)}
            >
              {preset.labelRu}
            </button>
          ))}
        </div>
        <div className="inline-actions">
          <button type="button" onClick={editor.resetPose}>Сбросить позу</button>
          <button type="button" onClick={editor.setCurrentAsBindPose}>Текущую как базовую</button>
          <button type="button" onClick={() => editor.saveCustomPose()}>Сохранить свою</button>
        </div>
        {(editor.currentCharacter.poseLibrary?.length ?? 0) > 0 && (
          <div className="pose-custom-list">
            <small>Свои позы</small>
            {editor.currentCharacter.poseLibrary!.map((preset) => (
              <div key={preset.id} className="pose-custom-row">
                <button type="button" onClick={() => editor.applyPosePreset(preset.id)}>{preset.labelRu}</button>
                <button type="button" className="danger" title="Удалить" onClick={() => editor.deleteCustomPose(preset.id)}>×</button>
              </div>
            ))}
          </div>
        )}
        <p className="hint">Пресеты = сдвиг от базовой позы. Инструмент <strong>IK (I)</strong> — тяните кисть или стопу на холсте.</p>
      </section>

      {!part ? (
        <div className="empty-inspector"><span>◇</span><p>Выберите часть актёра на сцене или во вкладке «Слои персонажа».</p></div>
      ) : (
        <>
          <div className="inspector-object"><span className="part-badge">ЧАСТЬ</span><div><strong>{part.name}</strong><small>{part.id}</small></div></div>
          <section className="inspector-section">
            <h3>Роль части</h3>
            <label className="select-field">
              <span>Роль</span>
              <select value={part.semanticRole ?? "None"} onChange={(event) => updatePart("Semantic Role изменена", (target) => { target.semanticRole = event.target.value as SemanticRole; })}>
                {semanticRoles.map((role) => <option key={role}>{role}</option>)}
              </select>
            </label>
            {part.semanticRole === "Custom" && (
              <label className="select-field"><span>Своя</span><input value={part.customSemanticRole ?? ""} onChange={(event) => updatePart("Custom Role изменена", (target) => { target.customSemanticRole = event.target.value; })} /></label>
            )}
          </section>
          <section className="inspector-section">
            <h3>Трансформ части</h3>
            <div className="field-grid">
              {(["x", "y", "rotation", "scaleX", "scaleY"] as Array<keyof Transform>).map((key) => (
                <NumberField key={key} label={key === "rotation" ? "поворот" : key === "scaleX" ? "масш.X" : key === "scaleY" ? "масш.Y" : key} value={part.transform[key]} step={key.includes("scale") ? .05 : .5} onChange={(value) => updatePart(`Part ${key}`, (target) => { target.transform[key] = value; })} />
              ))}
            </div>
            <div className="inline-actions">
              <button type="button" onClick={() => updatePart("Flip X", (target) => { target.transform.scaleX *= -1; })}>Зеркало X</button>
              <button type="button" onClick={() => updatePart("Flip Y", (target) => { target.transform.scaleY *= -1; })}>Зеркало Y</button>
            </div>
          </section>
          <section className="inspector-section">
            <h3>Опора / якорь</h3>
            <div className="field-grid">
              {(["x", "y"] as Array<keyof Vec2>).map((key) => <NumberField key={`p${key}`} label={`Опора ${key.toUpperCase()}`} value={part.pivot[key]} onChange={(value) => updatePart("Pivot изменён", (target) => { target.pivot[key] = value; })} />)}
              {(["x", "y"] as Array<keyof Vec2>).map((key) => <NumberField key={`a${key}`} label={`Якорь ${key.toUpperCase()}`} value={part.anchor[key]} step={.05} onChange={(value) => updatePart("Anchor изменён", (target) => { target.anchor[key] = value; })} />)}
            </div>
          </section>
          <section className="inspector-section">
            <h3>Сокеты</h3>
            <div className="socket-list">
              {editor.currentCharacter.sockets?.filter((item) => item.partId === part.id).map((item) => (
                <button key={item.id} className={item.id === editor.selectedSocketId ? "active" : ""} onClick={() => { editor.setSelectedSocketId(item.id); editor.setTool("socket"); }}>{item.name}<small>{item.type}</small></button>
              ))}
            </div>
            <button type="button" className="wide-button" onClick={editor.addSocket}>＋ Добавить сокет</button>
            {socket && socket.partId === part.id && (
              <div className="socket-editor">
                <label className="select-field">
                  <span>Тип</span>
                  <select value={socket.type} onChange={(event) => updateSocket("Socket type", (target) => { target.type = event.target.value as SocketType; })}>
                    {(["HeadTop", "Mouth", "HandLeft", "HandRight", "FootLeft", "FootRight", "Custom"] as SocketType[]).map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <div className="field-grid">
                  <NumberField label="Локал. X" value={socket.position.x} onChange={(value) => updateSocket("Socket X", (target) => { target.position.x = value; })} />
                  <NumberField label="Локал. Y" value={socket.position.y} onChange={(value) => updateSocket("Socket Y", (target) => { target.position.y = value; })} />
                </div>
              </div>
            )}
          </section>
          <section className="inspector-section">
            <h3>Слой</h3>
            <label className="select-field">
              <span>Родитель</span>
              <select value={part.parentId ?? ""} onChange={(event) => editor.changeParent(part.id, event.target.value || null)}>
                <option value="">Корень персонажа</option>
                {editor.currentCharacter.parts.filter((item) => item.id !== part.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <div className="field-grid">
              <NumberField label="Слой Z" value={part.zIndex} onChange={(value) => updatePart("Z-order", (target) => { target.zIndex = Math.round(value); })} />
              <NumberField label="Прозрачность" value={part.opacity} step={.05} onChange={(value) => updatePart("Opacity", (target) => { target.opacity = Math.max(0, Math.min(1, value)); })} />
            </div>
          </section>
        </>
      )}
      <section className="inspector-section">
        <h3>Lip Sync / Mouth Set</h3>
        <label className="select-field">
          <span>Mode</span>
          <select
            value={editor.currentCharacter.mouthSet?.mode ?? "basic"}
            onChange={(event) => {
              const mode = event.target.value as import("../domain/visemeSystem").MouthLipSyncMode;
              const mouth = editor.currentCharacter.parts.find((item) => item.semanticRole === "Mouth");
              editor.updateCharacterMouthSet(editor.currentCharacter.id, {
                ...(editor.currentCharacter.mouthSet ?? { mode: "basic", advancedMapping: {}, basicMapping: {}, primaryMouthPartId: mouth?.id ?? null }),
                mode,
                primaryMouthPartId: editor.currentCharacter.mouthSet?.primaryMouthPartId ?? mouth?.id ?? null,
              });
            }}
          >
            <option value="disabled">Disabled</option>
            <option value="simple">Simple (REST/OPEN amp.)</option>
            <option value="basic">Basic</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <p className="hint">Basic: REST/OPEN/WIDE/ROUND/CLOSED. Advanced: полный Viseme set. Без спрайта — scale fallback, рот никогда не пропадает.</p>
        {(editor.currentCharacter.mouthSet?.mode === "basic" || editor.currentCharacter.mouthSet?.mode === "advanced") && (
          <label className="select-field">
            <span>Primary Mouth part</span>
            <select
              value={editor.currentCharacter.mouthSet?.primaryMouthPartId ?? ""}
              onChange={(event) => {
                const mouthSet = editor.currentCharacter.mouthSet ?? { mode: "basic" as const, advancedMapping: {}, basicMapping: {}, primaryMouthPartId: null };
                editor.updateCharacterMouthSet(editor.currentCharacter.id, {
                  ...mouthSet,
                  primaryMouthPartId: event.target.value || null,
                });
              }}
            >
              <option value="">—</option>
              {editor.currentCharacter.parts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
      </section>
    </div>
  );
}
