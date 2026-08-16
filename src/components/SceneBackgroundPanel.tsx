import { useState } from "react";
import {
  SCENE_BACKGROUND_PRESETS,
  SCENE_BACKGROUND_SWATCHES,
  SWATCH_CATEGORY_LABELS,
  clampHorizon,
  clampSoftness,
  normalizeHexColor,
  resolveSceneBackgroundFill,
  type SceneBackgroundSwatch,
} from "../domain/sceneBackgrounds";
import { useEditor } from "../editor/EditorContext";

function toColorInput(value: string): string {
  return normalizeHexColor(value, "#87b86a");
}

type PaintTarget = "solid" | "top" | "bottom";

export function SceneBackgroundPanel() {
  const editor = useEditor();
  const scene = editor.currentScene;
  const fill = resolveSceneBackgroundFill(scene.background, scene.backgroundFill);
  const isGradient = fill.mode === "gradient";
  const solidColor = toColorInput(scene.background);
  const topColor = isGradient ? toColorInput(fill.top) : solidColor;
  const bottomColor = isGradient ? toColorInput(fill.bottom) : "#3f9b4a";
  const horizon = isGradient ? clampHorizon(fill.horizon) : 0.55;
  const softness = isGradient ? clampSoftness(fill.softness, 0.08) : 0.08;
  const [paintTarget, setPaintTarget] = useState<PaintTarget>("top");
  const [showPresets, setShowPresets] = useState(false);
  const bgAsset = scene.backgroundAssetId
    ? editor.project.assets.find((item) => item.id === scene.backgroundAssetId)
    : null;

  const categories = Array.from(
    new Set(SCENE_BACKGROUND_SWATCHES.map((item) => item.category)),
  ) as SceneBackgroundSwatch["category"][];

  const applyGradient = (patch: {
    top?: string;
    bottom?: string;
    horizon?: number;
    softness?: number;
  }) => {
    editor.setSceneBackgroundFill({
      mode: "gradient",
      top: patch.top ?? topColor,
      bottom: patch.bottom ?? bottomColor,
      horizon: patch.horizon ?? horizon,
      softness: patch.softness ?? softness,
    });
  };

  const applySwatch = (color: string) => {
    if (!isGradient) {
      editor.setSceneBackgroundColor(color);
      return;
    }
    if (paintTarget === "bottom") applyGradient({ bottom: color });
    else applyGradient({ top: color });
  };

  const activeSwatch = !isGradient
    ? solidColor
    : paintTarget === "bottom"
      ? bottomColor
      : topColor;

  const previewStyle = isGradient
    ? {
        background: `linear-gradient(180deg, ${topColor} 0%, ${topColor} ${(horizon - softness) * 100}%, ${bottomColor} ${(horizon + softness) * 100}%, ${bottomColor} 100%)`,
      }
    : { background: solidColor };

  return (
    <section className="inspector-section scene-bg-panel" id="scene-background-panel">
      <h3>Фон сцены</h3>
      <p className="hint">
        Настраивай вручную: небо сверху, земля/трава снизу. Ползунок «Горизонт» — где начинается земля.
      </p>

      <div className="scene-bg-mode">
        <button
          type="button"
          className={!isGradient ? "active" : ""}
          onClick={() => editor.setSceneBackgroundFill({ mode: "solid" }, solidColor)}
        >
          Один цвет
        </button>
        <button
          type="button"
          className={isGradient ? "active" : ""}
          onClick={() =>
            editor.setSceneBackgroundFill({
              mode: "gradient",
              top: topColor,
              bottom: bottomColor,
              horizon,
              softness,
            })
          }
        >
          Небо + земля
        </button>
      </div>

      <div className="scene-bg-live-preview" style={previewStyle} title="Превью фона" />

      {!isGradient ? (
        <div className="scene-bg-manual">
          <div className="scene-bg-color-row">
            <label className="scene-bg-color-field">
              <span>Цвет</span>
              <input
                type="color"
                value={solidColor}
                onChange={(event) => editor.setSceneBackgroundColor(event.target.value)}
              />
            </label>
            <label className="scene-bg-hex-field">
              <span>HEX</span>
              <input
                type="text"
                value={solidColor}
                spellCheck={false}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
                    editor.setSceneBackgroundColor(next);
                  }
                }}
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="scene-bg-manual">
          <div className="scene-bg-layers">
            <button
              type="button"
              className={paintTarget === "top" ? "active" : ""}
              onClick={() => setPaintTarget("top")}
            >
              Красить небо
            </button>
            <button
              type="button"
              className={paintTarget === "bottom" ? "active" : ""}
              onClick={() => setPaintTarget("bottom")}
            >
              Красить землю
            </button>
          </div>

          <div className="scene-bg-color-row scene-bg-gradient-row">
            <label className="scene-bg-color-field">
              <span>Небо (верх)</span>
              <input
                type="color"
                value={topColor}
                onChange={(event) => applyGradient({ top: event.target.value })}
              />
            </label>
            <label className="scene-bg-hex-field">
              <span>HEX неба</span>
              <input
                type="text"
                value={topColor}
                spellCheck={false}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
                    applyGradient({ top: next });
                  }
                }}
              />
            </label>
          </div>

          <div className="scene-bg-color-row scene-bg-gradient-row">
            <label className="scene-bg-color-field">
              <span>Земля (низ)</span>
              <input
                type="color"
                value={bottomColor}
                onChange={(event) => applyGradient({ bottom: event.target.value })}
              />
            </label>
            <label className="scene-bg-hex-field">
              <span>HEX земли</span>
              <input
                type="text"
                value={bottomColor}
                spellCheck={false}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(next)) {
                    applyGradient({ bottom: next });
                  }
                }}
              />
            </label>
          </div>

          <label className="scene-bg-slider">
            <span>Горизонт · {Math.round(horizon * 100)}% сверху небо</span>
            <input
              type="range"
              min={5}
              max={95}
              step={1}
              value={Math.round(horizon * 100)}
              onChange={(event) => applyGradient({ horizon: Number(event.target.value) / 100 })}
            />
          </label>

          <label className="scene-bg-slider">
            <span>Мягкость края · {Math.round(softness * 100)}%</span>
            <input
              type="range"
              min={0}
              max={35}
              step={1}
              value={Math.round(softness * 100)}
              onChange={(event) => applyGradient({ softness: Number(event.target.value) / 100 })}
            />
          </label>
          <p className="hint">Мягкость 0% = резкая линия небо|трава.</p>
        </div>
      )}

      <div className="scene-bg-swatches">
        <strong className="scene-bg-label">
          Палитра{isGradient ? ` → ${paintTarget === "bottom" ? "земля" : "небо"}` : ""}
        </strong>
        {categories.map((category) => (
          <div key={category} className="scene-bg-swatch-group">
            <span className="scene-bg-cat">{SWATCH_CATEGORY_LABELS[category]}</span>
            <div className="scene-bg-swatch-grid">
              {SCENE_BACKGROUND_SWATCHES.filter((item) => item.category === category).map((swatch) => (
                <button
                  key={swatch.id}
                  type="button"
                  className={`scene-bg-swatch${activeSwatch === swatch.color ? " active" : ""}`}
                  style={{ background: swatch.color }}
                  title={swatch.label}
                  aria-label={swatch.label}
                  onClick={() => applySwatch(swatch.color)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="scene-bg-presets">
        <button type="button" className="scene-bg-presets-toggle" onClick={() => setShowPresets((v) => !v)}>
          {showPresets ? "▾ Скрыть быстрые примеры" : "▸ Быстрые примеры (необязательно)"}
        </button>
        {showPresets && (
          <div className="scene-bg-preset-grid">
            {SCENE_BACKGROUND_PRESETS.map((preset) => {
              const style =
                preset.fill.mode === "gradient"
                  ? {
                      background: `linear-gradient(180deg, ${preset.fill.top}, ${preset.fill.bottom})`,
                    }
                  : { background: preset.background };
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="scene-bg-preset"
                  title={preset.label}
                  style={style}
                  onClick={() => editor.applySceneBackgroundPreset(preset)}
                >
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="scene-bg-png">
        {bgAsset ? (
          <>
            <p className="hint">PNG поверх цвета: <strong>{bgAsset.name}</strong></p>
            <button type="button" className="wide-button danger" onClick={editor.clearSceneBackground}>
              Убрать PNG-фон
            </button>
          </>
        ) : (
          <p className="hint">Нет PNG-фона. Слева: Импорт PNG → кнопка «Фон».</p>
        )}
        <button type="button" className="wide-button" onClick={editor.syncExportBackgroundFromScene}>
          Цвет экспорта ← сцена
        </button>
      </div>
    </section>
  );
}
