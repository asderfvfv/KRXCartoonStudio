import { useEffect, useMemo, useState } from "react";
import { isRigPartAssetName } from "../domain/promptAssist";
import {
  generateStoryVariants,
  thinkDirectorBrain,
  STORY_STRATEGIES,
  storyStrategyTitle,
  type StoryKind,
  type StoryStrategy,
  type StoryVariant,
} from "../domain/mindcoreStoryGen";
import { recommendAdVoiceMode, type AdVoiceMode } from "../domain/adNarration";
import { useEditor } from "../editor/EditorContext";

interface PickedMedia {
  name: string;
  width?: number;
  height?: number;
}

export interface BrainAssembleOptions {
  generateTts: boolean;
  musicFolder: string;
  voiceMode: AdVoiceMode;
  skipMusic?: boolean;
}

interface MindcoreStoryGenBarProps {
  disabled?: boolean;
  characters: Array<{ name: string }>;
  assets: Array<{ name: string; mediaType: string; width?: number; height?: number }>;
  onPick(prompt: string): void;
  onAssemble?(prompt: string, options: BrainAssembleOptions): void;
}

export function MindcoreStoryGenBar({
  disabled,
  characters,
  assets,
  onPick,
  onAssemble,
}: MindcoreStoryGenBarProps) {
  const editor = useEditor();
  const [kind, setKind] = useState<StoryKind>("cartoon");
  const [strategy, setStrategy] = useState<StoryStrategy>("mixed");
  const [idea, setIdea] = useState("");
  const [variants, setVariants] = useState<StoryVariant[]>([]);
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [busyLocal, setBusyLocal] = useState(false);
  const [picked, setPicked] = useState<PickedMedia[]>([]);
  const [withCast, setWithCast] = useState(false);
  const [voiceMode, setVoiceMode] = useState<AdVoiceMode>("off");
  const [voiceHint, setVoiceHint] = useState("Проверяю голос…");
  const [useMusic, setUseMusic] = useState(true);
  const musicFolder = editor.studioPrefs.musicFolder;
  const setMusicFolder = (path: string) => editor.setStudioPrefs({ musicFolder: path });

  const names = useMemo(
    () => characters.map((item) => item.name.trim()).filter(Boolean),
    [characters],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const installed = await editor.desktop.voiceInstalled();
        const listed = await editor.desktop.listSpeechVoices({
          extraFolders: editor.speechSettings.extraPiperFolders,
          extraModels: editor.speechSettings.customPiperModels.map((item) => ({
            name: item.name,
            modelPath: item.modelPath,
            culture: item.culture,
            gender: item.gender,
          })),
        });
        const hasPiper = Boolean(listed.ok && listed.voices.some((voice) => voice.engine === "piper"));
        const pick = recommendAdVoiceMode({
          chatterboxInstalled: Boolean(installed.ok && installed.installed),
          hasVoiceProfile: (editor.project.voiceProfiles?.length ?? 0) > 0,
          hasPiper,
        });
        if (!alive) return;
        setVoiceMode(pick.mode === "off" ? "off" : pick.mode);
        setVoiceHint(pick.detail);
      } catch {
        if (!alive) return;
        setVoiceMode("off");
        setVoiceHint("Голос не найден. Поставьте Chatterbox (Voice) или Piper — робот Windows отключён.");
      }
    })();
    return () => { alive = false; };
  }, [editor.desktop, editor.project.voiceProfiles, editor.speechSettings.customPiperModels, editor.speechSettings.extraPiperFolders]);

  useEffect(() => {
    setVariants([]);
    setThoughts([]);
    if (kind !== "cartoon") return;
    const next = generateStoryVariants(inputFor(picked));
    setVariants(next);
    const brain = thinkDirectorBrain({ ...inputFor(picked), count: 1 });
    setThoughts(brain.thoughts);
    // Auto-draft variants when switching to «Мультфильм»; do not overwrite the prompt field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const inputFor = (pack: PickedMedia[]) => ({
    kind,
    strategy,
    count: 3,
    idea,
    product: idea,
    characters: kind === "ad" && !withCast ? [] : names,
    props: pack.map((item) => item.name),
    assets: pack,
    withCast: kind === "cartoon" ? true : withCast,
  });

  const runThink = (pack: PickedMedia[] = picked) => {
    const next = generateStoryVariants(inputFor(pack));
    setVariants(next);
    const brain = thinkDirectorBrain({ ...inputFor(pack), count: 1 });
    setThoughts(brain.thoughts);
    if (next[0]) onPick(next[0].prompt);
    return next;
  };

  const importThenThink = async () => {
    setBusyLocal(true);
    try {
      const imported = await editor.importPng();
      if (!imported?.length) return;
      const extra = imported
        .map((item) => ({ name: item.name, width: item.width, height: item.height }))
        .filter((item) => item.name && !isRigPartAssetName(item.name));
      const merged = [...picked];
      for (const item of extra) {
        if (!merged.some((existing) => existing.name === item.name)) merged.push(item);
      }
      setPicked(merged);
      runThink(merged);
    } finally {
      setBusyLocal(false);
    }
  };

  const assembleBest = () => {
    if (kind === "ad" && picked.length === 0) {
      window.alert("Для рекламы сначала нажмите «Положить картинки / видео…» — иначе нечего показывать.");
      return;
    }
    const next = variants[0] ? variants : runThink(picked);
    const prompt = next[0]?.prompt;
    if (!prompt) return;
    onPick(prompt);
    onAssemble?.(prompt, {
      generateTts: voiceMode !== "off",
      voiceMode,
      musicFolder: useMusic ? musicFolder.trim() : "",
      skipMusic: !useMusic,
    });
  };

  const locked = disabled || busyLocal;
  const voiceLabel = voiceMode === "natural"
    ? "живой Chatterbox"
    : voiceMode === "piper"
      ? "Piper"
      : "нет";

  return (
    <section className="inspector-section mindcore-gen">
      <h3>Мозг режиссёра (локально)</h3>
      <div className="button-row">
        <button type="button" className={kind === "ad" ? "active" : ""} disabled={locked} onClick={() => setKind("ad")}>Реклама</button>
        <button type="button" className={kind === "cartoon" ? "active" : ""} disabled={locked} onClick={() => setKind("cartoon")}>Мультфильм</button>
      </div>

      {kind === "ad" ? (
        <div className="mindcore-rules">
          <p>
            <b>Реклама цепляет:</b> вау-анимация кадров + короткий дикторский текст.
            Голос — <b>Chatterbox</b> (натуральный) или Piper. Робот Windows отключён.
          </p>
          <ul>
            <li><b>Картинки:</b> {picked.length ? picked.map((item) => item.name).join(", ") : "ещё не выбраны — «Положить…»"}</li>
            <li><b>Герои:</b> {withCast ? "да" : "нет"}</li>
            <li><b>Голос:</b> {voiceLabel}</li>
            <li><b>Музыка:</b> {useMusic && musicFolder.trim() ? musicFolder : useMusic ? "папка ещё не выбрана" : "нет"}</li>
          </ul>
          <p className="hint">{voiceHint}</p>
        </div>
      ) : (
        <div className="mindcore-rules">
          <p>
            <b>Мультфильм:</b> мозг сам выбирает сюжет по идее, пишет реплики, ставит жесты всем героям.
            Картинки — только из «Положить…» (по одной на сцену). Голос — Chatterbox / Piper.
          </p>
          <ul>
            <li><b>Герои:</b> {names.length ? names.join(", ") : "нет ригов в проекте"}</li>
            <li><b>Идея:</b> {idea.trim() || "не задана — возьму шаблон"}</li>
            <li><b>Картинки:</b> {picked.length ? picked.map((item) => item.name).join(", ") : "нет"}</li>
            <li><b>Голос:</b> {voiceLabel}</li>
            <li><b>Музыка:</b> {useMusic && musicFolder.trim() ? musicFolder : useMusic ? "папка ещё не выбрана" : "нет"}</li>
          </ul>
          <p className="hint">{voiceHint}</p>
        </div>
      )}

      <label className="export-field">
        <span>{kind === "ad" ? "Продукт / оффер" : "Идея мультика (мозг вплетает в сюжет)"}</span>
        <input
          disabled={locked}
          value={idea}
          placeholder={kind === "ad" ? "например: MindCore" : "например: в гости к Винтику"}
          onChange={(event) => setIdea(event.target.value)}
        />
      </label>
      <label className="export-field">
        <span>Как думает</span>
        <select disabled={locked} value={strategy} onChange={(event) => setStrategy(event.target.value as StoryStrategy)}>
          {STORY_STRATEGIES.map((item) => (
            <option key={item} value={item}>{storyStrategyTitle(item)}</option>
          ))}
        </select>
      </label>

      {kind === "ad" && (
        <>
          <label className="export-check">
            <input type="checkbox" disabled={locked} checked={withCast} onChange={(event) => setWithCast(event.target.checked)} />
            Добавить героев на сцену (иначе только картинки + диктор)
          </label>
        </>
      )}

      <label className="export-field">
        <span>Голос {kind === "ad" ? "диктора" : "героев"}</span>
        <select
          disabled={locked}
          value={voiceMode}
          onChange={(event) => setVoiceMode(event.target.value as AdVoiceMode)}
        >
          <option value="natural">Живой Chatterbox (рекомендуется)</option>
          <option value="piper">Piper (нейронный, если нет Chatterbox)</option>
          <option value="off">Без озвучки</option>
        </select>
      </label>
      <p className="hint">
        Для своего тембра: Voice → профиль + reference WAV 3–10 с. Иначе — стандартный Chatterbox / Piper.
        Робот Windows в программу не подключается.
      </p>

      <label className="export-check">
        <input type="checkbox" disabled={locked} checked={useMusic} onChange={(event) => setUseMusic(event.target.checked)} />
        Музыка из папки (запоминается)
      </label>
      {useMusic && (
        <div className="button-row">
          <input
            disabled={locked}
            value={musicFolder}
            placeholder="C:\…\музыка"
            onChange={(event) => setMusicFolder(event.target.value)}
          />
          <button
            type="button"
            disabled={locked}
            onClick={() => void (async () => {
              const pickedDir = await window.kcs?.chooseDirectory(musicFolder || undefined);
              if (pickedDir && !pickedDir.canceled && pickedDir.path) setMusicFolder(pickedDir.path);
            })()}
          >
            Папка…
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => void (async () => {
              const picked = await window.kcs?.chooseAudioFolderFromFile(musicFolder || undefined);
              if (picked && !picked.canceled && picked.path) setMusicFolder(picked.path);
            })()}
          >
            Через MP3…
          </button>
        </div>
      )}

      <div className="button-row">
        <button type="button" disabled={locked} onClick={() => void importThenThink()}>Положить картинки / видео…</button>
        <button type="button" disabled={locked || picked.length === 0} onClick={() => { setPicked([]); setVariants([]); setThoughts([]); }}>
          Очистить картинки
        </button>
        <button type="button" disabled={locked} onClick={() => runThink(picked)}>Придумать 3 варианта</button>
        {onAssemble && (
          <button type="button" className="accent" disabled={locked} onClick={assembleBest}>
            Придумать и собрать
          </button>
        )}
      </div>

      {thoughts.length > 0 && (
        <ol className="mindcore-thoughts">
          {thoughts.map((line) => <li key={line}>{line.replace(/^\d+[a-z]?\.\s*/i, "")}</li>)}
        </ol>
      )}
      {variants.length > 0 && (
        <ul className="mindcore-gen-list">
          {variants.map((item) => (
            <li key={item.id}>
              <button type="button" disabled={locked} onClick={() => onPick(item.prompt)}>
                <strong>{item.title}</strong>
                <small>
                  {storyStrategyTitle(item.strategy)}
                  {" · "}
                  {item.characters.length ? item.characters.join(", ") : "без героев"}
                </small>
                <span>{item.explanation}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
