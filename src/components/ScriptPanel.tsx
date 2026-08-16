import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SCRIPT_EXAMPLE,
  autoMapScriptCharacters,
  parseCartoonScript,
  validateScriptMapping,
  type ScriptCharacterMapping,
} from "../domain/scriptCartoon";
import { FIGHT_DEMO_SCRIPT } from "../domain/fightDemo";
import { MEADOW_DIALOGUE_SCRIPT } from "../domain/meadowDialogue";
import { parseCartoonPrompt, planToScript, analyzePromptReadiness } from "../domain/promptCartoon";
import { STAGE_DUMP_AUDIO, STAGE_DUMP_BACKGROUNDS, STAGE_DUMP_PROPS } from "../domain/stageDump";
import { loadStudioPrefs } from "../domain/studioPrefs";
import { PromptAssistEditor } from "./PromptAssistEditor";
import { MindcoreStoryGenBar } from "./MindcoreStoryGenBar";
import {
  assignVoicesToSpeakers,
  assignProsodyToSpeakers,
  clampSpeechRate,
  mergeVoiceCatalog,
  removeCustomPiperVoice,
  resolveSpeakOptions,
  upsertCustomPiperVoice,
  type SpeechVoiceInfo,
} from "../domain/speechSettings";
import { isExportBusy } from "../domain/renderSettings";
import { useEditor } from "../editor/EditorContext";

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

export function ScriptPanel() {
  const editor = useEditor();
  const [mode, setMode] = useState<"prompt" | "script">("prompt");
  const [prompt, setPrompt] = useState(() => loadStudioPrefs().lastPrompt.trim() || PROMPT_EXAMPLE);
  const [script, setScript] = useState(SCRIPT_EXAMPLE);
  const [mapping, setMapping] = useState<ScriptCharacterMapping>({});
  const [generateTts, setGenerateTts] = useState(true);
  const [replaceScenes, setReplaceScenes] = useState(true);
  const [exportAfter, setExportAfter] = useState(false);
  const [subtitles, setSubtitles] = useState(true);
  const musicFolder = editor.studioPrefs.musicFolder;
  const setMusicFolder = (path: string) => editor.setStudioPrefs({ musicFolder: path });
  const [musicFileCount, setMusicFileCount] = useState<number | null>(null);
  const [dumpBackgroundCount, setDumpBackgroundCount] = useState(0);
  const [dumpPropNames, setDumpPropNames] = useState<string[]>([]);
  const [dumpTick, setDumpTick] = useState(0);
  const [voices, setVoices] = useState<SpeechVoiceInfo[]>([]);
  const [previewPhrase, setPreviewPhrase] = useState("Привет! Это мой голос в мультфильме.");
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const busy = isExportBusy(editor.exportState.phase) || editor.scriptGenerating;

  const parsed = useMemo(() => parseCartoonScript(script), [script]);
  const promptPlan = useMemo(() => parseCartoonPrompt(prompt), [prompt]);
  const characters = editor.project.characters;
  const castSpeakers = useMemo(() => {
    const set = new Set<string>([...promptPlan.characters, ...parsed.speakers]);
    return [...set];
  }, [promptPlan.characters, parsed.speakers]);

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
    if (result?.ok) {
      setVoices(mergeVoiceCatalog(result.voices, settings));
    }
  }, [editor.speechSettings]);

  useEffect(() => {
    if (!editor.scriptPanelOpen) return;
    void refreshVoices();
  }, [editor.scriptPanelOpen, editor.speechSettings.customPiperModels, editor.speechSettings.extraPiperFolders, refreshVoices]);

  useEffect(() => {
    if (!editor.scriptPanelOpen) return;
    let canceled = false;
    void (async () => {
      const folder = musicFolder.trim();
      if (!folder) {
        if (!canceled) setMusicFileCount(0);
        return;
      }
      try {
        const listed = await window.kcs?.listAudioFolder(folder);
        if (canceled) return;
        if (!listed?.ok) {
          setMusicFileCount(0);
          return;
        }
        setMusicFileCount(listed.files?.length ?? 0);
      } catch {
        if (!canceled) setMusicFileCount(null);
      }
    })();
    return () => { canceled = true; };
  }, [editor.scriptPanelOpen, musicFolder]);

  useEffect(() => {
    if (!editor.scriptPanelOpen) return;
    let canceled = false;
    void (async () => {
      try {
        const root = await window.kcs?.getAssetsRoot();
        if (!root?.ok || !root.path || !window.kcs?.listImageFolder) {
          if (!canceled) {
            setDumpBackgroundCount(0);
            setDumpPropNames([]);
          }
          return;
        }
        const bgFolder = await window.kcs.joinPath(root.path, STAGE_DUMP_BACKGROUNDS);
        const propFolder = await window.kcs.joinPath(root.path, STAGE_DUMP_PROPS);
        await window.kcs.ensureDirectory(bgFolder);
        await window.kcs.ensureDirectory(propFolder);
        const [bgs, props] = await Promise.all([
          window.kcs.listImageFolder(bgFolder),
          window.kcs.listImageFolder(propFolder),
        ]);
        if (canceled) return;
        setDumpBackgroundCount(bgs?.ok ? bgs.files.length : 0);
        setDumpPropNames(props?.ok ? props.files.map((file) => file.name) : []);
      } catch {
        if (!canceled) {
          setDumpBackgroundCount(0);
          setDumpPropNames([]);
        }
      }
    })();
    return () => { canceled = true; };
  }, [editor.scriptPanelOpen, dumpTick]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (prompt.trim() && prompt !== editor.studioPrefs.lastPrompt) {
        editor.setStudioPrefs({ lastPrompt: prompt });
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [editor.setStudioPrefs, editor.studioPrefs.lastPrompt, prompt]);

  useEffect(() => {
    if (!editor.scriptPanelOpen) return;
    setMapping((previous) => {
      const auto = autoMapScriptCharacters(parsed.speakers, characters);
      const next = { ...auto };
      for (const speaker of parsed.speakers) {
        if (previous[speaker] && characters.some((character) => character.id === previous[speaker])) {
          next[speaker] = previous[speaker]!;
        }
      }
      return next;
    });
  }, [characters, editor.scriptPanelOpen, parsed.speakers]);

  useEffect(() => {
    if (!voices.length || !castSpeakers.length) return;
    const assigned = assignVoicesToSpeakers(
      castSpeakers,
      voices,
      editor.speechSettings.preferCulture,
      editor.speechSettings.preferPiper,
    );
    const voiceBySpeaker = { ...assigned };
    for (const [key, value] of Object.entries(editor.speechSettings.voiceBySpeaker)) {
      if (value) voiceBySpeaker[key] = value;
    }
    const prosody = assignProsodyToSpeakers(castSpeakers, {
      ...editor.speechSettings,
      voiceBySpeaker,
    });
    editor.setSpeechSettings({ voiceBySpeaker, ...prosody });
    // Seed once when voices / cast arrive — user edits win via voiceBySpeaker merge above.
  }, [voices.length, castSpeakers.join("|")]);

  useEffect(() => () => {
    const el = previewAudioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
    }
    if (previewUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const previewVoice = async (speaker: string) => {
    if (!window.kcs || previewBusy) return;
    setPreviewBusy(true);
    try {
      const temp = await window.kcs.createTempDir("kcs-voice-preview-");
      if (!temp.ok || !temp.path) throw new Error(temp.error ?? "temp");
      const outPath = await window.kcs.joinPath(temp.path, `preview-${Date.now()}.wav`);
      const opts = resolveSpeakOptions(speaker, editor.speechSettings, voices);
      const spoken = await window.kcs.synthesizeSpeech(previewPhrase, outPath, opts);
      if (!spoken.ok || !spoken.path) throw new Error(spoken.error ?? "TTS preview failed");
      const url = await window.kcs.readAsset(spoken.path, editor.projectPath);
      if (previewUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = url;
      const el = previewAudioRef.current;
      if (!el) throw new Error("Нет встроенного плеера.");
      el.pause();
      el.src = url;
      el.currentTime = 0;
      await el.play();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      editor.reportError(`Проба голоса: ${message}. Нужен Piper (.onnx) или Chatterbox.`);
    } finally {
      setPreviewBusy(false);
    }
  };

  const validation = validateScriptMapping(parsed.speakers, mapping, characters);
  const piperReady = voices.some((voice) => voice.engine === "piper");
  const customCount = editor.speechSettings.customPiperModels.length;

  const openDumpFolder = async (sub: string) => {
    try {
      if (!window.kcs?.getAssetsRoot) {
        alert("Нужен desktop KRX (START-KRX.bat), не браузер.");
        return;
      }
      const root = await window.kcs.getAssetsRoot();
      if (!root?.ok || !root.path) {
        alert(root?.error ?? "Не найдена папка Assets");
        return;
      }
      const folder = await window.kcs.joinPath(root.path, sub);
      await window.kcs.ensureDirectory(folder);
      const opened = await window.kcs.openPath(folder);
      if (!opened.ok) alert(opened.error ?? "Не удалось открыть папку");
      else {
        setDumpTick((value) => value + 1);
        if (sub === STAGE_DUMP_AUDIO) setMusicFolder(folder);
      }
    } catch (reason) {
      alert(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const readiness = useMemo(() => analyzePromptReadiness({
    plan: promptPlan,
    characters,
    assets: editor.project.assets,
    voicesCount: voices.length,
    piperReady,
    generateTts,
    musicFolder,
    musicFileCount,
    dumpBackgroundCount,
    dumpPropNames,
  }), [characters, dumpBackgroundCount, dumpPropNames, editor.project.assets, generateTts, musicFileCount, musicFolder, piperReady, promptPlan, voices.length]);

  const runPromptBuild = () => {
    if (!readiness.canBuild) {
      alert(readiness.items.find((item) => item.level === "error")?.detail ?? "Промпт не готов.");
      return;
    }
    if (readiness.errors > 0) {
      const missing = readiness.items.filter((item) => item.level === "error").map((item) => `• ${item.title}: ${item.howToFix ?? item.detail}`).join("\n");
      const ok = window.confirm(`Есть проблемы (${readiness.errors}). Собрать всё равно?\n\n${missing}`);
      if (!ok) return;
    }
    void editor.generateCartoonFromPrompt({
      prompt,
      musicFolder,
      generateTts,
      voiceMode: generateTts ? "natural" : "off",
      exportAfter,
    });
  };

  if (!editor.scriptPanelOpen) return null;

  return (
    <div
      className="export-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) editor.setScriptPanelOpen(false);
      }}
    >
      <section className="export-modal script-modal" role="dialog" aria-label="Script to Cartoon">
        <header className="export-modal-head">
          <div>
            <strong>Конструктор мультика</strong>
            <small>Локально: промпт/сценарий → сцены → TTS → музыка из папки. Без облачных API.</small>
          </div>
          <button type="button" disabled={busy} onClick={() => editor.setScriptPanelOpen(false)}>Закрыть</button>
        </header>

        <div className="export-modal-body">
          <div className="button-row">
            <button type="button" className={mode === "prompt" ? "active" : ""} disabled={busy} onClick={() => setMode("prompt")}>Промпт</button>
            <button type="button" className={mode === "script" ? "active" : ""} disabled={busy} onClick={() => setMode("script")}>Сценарий</button>
          </div>

          <section className="inspector-section">
            <h3>Герои</h3>
            <p className="hint">
              Сборка рига — кнопка <strong>Персонаж</strong> на панели (не обязанность вкладки Промпт).
              Отдельные PNG: body/eye/mouth… Или sheet → Создатель → <strong>Из sheet…</strong>.
            </p>
            <ul className="wizard-list">
              {characters.map((character) => (
                <li key={character.id}><strong>{character.name}</strong><small>{character.parts.length} частей</small></li>
              ))}
              {!characters.length && <li className="empty-hint">Пока нет героев в проекте</li>}
            </ul>
            <div className="button-row">
              <button type="button" disabled={busy} onClick={() => void editor.loadCharacterPngFolder()}>Папка с PNG…</button>
              <button type="button" disabled={busy} onClick={() => void editor.loadCharacter()}>JSON или PNG-файл…</button>
              <button type="button" disabled={busy} onClick={() => editor.openToolPanel("character")}>Открыть Создатель…</button>
            </div>
          </section>

          <section className="inspector-section">
            <h3>Озвучка (локально)</h3>
            <p className="hint">
              Скорость −10…+10. Голоса: <strong>Chatterbox</strong> (Voice) или <strong>Piper</strong> (.onnx).
              Робот Windows отключён.
              {piperReady
                ? ` Найдено Piper: ${voices.filter((v) => v.engine === "piper").length}.`
                : " Piper не найден — поставьте scripts\\setup-piper.ps1 → Tools\\piper, либо Voice."}
            </p>
            <label className="export-field">
              <span>Скорость речи (общая): {editor.speechSettings.rate}</span>
              <input
                type="range"
                min={-10}
                max={10}
                step={1}
                disabled={busy}
                value={editor.speechSettings.rate}
                onChange={(event) => editor.setSpeechSettings({ rate: clampSpeechRate(Number(event.target.value)) })}
              />
            </label>

            <h4>Свои реалистичные голоса</h4>
            <p className="hint">
              <strong>MP3 сюда не подходит</strong> — это готовая запись, а не модель голоса.
              Кнопка «Добавить .onnx…» принимает только нейросеть Piper: пара файлов
              <code>голос.onnx</code> + <code>голос.onnx.json</code> (оба рядом).
              Готовый MP3/WAV: «Импорт MP3…» ниже или вкладка Аудио.
              Живой тембр из MP3: кнопка <strong>Voice</strong> → референс.
              «Папка моделей…» — каталог с несколькими .onnx; «Открыть TTS-папку» —
              <code>Assets/TTS/piper/models</code>. Свои: {customCount}, папок: {editor.speechSettings.extraPiperFolders.length}.
            </p>
            <div className="button-row">
              <button
                type="button"
                disabled={busy}
                onClick={() => void editor.importAudio()}
              >
                Импорт MP3 / WAV…
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => editor.openToolPanel("voice")}
              >
                Voice: референс MP3…
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void (async () => {
                  try {
                    if (!window.kcs?.importPiperModel) {
                      alert("Нужен desktop KRX (START-KRX.bat), не браузер.");
                      return;
                    }
                    const result = await window.kcs.importPiperModel();
                    if (!result || result.canceled) return;
                    if (!result.voices?.length) {
                      alert("MP3/WAV здесь не голос. Выберите файл .onnx (рядом .onnx.json) — это нейросеть Piper, не аудиозапись.\n\nГотовый MP3: «Импорт MP3 / WAV…» или Voice → референс.");
                      return;
                    }
                    let next = editor.speechSettings;
                    for (const voice of result.voices) {
                      if (!voice.modelPath) continue;
                      next = upsertCustomPiperVoice(next, {
                        name: voice.name,
                        modelPath: voice.modelPath,
                        culture: voice.culture,
                        gender: voice.gender,
                      });
                    }
                    editor.setSpeechSettings({
                      customPiperModels: next.customPiperModels,
                    });
                    await refreshVoices();
                    alert(`Добавлено голосов: ${result.voices.length}`);
                  } catch (reason) {
                    alert(reason instanceof Error ? reason.message : String(reason));
                  }
                })}
              >
                Добавить .onnx…
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void (async () => {
                  try {
                    if (!window.kcs?.chooseDirectory) {
                      alert("Нужен desktop KRX (START-KRX.bat), не браузер.");
                      return;
                    }
                    const picked = await window.kcs.chooseDirectory(
                      editor.speechSettings.extraPiperFolders[0] || undefined,
                    );
                    if (!picked) {
                      alert("Диалог папки недоступен.");
                      return;
                    }
                    if (picked.canceled || !picked.path) return;
                    const folders = [...new Set([...editor.speechSettings.extraPiperFolders, picked.path])];
                    editor.setSpeechSettings({ extraPiperFolders: folders });
                    await refreshVoices();
                    alert(`Папка добавлена:\n${picked.path}`);
                  } catch (reason) {
                    alert(reason instanceof Error ? reason.message : String(reason));
                  }
                })}
              >
                Папка моделей…
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void (async () => {
                  try {
                    if (!window.kcs?.getAssetsRoot) {
                      alert("Нужен desktop KRX (START-KRX.bat), не браузер.");
                      return;
                    }
                    const root = await window.kcs.getAssetsRoot();
                    if (!root?.ok || !root.path) {
                      alert(root?.error ?? "Не найдена папка Assets");
                      return;
                    }
                    const models = await window.kcs.joinPath(root.path, "TTS", "piper", "models");
                    await window.kcs.ensureDirectory(models);
                    const opened = await window.kcs.openPath(models);
                    if (!opened.ok) alert(opened.error ?? "Не удалось открыть папку");
                  } catch (reason) {
                    alert(reason instanceof Error ? reason.message : String(reason));
                  }
                })}
              >
                Открыть TTS-папку
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void (async () => {
                  await refreshVoices();
                  alert(`Голосов в списке: ${voices.length}. Piper: ${voices.filter((v) => v.engine === "piper").length}.`);
                })}
              >
                Обновить список
              </button>
            </div>
            {editor.speechSettings.extraPiperFolders.map((folder) => (
              <div key={folder} className="button-row" style={{ alignItems: "center" }}>
                <small className="hint" style={{ flex: 1 }}>{folder}</small>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => editor.setSpeechSettings({
                    extraPiperFolders: editor.speechSettings.extraPiperFolders.filter((item) => item !== folder),
                  })}
                >
                  Убрать
                </button>
              </div>
            ))}
            {editor.speechSettings.customPiperModels.map((voice) => (
              <div key={voice.id} className="button-row" style={{ alignItems: "center" }}>
                <small style={{ flex: 1 }}>[свой] {voice.name} · {voice.culture}/{voice.gender}</small>
                <button
                  type="button"
                  className="danger"
                  disabled={busy}
                  onClick={() => editor.setSpeechSettings({
                    customPiperModels: removeCustomPiperVoice(editor.speechSettings, voice.id).customPiperModels,
                  })}
                >
                  Удалить
                </button>
              </div>
            ))}

            <label className="export-field">
              <span>Пробная фраза</span>
              <input disabled={busy || previewBusy} value={previewPhrase} onChange={(event) => setPreviewPhrase(event.target.value)} />
            </label>
            <audio ref={previewAudioRef} controls className="voice-preview-audio" />
            <p className="hint">Проба играет здесь, внутри студии — внешний плеер Windows не открывается.</p>

            {castSpeakers.map((speaker) => (
              <div key={speaker} className="export-field">
                <span>{speaker}</span>
                <select
                  disabled={busy || !voices.length}
                  value={editor.speechSettings.voiceBySpeaker[speaker] ?? ""}
                  onChange={(event) => editor.setSpeechSettings({ voiceBySpeaker: { [speaker]: event.target.value } })}
                >
                  <option value="">— авто —</option>
                  {voices.map((voice) => (
                    <option key={`${voice.name}-${voice.modelPath ?? ""}`} value={voice.name}>
                      {voice.engine === "piper" ? "[Piper] " : ""}
                      {voice.custom ? "[свой] " : ""}
                      {voice.name} ({voice.culture})
                    </option>
                  ))}
                </select>
                <label>
                  <span>Скорость: {editor.speechSettings.rateBySpeaker[speaker] ?? editor.speechSettings.rate}</span>
                  <input
                    type="range"
                    min={-10}
                    max={10}
                    step={1}
                    disabled={busy}
                    value={editor.speechSettings.rateBySpeaker[speaker] ?? editor.speechSettings.rate}
                    onChange={(event) => editor.setSpeechSettings({
                      rateBySpeaker: { [speaker]: clampSpeechRate(Number(event.target.value)) },
                    })}
                  />
                </label>
                <button type="button" disabled={busy || previewBusy || !previewPhrase.trim()} onClick={() => void previewVoice(speaker)}>
                  {previewBusy ? "Синтез…" : "▶ Прослушать"}
                </button>
              </div>
            ))}
          </section>

          {mode === "prompt" && (
            <section className="inspector-section">
              <h3>Промпт → мультик</h3>
              <div className="prompt-howto">
                <strong>Как собрать по именам</strong>
                <ol>
                  <li><b>Накидайте картинки</b> в папки ниже — сборка сама поставит фон и предметы по промпту.</li>
                  <li><b>Characters:</b> имена героев = имена rig в проекте (чипы и Tab подставляют сами).</li>
                  <li><b>Props: / Предметы:</b> необязательно, если файлы уже в <code>Assets/Props</code>.</li>
                  <li><b>## Сцена</b> и реплики <b>Имя: текст</b> — имя слева = Characters.</li>
                  <li>Блок <b>Мозг режиссёра</b>: картинки/видео → придумать → собрать.</li>
                  <li>Кнопка <b>Собрать мультик по промпту</b> — сцены, фоны, предметы, TTS, музыка.</li>
                </ol>
              </div>
              <p className="hint">
                Куда кидать файлы (PNG/JPG). Имена лучше по смыслу: <code>поляна.png</code>, <code>домик.jpg</code>, <code>меч.png</code>.
                Сейчас фонов: {dumpBackgroundCount}, предметов: {dumpPropNames.length}.
              </p>
              <div className="button-row">
                <button type="button" disabled={busy} onClick={() => void openDumpFolder(STAGE_DUMP_BACKGROUNDS)}>
                  Фоны ({dumpBackgroundCount})…
                </button>
                <button type="button" disabled={busy} onClick={() => void openDumpFolder(STAGE_DUMP_PROPS)}>
                  Предметы ({dumpPropNames.length})…
                </button>
                <button type="button" disabled={busy} onClick={() => void openDumpFolder(STAGE_DUMP_AUDIO)}>
                  Музыка…
                </button>
                <button type="button" disabled={busy} onClick={() => setDumpTick((value) => value + 1)}>
                  Обновить полки
                </button>
              </div>
              <MindcoreStoryGenBar
                disabled={busy}
                characters={characters}
                assets={editor.project.assets}
                onPick={setPrompt}
                onAssemble={(text, options) => {
                  setPrompt(text);
                  void editor.generateCartoonFromPrompt({
                    prompt: text,
                    musicFolder: options.musicFolder.trim() || musicFolder,
                    generateTts: options.generateTts,
                    voiceMode: options.voiceMode,
                    exportAfter,
                    skipMusic: options.skipMusic,
                  });
                }}
              />
              <PromptAssistEditor
                value={prompt}
                disabled={busy}
                rows={12}
                characters={characters}
                assets={editor.project.assets}
                onChange={setPrompt}
              />
              <div className="button-row">
                <button type="button" disabled={busy} onClick={() => setPrompt(PROMPT_EXAMPLE)}>Пример промпта</button>
                <button type="button" disabled={busy} onClick={() => { setScript(planToScript(promptPlan)); setMode("script"); }}>В сценарий →</button>
              </div>
              <label className="export-field">
                <span>Папка музыки (запоминается)</span>
                <input disabled={busy} value={musicFolder} onChange={(event) => setMusicFolder(event.target.value)} placeholder="C:\…\музыка" />
              </label>
              <div className="button-row">
                <button type="button" disabled={busy} onClick={() => void (async () => {
                  const picked = await window.kcs?.chooseDirectory(musicFolder || undefined);
                  if (picked && !picked.canceled && picked.path) setMusicFolder(picked.path);
                })()}>Выбрать папку…</button>
                <button type="button" disabled={busy} onClick={() => void (async () => {
                  if (!window.kcs?.chooseAudioFolderFromFile) {
                    alert("Нужен desktop KRX (START-KRX.bat), не браузер.");
                    return;
                  }
                  const picked = await window.kcs.chooseAudioFolderFromFile(musicFolder || undefined);
                  if (picked && !picked.canceled && picked.path) setMusicFolder(picked.path);
                })()}>Через MP3…</button>
                <button type="button" disabled={busy || !musicFolder.trim()} onClick={() => setMusicFolder("")}>Очистить</button>
              </div>
              <p className="hint">
                В диалоге папки Windows файлы не показывает. «Через MP3…» — укажите любой трек, программа возьмёт
                <strong> всю папку</strong> и все mp3/wav в ней. Выбор не сбрасывается после перезапуска.
                Пустое поле — музыка из Assets/Audio, только если свою папку ещё не выбирали.
                {musicFolder.trim() && musicFileCount != null
                  ? musicFileCount > 0
                    ? ` Сейчас файлов: ${musicFileCount}.`
                    : " В этой папке пока нет mp3/wav/ogg."
                  : ""}
              </p>
              <div className="export-summary">
                <div><span>Сцен</span><strong>{promptPlan.scenes.length}</strong></div>
                <div><span>Героев</span><strong>{promptPlan.characters.length}</strong></div>
                <div><span>Props</span><strong>{promptPlan.props.length || "—"}</strong></div>
                <div><span>Жанр</span><strong>{promptPlan.genre}</strong></div>
              </div>
              <div className={`prompt-readiness${readiness.errors ? " has-errors" : readiness.warnings ? " has-warnings" : " ready"}`}>
                <strong>
                  Чеклист готовности
                  {" · "}
                  {readiness.errors ? `${readiness.errors} проблем` : readiness.warnings ? `${readiness.warnings} предупр.` : "всё ок"}
                </strong>
                <ul className="prompt-checklist">
                  {readiness.items.map((item) => (
                    <li key={item.id} className={`prompt-check-${item.level}`}>
                      <span className="prompt-check-mark">{item.level === "ok" ? "✓" : item.level === "warn" ? "!" : "✕"}</span>
                      <div>
                        <b>{item.title}</b>
                        <p>{item.detail}</p>
                        {item.howToFix && <small>Как исправить: {item.howToFix}</small>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              {promptPlan.scenes.length > 0 && (
                <ul className="hint" style={{ marginTop: 8, paddingLeft: 18 }}>
                  {promptPlan.scenes.map((scene) => (
                    <li key={scene.title}>
                      {scene.title}: фон {scene.backgroundKey}
                      {scene.stageHints.length ? `, ${scene.stageHints.map((h) => h.kind).join("+")}` : ""}
                      {" · "}
                      {scene.mood}
                    </li>
                  ))}
                </ul>
              )}
              <label className="export-check"><input type="checkbox" checked={generateTts} onChange={(event) => setGenerateTts(event.target.checked)} /> Локальный TTS (речь)</label>
              <label className="export-check"><input type="checkbox" checked={exportAfter} onChange={(event) => setExportAfter(event.target.checked)} /> Экспорт монтажа после сборки</label>
              <button
                type="button"
                className="wide-button"
                disabled={busy || !readiness.canBuild}
                title={!readiness.canBuild ? "Сначала исправьте промпт (нужны сцены с репликами)" : undefined}
                onClick={runPromptBuild}
              >
                Собрать мультик по промпту
              </button>
            </section>
          )}

          {mode === "script" && (
            <>
              <section className="inspector-section">
                <h3>Сценарий</h3>
                <textarea className="script-textarea" rows={12} disabled={busy} value={script} onChange={(event) => setScript(event.target.value)} spellCheck={false} />
                <div className="button-row">
                  <button type="button" disabled={busy} onClick={() => setScript(SCRIPT_EXAMPLE)}>Пример</button>
                  <button type="button" disabled={busy} onClick={() => setScript(MEADOW_DIALOGUE_SCRIPT)}>Сюжет: поляна</button>
                  <button type="button" disabled={busy} onClick={() => setScript(FIGHT_DEMO_SCRIPT)}>Сюжет драки</button>
                  <button type="button" disabled={busy} onClick={() => void editor.loadMeadowDialogueDemo({ generateTts, exportAfter })}>Мультик: в гости к Винтику</button>
                  <button type="button" disabled={busy} onClick={() => void editor.loadAudioBeastFightDemo({ generateTts, exportAfter })}>Тест: драка</button>
                  <button type="button" disabled={busy} onClick={() => void editor.loadCharacterPngFolder()}>Папка PNG…</button>
                  <button type="button" disabled={busy} onClick={() => void editor.loadCharacter()}>JSON / PNG…</button>
                </div>
                <div className="export-summary">
                  <div><span>Сцен</span><strong>{parsed.scenes.length}</strong></div>
                  <div><span>Реплик</span><strong>{parsed.scenes.reduce((sum, scene) => sum + scene.lines.length, 0)}</strong></div>
                  <div><span>Говорящих</span><strong>{parsed.speakers.length}</strong></div>
                </div>
                {parsed.errors.map((error) => <div key={error} className="export-error">{error}</div>)}
              </section>

              <section className="inspector-section">
                <h3>Персонажи (готовые)</h3>
                {parsed.speakers.map((speaker) => (
                  <label key={speaker} className="export-field">
                    <span>{speaker}</span>
                    <select disabled={busy || !characters.length} value={mapping[speaker] ?? ""} onChange={(event) => setMapping((previous) => ({ ...previous, [speaker]: event.target.value }))}>
                      <option value="">— выберите rig —</option>
                      {characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}
                    </select>
                  </label>
                ))}
                {!validation.ok && validation.errors.map((error) => <div key={error} className="export-error">{error}</div>)}
              </section>

              <section className="inspector-section">
                <h3>Генерация</h3>
                <label className="export-check"><input type="checkbox" checked={generateTts} onChange={(event) => setGenerateTts(event.target.checked)} /> Локальный TTS</label>
                <label className="export-check"><input type="checkbox" checked={replaceScenes} onChange={(event) => setReplaceScenes(event.target.checked)} /> Заменить сцены проекта</label>
                <label className="export-check"><input type="checkbox" checked={subtitles} onChange={(event) => setSubtitles(event.target.checked)} /> Субтитры</label>
                <label className="export-check"><input type="checkbox" checked={exportAfter} onChange={(event) => setExportAfter(event.target.checked)} /> Экспорт после сборки</label>
                <button
                  type="button"
                  className="wide-button"
                  disabled={busy || !validation.ok}
                  onClick={() => void editor.generateCartoonFromScript({
                    script,
                    mapping,
                    generateTts,
                    voiceMode: generateTts ? "natural" : "off",
                    replaceScenes,
                    subtitles,
                    exportAfter,
                  })}
                >
                  Собрать мультик по сценарию
                </button>
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
