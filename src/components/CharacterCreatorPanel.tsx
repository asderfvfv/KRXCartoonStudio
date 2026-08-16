import { useMemo, useState } from "react";
import {
  creatorProgress,
  creatorSlots,
  requiredSlotsComplete,
  slotFilled,
  type CreatorSlotId,
} from "../domain/characterCreator";
import { useEditor } from "../editor/EditorContext";
import { useSpritesheetSliceFlow } from "./SpritesheetSliceModal";

export function CharacterCreatorPanel() {
  const editor = useEditor();
  const [activeSlot, setActiveSlot] = useState<CreatorSlotId>("body");
  const actor = editor.currentScene.actors.find((item) => item.id === editor.selectedActorId);
  const progress = useMemo(() => creatorProgress(editor.currentCharacter), [editor.currentCharacter]);
  const slot = creatorSlots.find((item) => item.id === activeSlot)!;
  const filled = slotFilled(editor.currentCharacter, slot);
  const sheetFlow = useSpritesheetSliceFlow();

  if (!editor.characterCreatorOpen) return null;

  return (
    <div className="export-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) editor.setCharacterCreatorOpen(false); }}>
      <section className="export-modal character-creator-modal" role="dialog" aria-label="Character Creator">
        <header className="export-modal-head">
          <div>
            <strong>Character Creator</strong>
            <small>
              {editor.cartoonWizardOpen
                ? "Закрыть вернёт вас в «Новый мультик». Только локально."
                : "Новый персонаж → части → цвета → сохранить. Только локально."}
            </small>
          </div>
          <button
            type="button"
            onClick={() => editor.setCharacterCreatorOpen(false)}
            title={editor.cartoonWizardOpen ? "Вернуться к мастеру «Новый мультик»" : "Закрыть"}
          >
            {editor.cartoonWizardOpen ? "← К мультику" : "Закрыть"}
          </button>
        </header>

        <div className="export-modal-body character-creator-body">
          <section className="inspector-section">
            <h3>Персонаж</h3>
            <label className="export-field">
              <span>Имя</span>
              <input
                value={editor.currentCharacter.name}
                onChange={(event) => editor.renameCharacter(event.target.value)}
              />
            </label>
            <label className="export-field">
              <span>Редактировать</span>
              <select
                value={editor.currentCharacter.id}
                onChange={(event) => editor.selectEditableCharacter(event.target.value)}
              >
                {editor.project.characters.map((character) => (
                  <option key={character.id} value={character.id}>{character.name}</option>
                ))}
              </select>
            </label>
            <p className="hint">Слоты: {progress.requiredFilled}/{progress.required} обязательных · {progress.filled}/{progress.total} всего</p>
            <div className="button-row">
              <button type="button" onClick={() => editor.createCharacterFromTemplate("empty")}>Пустой</button>
              <button type="button" onClick={() => editor.createCharacterFromTemplate("procedural")}>Procedural</button>
              <button type="button" onClick={() => editor.createCharacterFromTemplate("library")}>Из DemoBot</button>
            </div>
          </section>

          <section className="inspector-section">
            <h3>Цвета частей</h3>
            <div className="creator-color-grid">
              {([
                ["body", "Тело"],
                ["accent", "Акцент"],
                ["eyes", "Глаза"],
                ["mouth", "Рот"],
                ["clothes", "Одежда"],
              ] as const).map(([key, label]) => (
                <label key={key} className="export-field">
                  <span>{label}</span>
                  <input
                    type="color"
                    value={editor.creatorPalette[key]}
                    onChange={(event) => editor.setCreatorPalette({ ...editor.creatorPalette, [key]: event.target.value })}
                  />
                </label>
              ))}
            </div>
            <label className="export-field">
              <span>Tint актёра</span>
              <input
                type="color"
                value={actor?.tint ?? "#ffffff"}
                onChange={(event) => editor.setSelectedActorTint(event.target.value)}
              />
            </label>
          </section>

          <section className="inspector-section">
            <h3>Слоты</h3>
            <div className="creator-slot-grid">
              {creatorSlots.map((item) => {
                const ok = slotFilled(editor.currentCharacter, item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${item.id === activeSlot ? "active" : ""} ${ok ? "filled" : ""}`}
                    onClick={() => setActiveSlot(item.id)}
                  >
                    <strong>{item.label}</strong>
                    <small>{ok ? "готово" : item.optional ? "опционально" : "нужно"}</small>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="inspector-section">
            <h3>Слот · {slot.label}</h3>
            <p className="hint">
              {filled
                ? "Часть назначена. Можно заменить PNG / library / procedural / sheet."
                : "Назначьте часть: procedural, DemoBot, свой PNG или «Из sheet…» (один файл со всеми кусками)."}
            </p>
            <div className="button-row">
              <button type="button" onClick={() => editor.assignProceduralPart(activeSlot)}>Procedural</button>
              <button type="button" onClick={() => editor.assignLibraryPart(activeSlot)}>Library</button>
              <button type="button" onClick={() => void editor.importPngToSlot(activeSlot)}>Import PNG</button>
              <button type="button" disabled={sheetFlow.busy} onClick={() => void sheetFlow.openPicker()}>Из sheet…</button>
              <button type="button" className="danger" disabled={!filled} onClick={() => editor.clearCreatorSlot(activeSlot)}>Clear</button>
            </div>
          </section>

          <section className="inspector-section">
            <h3>Иерархия и сохранение</h3>
            <div className="button-row">
              <button type="button" onClick={editor.autoHierarchy}>Auto Parent</button>
              <button type="button" onClick={editor.setCurrentAsBindPose}>Set Bind Pose</button>
              <button type="button" onClick={() => void editor.saveCharacter()}>Save Character</button>
              <button type="button" onClick={() => void editor.loadCharacterPngFolder()}>Папка PNG…</button>
              <button type="button" onClick={() => void editor.loadCharacter()}>JSON / PNG…</button>
            </div>
            <p className="hint">
              {requiredSlotsComplete(editor.currentCharacter)
                ? "Обязательные слоты заполнены — персонаж готов к сцене и анимациям."
                : "Заполните обязательные слоты (тело, голова, глаза, руки, ноги), затем Save Character."}
            </p>
          </section>
        </div>
      </section>
      {sheetFlow.modal}
    </div>
  );
}
