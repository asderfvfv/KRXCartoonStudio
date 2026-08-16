import { useEffect, useRef, useState } from "react";
import { Toolbar } from "./components/Toolbar";
import { LeftSidebar } from "./components/LeftSidebar";
import { CanvasStage } from "./components/CanvasStage";
import { DirectorBar } from "./components/DirectorBar";
import { SceneAssemblyBar } from "./components/SceneAssemblyBar";
import { Timeline } from "./components/Timeline";
import { SceneComposer } from "./components/SceneComposer";
import { RightSidebar } from "./components/RightSidebar";
import { ExportPanel } from "./components/ExportPanel";
import { CharacterCreatorPanel } from "./components/CharacterCreatorPanel";
import { MontagePanel } from "./components/MontagePanel";
import { PartForgePanel } from "./components/PartForgePanel";
import { SeriesPanel } from "./components/SeriesPanel";
import { ScriptPanel } from "./components/ScriptPanel";
import { HelpPanel } from "./components/HelpPanel";
import { NewCartoonWizard } from "./components/NewCartoonWizard";
import { VoiceStudioPanel } from "./components/VoiceStudioPanel";
import { ProjectGate } from "./components/ProjectGate";
import { EditorProvider, useEditor } from "./editor/EditorContext";
import { usePlayback } from "./editor/usePlayback";
import { useTimelineHeight } from "./editor/useTimelineHeight";
import { runStage3SmokeExport } from "./systems/smokeExport";
import { runStage4SmokeAudio } from "./systems/smokeAudio";
import { isExportBusy } from "./domain/renderSettings";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function EditorShell() {
  usePlayback();
  const editor = useEditor();
  const timelineLayout = useTimelineHeight();
  const smokeDone = useRef(false);
  const [advancedTimeline, setAdvancedTimeline] = useState(false);
  /** Default collapsed so the scene itself stays large. */
  const [chromeCollapsed, setChromeCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem("kcs-stage-chrome-collapsed");
      if (raw === null) return true;
      return raw === "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("kcs-stage-chrome-collapsed", chromeCollapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [chromeCollapsed]);

  useEffect(() => {
    if (smokeDone.current) return;
    const search = window.location.search;
    const runStage3 = search.includes("smoke=1");
    const runStage4 = search.includes("smokeAudio=1");
    if (!runStage3 && !runStage4) return;
    console.info("[KCS smoke] boot", { search, hasKcs: Boolean(window.kcs), hasWrite: Boolean(window.kcs?.writePng), hasTts: Boolean(window.kcs?.synthesizeSpeech) });
    if (!window.kcs?.writePng) return;
    smokeDone.current = true;
    void (async () => {
      try {
        if (runStage4) {
          const root = await window.kcs.joinPath("D:\\KRXCartoonStudio", "_stage4_smoke");
          const result = await runStage4SmokeAudio({
            project: editor.project,
            scene: editor.currentScene,
            resolveAssetUrl: (assetPath) => window.kcs.readAsset(assetPath, editor.projectPath),
            joinPath: (...parts) => window.kcs.joinPath(...parts),
            ensureDirectory: (path) => window.kcs.ensureDirectory(path),
            writePng: (path, bytes) => window.kcs.writePng(path, bytes),
            createTempDir: (prefix) => window.kcs.createTempDir(prefix),
            removeDirectory: (path) => window.kcs.removeDirectory(path),
            synthesizeSpeech: (text, outPath) => window.kcs.synthesizeSpeech(text, outPath),
            resolvePath: (assetPath, projectPath) => window.kcs.resolvePath(assetPath, projectPath),
            checkFfmpeg: () => window.kcs.checkFfmpeg(),
            runFfmpeg: (args, logPath) => window.kcs.runFfmpeg(args, logPath),
            rootDir: root,
          });
          console.info("[KCS smokeAudio]", JSON.stringify(result));
          (window as Window & { __kcsSmokeAudio?: unknown }).__kcsSmokeAudio = result;
          return;
        }

        const root = await window.kcs.joinPath("D:\\KRXCartoonStudio", "_stage3_smoke");
        const result = await runStage3SmokeExport({
          project: editor.project,
          scene: editor.currentScene,
          resolveAssetUrl: (assetPath) => window.kcs.readAsset(assetPath, editor.projectPath),
          joinPath: (...parts) => window.kcs.joinPath(...parts),
          ensureDirectory: (path) => window.kcs.ensureDirectory(path),
          writePng: (path, bytes) => window.kcs.writePng(path, bytes),
          createTempDir: (prefix) => window.kcs.createTempDir(prefix),
          removeDirectory: (path) => window.kcs.removeDirectory(path),
          checkFfmpeg: () => window.kcs.checkFfmpeg(),
          runFfmpeg: (args, logPath) => window.kcs.runFfmpeg(args, logPath),
          rootDir: root,
        });
        console.info("[KCS smoke]", JSON.stringify(result));
        (window as Window & { __kcsSmoke?: unknown }).__kcsSmoke = result;
      } catch (reason) {
        console.error("[KCS smoke failed]", reason);
        (window as Window & { __kcsSmoke?: unknown; __kcsSmokeAudio?: unknown }).__kcsSmokeAudio = { ok: false, error: String(reason) };
        (window as Window & { __kcsSmoke?: unknown }).__kcsSmoke = { ok: false, error: String(reason) };
      }
    })();
  }, [editor]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (editor.error) {
          editor.clearError();
          return;
        }
        editor.closeTopPanel();
        return;
      }
      if (event.code === "Space" && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (isTypingTarget(event.target)) return;
        if (isExportBusy(editor.exportState.phase)) return;
        if (editor.exportPanelOpen || editor.characterCreatorOpen || editor.montagePanelOpen || editor.partForgeOpen || editor.seriesPanelOpen || editor.scriptPanelOpen || editor.helpPanelOpen || editor.cartoonWizardOpen || editor.projectGateOpen) return;
        event.preventDefault();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if ((event.key === "Delete" || event.key === "Backspace") && !event.ctrlKey && !event.metaKey) {
        if (editor.exportPanelOpen || editor.characterCreatorOpen || editor.montagePanelOpen || editor.partForgeOpen || editor.seriesPanelOpen || editor.scriptPanelOpen || editor.helpPanelOpen || editor.cartoonWizardOpen || editor.projectGateOpen) return;
        event.preventDefault();
        editor.deleteSelectedFromScene();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const toolByKey: Record<string, "select" | "move" | "rotate" | "scale" | "pivot" | "socket" | "path" | "pan" | "ik"> = {
          v: "select",
          g: "move",
          r: "rotate",
          s: "scale",
          p: "pivot",
          k: "socket",
          i: "ik",
          w: "path",
          h: "pan",
        };
        const tool = toolByKey[event.key.toLowerCase()];
        if (tool) {
          event.preventDefault();
          editor.setTool(tool);
        }
      }
      if (event.key === "F1") {
        event.preventDefault();
        editor.openToolPanel("help");
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (isExportBusy(editor.exportState.phase)) return;
      if (editor.exportPanelOpen || editor.characterCreatorOpen || editor.montagePanelOpen || editor.partForgeOpen || editor.seriesPanelOpen || editor.scriptPanelOpen || editor.helpPanelOpen || editor.cartoonWizardOpen || editor.projectGateOpen) return;
      const moved = Boolean((window as Window & { __kcsSpacePanMoved?: boolean }).__kcsSpacePanMoved);
      (window as Window & { __kcsSpacePanMoved?: boolean }).__kcsSpacePanMoved = false;
      if (moved) return;
      event.preventDefault();
      editor.setPlaying(!editor.playing);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [editor]);

  const statusText = editor.error
    ? (editor.error.split("\n")[0] ?? editor.error)
    : editor.status;

  return (
    <>
      <div className="app-shell" style={{ ["--timeline-height" as string]: `${timelineLayout.height}px` }}>
        <Toolbar />
        <div className="app-body">
          <div className="workspace">
            <LeftSidebar />
            <CanvasStage />
            <RightSidebar />
          </div>
          <div className={`stage-chrome${chromeCollapsed ? " collapsed" : ""}`}>
            <div className="stage-chrome-toggle">
              <strong>Сцены · Режиссёр</strong>
              <small>{advancedTimeline ? "Расширенный Timeline открыт снизу" : "Простой редактор сцены открыт снизу"}</small>
              <button
                type="button"
                title={chromeCollapsed ? "Показать сцены и режиссёра" : "Свернуть — больше места для сцены"}
                onClick={() => setChromeCollapsed((value) => !value)}
              >
                {chromeCollapsed ? "▼ Сцены / Режиссёр" : "▲ Свернуть"}
              </button>
            </div>
            {!chromeCollapsed && (
              <>
                <SceneAssemblyBar />
                <DirectorBar />
              </>
            )}
          </div>
        </div>
        <div
          className="timeline-splitter"
          title="Потяните — высота нижнего редактора (запоминается)"
          onPointerDown={(event) => {
            event.preventDefault();
            timelineLayout.beginResize(event.clientY);
          }}
        />
        {advancedTimeline ? (
          <div style={{ height: "var(--timeline-height)", minHeight: 0, display: "grid", gridTemplateRows: "auto minmax(0,1fr)" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "6px 10px", background: "#15191c", borderBottom: "1px solid #343a3f" }}>
              <button type="button" onClick={() => setAdvancedTimeline(false)} style={{ border: "1px solid #d0a735", background: "#3a3119", color: "#fff2c2", borderRadius: 7, padding: "6px 10px", cursor: "pointer" }}>← Вернуться в простой редактор сцены</button>
            </div>
            <div style={{ minHeight: 0, overflow: "hidden" }}><Timeline /></div>
          </div>
        ) : (
          <SceneComposer onAdvancedTimeline={() => setAdvancedTimeline(true)} />
        )}
        <footer
          className={`status-bar ${editor.error ? "error" : ""}`}
          title={editor.error ? "Esc или клик — скрыть ошибку" : "Esc — закрыть панель · Space — Play/Pause"}
          onClick={() => { if (editor.error) editor.clearError(); }}
        >
          <span className="status-dot" />
          <span className="status-message">{statusText}</span>
          <span className="status-right">
            {editor.projectDirty
              ? (editor.projectPath ? (editor.autosaveEnabled ? "● правки · автосейв" : "● не сохранено") : "● не сохранён файл")
              : "Studio · local"}
          </span>
        </footer>
      </div>
      <ExportPanel />
      <PartForgePanel />
      <MontagePanel />
      <SeriesPanel />
      <ScriptPanel />
      <NewCartoonWizard />
      <CharacterCreatorPanel />
      <HelpPanel />
      <VoiceStudioPanel />
      <ProjectGate />
    </>
  );
}

export default function App() {
  return (
    <EditorProvider>
      <EditorShell />
    </EditorProvider>
  );
}
