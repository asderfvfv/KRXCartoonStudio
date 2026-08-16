import { useEffect, useState } from "react";
import type { StudioImageFile } from "../domain/sceneConstructor";
import { SCENE_BACKGROUND_PRESETS } from "../domain/sceneBackgrounds";
import { AUDIO_BEAST_FIGHT_CAST } from "../domain/audioBeastCharacters";
import { useEditor } from "../editor/EditorContext";

const BUILTIN_CAST_LABELS: Record<string, string> = {
  EmberPuff: "Огонёк (EmberPuff)",
  FrostFang: "Морозко (FrostFang)",
  GearBot: "Винтик (GearBot)",
};

type Panel = "none" | "bg" | "actor" | "prop" | "where";

export function SceneConstructorBar() {
  const editor = useEditor();
  const [panel, setPanel] = useState<Panel>("none");
  const [backgrounds, setBackgrounds] = useState<StudioImageFile[]>([]);
  const [props, setProps] = useState<StudioImageFile[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scene = editor.currentScene;
  const hasPictureBg = Boolean(scene.backgroundAssetId);
  const actorCount = scene.actors.length;
  const propCount = scene.props.length;
  const characters = editor.project.characters;
  const usableCharacters = characters.filter((item) => (item.parts?.length ?? 0) > 0);
  const emptyHero = characters.find((item) => (item.parts?.length ?? 0) === 0);

  useEffect(() => {
    if (panel !== "bg" && panel !== "prop") return;
    let canceled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const files = await editor.listStudioImages(panel === "bg" ? "backgrounds" : "props");
        if (canceled) return;
        if (panel === "bg") setBackgrounds(files);
        else setProps(files);
        const next: Record<string, string> = {};
        for (const file of files.slice(0, 24)) {
          try {
            next[file.path] = await editor.desktop.readAsset(file.path);
          } catch {
            /* skip broken thumb */
          }
        }
        if (!canceled) setThumbs((prev) => ({ ...prev, ...next }));
      } catch (reason) {
        if (!canceled) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!canceled) setLoading(false);
      }
    })();
    return () => { canceled = true; };
  }, [editor, panel]);

  const toggle = (next: Panel) => setPanel((current) => (current === next ? "none" : next));

  return (
    <section className="scene-constructor" aria-label="Конструктор сцены">
      <div className="scene-constructor-head">
        <div>
          <strong>Конструктор сцены</strong>
          <small>Фон / актёры / предметы — на холст. Timeline внизу — время и звук.</small>
        </div>
        <span className="scene-constructor-meta">
          {hasPictureBg ? "фон PNG" : "цвет/градиент"}
          {" · "}
          {actorCount} акт.
          {" · "}
          {propCount} предм.
        </span>
      </div>

      <div className="scene-constructor-actions">
        <button type="button" className={panel === "bg" ? "active" : ""} onClick={() => toggle("bg")}>1. Фон</button>
        <button type="button" className={panel === "actor" ? "active" : ""} onClick={() => toggle("actor")}>2. Актёр</button>
        <button type="button" className={panel === "prop" ? "active" : ""} onClick={() => toggle("prop")}>3. Предмет</button>
        <button
          type="button"
          onClick={() => {
            editor.requestRightTab("audio");
            void editor.importAudio();
          }}
        >
          4. Звук
        </button>
        <button type="button" className={panel === "where" ? "active" : ""} onClick={() => toggle("where")}>
          Куда класть файлы
        </button>
        <button
          type="button"
          title="Цвет и градиент фона справа"
          onClick={() => {
            editor.requestRightTab("inspector");
            setPanel("none");
            window.setTimeout(() => {
              document.getElementById("scene-background-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }, 50);
          }}
        >
          Цвет / градиент
        </button>
        <button type="button" onClick={() => void editor.importPngAs("background")}>PNG как фон…</button>
        <button type="button" onClick={() => void editor.importPngAs("prop")}>PNG как предмет…</button>
      </div>

      {panel === "where" && (
        <div className="scene-constructor-panel scene-constructor-where">
          <p className="hint">Папки рядом с программой (в release — внутри resources, в dev — корень репо). Форматы ниже.</p>
          <ul className="scene-constructor-where-list">
            <li>
              <strong>Фоны</strong> — <code>Assets/Backgrounds/</code>
              <span>PNG, JPG, JPEG, WEBP · одна картинка на кадр</span>
              <button type="button" onClick={() => void editor.openStudioFolder("backgrounds")}>Открыть папку</button>
            </li>
            <li>
              <strong>Предметы</strong> — <code>Assets/Props/</code>
              <span>PNG / JPG / WEBP · меч.png, яблоко.png… (не части тела)</span>
              <button type="button" onClick={() => void editor.openStudioFolder("props")}>Открыть папку</button>
            </li>
            <li>
              <strong>Персонажи (риг)</strong> — <code>Characters/Имя/</code>
              <span>
                Папка с PNG-частями: <code>тело</code>/<code>body</code>, <code>голова</code>/<code>башка</code>/<code>head</code>,
                глаз, рот, рука, нога (можно левая/правая). Не MP4.
              </span>
              <button type="button" onClick={() => void editor.openStudioFolder("characters")}>Открыть Characters</button>
            </li>
            <li>
              <strong>Музыка / звуки</strong> — <code>Assets/Audio/</code> или кнопка «4. Звук»
              <span>WAV, MP3, OGG, M4A, FLAC</span>
              <button type="button" onClick={() => void editor.openStudioFolder("audio")}>Открыть Audio</button>
            </li>
          </ul>
          <p className="hint">
            После того как кинул файлы в папку — снова открой «1. Фон» / «3. Предмет» (список обновится).
            Актёра: «2. Актёр» → готовые герои или «Папка PNG…» / «Загрузить…».
          </p>
        </div>
      )}

      {panel === "bg" && (
        <div className="scene-constructor-panel">
          <p className="hint">
            Файлы: <code>Assets/Backgrounds/</code> (PNG/JPG/WEBP).{" "}
            <button type="button" className="linkish" onClick={() => void editor.openStudioFolder("backgrounds")}>Открыть папку</button>
          </p>
          {loading && <p className="hint">Загрузка…</p>}
          {error && <p className="export-error">{error}</p>}
          <div className="scene-constructor-grid">
            {backgrounds.map((file) => (
              <button
                key={file.path}
                type="button"
                className="scene-constructor-card"
                title={file.path}
                onClick={() => void editor.addStudioImageAsBackground(file)}
              >
                <span className="scene-constructor-thumb">
                  {thumbs[file.path] ? <img src={thumbs[file.path]} alt="" draggable={false} /> : <span>—</span>}
                </span>
                <strong>{file.name}</strong>
              </button>
            ))}
            {!loading && !backgrounds.length && !error && (
              <p className="hint">Папка пуста — кинь PNG в Backgrounds или «PNG как фон…».</p>
            )}
          </div>
          <div className="scene-constructor-presets">
            {SCENE_BACKGROUND_PRESETS.slice(0, 6).map((preset) => {
              const style =
                preset.fill.mode === "gradient"
                  ? { background: `linear-gradient(180deg, ${preset.fill.top}, ${preset.fill.bottom})` }
                  : { background: preset.background };
              return (
                <button
                  key={preset.id}
                  type="button"
                  className="scene-constructor-swatch"
                  style={style}
                  title={preset.label}
                  onClick={() => {
                    editor.applySceneBackgroundPreset(preset);
                    editor.setStatus(`Фон: ${preset.label}`);
                  }}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          {hasPictureBg ? (
            <button type="button" className="danger" onClick={editor.clearSceneBackground}>Убрать PNG-фон</button>
          ) : null}
        </div>
      )}

      {panel === "actor" && (
        <div className="scene-constructor-panel">
          <p className="hint">
            <strong>Готовые в программе</strong> — кнопки ниже (Characters/AudioBeast).
            Свой риг: папка PNG или JSON.{" "}
            <button type="button" className="linkish" onClick={() => void editor.openStudioFolder("characters")}>Открыть Characters</button>
          </p>
          <div className="scene-constructor-actor-list">
            {AUDIO_BEAST_FIGHT_CAST.map((spec) => (
              <button
                key={spec.id}
                type="button"
                className="accent"
                onClick={() => void editor.addBundledCharacterToScene(spec.folder)}
              >
                ＋ {BUILTIN_CAST_LABELS[spec.name] ?? spec.name}
                <small>из программы</small>
              </button>
            ))}
            {usableCharacters
              .filter((character) => !AUDIO_BEAST_FIGHT_CAST.some((spec) => spec.id === character.id || character.name === spec.name))
              .filter((character) => character.name !== "DemoBot")
              .map((character) => (
                <button
                  key={character.id}
                  type="button"
                  onClick={() => {
                    editor.addActor(character.id);
                    editor.setTool("move");
                    editor.setStatus(`Актёр «${character.name}» на сцене`);
                  }}
                >
                  ＋ {character.name}
                  <small>{character.parts.length} частей · в проекте</small>
                </button>
              ))}
          </div>
          <div className="scene-constructor-actor-row">
            <button type="button" onClick={() => void editor.loadCharacter()}>Загрузить персонажа…</button>
            <button type="button" onClick={() => void editor.loadCharacterPngFolder()}>Папка PNG рига…</button>
            <button type="button" onClick={() => editor.openToolPanel("character")}>Создатель</button>
          </div>
          {usableCharacters.length === 0 && (
            <p className="hint">
              Выбери героя сверху
              {emptyHero ? ` (сейчас «${emptyHero.name}» без частей — это заготовка)` : ""}.
            </p>
          )}
        </div>
      )}

      {panel === "prop" && (
        <div className="scene-constructor-panel">
          <p className="hint">
            Файлы: <code>Assets/Props/</code> (PNG/JPG/WEBP).{" "}
            <button type="button" className="linkish" onClick={() => void editor.openStudioFolder("props")}>Открыть папку</button>
          </p>
          {loading && <p className="hint">Загрузка…</p>}
          {error && <p className="export-error">{error}</p>}
          <div className="scene-constructor-grid">
            {props.map((file) => (
              <button
                key={file.path}
                type="button"
                className="scene-constructor-card"
                title={file.path}
                onClick={() => void editor.addStudioImageAsProp(file)}
              >
                <span className="scene-constructor-thumb">
                  {thumbs[file.path] ? <img src={thumbs[file.path]} alt="" draggable={false} /> : <span>—</span>}
                </span>
                <strong>{file.name}</strong>
              </button>
            ))}
            {!loading && !props.length && !error && (
              <p className="hint">Папка Props пуста — кинь туда PNG или «PNG как предмет…».</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
