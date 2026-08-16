import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCartoonPrompt } from "../domain/promptCartoon";
import { generateStoryVariants } from "../domain/mindcoreStoryGen";
import {
  assignProsodyToSpeakers,
  assignVoicesToSpeakers,
  mergeVoiceCatalog,
  type SpeechVoiceInfo,
} from "../domain/speechSettings";
import { isExportBusy } from "../domain/renderSettings";
import { useEditor } from "../editor/EditorContext";
import { PromptAssistEditor } from "./PromptAssistEditor";
import { MindcoreStoryGenBar } from "./MindcoreStoryGenBar";
import { loadStudioPrefs } from "../domain/studioPrefs";

const PROMPT_EXAMPLE = `# В гости к Винтику
Characters: Огонёк, Морозко, Винтик
Genre: сказка
Atmosphere: солнечная поляна, дружелюбно

## Встреча
Огонёк: Эй, Морозко! Пойдём к Винтику в гости!
Морозко: Давай! Он давно сидит дома.

## Дорога
Огонёк: Почти пришли.
Морозко: Сейчас позовём его.

## Домик
Огонёк: Винтик, выходи!
Морозко: Мы на пороге!
Винтик: Скрип-привет! Я выхожу!
`;

const STEPS = [
  { id: 1, title: "Герои" },
  { id: 2, title: "Картинки" },
  { id: 3, title: "Текст" },
  { id: 4, title: "Голос" },
  { id: 5, title: "Собрать" },
] as const;

function nameMatches(haystack: string, needle: string): boolean {
  const a = haystack.trim().toLowerCase();
  const b = needle.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export function NewCartoonWizard() {
  const editor = useEditor();
  const [step, setStep] = useState(1);
  const [prompt, setPrompt] = useState(() => loadStudioPrefs().lastPrompt.trim() || PROMPT_EXAMPLE);
  const musicFolder = editor.studioPrefs.musicFolder;
  const setMusicFolder = (path: string) => editor.setStudioPrefs({ musicFolder: path });
  const [generateTts, setGenerateTts] = useState(true);
  const [voices, setVoices] = useState<SpeechVoiceInfo[]>([]);
  const [done, setDone] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const busy = isExportBusy(editor.exportState.phase) || editor.scriptGenerating;
  const plan = useMemo(() => parseCartoonPrompt(prompt), [prompt]);

  const refreshVoices = useCallback(async () => {
    const settings = editor.speechSettings;
    const result = await window.kcs?.listSpeechVoices({
      extraFolders: settings.extraPiperFolders,
      extraModels: settings.customPiperModels.map((item) => ({
        name: item.name,
        modelPath: item.modelPath,
        culture: item.culture,
        gender: item.gender,
      })),
    });
    if (result?.ok) setVoices(mergeVoiceCatalog(result.voices, settings));
  }, [editor.speechSettings]);

  useEffect(() => {
    if (!editor.cartoonWizardOpen) return;
    setStep(1);
    setDone(false);
    setLocalError(null);
    void refreshVoices();
  }, [editor.cartoonWizardOpen, refreshVoices]);

  useEffect(() => {
    if (!editor.cartoonWizardOpen) return;
    const names = editor.project.characters.map((item) => item.name.trim()).filter(Boolean);
    const saved = editor.studioPrefs.lastPrompt.trim();
    if (saved) {
      setPrompt(saved);
      return;
    }
    if (!names.length) return;
    const variants = generateStoryVariants({
      kind: "cartoon",
      strategy: "mixed",
      count: 1,
      characters: names,
      props: [],
      seed: Date.now() % 1_000_000_007,
    });
    if (variants[0]?.prompt) setPrompt(variants[0].prompt);
  }, [editor.cartoonWizardOpen, editor.studioPrefs.lastPrompt]);

  useEffect(() => {
    if (!editor.cartoonWizardOpen || !voices.length || !plan.characters.length) return;
    const assigned = assignVoicesToSpeakers(
      plan.characters,
      voices,
      editor.speechSettings.preferCulture,
      editor.speechSettings.preferPiper,
    );
    const voiceBySpeaker = { ...assigned };
    for (const [key, value] of Object.entries(editor.speechSettings.voiceBySpeaker)) {
      if (value) voiceBySpeaker[key] = value;
    }
    const same = plan.characters.every((name) => editor.speechSettings.voiceBySpeaker[name] === voiceBySpeaker[name]);
    if (same) return;
    const prosody = assignProsodyToSpeakers(plan.characters, {
      ...editor.speechSettings,
      voiceBySpeaker,
    });
    editor.setSpeechSettings({ voiceBySpeaker, ...prosody });
  }, [editor.cartoonWizardOpen, plan.characters, voices]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (prompt.trim() && prompt !== editor.studioPrefs.lastPrompt) {
        editor.setStudioPrefs({ lastPrompt: prompt });
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [editor.setStudioPrefs, editor.studioPrefs.lastPrompt, prompt]);

  if (!editor.cartoonWizardOpen) return null;

  const characterHits = plan.characters.map((name) => ({
    name,
    hit: editor.project.characters.find((character) => nameMatches(character.name, name)),
  }));
  const propHits = plan.props.map((name) => ({
    name,
    hit: editor.project.assets.find((asset) => nameMatches(asset.name, name)),
  }));
  const missingHeroes = characterHits.filter((item) => !item.hit).map((item) => item.name);
  const missingProps = propHits.filter((item) => !item.hit).map((item) => item.name);
  const canAssemble = plan.scenes.length > 0 && !busy;

  const close = () => {
    if (busy) return;
    editor.setCartoonWizardOpen(false);
  };

  const watchFilm = () => {
    editor.setMontageMode(true);
    editor.setTime(0);
    editor.setPlaying(true);
    editor.setCartoonWizardOpen(false);
  };

  const assemble = async () => {
    setLocalError(null);
    setDone(false);
    try {
      await editor.generateCartoonFromPrompt({
        prompt,
        musicFolder,
        generateTts,
        voiceMode: generateTts ? "natural" : "off",
        exportAfter: false,
      });
      setDone(true);
      setStep(5);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div
      className="export-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) close();
      }}
    >
      <section className="export-modal cartoon-wizard-modal" role="dialog" aria-label="Новый мультик">
        <header className="export-modal-head">
          <div>
            <strong>Новый мультик</strong>
            <small>5 шагов · локально · без облака</small>
          </div>
          <button type="button" disabled={busy} onClick={close}>Закрыть</button>
        </header>

        <nav className="wizard-steps" aria-label="Шаги">
          {STEPS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={step === item.id ? "active" : step > item.id ? "done" : ""}
              disabled={busy}
              onClick={() => setStep(item.id)}
            >
              <span>{item.id}</span>
              {item.title}
            </button>
          ))}
        </nav>

        <div className="export-modal-body wizard-body">
          {step === 1 && (
            <section className="inspector-section">
              <h3>1. Герои для этого мультика</h3>
              <p className="hint">
                <strong>Rig</strong> — персонаж из частей (тело, руки…). Мастер «＋ Мультик» героев не рисует —
                он только берёт уже готовых. Основное место сборки: кнопка <strong>Персонаж</strong> на верхней панели
                (или «Из sheet…» / Import PNG там же). Здесь — быстрые кнопки, если героев ещё нет.
              </p>
              <ul className="wizard-list">
                {editor.project.characters.map((character) => (
                  <li key={character.id}><strong>{character.name}</strong><small>{character.parts.length} частей</small></li>
                ))}
                {!editor.project.characters.length && <li className="export-error">Пока нет персонажей</li>}
              </ul>
              <div className="button-row">
                <button type="button" disabled={busy} onClick={() => void editor.loadCharacterPngFolder()}>Папка с PNG…</button>
                <button type="button" disabled={busy} onClick={() => void editor.loadCharacter()}>JSON или PNG…</button>
                <button type="button" disabled={busy} onClick={() => editor.openToolPanel("character")}>Открыть Создатель…</button>
              </div>
              <p className="hint">
                «Открыть Создатель» — поверх мастера (кнопка «← К мультику» вернёт сюда).
                Один sheet → в Создателе «Из sheet…».
              </p>
            </section>
          )}

          {step === 2 && (
            <section className="inspector-section">
              <h3>2. Картинки и предметы</h3>
              <p className="hint">
                Сюда кладут <strong>отдельные PNG</strong> для сцены: меч, мяч, табличка.
                В промпте пишите <code>Props: имя_файла</code> (без .png).
                Фоны <em>поляна / домик</em> — кидайте PNG/JPG в <code>Assets/Backgrounds</code>, предметы — в <code>Assets/Props</code>. Сборка подберёт сама.
                Части тела (body, head…) — это риг, не Props.
              </p>
              <div className="button-row">
                <button type="button" disabled={busy} onClick={() => void editor.importPng()}>Импорт PNG</button>
              </div>
              <ul className="wizard-list">
                {editor.project.assets.slice(0, 24).map((asset) => (
                  <li key={asset.id}><strong>{asset.name}</strong><small>{asset.width}×{asset.height}</small></li>
                ))}
                {!editor.project.assets.length && <li className="empty-hint">Пока нет картинок — нажмите «Импорт PNG»</li>}
              </ul>
              {editor.project.assets.length > 24 && <p className="hint">Показаны первые 24 из {editor.project.assets.length}.</p>}
            </section>
          )}

          {step === 3 && (
            <section className="inspector-section">
              <h3>3. Текст мультика</h3>
              <MindcoreStoryGenBar
                disabled={busy}
                characters={editor.project.characters}
                assets={editor.project.assets}
                onPick={setPrompt}
                onAssemble={(text, options) => {
                  setPrompt(text);
                  setLocalError(null);
                  void editor.generateCartoonFromPrompt({
                    prompt: text,
                    musicFolder: options.musicFolder.trim() || musicFolder,
                    generateTts: options.generateTts,
                    voiceMode: options.voiceMode,
                    exportAfter: false,
                    skipMusic: options.skipMusic,
                  }).then(() => {
                    setDone(true);
                    setStep(5);
                  }).catch((reason) => {
                    setLocalError(reason instanceof Error ? reason.message : String(reason));
                  });
                }}
              />
              <PromptAssistEditor
                value={prompt}
                disabled={busy}
                rows={14}
                characters={editor.project.characters}
                assets={editor.project.assets}
                onChange={setPrompt}
              />
              <div className="button-row">
                <button type="button" disabled={busy} onClick={() => setPrompt(PROMPT_EXAMPLE)}>Пример</button>
              </div>
              <div className="export-summary">
                <div><span>Сцен</span><strong>{plan.scenes.length}</strong></div>
                <div><span>Героев</span><strong>{plan.characters.length || "—"}</strong></div>
                <div><span>Props</span><strong>{plan.props.length || "—"}</strong></div>
              </div>
              {plan.warnings.map((warning) => <div key={warning} className="export-error">{warning}</div>)}
              {characterHits.length > 0 && (
                <div className="prompt-name-map">
                  <strong>Чеклист героев</strong>
                  <ul>
                    {characterHits.map((item) => (
                      <li key={item.name}>
                        <b>{item.name}</b>
                        {" → "}
                        {item.hit ? item.hit.name : <span className="export-error">нет rig (подгрузится AudioBeast или Load Rig)</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {propHits.length > 0 && (
                <div className="prompt-name-map">
                  <strong>Чеклист предметов</strong>
                  <ul>
                    {propHits.map((item) => (
                      <li key={item.name}>
                        <b>{item.name}</b>
                        {" → "}
                        {item.hit ? item.hit.name : <span className="export-error">нет PNG — вернитесь к шагу 2</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="inspector-section">
              <h3>4. Голос и музыка</h3>
              <label className="export-check">
                <input type="checkbox" checked={generateTts} disabled={busy} onChange={(event) => setGenerateTts(event.target.checked)} />
                Озвучить реплики (локальный TTS)
              </label>
              {plan.characters.length > 0 && (
                <div className="wizard-voice-grid">
                  {plan.characters.map((name) => (
                    <label key={name} className="export-field">
                      <span>{name}</span>
                      <select
                        disabled={busy || !voices.length}
                        value={editor.speechSettings.voiceBySpeaker[name] ?? ""}
                        onChange={(event) => {
                          const next = { ...editor.speechSettings.voiceBySpeaker };
                          if (event.target.value) next[name] = event.target.value;
                          else delete next[name];
                          editor.setSpeechSettings({ voiceBySpeaker: next });
                        }}
                      >
                        <option value="">Авто</option>
                        {voices.map((voice) => (
                          <option key={`${voice.name}-${voice.modelPath ?? ""}`} value={voice.name}>
                            {voice.engine === "piper" ? "[Piper] " : ""}
                            {voice.custom ? "[свой] " : ""}
                            {voice.name} ({voice.culture})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <label className="export-field">
                <span>Папка музыки (запоминается)</span>
                <input disabled={busy} value={musicFolder} onChange={(event) => setMusicFolder(event.target.value)} placeholder="C:\…\музыка" />
              </label>
              <div className="button-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void (async () => {
                    const picked = await window.kcs?.chooseDirectory(musicFolder || undefined);
                    if (picked && !picked.canceled && picked.path) setMusicFolder(picked.path);
                  })()}
                >
                  Выбрать папку…
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void (async () => {
                    const picked = await window.kcs?.chooseAudioFolderFromFile(musicFolder || undefined);
                    if (picked && !picked.canceled && picked.path) setMusicFolder(picked.path);
                  })()}
                >
                  Через MP3…
                </button>
                <button type="button" disabled={busy} onClick={() => void refreshVoices()}>Обновить голоса</button>
              </div>
              <p className="hint">
                «Через MP3…» выбирает файл, программа берёт всю его папку. Голоса: Chatterbox (Voice) или Piper (.onnx).
              </p>
            </section>
          )}

          {step === 5 && (
            <section className="inspector-section">
              <h3>5. Собрать и посмотреть</h3>
              <p className="hint">
                Зелёное — готово. Жёлтое — можно собрать, но лучше поправить.
                <strong> Characters</strong> = герои, <strong>Props</strong> = отдельные PNG-предметы,
                <strong> Genre / Atmosphere</strong> = жанр и настроение (не персонажи).
              </p>
              <ul className="wizard-checklist">
                <li className={plan.scenes.length ? "ok" : "bad"}>{plan.scenes.length ? `Сцен: ${plan.scenes.length}` : "Нет сцен — добавьте ## Сцена и «Имя: реплика»"}</li>
                <li className={plan.characters.length ? "ok" : "bad"}>{plan.characters.length ? `Героев в тексте: ${plan.characters.length}` : "Укажите Characters: Имя1, Имя2"}</li>
                <li className={missingHeroes.length ? "warn" : "ok"}>
                  {missingHeroes.length
                    ? `В проекте нет rig: ${missingHeroes.join(", ")} (часто подтянется само при сборке)`
                    : "Все герои найдены в проекте или будут подгружены"}
                </li>
                <li className={missingProps.length ? "warn" : "ok"}>
                  {missingProps.length
                    ? `Нет PNG для Props «${missingProps.join(", ")}» — шаг 2: Импорт PNG с таким именем файла`
                    : plan.props.length ? "Все Props найдены" : "Props не указаны — ок (предметы необязательны)"}
                </li>
                <li className={generateTts ? "ok" : "warn"}>{generateTts ? "TTS включён" : "Без озвучки"}</li>
                <li className={musicFolder.trim() ? "ok" : "warn"}>{musicFolder.trim() ? "Папка музыки задана" : "Без музыки из папки — ок"}</li>
              </ul>
              {localError && <div className="export-error">{localError}</div>}
              {editor.error && <div className="export-error">{editor.error}</div>}
              {done && (
                <div className="wizard-success">
                  <strong>Мультик собран.</strong>
                  <p className="hint">{editor.status}</p>
                  <button type="button" className="wide-button accent" onClick={watchFilm}>Смотреть фильм (Монтаж ▶)</button>
                </div>
              )}
              {!done && (
                <button type="button" className="wide-button accent" disabled={!canAssemble} onClick={() => void assemble()}>
                  {busy ? "Собираю…" : "Собрать мультик"}
                </button>
              )}
            </section>
          )}
        </div>

        <footer className="wizard-footer">
          <button type="button" disabled={busy || step <= 1} onClick={() => setStep((value) => Math.max(1, value - 1))}>← Назад</button>
          <span className="hint">Шаг {step} из {STEPS.length}</span>
          {step < 5 ? (
            <button type="button" disabled={busy} onClick={() => setStep((value) => Math.min(5, value + 1))}>Далее →</button>
          ) : (
            <button type="button" disabled={busy} onClick={close}>Готово</button>
          )}
        </footer>
      </section>
    </div>
  );
}
