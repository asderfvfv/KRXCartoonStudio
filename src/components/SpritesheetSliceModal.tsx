import { useMemo, useState } from "react";
import { creatorSlots, type CreatorSlotId } from "../domain/characterCreator";
import type { PreparedSheetCrop, PreparedSheetSlice } from "../systems/spritesheetCanvas";
import { prepareSpritesheetSlice } from "../systems/spritesheetCanvas";
import { useEditor } from "../editor/EditorContext";

interface SpritesheetSliceModalProps {
  sheet: PreparedSheetSlice;
  bgThreshold: number;
  busy: boolean;
  onBgThresholdChange(value: number): void;
  onReslice(): void;
  onCancel(): void;
  onApply(assignments: Array<{ crop: PreparedSheetCrop; slotId: CreatorSlotId }>): void;
}

function SpritesheetAssignView({
  sheet,
  bgThreshold,
  busy,
  onBgThresholdChange,
  onReslice,
  onCancel,
  onApply,
}: SpritesheetSliceModalProps) {
  const [assignment, setAssignment] = useState<Record<string, CreatorSlotId | "">>(() => {
    const initial: Record<string, CreatorSlotId | ""> = {};
    for (const crop of sheet.crops) {
      initial[crop.id] = crop.suggestedSlot ?? "";
    }
    return initial;
  });

  const usedSlots = useMemo(() => {
    const set = new Set<CreatorSlotId>();
    for (const value of Object.values(assignment)) {
      if (value) set.add(value);
    }
    return set;
  }, [assignment]);

  const selectedCount = Object.values(assignment).filter(Boolean).length;

  const setCropSlot = (cropId: string, value: CreatorSlotId | "") => {
    setAssignment((prev) => {
      const next: Record<string, CreatorSlotId | ""> = { ...prev };
      if (value) {
        for (const id of Object.keys(next)) {
          if (id !== cropId && next[id] === value) next[id] = "";
        }
      }
      next[cropId] = value;
      return next;
    });
  };

  const resetToSuggestions = () => {
    const initial: Record<string, CreatorSlotId | ""> = {};
    for (const crop of sheet.crops) {
      initial[crop.id] = crop.suggestedSlot ?? "";
    }
    setAssignment(initial);
  };

  const clearAll = () => {
    const initial: Record<string, CreatorSlotId | ""> = {};
    for (const crop of sheet.crops) initial[crop.id] = "";
    setAssignment(initial);
  };

  return (
    <div className="sheet-slice-modal" role="dialog" aria-label="Нарезка spritesheet">
      <header className="export-modal-head">
        <div>
          <strong>Из sheet → слоты</strong>
          <small>Авто — подсказка. Можно менять: выбор слота заберёт его у другого куска.</small>
        </div>
        <button type="button" disabled={busy} onClick={onCancel}>Отмена</button>
      </header>

      <div className="sheet-slice-body">
        <div className="sheet-slice-source">
          <img src={sheet.sourcePreviewUrl} alt={sheet.sourceName} />
          <p className="hint">{sheet.sourceName} · найдено кусков: {sheet.crops.length}</p>
        </div>

        <label className="export-field">
          <span>Чувствительность к фону: {bgThreshold}</span>
          <input
            type="range"
            min={8}
            max={80}
            step={1}
            disabled={busy}
            value={bgThreshold}
            onChange={(event) => onBgThresholdChange(Number(event.target.value))}
          />
        </label>
        <div className="button-row">
          <button type="button" disabled={busy} onClick={onReslice}>Перенарезать</button>
          <button type="button" disabled={busy} onClick={resetToSuggestions}>Снова авто</button>
          <button type="button" disabled={busy} onClick={clearAll}>Очистить слоты</button>
        </div>

        <div className="sheet-slice-grid">
          {sheet.crops.map((crop) => (
            <div key={crop.id} className="sheet-slice-card">
              <img src={crop.dataUrl} alt={crop.id} />
              <small>{crop.width}×{crop.height}</small>
              <select
                disabled={busy}
                value={assignment[crop.id] ?? ""}
                onChange={(event) => {
                  setCropSlot(crop.id, event.target.value as CreatorSlotId | "");
                }}
              >
                <option value="">— не использовать —</option>
                {creatorSlots.map((slot) => {
                  const takenByOther = usedSlots.has(slot.id) && assignment[crop.id] !== slot.id;
                  return (
                    <option key={slot.id} value={slot.id}>
                      {slot.label}{takenByOther ? " ← забрать" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          ))}
        </div>
      </div>

      <footer className="sheet-slice-foot">
        <p className="hint">
          Назначено: {selectedCount}. Хвост / искры можно оставить «не использовать».
          Слот «занят» больше не блокирует — выбор переносит его на этот кусок.
        </p>
        <div className="button-row">
          <button type="button" disabled={busy} onClick={onCancel}>Отмена</button>
          <button
            type="button"
            className="accent"
            disabled={busy || selectedCount === 0}
            onClick={() => {
              const next: Array<{ crop: PreparedSheetCrop; slotId: CreatorSlotId }> = [];
              for (const crop of sheet.crops) {
                const slotId = assignment[crop.id];
                if (slotId) next.push({ crop, slotId });
              }
              onApply(next);
            }}
          >
            Применить к персонажу
          </button>
        </div>
      </footer>
    </div>
  );
}

/** Orchestrates pick → slice → assign inside Character Creator. */
export function useSpritesheetSliceFlow() {
  const editor = useEditor();
  const [sheet, setSheet] = useState<PreparedSheetSlice | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState("sheet");
  const [bgThreshold, setBgThreshold] = useState(28);
  const [busy, setBusy] = useState(false);

  const reslice = async (url: string, name: string, threshold: number) => {
    setBusy(true);
    try {
      const prepared = await prepareSpritesheetSlice(url, name, { bgThreshold: threshold });
      setSheet(prepared);
    } finally {
      setBusy(false);
    }
  };

  const openPicker = async () => {
    setBusy(true);
    try {
      const picked = await editor.desktop.importPng();
      if (picked.canceled || !picked.data?.length) return;
      const item = picked.data[0]!;
      const url = await editor.desktop.readAsset(item.path, undefined);
      setSourceUrl(url);
      setSourceName(item.name);
      await reslice(url, item.name, bgThreshold);
    } catch (reason) {
      editor.reportError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const onReslice = () => {
    if (!sourceUrl) return;
    void (async () => {
      try {
        await reslice(sourceUrl, sourceName, bgThreshold);
      } catch (reason) {
        editor.reportError(reason instanceof Error ? reason.message : String(reason));
      }
    })();
  };

  const modal = sheet ? (
    <div className="export-modal-backdrop sheet-slice-backdrop" role="presentation">
      <section className="export-modal sheet-slice-dialog">
        <SpritesheetAssignView
          key={sheet.crops.map((crop) => `${crop.id}:${crop.width}x${crop.height}`).join("|")}
          sheet={sheet}
          bgThreshold={bgThreshold}
          busy={busy}
          onBgThresholdChange={setBgThreshold}
          onReslice={onReslice}
          onCancel={() => setSheet(null)}
          onApply={(assignments) => {
            void (async () => {
              setBusy(true);
              try {
                await editor.applySpritesheetCrops(assignments);
                setSheet(null);
              } catch (reason) {
                editor.reportError(reason instanceof Error ? reason.message : String(reason));
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      </section>
    </div>
  ) : null;

  return { openPicker, modal, busy };
}
