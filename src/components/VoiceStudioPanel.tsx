import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor } from "../editor/EditorContext";
import {
  CHATTERBOX_LANGUAGES,
  VOICE_EMOTION_LABELS_RU,
  VOICE_EMOTIONS,
  createEmptyVoiceProfile,
  resolveEmotionParams,
  resolveEmotionReference,
  type VoiceEmotion,
  type VoiceProfile,
  type VoiceTake,
} from "../domain/voiceStudio";
import { createId } from "../domain/ids";
import type { VoiceEngineStatusUi } from "../types/voiceEngine";

function stateLabel(state: VoiceEngineStatusUi["state"]): string {
  switch (state) {
    case "not_installed": return "Не установлен";
    case "unloaded": return "Модель выгружена";
    case "starting": return "Запуск worker…";
    case "loading": return "Model loading";
    case "ready": return "Ready";
    case "queued": return "Queued";
    case "generating": return "Generating";
    case "completed": return "Completed";
    case "failed": return "Failed";
    default: return state;
  }
}

export function VoiceStudioPanel() {
  const editor = useEditor();
  if (!editor.voiceStudioOpen) return null;

  const scene = editor.currentScene;
  const profiles = editor.project.voiceProfiles ?? [];
  const actors = scene.actors;
  const [actorId, setActorId] = useState<string>(editor.selectedActorId ?? actors[0]?.id ?? "");
  const selectedActor = actors.find((a) => a.id === actorId) ?? null;
  const character = selectedActor
    ? editor.project.characters.find((c) => c.id === selectedActor.characterId)
    : null;

  const [profileId, setProfileId] = useState<string>("");
  const [languageId, setLanguageId] = useState("ru");
  const [emotion, setEmotion] = useState<VoiceEmotion>("neutral");
  const [text, setText] = useState("Привет! Это локальная озвучка Chatterbox Multilingual.");
  const [status, setStatus] = useState<VoiceEngineStatusUi | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const takes = editor.voiceTakes;
  const [selectedTakeId, setSelectedTakeId] = useState<string | null>(null);

  const profile = profiles.find((p) => p.id === profileId) ?? null;
  const referencePath = resolveEmotionReference(profile, emotion);
  const params = resolveEmotionParams(emotion, profile);

  useEffect(() => {
    if (character?.voiceProfileId && profiles.some((p) => p.id === character.voiceProfileId)) {
      setProfileId(character.voiceProfileId);
    }
  }, [character?.voiceProfileId, profiles]);

  useEffect(() => {
    if (profile?.languageId) setLanguageId(profile.languageId);
  }, [profile?.id, profile?.languageId]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    void editor.desktop.voiceStatus().then(setStatus).catch(() => undefined);
    if (editor.desktop.onVoiceStatus) {
      unsub = editor.desktop.onVoiceStatus((next) => setStatus(next));
    }
    return () => { unsub?.(); };
  }, [editor.desktop]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const selectedTake = useMemo(
    () => takes.find((t) => t.id === selectedTakeId) ?? takes[takes.length - 1] ?? null,
    [takes, selectedTakeId],
  );

  const refreshStatus = async () => {
    const next = await editor.desktop.voiceStatus();
    setStatus(next);
  };

  const createProfile = () => {
    const name = window.prompt("Имя голоса", "Max")?.trim();
    if (!name) return;
    const id = createId("voice");
    const empty = createEmptyVoiceProfile({ id, name, referencePath: "", languageId: "ru" });
    editor.upsertVoiceProfile(empty);
    setProfileId(id);
  };

  const importReference = async (targetEmotion: VoiceEmotion) => {
    if (!editor.projectPath) {
      editor.reportError("Сначала сохраните проект — reference копируется в Voices/<имя>/References/.");
      return;
    }
    if (!profile) {
      editor.reportError("Сначала создайте Voice Profile.");
      return;
    }
    setBusy(true);
    try {
      const result = await editor.desktop.voiceImportReference({
        projectPath: editor.projectPath,
        voiceName: profile.name,
        emotion: targetEmotion,
      });
      if (result.canceled || !result.relativePath) return;
      const next: VoiceProfile = {
        ...profile,
        referencePath: targetEmotion === "neutral" || !profile.referencePath
          ? result.relativePath
          : profile.referencePath,
        emotionReferences: [
          ...profile.emotionReferences.filter((r) => r.emotion !== targetEmotion),
          { emotion: targetEmotion, path: result.relativePath },
        ],
      };
      if (targetEmotion === "neutral") next.referencePath = result.relativePath;
      editor.upsertVoiceProfile(next);
      editor.setStatus(`Reference импортирован: ${result.relativePath}`);
    } finally {
      setBusy(false);
    }
  };

  const assignToCharacter = () => {
    if (!character || !profileId) return;
    editor.assignCharacterVoice(character.id, profileId);
    editor.setStatus(`Голос «${profile?.name}» назначен персонажу ${character.name}`);
  };

  const generate = async (newTake: boolean) => {
    if (!text.trim()) {
      editor.reportError("Введите текст реплики.");
      return;
    }
    if (!profile?.referencePath && !referencePath) {
      editor.reportError("Импортируйте reference-аудио для Voice Profile (нужен WAV/MP3/FLAC/M4A).");
      return;
    }
    setBusy(true);
    try {
      const takeIndex = newTake ? (takes.filter((t) => t.voiceProfileId === (profileId || "none") && t.text === text.trim()).length + 1) : Math.max(1, takes.length + 1);
      const prepared = await editor.desktop.voicePrepareOutPath({
        projectPath: editor.projectPath,
        sceneName: scene.name,
        characterName: selectedActor?.name ?? character?.name ?? "Character",
        takeIndex,
      });
      if (!prepared.ok || !prepared.absolutePath) throw new Error(prepared.error ?? "Не удалось подготовить путь WAV");

      let promptAbs: string | undefined;
      const rel = referencePath || profile?.referencePath;
      if (rel) {
        promptAbs = await editor.desktop.resolvePath(rel, editor.projectPath);
      }

      const result = await editor.desktop.voiceGenerate({
        text: text.trim(),
        languageId,
        outPath: prepared.absolutePath,
        audioPromptPath: promptAbs,
        emotion,
        exaggeration: params.exaggeration,
        cfgWeight: params.cfgWeight,
      });
      if (!result.ok && result.error) throw new Error(String(result.error));
      const duration = Number(result.duration) || 1;
      const storePath = editor.projectPath && prepared.relativePath && !pathIsAbsolute(prepared.relativePath)
        ? prepared.relativePath
        : prepared.absolutePath;

      const take: VoiceTake = {
        id: createId("take"),
        takeIndex,
        text: text.trim(),
        emotion,
        languageId,
        voiceProfileId: profileId || "none",
        actorId: actorId || null,
        audioPath: storePath,
        duration,
        createdAt: Date.now(),
        exaggeration: params.exaggeration,
        cfgWeight: params.cfgWeight,
        lipSyncStatus: "not_generated",
      };
      editor.addVoiceTake(take);
      setSelectedTakeId(take.id);
      await playPath(storePath);
      editor.setStatus(`Take ${takeIndex} готов (${duration.toFixed(2)} с)`);
      if (editor.autoLipSyncEnabled) {
        try {
          await editor.generateLipSyncForTake(take.id, take);
        } catch (lipError) {
          editor.reportError(lipError instanceof Error ? lipError.message : String(lipError));
        }
      }
      await refreshStatus();
    } catch (error) {
      editor.reportError(error instanceof Error ? error.message : String(error));
      await refreshStatus();
    } finally {
      setBusy(false);
    }
  };

  const pathIsAbsolute = (value: string) => /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(value);

  const playPath = async (assetPath: string) => {
    const url = await editor.desktop.readAsset(assetPath, editor.projectPath);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    // readAsset returns data URL string
    setPreviewUrl(url);
    requestAnimationFrame(() => {
      const el = audioRef.current;
      if (!el) return;
      el.src = url;
      void el.play().catch(() => undefined);
    });
  };

  const stopPreview = () => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
  };

  const addToTimeline = () => {
    if (!selectedTake) {
      editor.reportError("Нет Take для добавления на Timeline.");
      return;
    }
    editor.addVoiceTakeToTimeline(selectedTake);
  };

  return (
    <div className="export-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) editor.setVoiceStudioOpen(false);
    }}>
      <section className="export-modal voice-studio-modal" role="dialog" aria-label="Voice Studio">
        <header className="export-modal-head">
          <div>
            <strong>Voice Studio</strong>
            <small>Character → Voice → Text → Emotion → Generate → Preview → Timeline · только локальный Chatterbox</small>
          </div>
          <button type="button" disabled={busy} onClick={() => editor.setVoiceStudioOpen(false)}>Закрыть</button>
        </header>

        <div className="export-modal-body voice-studio-body">
          <section className="inspector-section">
            <h3>Движок</h3>
            <p className="hint">
              Статус: <strong>{stateLabel(status?.state ?? "not_installed")}</strong>
              {status?.device ? ` · ${status.device}` : ""}
              {status?.gpu?.gpu_name ? ` · ${status.gpu.gpu_name}` : ""}
              {status?.queueLength ? ` · очередь ${status.queueLength}` : ""}
            </p>
            {status?.lastError ? <p className="hint error-text">{status.lastError}</p> : null}
            <div className="button-row">
              <button type="button" disabled={busy} onClick={() => void refreshStatus()}>Обновить статус</button>
              <button type="button" disabled={busy || status?.state === "not_installed"} onClick={() => void editor.desktop.voiceLoad().then(setStatus)}>Load Model</button>
              <button type="button" disabled={busy} onClick={() => void editor.desktop.voiceUnload().then(setStatus)}>Unload Voice Model</button>
              <button type="button" disabled={busy} onClick={() => void editor.desktop.voiceRunSetup()}>Setup Voice Engine…</button>
            </div>
            <p className="hint">Модель грузится только при Load/Generate. Unload освобождает VRAM.</p>
          </section>

          <section className="inspector-section">
            <h3>Character</h3>
            <label className="export-field">
              <span>Актёр сцены</span>
              <select value={actorId} onChange={(e) => setActorId(e.target.value)}>
                <option value="">—</option>
                {actors.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
              </select>
            </label>
            <p className="hint">Персонаж: {character?.name ?? "—"}. Назначенный голос: {character?.voiceProfileId ? (profiles.find((p) => p.id === character.voiceProfileId)?.name ?? character.voiceProfileId) : "не назначен"}</p>
          </section>

          <section className="inspector-section">
            <h3>Voice Profile</h3>
            <div className="button-row">
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                <option value="">— выберите —</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.languageId})</option>)}
              </select>
              <button type="button" onClick={createProfile}>＋ Профиль</button>
              <button type="button" disabled={!profileId || !character} onClick={assignToCharacter}>Назначить Character</button>
            </div>
            {profile ? (
              <>
                <label className="export-field">
                  <span>Язык (language_id)</span>
                  <select value={languageId} onChange={(e) => {
                    setLanguageId(e.target.value);
                    editor.upsertVoiceProfile({ ...profile, languageId: e.target.value });
                  }}>
                    {Object.entries(CHATTERBOX_LANGUAGES).map(([id, label]) => (
                      <option key={id} value={id}>{label} ({id})</option>
                    ))}
                  </select>
                </label>
                <p className="hint">Reference: {referencePath || "нет — импортируйте WAV"}</p>
                <div className="button-row">
                  <button type="button" disabled={busy} onClick={() => void importReference(emotion)}>Import Reference ({emotion})</button>
                  <button type="button" disabled={busy} onClick={() => void importReference("neutral")}>Import Neutral</button>
                </div>
                {profile.emotionReferences.length > 0 ? (
                  <ul className="hint-list">
                    {profile.emotionReferences.map((ref) => (
                      <li key={`${ref.emotion}-${ref.path}`}>{ref.emotion}: {ref.path}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="inspector-section">
            <h3>Emotion</h3>
            <label className="export-field">
              <span>Эмоция</span>
              <select value={emotion} onChange={(e) => setEmotion(e.target.value as VoiceEmotion)}>
                {VOICE_EMOTIONS.map((id) => (
                  <option key={id} value={id}>{VOICE_EMOTION_LABELS_RU[id]}</option>
                ))}
              </select>
            </label>
            <p className="hint">
              Chatterbox: exaggeration={params.exaggeration}, cfg_weight={params.cfgWeight}
              {referencePath && profile?.emotionReferences.some((r) => r.emotion === emotion)
                ? " · отдельный reference"
                : " · neutral reference + параметры выразительности"}
            </p>
          </section>

          <section className="inspector-section">
            <h3>Text</h3>
            <label className="export-field">
              <span>Реплика</span>
              <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <div className="button-row">
              <button type="button" className="wide-button" disabled={busy} onClick={() => void generate(false)}>Generate</button>
              <button type="button" disabled={busy} onClick={() => void generate(true)}>Generate New Take</button>
            </div>
          </section>

          <section className="inspector-section">
            <h3>Takes / Preview</h3>
            {takes.length === 0 ? <p className="hint">Пока нет takes.</p> : (
              <div className="takes-list">
                {takes.map((take) => (
                  <button
                    key={take.id}
                    type="button"
                    className={selectedTake?.id === take.id ? "take-chip active" : "take-chip"}
                    onClick={() => { setSelectedTakeId(take.id); void playPath(take.audioPath); }}
                  >
                    Take {take.takeIndex} · {take.emotion} · {take.duration.toFixed(1)}s · LS:{take.lipSyncStatus ?? "—"}
                  </button>
                ))}
              </div>
            )}
            <audio ref={audioRef} controls className="voice-preview-audio" />
            <div className="button-row">
              <button type="button" disabled={!selectedTake} onClick={() => selectedTake && void playPath(selectedTake.audioPath)}>Preview</button>
              <button type="button" onClick={stopPreview}>Stop</button>
              <button type="button" disabled={!selectedTake} onClick={addToTimeline}>Add to Timeline</button>
            </div>
          </section>

          <section className="inspector-section">
            <h3>Lip Sync (forced alignment)</h3>
            <label className="export-check">
              <input
                type="checkbox"
                checked={editor.autoLipSyncEnabled}
                onChange={(e) => editor.setAutoLipSyncEnabled(e.target.checked)}
              /> Auto Lip Sync после Generate
            </label>
            <p className="hint">
              Take Lip Sync: <strong>{selectedTake?.lipSyncStatus ?? "Not Generated"}</strong>
              {selectedTake?.lipSync?.cues?.length ? ` · ${selectedTake.lipSync.cues.length} cues` : ""}
              {selectedTake?.lipSyncError ? ` · ${selectedTake.lipSyncError}` : ""}
            </p>
            <div className="button-row">
              <button type="button" disabled={busy || !selectedTake} onClick={() => selectedTake && void editor.generateLipSyncForTake(selectedTake.id).catch((err) => editor.reportError(String(err)))}>Generate Lip Sync</button>
              <button type="button" disabled={busy || !selectedTake} onClick={() => selectedTake && void editor.generateLipSyncForTake(selectedTake.id).catch((err) => editor.reportError(String(err)))}>Regenerate</button>
              <button type="button" disabled={!selectedTake?.lipSync?.cues?.length} onClick={() => {
                if (!selectedTake?.lipSync) return;
                void playPath(selectedTake.audioPath);
                editor.setStatus(`Preview Lip Sync: ${selectedTake.lipSync.cues.length} cues — рот на Timeline clock`);
              }}>Preview Lip Sync</button>
              <button type="button" disabled={!selectedTake} onClick={() => selectedTake && editor.clearLipSyncForTake(selectedTake.id)}>Clear</button>
            </div>
            <div className="button-row">
              <button type="button" disabled={busy} onClick={() => void editor.generateMissingLipSyncForScene().then((r) => editor.setStatus(`Batch Lip Sync: ${r.done}/${r.total}`))}>Generate Missing Lip Sync (сцена)</button>
            </div>
            {selectedTake?.lipSync?.cues?.length ? (
              <p className="hint mono-cues">
                {selectedTake.lipSync.cues.slice(0, 24).map((c) => c.viseme).join(" | ")}
                {selectedTake.lipSync.cues.length > 24 ? " …" : ""}
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}
