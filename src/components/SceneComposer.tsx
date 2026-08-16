import { useMemo, useState } from "react";
import type { MotionName } from "../domain/types";
import { createEmptyDialogue } from "../domain/audio";
import { createId } from "../domain/ids";
import { useEditor } from "../editor/EditorContext";

const QUICK_MOTIONS: Array<{ motion: MotionName; icon: string; label: string }> = [
  { motion: "Idle", icon: "⏸", label: "Стоять" },
  { motion: "Wave", icon: "👋", label: "Махать" },
  { motion: "Talk", icon: "🗣", label: "Говорить" },
  { motion: "Happy", icon: "🙂", label: "Радость" },
  { motion: "Angry", icon: "😠", label: "Злость" },
  { motion: "Surprised", icon: "😲", label: "Удивление" },
  { motion: "Scared", icon: "😱", label: "Страх" },
  { motion: "Laugh", icon: "😄", label: "Смех" },
  { motion: "Jump", icon: "↟", label: "Прыжок" },
  { motion: "Attack", icon: "🥊", label: "Удар" },
  { motion: "Hit", icon: "💥", label: "Получить удар" },
  { motion: "Fall", icon: "↘", label: "Упасть" },
];

const motionLabel: Record<MotionName, string> = {
  Idle: "Стоит",
  Walk: "Идёт",
  Run: "Бежит",
  Wave: "Машет",
  Talk: "Говорит",
  Happy: "Радуется",
  Angry: "Злится",
  Surprised: "Удивляется",
  Scared: "Пугается",
  Laugh: "Смеётся",
  Jump: "Прыгает",
  Attack: "Атакует",
  Hit: "Получает удар",
  Fall: "Падает",
};

function percent(time: number, duration: number): number {
  return Math.max(0, Math.min(100, (time / Math.max(0.01, duration)) * 100));
}

export function SceneComposer({ onAdvancedTimeline }: { onAdvancedTimeline(): void }) {
  const editor = useEditor();
  const [dialogueText, setDialogueText] = useState("");
  const [motionDuration, setMotionDuration] = useState(1.2);
  const [busyDialogueId, setBusyDialogueId] = useState<string | null>(null);

  const duration = Math.max(0.25, editor.playbackDuration || editor.currentScene.duration || 10);
  const actor = editor.currentScene.actors.find((item) => item.id === editor.selectedActorId) ?? editor.currentScene.actors[0] ?? null;
  const actorId = actor?.id ?? null;

  const motionSegments = useMemo(
    () => [...(editor.currentScene.generatedTimeline?.motionSegments ?? [])]
      .filter((item) => !actorId || item.actorId === actorId)
      .sort((a, b) => a.start - b.start),
    [actorId, editor.currentScene.generatedTimeline?.motionSegments],
  );

  const dialogues = useMemo(
    () => [...(editor.currentScene.dialogues ?? [])]
      .filter((item) => !actorId || item.actorId === actorId)
      .sort((a, b) => a.startTime - b.startTime),
    [actorId, editor.currentScene.dialogues],
  );

  const selectActor = (id: string) => {
    editor.setSelectedActorId(id);
    editor.setStatus("Персонаж выбран — добавляйте движение, действие или реплику");
  };

  const startPath = (mode: "Walk" | "Run") => {
    if (!actorId) {
      editor.setStatus("Сначала выберите персонажа");
      return;
    }
    editor.setDirectorLocomotion(mode);
    editor.setTool("path");
    editor.setStatus(`${mode === "Run" ? "Бег" : "Ходьба"}: рисуйте линию ПОД НОГАМИ персонажа. Отпустите мышь — движение будет создано.`);
  };

  const addMotion = (motion: MotionName) => {
    if (!actorId) {
      editor.setStatus("Сначала выберите персонажа");
      return;
    }
    editor.insertMotionSegment(motion, {
      actorId,
      startTime: editor.sceneTime,
      duration: Math.max(0.1, motionDuration),
    });
    editor.setStatus(`${motionLabel[motion]} @ ${editor.sceneTime.toFixed(2)}с`);
  };

  const addDialogue = () => {
    if (!actorId) {
      editor.setStatus("Сначала выберите персонажа");
      return;
    }
    const text = dialogueText.trim();
    if (!text) {
      editor.setStatus("Введите текст реплики");
      return;
    }
    const id = createId("dlg");
    editor.commit("Реплика добавлена из Scene Composer", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === editor.currentScene.id)!;
      scene.dialogues = scene.dialogues ?? [];
      scene.dialogues.push(createEmptyDialogue({
        id,
        actorId,
        text,
        startTime: editor.sceneTime,
        duration: Math.max(1, text.length * 0.07),
      }));
      scene.duration = Math.max(scene.duration, editor.sceneTime + Math.max(1, text.length * 0.07) + 0.25);
    });
    setDialogueText("");
    editor.setStatus("Реплика добавлена. Нажмите «Озвучить» на блоке — появится голос и аудиодорожка.");
  };

  const speakDialogue = async (id: string) => {
    setBusyDialogueId(id);
    try {
      await editor.synthesizeDialogueLine(id);
    } finally {
      setBusyDialogueId(null);
    }
  };

  return (
    <section className="scene-composer" aria-label="Простой редактор сцены">
      <style>{`
        .scene-composer{height:var(--timeline-height);min-height:250px;display:grid;grid-template-columns:220px minmax(0,1fr);background:#111416;border-top:1px solid #343a3f;color:#e9edf0;overflow:hidden;font:14px/1.35 system-ui,sans-serif}.sc-actors{border-right:1px solid #343a3f;padding:12px;overflow:auto;background:#15191c}.sc-title{font-size:17px;font-weight:800;margin-bottom:4px}.sc-sub{font-size:12px;color:#99a3aa;margin-bottom:12px}.sc-actor{width:100%;display:flex;align-items:center;gap:8px;padding:9px 10px;margin:0 0 6px;border:1px solid #343a3f;border-radius:8px;background:#1b2024;color:#e9edf0;text-align:left;cursor:pointer}.sc-actor.active{border-color:#e2b84b;background:#29251a}.sc-dot{width:9px;height:9px;border-radius:50%;background:#e2b84b;flex:none}.sc-main{display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden}.sc-toolbar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #343a3f;background:#171b1e;flex-wrap:wrap}.sc-toolbar strong{font-size:15px;margin-right:4px}.sc-btn{border:1px solid #41484e;background:#22282d;color:#eef2f4;border-radius:7px;padding:7px 10px;cursor:pointer}.sc-btn:hover{background:#2b3238}.sc-btn.primary{border-color:#d0a735;background:#3a3119;color:#fff2c2}.sc-btn.voice{border-color:#5b6ea8}.sc-time{font-variant-numeric:tabular-nums;color:#c7d0d5;min-width:106px}.sc-duration{display:flex;align-items:center;gap:5px;color:#aeb8be;font-size:12px}.sc-duration input{width:58px;background:#0f1214;color:#fff;border:1px solid #3b4247;border-radius:5px;padding:5px}.sc-actions{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid #2d3337;overflow-x:auto;background:#131719}.sc-action{white-space:nowrap;border:1px solid #363d42;background:#1c2226;color:#dfe5e8;border-radius:7px;padding:6px 9px;cursor:pointer}.sc-content{overflow:auto;padding:10px 12px 18px}.sc-lane{margin-bottom:11px}.sc-lane-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}.sc-lane-head b{font-size:13px}.sc-lane-head small{color:#8e999f}.sc-track{position:relative;height:44px;border:1px solid #30363a;border-radius:8px;background:repeating-linear-gradient(90deg,#171b1e 0,#171b1e calc(10% - 1px),#242a2e calc(10% - 1px),#242a2e 10%);overflow:hidden}.sc-block{position:absolute;top:6px;height:30px;min-width:42px;border-radius:6px;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;border:1px solid #a88631;background:#3a3119;color:#fff2c2;font-size:12px}.sc-block.dialogue{border-color:#536aa8;background:#202a43;color:#dce6ff}.sc-dialogue-form{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:7px;margin-top:10px}.sc-dialogue-form input{background:#0f1214;color:#f5f7f8;border:1px solid #3b4247;border-radius:7px;padding:9px}.sc-dialogue-list{display:grid;gap:6px;margin-top:8px}.sc-dialogue-row{display:grid;grid-template-columns:72px minmax(0,1fr) auto;gap:7px;align-items:center;border:1px solid #30363a;border-radius:7px;padding:6px 8px;background:#171b1e}.sc-dialogue-row time{color:#9da8ae;font-variant-numeric:tabular-nums}.sc-dialogue-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sc-empty{padding:13px;border:1px dashed #3a4247;border-radius:8px;color:#89949a;text-align:center}.sc-help{padding:7px 10px;border-radius:7px;background:#1c2226;color:#c8d0d4;font-size:12px;margin-top:8px}.sc-help b{color:#f1c95e}
      `}</style>
      <aside className="sc-actors">
        <div className="sc-title">🎬 Редактор сцены</div>
        <div className="sc-sub">Выберите героя и добавляйте понятные действия вместо ручных X/Y-ключей.</div>
        {editor.currentScene.actors.length === 0 ? (
          <div className="sc-empty">На сцене пока нет персонажей.</div>
        ) : editor.currentScene.actors.map((item) => (
          <button key={item.id} type="button" className={`sc-actor${item.id === actorId ? " active" : ""}`} onClick={() => selectActor(item.id)}>
            <span className="sc-dot" />
            <span>{item.name}</span>
          </button>
        ))}
      </aside>

      <div className="sc-main">
        <div className="sc-toolbar">
          <strong>{actor ? actor.name : "Нет персонажа"}</strong>
          <button type="button" className="sc-btn primary" onClick={() => startPath("Walk")}>🚶 Нарисовать ходьбу</button>
          <button type="button" className="sc-btn primary" onClick={() => startPath("Run")}>🏃 Нарисовать бег</button>
          <button type="button" className="sc-btn" onClick={() => editor.setPlaying(!editor.playing)}>{editor.playing ? "⏸ Пауза" : "▶ Play"}</button>
          <span className="sc-time">{editor.sceneTime.toFixed(2)} / {duration.toFixed(2)} сек</span>
          <span className="sc-duration">Действие <input type="number" min="0.1" step="0.1" value={motionDuration} onChange={(event) => setMotionDuration(Number(event.target.value) || 1.2)} /> сек</span>
          <button type="button" className="sc-btn" onClick={() => editor.openToolPanel("voice")}>🎙 Voice Studio</button>
          <button type="button" className="sc-btn" onClick={onAdvancedTimeline}>◆ Расширенный Timeline</button>
        </div>

        <div className="sc-actions">
          {QUICK_MOTIONS.map((item) => (
            <button key={item.motion} type="button" className="sc-action" onClick={() => addMotion(item.motion)} title={`Добавить в ${editor.sceneTime.toFixed(2)}с`}>
              {item.icon} {item.label}
            </button>
          ))}
        </div>

        <div className="sc-content">
          <div className="sc-lane">
            <div className="sc-lane-head"><b>Действия персонажа</b><small>положение блока = время в сцене</small></div>
            <div className="sc-track">
              {motionSegments.map((segment) => (
                <div
                  key={segment.id}
                  className="sc-block"
                  title={`${motionLabel[segment.motion]} · ${segment.start.toFixed(2)}–${(segment.start + segment.duration).toFixed(2)}с`}
                  style={{ left: `${percent(segment.start, duration)}%`, width: `${Math.max(2.5, percent(segment.duration, duration))}%` }}
                >
                  {motionLabel[segment.motion]}
                </div>
              ))}
            </div>
          </div>

          <div className="sc-lane">
            <div className="sc-lane-head"><b>Реплики и голос</b><small>текст → Озвучить → аудио + lip sync</small></div>
            <div className="sc-track">
              {dialogues.map((line) => (
                <div
                  key={line.id}
                  className="sc-block dialogue"
                  title={`${line.text} · ${line.startTime.toFixed(2)}с`}
                  style={{ left: `${percent(line.startTime, duration)}%`, width: `${Math.max(3, percent(line.duration, duration))}%` }}
                >
                  💬 {line.text}
                </div>
              ))}
            </div>

            <div className="sc-dialogue-form">
              <input
                value={dialogueText}
                onChange={(event) => setDialogueText(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") addDialogue(); }}
                placeholder={actor ? `Что говорит ${actor.name}?` : "Сначала выберите персонажа"}
                disabled={!actor}
              />
              <button type="button" className="sc-btn primary" onClick={addDialogue} disabled={!actor}>+ Реплика</button>
            </div>

            <div className="sc-dialogue-list">
              {dialogues.map((line) => (
                <div className="sc-dialogue-row" key={line.id}>
                  <time>{line.startTime.toFixed(2)}с</time>
                  <span title={line.text}>{line.text}</span>
                  <button type="button" className="sc-btn voice" disabled={busyDialogueId === line.id} onClick={() => void speakDialogue(line.id)}>
                    {busyDialogueId === line.id ? "Озвучка…" : line.audioTrackId ? "↻ Озвучить заново" : "🎙 Озвучить"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="sc-help">
            <b>Путь:</b> выберите героя → «Нарисовать ходьбу/бег» → проведите линию прямо на сцене. Для точной ручной работы с ключами используйте «Расширенный Timeline».
          </div>
        </div>
      </div>
    </section>
  );
}
