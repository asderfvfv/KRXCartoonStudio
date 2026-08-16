import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createDefaultProject, createBlankProject } from "../domain/defaults";
import {
  loadRecentProjects,
  pruneMissingRecentProjects,
  rememberProjectPath,
  removeRecentProjectPath,
  type RecentProjectsState,
} from "../domain/recentProjects";
import {
  AUTOSAVE_IDLE_MS,
  formatAutosaveClock,
  loadAutosaveSettings,
  saveAutosaveSettings,
} from "../domain/autosave";
import {
  clampSpeechRate,
  assignProsodyToSpeakers,
  assignVoicesToSpeakers,
  loadSpeechSettingsFromStorage,
  saveSpeechSettingsToStorage,
  resolveSpeakOptions,
  mergeVoiceCatalog,
  type CartoonSpeechSettings,
} from "../domain/speechSettings";
import {
  loadStudioPrefs,
  saveStudioPrefs,
  type StudioPrefs,
} from "../domain/studioPrefs";
import {
  enrichScenesFromPromptPlan,
  parseCartoonPrompt,
  planToScript,
  pickMusicForMood,
  toAudioAsset,
} from "../domain/promptCartoon";
import {
  matchDumpProp,
  pickBackgroundFromDump,
  resolvePromptPropNames,
  STAGE_DUMP_AUDIO,
  STAGE_DUMP_BACKGROUNDS,
  STAGE_DUMP_PROPS,
  type LocalImageFile,
  usableStagePropFiles,
  usableStageBackgroundFiles,
} from "../domain/stageDump";
import { createId } from "../domain/ids";
import { migrateProject } from "../domain/migration";
import { applyBindPose, captureBindPose } from "../domain/semantic";
import { addCustomPose, applyPosePreset as applyPosePresetToCharacter, removeCustomPose } from "../domain/posePresets";
import {
  capturePoseClip,
  duplicateAnimationClip,
  ensureBuiltinGestureClips,
  MOTION_LABELS_RU,
  renameAnimationClip,
} from "../domain/gestureLibrary";
import { createDefaultRenderSettings, createIdleExportState, isExportBusy, type ExportJobState, type RenderSettings } from "../domain/renderSettings";
import {
  buildSrtFromDialogues,
  createEmptyAudioTrack,
  createEmptyDialogue,
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
  estimateSpeechDuration,
  syncDialogueToTrack,
  type DialogueLine,
  type LipSyncSettings,
  type SceneAudioTrack,
  type SubtitleSettings,
} from "../domain/audio";
import {
  AUDIO_BEAST_FIGHT_CAST,
  applyAudioBeastFightDemo,
  buildPackFromSpec,
  type BundledCharacterPack,
} from "../domain/fightDemo";
import { audioBeastAssetFiles } from "../domain/audioBeastCharacters";
import { groundedActorY } from "../domain/stagePlacement";
import { applyMeadowDialogueDemo, retimeSceneDialoguesWithTts, tileMusicForScene } from "../domain/meadowDialogue";
import {
  chatterboxParamsForAd,
  compressAdCaption,
  pickPiperVoice,
  piperSpeakOptions,
  type AdVoiceMode,
} from "../domain/adNarration";
import { emotionFromDialogue } from "../domain/cartoonActing";
import {
  autoMapScriptCharacters,
  buildCartoonFromScript,
  collectScriptLinesForTts,
  isDemoBotCharacter,
  parseCartoonScript,
  preferredCastCharacters,
  validateScriptMapping,
  type ScriptCharacterMapping,
  type ScriptTtsClip,
} from "../domain/scriptCartoon";
import { amplitudeEnvelopeCache } from "../systems/AmplitudeEnvelopeCache";
import {
  applyCreatorHierarchy,
  buildEmptyCharacter,
  buildLibraryCharacter,
  buildProceduralCharacter,
  createDefaultPalette,
  createProceduralAsset,
  ensureCreatorSockets,
  findSlot,
  listDemoBotLibrary,
  removeSlotPart,
  upsertSlotAsset,
  type CreatorPalette,
  type CreatorSlotId,
} from "../domain/characterCreator";
import {
  attachmentFromPreset,
  attachmentLibrary,
  createEmptyAttachment,
  createLibraryAttachmentAsset,
  createPresetFromAttachment,
  duplicateAttachment,
  type ActorAttachment,
  type AttachmentPreset,
} from "../domain/attachments";
import {
  createDefaultMontage,
  mapMontageTime,
  montageTotalDuration,
  moveMontageClip,
  reorderMontageClip,
  resolveMontageSegments,
  setMontageClipTransitionOut as applyMontageClipTransitionOut,
  syncMontageWithScenes,
  type ProjectMontage,
} from "../domain/montage";
import {
  moveSeriesEpisode as moveSeriesEpisodeOrder,
  renumberSeriesEpisodes,
  syncSeriesWithScenes,
  type ProjectSeries,
  type SeriesEpisode,
} from "../domain/series";
import {
  applyEpisodeTemplateToProject,
  buildSceneFromTemplate,
  type EpisodeTemplateId,
  type SceneTemplateId,
} from "../domain/templates";
import {
  bakeDirectorPath,
  buildGestureAction,
  buildPathActions,
  defaultGestureDuration,
  type DirectorLocomotion,
} from "../domain/directorPath";
import { ensureSceneGeneratedTimeline } from "../domain/emptyTimeline";
import type { ActionType, AnimatableProperty, AnimationClip, AssetDefinition, CharacterDefinition, EasingName, MotionName, ProjectDocument, RigPart, Scene, SceneAction, SceneActionParameters, Vec2 } from "../domain/types";
import { ActionCompiler, actionSequenceHash } from "../systems/ActionCompiler";
import { ExportController } from "../systems/ExportController";
import { RigSystem } from "../systems/RigSystem";
import { SceneAudioEngine } from "../systems/SceneAudioEngine";
import { SceneRuntime } from "../systems/SceneRuntime";
import { formatExportStatusError, formatExportUserError } from "../domain/exportErrors";
import { UndoRedoManager } from "../systems/UndoRedoManager";
import { resolveEmotionParams, type VoiceProfile, type VoiceTake } from "../domain/voiceStudio";
import {
  applyBackgroundPreset,
  applyGradientColors,
  applySolidColor,
  type SceneBackgroundFill,
  type SceneBackgroundPreset,
  templateBackgroundFor,
} from "../domain/sceneBackgrounds";

export type CanvasTool = "select" | "move" | "rotate" | "scale" | "pivot" | "socket" | "pan" | "path" | "ik";

interface EditorContextValue {
  project: ProjectDocument; projectPath?: string; recentProjects: RecentProjectsState; projectGateOpen: boolean; projectDirty: boolean; autosaveEnabled: boolean; lastAutosaveAt: number | null; currentScene: Scene; currentSceneId: string; selectedActorId: string | null; selectedPropId: string | null; selectedPartId: string | null; selectedSocketId: string | null; selectedAttachmentId: string | null;
  currentCharacter: CharacterDefinition; selectedPart?: RigPart; currentClip: AnimationClip; currentClipId: string; previewMotion: MotionName | null;
  time: number; sceneTime: number; playbackDuration: number; playing: boolean; loop: boolean; montageMode: boolean; onionSkinEnabled: boolean; tool: CanvasTool; directorLocomotion: DirectorLocomotion; status: string; error: string | null; canUndo: boolean; canRedo: boolean; undoLabel: string | null;
  renderSettings: RenderSettings; exportPanelOpen: boolean; characterCreatorOpen: boolean; montagePanelOpen: boolean; partForgeOpen: boolean; seriesPanelOpen: boolean; scriptPanelOpen: boolean; helpPanelOpen: boolean; cartoonWizardOpen: boolean; voiceStudioOpen: boolean; scriptGenerating: boolean; exportState: ExportJobState; creatorPalette: CreatorPalette;
  partForgeColor: string;
  setCurrentSceneId(id: string): void; setSelectedActorId(id: string | null): void; setSelectedPropId(id: string | null): void; setSelectedPartId(id: string | null): void; setSelectedSocketId(id: string | null): void; setSelectedAttachmentId(id: string | null): void; clearSceneSelection(): void; setCurrentClipId(id: string): void;
  setTime(value: number): void; setPlaying(value: boolean): void; setLoop(value: boolean): void; setMontageMode(value: boolean): void; setOnionSkinEnabled(value: boolean): void; setTool(tool: CanvasTool): void; setDirectorLocomotion(mode: DirectorLocomotion): void; setPreviewMotion(motion: MotionName | null): void;
  commit(label: string, updater: (draft: ProjectDocument) => void): void; preview(updater: (draft: ProjectDocument) => void): void; finishPreview(label: string): void; undo(): void; redo(): void;
  newProject(name?: string): Promise<void>; openProject(): Promise<void>; openProjectAt(filePath: string): Promise<void>; saveProject(asNew?: boolean): Promise<boolean>; continueWithDemo(): void; openProjectGate(): void; dismissProjectGate(): void; setAutosaveEnabled(value: boolean): void; removeRecentProject(filePath: string): void; refreshRecentProjects(): Promise<void>; getProjectsDir(): Promise<string | null>; openProjectsFolder(): Promise<void>; recoverAndRefreshProjects(): Promise<void>; openStudioFolder(kind: "backgrounds" | "props" | "audio" | "characters"): Promise<void>; importPng(): Promise<Array<{ name: string; path: string; width: number; height: number }> | null>; createCharacter(): void; saveCharacter(): Promise<void>; loadCharacter(): Promise<void>; loadCharacterPngFolder(): Promise<void>;
  changeParent(partId: string, parentId: string | null): void; addKeyframe(partId: string, property: AnimatableProperty, time: number, value: number, easing: EasingName): void; deleteKeyframe(trackId: string, keyframeId: string): void;
  setCurrentAsBindPose(): void; resetPose(): void; applyPosePreset(presetId: string): void; saveCustomPose(label?: string): void; deleteCustomPose(presetId: string): void; addSocket(): void;
  newScene(): void;
  newSceneFromTemplate(templateId: import("../domain/templates").SceneTemplateId): void;
  duplicateScene(): void; renameScene(): void; setSceneDuration(seconds: number): void; deleteScene(sceneId?: string): Promise<void>; addActor(characterId: string): void;
  deleteActor(actorId: string): void; deleteProp(propId: string): void; deleteAsset(assetId: string): Promise<void>; clearSceneBackground(): void;
  setSceneBackgroundColor(color: string): void;
  setSceneBackgroundFill(fill: SceneBackgroundFill, backgroundHex?: string): void;
  applySceneBackgroundPreset(preset: SceneBackgroundPreset): void;
  syncExportBackgroundFromScene(): void;
  nudgePropLayer(propId: string, delta: number): void; setPropVisible(propId: string, visible: boolean): void; setActorVisible(actorId: string, visible: boolean): void; duplicateProp(propId: string): void; duplicateActor(actorId: string): void; reorderActor(actorId: string, direction: -1 | 1): void; alignSelection(mode: "center" | "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter"): void; deleteSelectedFromScene(): boolean;
  addAction(type?: ActionType): void; updateAction(actionId: string, patch: Partial<Omit<SceneAction, "parameters">> & { parameters?: Partial<SceneActionParameters> }): void; deleteAction(actionId: string): void; duplicateAction(actionId: string): void; moveAction(actionId: string, direction: -1 | 1): void; buildTimeline(options?: { resetPlayhead?: boolean }): boolean; markTimelineManual(): void;
  insertDirectorAction(type: ActionType, options?: { actorId?: string; startTime?: number; duration?: number }): void;
  /** Place a body animation (Walk/Wave/…) on a chosen time range — does not wipe X/Y keys. */
  insertMotionSegment(motion: MotionName, options?: { actorId?: string; startTime?: number; duration?: number }): void;
  commitActorPath(points: Vec2[], options?: { actorId?: string; mode?: DirectorLocomotion; startTime?: number }): void;
  /** Request Timeline to switch scene/clip mode (consumed once by Timeline). */
  requestedTimelineMode: "scene" | "clip" | null;
  clearRequestedTimelineMode(): void;
  requestedRightTab: import("../domain/sceneConstructor").RightSidebarTab | null;
  requestRightTab(tab: import("../domain/sceneConstructor").RightSidebarTab): void;
  clearRequestedRightTab(): void;
  listStudioImages(kind: import("../domain/sceneConstructor").StudioImageKind): Promise<import("../domain/sceneConstructor").StudioImageFile[]>;
  addStudioImageAsBackground(file: import("../domain/sceneConstructor").StudioImageFile): Promise<void>;
  addStudioImageAsProp(file: import("../domain/sceneConstructor").StudioImageFile): Promise<void>;
  importPngAs(role: "background" | "prop"): Promise<void>;
  addDemoBotToScene(): Promise<void>;
  /** Load Characters/<relativeFolder> into project and put an actor on the current scene. */
  addBundledCharacterToScene(relativeFolder: string): Promise<void>;
  insertGestureAtPlayhead(motion: MotionName): void;
  openGestureClip(clipId: string): void;
  openBuiltinGestureClip(motion: MotionName): void;
  ensureGestureClips(): void;
  duplicateGestureClip(clipId?: string): void;
  renameGestureClip(clipId?: string, name?: string): void;
  createPoseClip(name?: string): void;
  setExportPanelOpen(open: boolean): void; setCharacterCreatorOpen(open: boolean): void; setMontagePanelOpen(open: boolean): void; setPartForgeOpen(open: boolean): void; setSeriesPanelOpen(open: boolean): void; setScriptPanelOpen(open: boolean): void; setHelpPanelOpen(open: boolean): void; setCartoonWizardOpen(open: boolean): void; setVoiceStudioOpen(open: boolean): void; setPartForgeColor(color: string): void; updateRenderSettings(settings: RenderSettings): void; chooseExportDirectory(): Promise<void>;
  /** Open one tool panel; closes the others (keeps export progress visible if busy). */
  closeTopPanel(): void;
  openToolPanel(panel: "export" | "character" | "montage" | "partforge" | "series" | "script" | "help" | "wizard" | "voice"): void;
  clearError(): void;
  reportError(message: string): void;
  setStatus(message: string): void;
  desktop: Window["kcs"];
  voiceTakes: VoiceTake[];
  autoLipSyncEnabled: boolean;
  setAutoLipSyncEnabled(value: boolean): void;
  upsertVoiceProfile(profile: VoiceProfile): void;
  deleteVoiceProfile(id: string): void;
  assignCharacterVoice(characterId: string, voiceProfileId: string | null): void;
  updateCharacterMouthSet(characterId: string, mouthSet: import("../domain/visemeSystem").MouthSetDefinition): void;
  addVoiceTake(take: VoiceTake): void;
  updateVoiceTake(id: string, patch: Partial<VoiceTake>): void;
  clearVoiceTakes(): void;
  addVoiceTakeToTimeline(take: VoiceTake): void;
  generateLipSyncForTake(takeId: string, takeOverride?: VoiceTake): Promise<void>;
  clearLipSyncForTake(takeId: string): void;
  generateMissingLipSyncForScene(): Promise<{ done: number; total: number }>;
  updateDialogueLipSync(dialogueId: string, lipSync: import("../domain/visemeSystem").LipSyncData | null, status?: import("../domain/visemeSystem").LipSyncGenStatus): void;
  generateCartoonFromScript(options: {
    script: string;
    mapping: ScriptCharacterMapping;
    generateTts: boolean;
    /** Prefer Chatterbox for natural ad/narration voice. */
    voiceMode?: import("../domain/adNarration").AdVoiceMode;
    replaceScenes: boolean;
    subtitles: boolean;
    exportAfter: boolean;
    /** Prompt path does its own enrich with background PNGs. Default: enrich from script remarks. */
    skipPromptEnrich?: boolean;
  }): Promise<void>;
  loadAudioBeastFightDemo(options?: { generateTts?: boolean; exportAfter?: boolean }): Promise<void>;
  loadMeadowDialogueDemo(options?: { generateTts?: boolean; exportAfter?: boolean }): Promise<void>;
  speechSettings: CartoonSpeechSettings;
  setSpeechSettings(patch: Partial<CartoonSpeechSettings>): void;
  studioPrefs: StudioPrefs;
  setStudioPrefs(patch: Partial<StudioPrefs>): void;
  generateCartoonFromPrompt(options: {
    prompt: string;
    musicFolder: string;
    generateTts: boolean;
    voiceMode?: import("../domain/adNarration").AdVoiceMode;
    exportAfter: boolean;
    skipMusic?: boolean;
  }): Promise<void>;
  exportCurrentFrame(): Promise<void>; exportPngSequence(): Promise<void>; exportVideo(): Promise<void>; exportMontageVideo(): Promise<void>; exportMontagePngSequence(): Promise<void>; exportSeriesPack(): Promise<void>; cancelExport(): void; openExportOutput(): Promise<void>;
  importAudio(): Promise<void>; synthesizeDialogue(): Promise<void>;
  /** Озвучить уже существующую реплику (текст → WAV → дорожка + связь). */
  synthesizeDialogueLine(dialogueId: string): Promise<void>;
  addDialogue(): void; updateDialogue(id: string, patch: Partial<DialogueLine>): void; deleteDialogue(id: string): void;
  updateAudioTrack(id: string, patch: Partial<SceneAudioTrack>): void; deleteAudioTrack(id: string): void;
  updateSubtitleSettings(settings: SubtitleSettings): void;
  updateLipSyncSettings(settings: LipSyncSettings): void;
  syncDialogueToLinkedTrack(dialogueId: string): void;
  exportSubtitlesSrt(): Promise<void>;
  ensureAmplitudeEnvelopes(): Promise<void>;
  setCreatorPalette(palette: CreatorPalette): void;
  createCharacterFromTemplate(mode: "empty" | "procedural" | "library", name?: string): void;
  renameCharacter(name: string): void;
  selectEditableCharacter(characterId: string): void;
  assignLibraryPart(slotId: CreatorSlotId): void;
  assignProceduralPart(slotId: CreatorSlotId): void;
  importPngToSlot(slotId: CreatorSlotId): Promise<void>;
  /** Apply sliced spritesheet crops onto creator slots (writes PNG files locally). */
  applySpritesheetCrops(assignments: Array<{
    slotId: CreatorSlotId;
    crop: { id: string; width: number; height: number; pngBytes: Uint8Array; dataUrl: string };
  }>): Promise<void>;
  clearCreatorSlot(slotId: CreatorSlotId): void;
  autoHierarchy(): void;
  setSelectedActorTint(tint: string): void;
  montage: ProjectMontage;
  /** Crossfade amount 0..1 during montage playback, else null. */
  montageBlend: number | null;
  /** Full A→B layers during montage crossfade (for live canvas preview). */
  montageCrossfade: NonNullable<import("../domain/montage").MontageTimeMap["blend"]> | null;
  syncMontage(): void;
  toggleMontageClip(clipId: string, enabled: boolean): void;
  moveMontageClipUp(clipId: string): void;
  moveMontageClipDown(clipId: string): void;
  reorderMontageClipTo(clipId: string, toIndex: number): void;
  jumpToMontageScene(sceneId: string): void;
  resetMontageOrder(): void;
  updateMontageSettings(patch: { transition?: import("../domain/montage").MontageTransitionType; crossfadeDuration?: number }): void;
  setMontageClipTransitionOut(clipId: string, transitionOut: import("../domain/montage").MontageTransitionType | null): void;
  addAttachmentFromLibrary(libraryId: string, color?: string): void;
  addAttachmentFromAsset(assetId: string): void;
  updateAttachment(id: string, patch: Partial<import("../domain/attachments").ActorAttachment>): void;
  deleteAttachment(id: string): void;
  duplicateSelectedAttachment(): void;
  saveSelectedAttachmentPreset(name?: string): void;
  applyAttachmentPreset(presetId: string): void;
  deleteAttachmentPreset(presetId: string): void;
  attachmentPresets: AttachmentPreset[];
  series: ProjectSeries;
  updateSeries(patch: Partial<Pick<ProjectSeries, "name">>): void;
  syncSeries(): void;
  addSeriesEpisode(): void;
  applyEpisodeTemplate(templateId: import("../domain/templates").EpisodeTemplateId): void;
  updateSeriesEpisode(id: string, patch: Partial<SeriesEpisode>): void;
  deleteSeriesEpisode(id: string): void;
  moveSeriesEpisode(id: string, direction: -1 | 1): void;
  renumberSeries(): void;
  audioEngine: SceneAudioEngine;
}

const EditorContext = createContext<EditorContextValue | null>(null);

function fallbackDesktopApi(): Window["kcs"] {
  const unavailable = async () => ({ canceled: true as const });
  return {
    openProject: unavailable, openProjectPath: unavailable, saveProject: async (document) => ({ canceled: false, data: document }), saveProjectAs: async (document) => ({ canceled: false, data: document }),
    saveNewProject: async (document) => ({ canceled: false, data: document, filePath: "memory://project.kcsproj" }),
    getProjectsDir: async () => ({ ok: false, error: "Desktop API недоступен" }),
    recoverRecentProjects: async () => ({ ok: false, error: "Desktop API недоступен", recovered: [] }),
    importPng: unavailable,
    importAudio: unavailable, synthesizeSpeech: async () => ({ ok: false, error: "Desktop API недоступен" }),
    listSpeechVoices: async () => ({ ok: false, voices: [], error: "Desktop API недоступен" }),
    importPiperModel: async () => ({ canceled: true, voices: [] }),
    listAudioFolder: async () => ({ ok: false, files: [], error: "Desktop API недоступен" }),
    listImageFolder: async () => ({ ok: false, files: [], error: "Desktop API недоступен" }),
    chooseAudioFolderFromFile: unavailable,
    readAsset: async (assetPath) => (assetPath.startsWith("data:") ? assetPath : assetPath.replace("builtin://", "/")),
    readAudioWav: async (assetPath) => (assetPath.startsWith("data:") ? assetPath : assetPath.replace("builtin://", "/")), saveCharacter: unavailable, loadCharacter: unavailable, loadCharacterPngFolder: unavailable, loadBundledCharacter: unavailable,
    getCharactersRoot: async () => ({ ok: false, error: "Desktop API недоступен" }),
    getAssetsRoot: async () => ({ ok: false, error: "Desktop API недоступен" }),
    chooseDirectory: unavailable, chooseSaveFile: unavailable, ensureDirectory: async () => ({ ok: false, error: "Desktop API недоступен" }),
    pathExists: async () => false, joinPath: async (...parts) => parts.join("/"), resolvePath: async (assetPath) => assetPath, writePng: async () => ({ ok: false, error: "Desktop API недоступен" }),
    writeText: async () => ({ ok: false, error: "Desktop API недоступен" }),
    createTempDir: async () => ({ ok: false, error: "Desktop API недоступен" }), removeDirectory: async () => ({ ok: false, error: "Desktop API недоступен" }),
    checkFfmpeg: async () => ({ ok: false, error: "Desktop API недоступен" }), runFfmpeg: async () => ({ ok: false, error: "Desktop API недоступен" }),
    cancelFfmpeg: async () => ({ ok: true }), openPath: async () => ({ ok: false, error: "Desktop API недоступен" }), setExportBusy: async () => ({ ok: true }),
    setProjectDirty: async () => ({ ok: true }),
    reportSaveBeforeCloseResult: async () => ({ ok: true }),
    confirm: async (message) => window.confirm(message),
    voiceStatus: async () => ({ state: "not_installed" as const, installed: false }),
    voiceLoad: async () => ({ state: "not_installed" as const, installed: false }),
    voiceUnload: async () => ({ state: "not_installed" as const, installed: false }),
    voiceGenerate: async () => ({ ok: false, error: "Desktop API недоступен" }),
    voiceImportReference: async () => ({ canceled: true }),
    voicePrepareOutPath: async () => ({ ok: false, error: "Desktop API недоступен" }),
    voiceRunSetup: async () => ({ ok: false, error: "Desktop API недоступен" }),
    voiceInstalled: async () => ({ ok: true, installed: false }),
    lipSyncAlign: async () => ({ ok: false, error: "Desktop API недоступен" }),
    lipSyncAlignLoad: async () => ({ state: "unloaded" }),
    lipSyncAlignUnload: async () => ({ state: "unloaded" }),
    lipSyncAlignStatus: async () => ({ state: "unloaded" }),
  };
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => migrateProject(createBlankProject()), []); const history = useRef(new UndoRedoManager(initial));
  const [project, setProject] = useState(initial); const projectRef = useRef(project); const [projectPath, setProjectPath] = useState<string>();
  const [recentProjects, setRecentProjects] = useState<RecentProjectsState>(() => loadRecentProjects());
  const [projectGateOpen, setProjectGateOpen] = useState(true);
  const [projectDirty, setProjectDirty] = useState(false);
  const projectDirtyRef = useRef(false);
  const [autosaveEnabled, setAutosaveEnabledState] = useState(() => loadAutosaveSettings().enabled);
  const [lastAutosaveAt, setLastAutosaveAt] = useState<number | null>(null);
  const lastEditAtRef = useRef(0);
  const autosaveInFlightRef = useRef(false);
  const bootTried = useRef(false);
  const [currentSceneId, setCurrentSceneIdState] = useState(initial.activeSceneId!); const [selectedActorId, setSelectedActorIdState] = useState<string | null>(null);
  const [selectedPropId, setSelectedPropIdState] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null); const [selectedSocketId, setSelectedSocketId] = useState<string | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [currentClipId, setCurrentClipIdState] = useState("clip-wave"); const [previewMotion, setPreviewMotionState] = useState<MotionName | null>(null);
  const [requestedTimelineMode, setRequestedTimelineMode] = useState<"scene" | "clip" | null>(null);
  const [requestedRightTab, setRequestedRightTab] = useState<import("../domain/sceneConstructor").RightSidebarTab | null>(null);
  const [time, setTime] = useState(0); const [playing, setPlayingState] = useState(false); const [loop, setLoop] = useState(false); const [montageMode, setMontageModeState] = useState(false); const [tool, setTool] = useState<CanvasTool>("move");
  const [onionSkinEnabled, setOnionSkinEnabledState] = useState(() => {
    try { return localStorage.getItem("kcs-onion-skin") === "1"; } catch { return false; }
  });
  const setOnionSkinEnabled = useCallback((value: boolean) => {
    setOnionSkinEnabledState(value);
    try { localStorage.setItem("kcs-onion-skin", value ? "1" : "0"); } catch { /* ignore */ }
  }, []);
  const [directorLocomotion, setDirectorLocomotion] = useState<DirectorLocomotion>("Walk");
  const [status, setStatus] = useState("Action Scene готова"); const [error, setError] = useState<string | null>(null); const [, setHistoryTick] = useState(0);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [characterCreatorOpen, setCharacterCreatorOpen] = useState(false);
  const [montagePanelOpen, setMontagePanelOpen] = useState(false);
  const [partForgeOpen, setPartForgeOpen] = useState(false);
  const [seriesPanelOpen, setSeriesPanelOpen] = useState(false);
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false);
  const [helpPanelOpen, setHelpPanelOpen] = useState(false);
  const [cartoonWizardOpen, setCartoonWizardOpen] = useState(false);
  const [voiceStudioOpen, setVoiceStudioOpen] = useState(false);
  const [voiceTakes, setVoiceTakes] = useState<VoiceTake[]>([]);
  const [autoLipSyncEnabled, setAutoLipSyncEnabled] = useState(() => {
    try { return localStorage.getItem("kcs-auto-lipsync") !== "0"; } catch { return true; }
  });
  const setAutoLipSyncEnabledPersist = useCallback((value: boolean) => {
    setAutoLipSyncEnabled(value);
    try { localStorage.setItem("kcs-auto-lipsync", value ? "1" : "0"); } catch { /* ignore */ }
  }, []);
  const [scriptGenerating, setScriptGenerating] = useState(false);
  const [speechSettings, setSpeechSettingsState] = useState<CartoonSpeechSettings>(() => loadSpeechSettingsFromStorage());
  const speechSettingsRef = useRef(speechSettings);
  useEffect(() => { speechSettingsRef.current = speechSettings; }, [speechSettings]);
  useEffect(() => { saveSpeechSettingsToStorage(speechSettings); }, [speechSettings]);
  const [studioPrefs, setStudioPrefsState] = useState<StudioPrefs>(() => loadStudioPrefs());
  const studioPrefsRef = useRef(studioPrefs);
  useEffect(() => { studioPrefsRef.current = studioPrefs; }, [studioPrefs]);
  useEffect(() => { saveStudioPrefs(studioPrefs); }, [studioPrefs]);
  const setStudioPrefs = useCallback((patch: Partial<StudioPrefs>) => {
    setStudioPrefsState((previous) => ({ ...previous, ...patch }));
  }, []);
  const setSpeechSettings = useCallback((patch: Partial<CartoonSpeechSettings>) => {
    setSpeechSettingsState((previous) => ({
      ...previous,
      ...patch,
      rate: patch.rate !== undefined ? clampSpeechRate(patch.rate) : previous.rate,
      voiceBySpeaker: patch.voiceBySpeaker ? { ...previous.voiceBySpeaker, ...patch.voiceBySpeaker } : previous.voiceBySpeaker,
      rateBySpeaker: patch.rateBySpeaker ? { ...previous.rateBySpeaker, ...patch.rateBySpeaker } : previous.rateBySpeaker,
      pitchBySpeaker: patch.pitchBySpeaker ? { ...previous.pitchBySpeaker, ...patch.pitchBySpeaker } : previous.pitchBySpeaker,
      pitchSemitonesBySpeaker: patch.pitchSemitonesBySpeaker
        ? { ...previous.pitchSemitonesBySpeaker, ...patch.pitchSemitonesBySpeaker }
        : previous.pitchSemitonesBySpeaker,
      customPiperModels: patch.customPiperModels ?? previous.customPiperModels,
      extraPiperFolders: patch.extraPiperFolders ?? previous.extraPiperFolders,
    }));
  }, []);
  const [partForgeColor, setPartForgeColor] = useState("#e5b94e");
  const [creatorPalette, setCreatorPalette] = useState<CreatorPalette>(() => createDefaultPalette());
  const [exportState, setExportState] = useState<ExportJobState>(createIdleExportState);
  const timeRef = useRef(time); const playingRef = useRef(playing); const selectedActorRef = useRef(selectedActorId); const selectedPropRef = useRef(selectedPropId); const selectedPartRef = useRef(selectedPartId); const sceneIdRef = useRef(currentSceneId);
  const projectPathRef = useRef(projectPath);
  const desktop = typeof window !== "undefined" && window.kcs ? window.kcs : fallbackDesktopApi();
  const audioEngine = useMemo(() => new SceneAudioEngine(), []);
  const setPlaying = useCallback((value: boolean) => {
    if (!value) audioEngine.pauseAll();
    setPlayingState(value);
  }, [audioEngine]);

  useEffect(() => { projectRef.current = project; }, [project]);
  useEffect(() => { projectPathRef.current = projectPath; }, [projectPath]);
  useEffect(() => { timeRef.current = time; }, [time]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { selectedActorRef.current = selectedActorId; selectedPropRef.current = selectedPropId; selectedPartRef.current = selectedPartId; sceneIdRef.current = currentSceneId; }, [currentSceneId, selectedActorId, selectedPartId, selectedPropId]);
  const currentScene = project.scenes?.find((scene) => scene.id === currentSceneId) ?? project.scenes![0];
  const selectedActor = currentScene.actors.find((actor) => actor.id === selectedActorId) ?? currentScene.actors[0];
  const currentCharacter = project.characters.find((character) => character.id === selectedActor?.characterId) ?? project.characters[0] ?? createBlankProject().characters[0]!;
  const selectedPart = currentCharacter.parts.find((part) => part.id === selectedPartId);
  const currentClip = project.animationClips.find((clip) => clip.id === currentClipId) ?? project.animationClips[0] ?? createBlankProject().animationClips[0]!;
  const montageMapped = montageMode ? mapMontageTime(project, time) : null;
  const sceneTime = montageMapped?.localTime ?? time;
  const montageBlend = montageMapped?.blend?.amount ?? null;
  const montageCrossfade = montageMapped?.blend ?? null;
  const playbackDuration = previewMotion
    ? 2
    : montageMode
      ? Math.max(0.01, montageTotalDuration(project))
      : Math.max(
        currentScene.duration || 0,
        currentScene.generatedTimeline?.duration ?? 0,
        0.5,
      );
  const renderSettings = project.renderSettings ?? createDefaultRenderSettings({ duration: currentScene.duration, backgroundColor: currentScene.background, canvasWidth: currentScene.width, canvasHeight: currentScene.height, fps: Number(project.fps) || 30 });

  const exportController = useMemo(() => new ExportController(desktop, {
    getSnapshot: () => ({ time: timeRef.current, playing: playingRef.current, sceneId: sceneIdRef.current, selectedActorId: selectedActorRef.current, selectedPropId: selectedPropRef.current, selectedPartId: selectedPartRef.current }),
    restoreSnapshot: (snapshot) => {
      setTime(snapshot.time); setPlaying(snapshot.playing); setCurrentSceneIdState(snapshot.sceneId);
      setSelectedActorIdState(snapshot.selectedActorId); setSelectedPropIdState(snapshot.selectedPropId); setSelectedPartId(snapshot.selectedPartId);
    },
    setExportState: (state) => { setExportState(state); void desktop.setExportBusy?.(isExportBusy(state.phase)); },
    resolveAssetUrl: async (assetPath) => desktop.readAsset(assetPath, projectPathRef.current),
    getProjectPath: () => projectPathRef.current,
    confirm: (message) => window.confirm(message),
    yieldToUi: () => new Promise((resolve) => window.setTimeout(resolve, 0)),
  }), [desktop]);

  const markDirty = useCallback(() => {
    projectDirtyRef.current = true;
    setProjectDirty(true);
    lastEditAtRef.current = Date.now();
    void desktop.setProjectDirty?.(true);
  }, [desktop]);
  const markClean = useCallback(() => {
    projectDirtyRef.current = false;
    setProjectDirty(false);
    void desktop.setProjectDirty?.(false);
  }, [desktop]);

  const commit = useCallback((label: string, updater: (draft: ProjectDocument) => void) => {
    const next = structuredClone(projectRef.current); updater(next); const migrated = migrateProject(next); const committed = history.current.commit(migrated, label);
    projectRef.current = committed; setProject(committed); setHistoryTick((value) => value + 1); setStatus(label); setError(null);
    markDirty();
  }, [markDirty]);
  const preview = useCallback((updater: (draft: ProjectDocument) => void) => { const next = structuredClone(projectRef.current); updater(next); projectRef.current = next; setProject(next); }, []);
  const finishPreview = useCallback((label: string) => {
    const committed = history.current.commit(projectRef.current, label, { forceNew: true });
    projectRef.current = committed; setProject(committed); setHistoryTick((value) => value + 1); setStatus(label);
    markDirty();
  }, [markDirty]);
  const undo = useCallback(() => {
    const label = history.current.peekUndoLabel();
    const next = history.current.undo();
    history.current.takeRecentUndoLabel();
    projectRef.current = next; setProject(next); setHistoryTick((value) => value + 1);
    setStatus(label ? `Отменено: ${label}` : "Отменено");
    markDirty();
  }, [markDirty]);
  const redo = useCallback(() => {
    const next = history.current.redo();
    history.current.takeRecentRedoLabel();
    projectRef.current = next; setProject(next); setHistoryTick((value) => value + 1); setStatus("Повторено");
    markDirty();
  }, [markDirty]);
  const replaceProject = useCallback((raw: ProjectDocument, filePath?: string) => {
    const next = migrateProject(raw); const clean = history.current.reset(next); projectRef.current = clean; setProject(clean); setProjectPath(filePath);
    const scene = clean.scenes![0]; setCurrentSceneIdState(clean.activeSceneId ?? scene.id); setSelectedActorIdState(scene.actors[0]?.id ?? null); setSelectedPartId(clean.characters[0]?.parts[0]?.id ?? null);
    setSelectedPropIdState(null); setSelectedSocketId(null); setCurrentClipIdState(clean.animationClips[0]?.id ?? ""); setPreviewMotionState(null); setTime(0); setPlaying(false); setHistoryTick((value) => value + 1);
    if (filePath) setRecentProjects(rememberProjectPath(filePath, clean.name));
    markClean();
  }, [markClean]);
  const withErrors = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      setError(null);
      return await action();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      setStatus("Операция не выполнена");
      throw reason instanceof Error ? reason : new Error(message);
    }
  }, []);
  const ensureAmplitudeEnvelopes = useCallback(async () => {
    const assets = projectRef.current.audioAssets ?? [];
    const results = await Promise.all(assets.map(async (asset) => {
      const ok = await amplitudeEnvelopeCache.ensureFromLoader(asset.id, async () => {
        if (asset.path.startsWith("data:")) return asset.path;
        if (typeof desktop.readAudioWav === "function") {
          return desktop.readAudioWav(asset.path, projectPathRef.current);
        }
        return desktop.readAsset(asset.path, projectPathRef.current);
      });
      return { name: asset.name, ok };
    }));
    const failed = results.filter((item) => !item.ok);
    if (failed.length) {
      setStatus(`Волны аудио: не удалось ${failed.length} файл(ов) — ${failed.slice(0, 2).map((item) => item.name).join(", ")}${failed.length > 2 ? "…" : ""}`);
    }
  }, [desktop]);

  const dismissProjectGate = useCallback(() => setProjectGateOpen(false), []);
  const openProjectGate = useCallback(() => {
    setProjectGateOpen(true);
    void pruneMissingRecentProjects(async (filePath) => desktop.pathExists(filePath)).then(setRecentProjects);
  }, [desktop]);
  const setAutosaveEnabled = useCallback((value: boolean) => {
    setAutosaveEnabledState(value);
    saveAutosaveSettings({ ...loadAutosaveSettings(), enabled: value });
  }, []);
  const removeRecentProject = useCallback((filePath: string) => {
    setRecentProjects(removeRecentProjectPath(filePath));
  }, []);
  const refreshRecentProjects = useCallback(async () => {
    const next = await pruneMissingRecentProjects(async (filePath) => desktop.pathExists(filePath));
    setRecentProjects(next);
  }, [desktop]);
  const confirmDiscardIfDirty = useCallback((actionLabel: string) => {
    if (!projectDirtyRef.current) return true;
    return window.confirm(`Есть несохранённые изменения. ${actionLabel} и потерять правки?\n\nСовет: сначала Ctrl+S или дождитесь автосейва.`);
  }, []);
  const continueWithDemo = useCallback(() => {
    if (!confirmDiscardIfDirty("Открыть демо DemoBot")) return;
    replaceProject(createDefaultProject("DemoBot — демо"));
    setProjectGateOpen(false);
    setStatus("Демо DemoBot загружено. Save — чтобы открывать его при следующем запуске.");
  }, [confirmDiscardIfDirty, replaceProject]);

  const openProjectAt = useCallback((filePath: string) => withErrors(async () => {
    if (isExportBusy(exportState.phase)) throw new Error("Нельзя открыть другой проект во время экспорта.");
    if (!confirmDiscardIfDirty("Открыть другой проект")) return;
    const exists = await desktop.pathExists(filePath);
    if (!exists) {
      setRecentProjects(removeRecentProjectPath(filePath));
      throw new Error(`Файл не найден:\n${filePath}\nУбран из «Недавних».`);
    }
    const result = await desktop.openProjectPath(filePath);
    if (result.canceled || !result.data) return;
    replaceProject(result.data, result.filePath ?? filePath);
    setProjectGateOpen(false);
    setStatus(`Открыт ${result.filePath ?? filePath}`);
  }), [confirmDiscardIfDirty, desktop, exportState.phase, replaceProject, withErrors]);

  const newProject = useCallback((nameInput?: string) => withErrors(async () => {
    if (isExportBusy(exportState.phase)) throw new Error("Нельзя закрыть проект во время экспорта.");
    if (!confirmDiscardIfDirty("Создать новый проект")) return;
    const name = (nameInput ?? "Новый мультфильм").trim() || "Новый мультфильм";
    const blank = createBlankProject(name);
    const saved = await desktop.saveNewProject(blank, name);
    if (saved.canceled || !saved.filePath) {
      replaceProject(blank);
      setProjectGateOpen(false);
      setStatus("Новый пустой проект (ещё не сохранён на диск)");
      return;
    }
    replaceProject(saved.data ?? blank, saved.filePath);
    setProjectGateOpen(false);
    setStatus(`Новый проект в папке Projects:\n${saved.filePath}`);
  }), [confirmDiscardIfDirty, desktop, exportState.phase, replaceProject, withErrors]);

  const getProjectsDir = useCallback(async () => {
    const result = await desktop.getProjectsDir();
    return result.ok && result.path ? result.path : null;
  }, [desktop]);

  const openProjectsFolder = useCallback(() => withErrors(async () => {
    const result = await desktop.getProjectsDir();
    if (!result.ok || !result.path) throw new Error(result.error ?? "Папка Projects недоступна.");
    const opened = await desktop.openPath(result.path);
    if (!opened.ok) throw new Error(opened.error ?? "Не удалось открыть папку Projects.");
  }), [desktop, withErrors]);

  const recoverAndRefreshProjects = useCallback(() => withErrors(async () => {
    const recovered = await desktop.recoverRecentProjects();
    if (!recovered.ok) throw new Error(recovered.error ?? "Не удалось найти старые проекты.");
    let next = await pruneMissingRecentProjects(async (filePath) => desktop.pathExists(filePath));
    for (const item of recovered.recovered ?? []) {
      next = rememberProjectPath(item.path, item.name);
    }
    setRecentProjects(next);
    if ((recovered.recovered ?? []).length) {
      setStatus(`Найдено проектов: ${(recovered.recovered ?? []).length}. Папка: ${recovered.projectsDir ?? "Projects"}`);
    } else {
      setStatus(`В Projects пока пусто (${recovered.projectsDir ?? "—"}). Создайте новый или Открыть…`);
    }
  }), [desktop, withErrors]);

  const openStudioFolder = useCallback((kind: "backgrounds" | "props" | "audio" | "characters") => withErrors(async () => {
    if (kind === "characters") {
      const root = await desktop.getCharactersRoot();
      if (!root.ok || !root.path) throw new Error(root.error ?? "Папка Characters не найдена.");
      const opened = await desktop.openPath(root.path);
      if (!opened.ok) throw new Error(opened.error ?? "Не удалось открыть Characters.");
      return;
    }
    const root = await desktop.getAssetsRoot();
    if (!root.ok || !root.path) throw new Error(root.error ?? "Папка Assets не найдена.");
    const sub = kind === "backgrounds" ? "Backgrounds" : kind === "props" ? "Props" : "Audio";
    const folder = await desktop.joinPath(root.path, sub);
    await desktop.ensureDirectory(folder);
    const opened = await desktop.openPath(folder);
    if (!opened.ok) throw new Error(opened.error ?? `Не удалось открыть ${sub}.`);
  }), [desktop, withErrors]);

  const openProject = useCallback(() => withErrors(async () => {
    if (isExportBusy(exportState.phase)) throw new Error("Нельзя открыть другой проект во время экспорта.");
    if (!confirmDiscardIfDirty("Открыть другой проект")) return;
    const result = await desktop.openProject();
    if (!result.canceled && result.data) {
      replaceProject(result.data, result.filePath);
      setProjectGateOpen(false);
      setStatus(`Открыт ${result.filePath}`);
    }
  }), [confirmDiscardIfDirty, desktop, exportState.phase, replaceProject, withErrors]);
  const saveProject = useCallback((asNew = false) => withErrors(async () => {
    const result = asNew ? await desktop.saveProjectAs(projectRef.current) : await desktop.saveProject(projectRef.current, projectPathRef.current);
    if (result.canceled) return false;
    const savedPath = result.filePath ?? projectPathRef.current;
    if (result.data) replaceProject(result.data, savedPath);
    else {
      if (savedPath) {
        setProjectPath(savedPath);
        projectPathRef.current = savedPath;
        setRecentProjects(rememberProjectPath(savedPath, projectRef.current.name));
      }
      markClean();
    }
    setStatus(`Сохранён ${savedPath}`);
    return true;
  }), [desktop, markClean, replaceProject, withErrors]);

  useEffect(() => {
    void desktop.setProjectDirty?.(projectDirtyRef.current);
  }, [desktop]);

  useEffect(() => {
    if (!desktop.onSaveBeforeClose || !desktop.reportSaveBeforeCloseResult) return;
    return desktop.onSaveBeforeClose(() => {
      void (async () => {
        try {
          const ok = await saveProject(false);
          if (!ok) {
            await desktop.reportSaveBeforeCloseResult?.({ canceled: true });
            return;
          }
          await desktop.reportSaveBeforeCloseResult?.({ saved: true });
        } catch {
          await desktop.reportSaveBeforeCloseResult?.({ canceled: true });
        }
      })();
    });
  }, [desktop, saveProject]);

  const runAutosave = useCallback(async (reason: "interval" | "blur" | "unload") => {
    if (!autosaveEnabled) return false;
    if (!projectDirtyRef.current) return false;
    const path = projectPathRef.current;
    if (!path) return false;
    if (autosaveInFlightRef.current) return false;
    if (isExportBusy(exportState.phase)) return false;
    if (projectGateOpen) return false;
    if (reason === "interval" && Date.now() - lastEditAtRef.current < AUTOSAVE_IDLE_MS) return false;
    autosaveInFlightRef.current = true;
    try {
      const result = await desktop.saveProject(projectRef.current, path);
      if (result.canceled) return false;
      const savedPath = result.filePath ?? path;
      if (savedPath) {
        setProjectPath(savedPath);
        projectPathRef.current = savedPath;
        setRecentProjects(rememberProjectPath(savedPath, projectRef.current.name));
      }
      markClean();
      const at = Date.now();
      setLastAutosaveAt(at);
      setStatus(`Автосохранено ${formatAutosaveClock(at)}`);
      return true;
    } catch (reasonError) {
      setStatus(reasonError instanceof Error ? `Автосейв не удался: ${reasonError.message}` : "Автосейв не удался");
      return false;
    } finally {
      autosaveInFlightRef.current = false;
    }
  }, [autosaveEnabled, desktop, exportState.phase, markClean, projectGateOpen]);

  useEffect(() => {
    if (bootTried.current) return;
    bootTried.current = true;
    void (async () => {
      try {
        const recovered = await desktop.recoverRecentProjects();
        if (recovered.ok) {
          let next = await pruneMissingRecentProjects(async (filePath) => desktop.pathExists(filePath));
          for (const item of recovered.recovered ?? []) {
            next = rememberProjectPath(item.path, item.name);
          }
          setRecentProjects(next);
        } else {
          const pruned = await pruneMissingRecentProjects(async (filePath) => desktop.pathExists(filePath));
          setRecentProjects(pruned);
        }
      } catch {
        const pruned = await pruneMissingRecentProjects(async (filePath) => desktop.pathExists(filePath));
        setRecentProjects(pruned);
      }
      const pruned = loadRecentProjects();
      const last = pruned.lastPath;
      if (!last || !desktop.openProjectPath) {
        setStatus("Выберите проект или «Новый пустой проект».");
        return;
      }
      if (!studioPrefsRef.current.autoOpenLastProject) {
        setStatus("Выберите проект или «Новый пустой проект» — прошлый файл сам не открываю.");
        return;
      }
      try {
        const exists = await desktop.pathExists(last);
        if (!exists) {
          setRecentProjects(removeRecentProjectPath(last));
          setStatus("Последний проект не найден — выберите файл или создайте новый.");
          return;
        }
        const result = await desktop.openProjectPath(last);
        if (!result.canceled && result.data) {
          replaceProject(result.data, result.filePath ?? last);
          setProjectGateOpen(false);
          setStatus(`Восстановлен ${result.filePath ?? last}`);
        }
      } catch (reason) {
        setRecentProjects(removeRecentProjectPath(last));
        setError(reason instanceof Error ? reason.message : String(reason));
        setStatus("Не удалось открыть последний проект — выберите другой.");
      }
    })();
  }, [desktop, replaceProject]);

  useEffect(() => {
    if (!autosaveEnabled) return;
    const settings = loadAutosaveSettings();
    const timer = window.setInterval(() => {
      void runAutosave("interval");
    }, settings.intervalMs);
    return () => window.clearInterval(timer);
  }, [autosaveEnabled, runAutosave]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void runAutosave("blur");
    };
    const onPageHide = () => { void runAutosave("unload"); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [runAutosave]);

  // Electron main owns the quit dialog. A browser beforeunload here cancels
  // window teardown after «Не сохранять» and leaves the app hung/glitched.
  useEffect(() => {
    if (typeof window !== "undefined" && window.kcs) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!projectDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const importPng = useCallback(() => withErrors(async () => {
    const result = await desktop.importPng();
    if (result.canceled || !result.data?.length) return null;
    commit(`Импортировано PNG: ${result.data.length}`, (draft) => {
      for (const item of result.data!) {
        draft.assets.push({
          id: createId("asset"),
          name: item.name,
          path: item.path,
          mediaType: "image/png",
          width: item.width,
          height: item.height,
        });
      }
    });
    setStatus(`Картинки в проекте (${result.data.length}). Выберите их в «Мозг режиссёра → Положить…», иначе в Props не попадут.`);
    return result.data;
  }), [commit, desktop, withErrors]);
  const createCharacter = useCallback(() => { const name = window.prompt("Имя персонажа", "Новый персонаж")?.trim(); if (!name) return; const id = createId("character"); commit(`Создан персонаж ${name}`, (draft) => { draft.characters.push({ version: 1, id, name, parts: [], sockets: [], bindPose: {} }); }); }, [commit]);
  const saveCharacter = useCallback(() => withErrors(async () => { const result = await desktop.saveCharacter(currentCharacter, projectRef.current.assets, projectPath); if (!result.canceled) setStatus(`Персонаж сохранён: ${result.filePath}`); }), [currentCharacter, desktop, projectPath, withErrors]);
  const applyLoadedCharacter = useCallback((loaded: CharacterDefinition) => {
    commit(`Загружен персонаж ${loaded.name}`, (draft) => {
      const index = draft.characters.findIndex((character) => character.id === loaded.id);
      if (index >= 0) draft.characters[index] = loaded;
      else draft.characters.push(loaded);
      if (loaded.assets) {
        const ids = new Set(loaded.assets.map((asset) => asset.id));
        draft.assets = [...draft.assets.filter((asset) => !ids.has(asset.id)), ...loaded.assets];
      }
    });
    setStatus(`Персонаж «${loaded.name}» в проекте`);
  }, [commit]);
  const loadCharacter = useCallback(() => withErrors(async () => {
    const result = await desktop.loadCharacter();
    if (result.canceled || !result.data) return;
    applyLoadedCharacter(result.data);
  }), [applyLoadedCharacter, desktop, withErrors]);
  const loadCharacterPngFolder = useCallback(() => withErrors(async () => {
    const result = await desktop.loadCharacterPngFolder();
    if (result.canceled || !result.data) return;
    applyLoadedCharacter(result.data);
  }), [applyLoadedCharacter, desktop, withErrors]);

  const changeParent = useCallback((partId: string, parentId: string | null) => { const rig = new RigSystem(currentCharacter.parts); if (!rig.canSetParent(partId, parentId)) { setError("Циклическая parent-зависимость запрещена."); return; } const characterId = currentCharacter.id; commit("Изменена иерархия", (draft) => { const part = draft.characters.find((character) => character.id === characterId)?.parts.find((item) => item.id === partId); if (part) part.parentId = parentId; }); }, [commit, currentCharacter]);
  const addKeyframe = useCallback((partId: string, property: AnimatableProperty, at: number, value: number, easing: EasingName) => { commit("Добавлен keyframe", (draft) => { const clip = draft.animationClips.find((item) => item.id === currentClip.id)!; let track = clip.tracks.find((item) => item.partId === partId && item.property === property); if (!track) { track = { id: createId("track"), partId, property, keyframes: [] }; clip.tracks.push(track); } const existing = track.keyframes.find((key) => Math.abs(key.time - at) < .0001); if (existing) { existing.value = value; existing.easing = easing; } else track.keyframes.push({ id: createId("key"), time: Math.max(0, Math.min(clip.duration, at)), value, easing }); track.keyframes.sort((a, b) => a.time - b.time); }); }, [commit, currentClip.id]);
  const deleteKeyframe = useCallback((trackId: string, keyframeId: string) => { commit("Удалён keyframe", (draft) => { const track = draft.animationClips.find((clip) => clip.id === currentClip.id)?.tracks.find((item) => item.id === trackId); if (track) track.keyframes = track.keyframes.filter((key) => key.id !== keyframeId); }); }, [commit, currentClip.id]);

  const setCurrentAsBindPose = useCallback(() => { const characterId = currentCharacter.id; commit("Текущая поза сохранена как Bind Pose", (draft) => { const character = draft.characters.find((item) => item.id === characterId)!; character.bindPose = captureBindPose(character); }); }, [commit, currentCharacter.id]);
  const resetPose = useCallback(() => { const characterId = currentCharacter.id; commit("Поза сброшена к Bind Pose", (draft) => { const index = draft.characters.findIndex((item) => item.id === characterId); if (index >= 0) draft.characters[index] = applyBindPose(draft.characters[index]); }); setTime(0); setPlaying(false); }, [commit, currentCharacter.id]);
  const applyPosePreset = useCallback((presetId: string) => {
    const characterId = currentCharacter.id;
    commit(`Поза: ${presetId}`, (draft) => {
      const index = draft.characters.findIndex((item) => item.id === characterId);
      if (index < 0) return;
      draft.characters[index] = applyPosePresetToCharacter(draft.characters[index]!, presetId);
    });
    setPlaying(false);
  }, [commit, currentCharacter.id]);
  const saveCustomPose = useCallback((label?: string) => {
    const characterId = currentCharacter.id;
    const name = (label ?? window.prompt("Имя позы", "Своя поза") ?? "").trim();
    if (!name) return;
    commit(`Сохранена поза «${name}»`, (draft) => {
      const index = draft.characters.findIndex((item) => item.id === characterId);
      if (index < 0) return;
      draft.characters[index] = addCustomPose(draft.characters[index]!, name);
    });
  }, [commit, currentCharacter.id]);
  const deleteCustomPose = useCallback((presetId: string) => {
    const characterId = currentCharacter.id;
    commit("Удалена своя поза", (draft) => {
      const index = draft.characters.findIndex((item) => item.id === characterId);
      if (index < 0) return;
      draft.characters[index] = removeCustomPose(draft.characters[index]!, presetId);
    });
  }, [commit, currentCharacter.id]);
  const addSocket = useCallback(() => { if (!selectedPartId) return; const characterId = currentCharacter.id; const socketId = createId("socket"); commit("Добавлен socket", (draft) => { const character = draft.characters.find((item) => item.id === characterId)!; (character.sockets ??= []).push({ id: socketId, name: "Custom Socket", type: "Custom", partId: selectedPartId, position: { x: 0, y: 0 } }); }); setSelectedSocketId(socketId); setTool("socket"); }, [commit, currentCharacter.id, selectedPartId]);

  const setCurrentSceneId = useCallback((id: string) => {
    const scene = projectRef.current.scenes?.find((item) => item.id === id);
    if (!scene) return;
    // Persist so reopen lands on the scene you left (not an old activeSceneId).
    if (projectRef.current.activeSceneId !== id) {
      const next = { ...projectRef.current, activeSceneId: id };
      projectRef.current = next;
      setProject(next);
      markDirty();
    }
    setCurrentSceneIdState(id);
    setSelectedActorIdState(scene.actors[0]?.id ?? null);
    setSelectedPropIdState(null);
    setSelectedAttachmentId(null);
    setSelectedPartId(projectRef.current.characters.find((character) => character.id === scene.actors[0]?.characterId)?.parts[0]?.id ?? null);
    setPlaying(false);
    setPreviewMotionState(null);
    if (montageMode) {
      // Playhead drives which scene is "current" in montage — jump to this scene's offset
      // or the sync effect will snap highlight back to whatever time is showing.
      const segments = resolveMontageSegments(projectRef.current);
      const segment = segments.find((item) => item.scene.id === id);
      setTime(segment?.offset ?? 0);
    } else {
      setTime(0);
    }
  }, [markDirty, montageMode]);
  const newScene = useCallback(() => {
    // Пустая сцена — без DemoBot / актёров. Шаблоны с актёрами: «＋ Сцена из шаблона…»
    const bg = templateBackgroundFor("empty");
    const scene = buildSceneFromTemplate("empty", {
      name: `Scene ${(projectRef.current.scenes?.length ?? 0) + 1}`,
      width: projectRef.current.renderSettings?.canvasWidth ?? 1920,
      height: projectRef.current.renderSettings?.canvasHeight ?? 1080,
      characters: projectRef.current.characters,
      background: bg.background,
      backgroundFill: bg.backgroundFill,
    });
    commit("Создана пустая сцена", (draft) => {
      (draft.scenes ??= []).push(scene);
      draft.activeSceneId = scene.id;
      draft.montage = syncMontageWithScenes(draft.montage, draft.scenes);
      draft.series = syncSeriesWithScenes(draft.series, draft.scenes, draft.name);
    });
    setCurrentSceneIdState(scene.id);
    setSelectedActorIdState(null);
    setSelectedPropIdState(null);
    setSelectedAttachmentId(null);
    setTime(0);
    setPlaying(false);
    setStatus("Пустая сцена — справа «Фон сцены»: цвет / градиент / PNG");
  }, [commit]);

  const newSceneFromTemplate = useCallback((templateId: SceneTemplateId) => {
    const bg = templateBackgroundFor(templateId);
    const scene = buildSceneFromTemplate(templateId, {
      name: `Scene ${(projectRef.current.scenes?.length ?? 0) + 1}`,
      width: projectRef.current.renderSettings?.canvasWidth ?? 1920,
      height: projectRef.current.renderSettings?.canvasHeight ?? 1080,
      characters: projectRef.current.characters,
      background: bg.background,
      backgroundFill: bg.backgroundFill,
    });
    commit(`Scene из шаблона ${templateId}`, (draft) => {
      (draft.scenes ??= []).push(scene);
      draft.activeSceneId = scene.id;
      draft.montage = syncMontageWithScenes(draft.montage, draft.scenes);
      draft.series = syncSeriesWithScenes(draft.series, draft.scenes, draft.name);
    });
    setCurrentSceneIdState(scene.id);
    setSelectedActorIdState(scene.actors[0]?.id ?? null);
    setSelectedPropIdState(null);
    setSelectedAttachmentId(null);
    setTime(0);
    setPlaying(false);
    setStatus(`Сцена из шаблона: ${templateId} · фон справа в Свойствах`);
  }, [commit]);
  const duplicateScene = useCallback(() => { const clone = structuredClone(currentScene); clone.id = createId("scene"); clone.name = `${clone.name} Copy`; clone.actors = clone.actors.map((actor) => ({ ...actor, id: createId("actor") })); clone.generatedTimeline = undefined; clone.actionSequence = []; commit("Scene дублирована", (draft) => { draft.scenes!.push(clone); draft.activeSceneId = clone.id; draft.montage = syncMontageWithScenes(draft.montage, draft.scenes); draft.series = syncSeriesWithScenes(draft.series, draft.scenes, draft.name); }); setCurrentSceneIdState(clone.id); setSelectedActorIdState(clone.actors[0]?.id ?? null); }, [commit, currentScene]);
  const renameScene = useCallback(() => { const name = window.prompt("Название сцены", currentScene.name)?.trim(); if (name) commit("Сцена переименована", (draft) => { const scene = draft.scenes!.find((item) => item.id === currentScene.id); if (scene) scene.name = name; }); }, [commit, currentScene]);
  const setSceneDuration = useCallback((seconds: number) => {
    const next = Math.max(0.5, Math.min(600, Number(seconds) || 0.5));
    commit("Длительность сцены", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id);
      if (!scene) return;
      scene.duration = next;
      if (scene.generatedTimeline) {
        scene.generatedTimeline.duration = Math.max(scene.generatedTimeline.duration, next);
      }
      if (draft.renderSettings && !montageMode) {
        draft.renderSettings = { ...draft.renderSettings, duration: next };
      }
    });
    if (timeRef.current > next) setTime(next);
  }, [commit, currentScene.id, montageMode]);
  const askConfirm = useCallback(async (message: string, title?: string) => {
    if (desktop.confirm) return desktop.confirm(message, title);
    return window.confirm(message);
  }, [desktop]);
  const deleteScene = useCallback((sceneId?: string) => withErrors(async () => {
    const scenes = projectRef.current.scenes ?? [];
    if (scenes.length <= 1) {
      setError("В проекте должна остаться минимум одна сцена.");
      return;
    }
    const targetId = sceneId ?? currentSceneId;
    const target = scenes.find((scene) => scene.id === targetId);
    if (!target) {
      setError("Сцена не найдена.");
      return;
    }
    const ok = await askConfirm(`Удалить сцену «${target.name}»?\nЭто действие можно отменить через Undo.`, "Удаление сцены");
    if (!ok) return;
    const next = scenes.find((scene) => scene.id !== target.id);
    if (!next) {
      setError("В проекте должна остаться минимум одна сцена.");
      return;
    }
    commit("Сцена удалена", (draft) => {
      draft.scenes = draft.scenes!.filter((scene) => scene.id !== target.id);
      draft.activeSceneId = next.id;
      draft.montage = syncMontageWithScenes(draft.montage, draft.scenes);
      draft.series = syncSeriesWithScenes(draft.series, draft.scenes, draft.name);
    });
    setCurrentSceneIdState(next.id);
    setSelectedActorIdState(next.actors[0]?.id ?? null);
    setSelectedPropIdState(null);
    setStatus(`Удалена сцена «${target.name}»`);
  }), [askConfirm, commit, currentSceneId, withErrors]);
  const addActor = useCallback((characterId: string) => { const definition = project.characters.find((character) => character.id === characterId); if (!definition) return; const id = createId("actor"); commit("Actor добавлен", (draft) => { draft.scenes!.find((scene) => scene.id === currentScene.id)!.actors.push({ id, name: `${definition.name} ${(currentScene.actors.length + 1)}`, characterId, position: { x: currentScene.width / 2, y: currentScene.height / 2 }, scale: .75, rotation: 0, facingDirection: "Right", visible: true }); }); setSelectedActorIdState(id); }, [commit, currentScene, project.characters]);

  const deleteActor = useCallback((actorId: string) => {
    commit("Актёр удалён со сцены", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id);
      if (!scene) return;
      scene.actors = scene.actors.filter((item) => item.id !== actorId);
      scene.actionSequence = scene.actionSequence.filter((action) => action.actorId !== actorId && action.targetActorId !== actorId);
      scene.dialogues = (scene.dialogues ?? []).map((line) => (line.actorId === actorId ? { ...line, actorId: null } : line));
      scene.attachments = (scene.attachments ?? []).filter((item) => item.actorId !== actorId);
      delete scene.generatedTimeline;
    });
    setSelectedActorIdState(null);
    setSelectedPartId(null);
    setStatus("Актёр удалён — Build Timeline при необходимости");
  }, [commit, currentScene.id]);

  const deleteProp = useCallback((propId: string) => {
    commit("Предмет удалён со сцены", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id);
      if (!scene) return;
      scene.props = scene.props.filter((item) => item.id !== propId);
    });
    setSelectedPropIdState(null);
    setStatus("Предмет удалён");
  }, [commit, currentScene.id]);

  const clearSceneBackground = useCallback(() => {
    commit("Фон сцены убран", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id);
      if (scene) delete scene.backgroundAssetId;
    });
    setStatus("Фон убран");
  }, [commit, currentScene.id]);

  const setSceneBackgroundColor = useCallback((color: string) => {
    const next = applySolidColor(color);
    commit("Цвет фона сцены", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id);
      if (!scene) return;
      scene.background = next.background;
      scene.backgroundFill = next.backgroundFill;
    });
  }, [commit, currentScene.id]);

  const setSceneBackgroundFill = useCallback((fill: SceneBackgroundFill, backgroundHex?: string) => {
    const next = fill.mode === "gradient"
      ? applyGradientColors(fill.top, fill.bottom, fill.horizon, fill.softness)
      : applySolidColor(backgroundHex ?? currentScene.background);
    commit(fill.mode === "gradient" ? "Градиент фона сцены" : "Заливка фона сцены", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id);
      if (!scene) return;
      scene.background = next.background;
      scene.backgroundFill = next.backgroundFill;
    });
  }, [commit, currentScene.background, currentScene.id]);

  const applySceneBackgroundPreset = useCallback((preset: SceneBackgroundPreset) => {
    const next = applyBackgroundPreset(preset);
    commit(`Пресет фона: ${preset.label}`, (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id);
      if (!scene) return;
      scene.background = next.background;
      scene.backgroundFill = next.backgroundFill;
    });
    setStatus(`Фон: ${preset.label}`);
  }, [commit, currentScene.id]);

  const syncExportBackgroundFromScene = useCallback(() => {
    commit("Цвет экспорта ← сцена", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id);
      if (!scene || !draft.renderSettings) return;
      draft.renderSettings = {
        ...draft.renderSettings,
        backgroundColor: scene.background,
        transparentBackground: false,
      };
    });
    setStatus("Цвет экспорта взят из сцены");
  }, [commit, currentScene.id]);

  const nudgePropLayer = useCallback((propId: string, delta: number) => {
    commit(delta > 0 ? "Предмет выше" : "Предмет ниже", (draft) => {
      const prop = draft.scenes!.find((item) => item.id === currentScene.id)?.props.find((item) => item.id === propId);
      if (prop) prop.zIndex = Math.max(-1000, Math.min(10000, prop.zIndex + delta));
    });
  }, [commit, currentScene.id]);

  const setPropVisible = useCallback((propId: string, visible: boolean) => {
    commit(visible ? "Предмет показан" : "Предмет скрыт", (draft) => {
      const prop = draft.scenes!.find((item) => item.id === currentScene.id)?.props.find((item) => item.id === propId);
      if (prop) prop.visible = visible;
    });
  }, [commit, currentScene.id]);

  const setActorVisible = useCallback((actorId: string, visible: boolean) => {
    commit(visible ? "Актёр показан" : "Актёр скрыт", (draft) => {
      const actor = draft.scenes!.find((item) => item.id === currentScene.id)?.actors.find((item) => item.id === actorId);
      if (actor) actor.visible = visible;
    });
  }, [commit, currentScene.id]);

  const duplicateProp = useCallback((propId: string) => {
    const source = currentScene.props.find((item) => item.id === propId);
    if (!source) return;
    const id = createId("prop");
    commit("Предмет скопирован", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.props.push({
        ...structuredClone(source),
        id,
        name: `${source.name} копия`,
        position: { x: source.position.x + 40, y: source.position.y + 40 },
        zIndex: source.zIndex + 1,
      });
    });
    setSelectedPropIdState(id);
    setSelectedActorIdState(null);
    setTool("move");
  }, [commit, currentScene.id, currentScene.props]);

  const duplicateActor = useCallback((actorId: string) => {
    const source = currentScene.actors.find((item) => item.id === actorId);
    if (!source) return;
    const id = createId("actor");
    commit("Актёр скопирован", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.actors.push({
        ...structuredClone(source),
        id,
        name: `${source.name} копия`,
        position: { x: source.position.x + 60, y: source.position.y },
      });
    });
    setSelectedActorIdState(id);
    setSelectedPropIdState(null);
    setTool("move");
  }, [commit, currentScene.actors, currentScene.id]);

  const reorderActor = useCallback((actorId: string, direction: -1 | 1) => {
    commit(direction > 0 ? "Актёр ближе" : "Актёр дальше", (draft) => {
      const actors = draft.scenes!.find((item) => item.id === currentScene.id)!.actors;
      const index = actors.findIndex((item) => item.id === actorId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= actors.length) return;
      [actors[index], actors[target]] = [actors[target]!, actors[index]!];
    });
  }, [commit, currentScene.id]);

  const alignSelection = useCallback((mode: "center" | "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter") => {
    const scene = currentScene;
    const w = scene.width;
    const h = scene.height;
    if (selectedPropId) {
      commit("Выравнивание предмета", (draft) => {
        const prop = draft.scenes!.find((item) => item.id === scene.id)?.props.find((item) => item.id === selectedPropId);
        if (!prop) return;
        if (mode === "center" || mode === "hcenter") prop.position.x = w / 2;
        if (mode === "center" || mode === "vcenter") prop.position.y = h / 2;
        if (mode === "left") prop.position.x = w * 0.2;
        if (mode === "right") prop.position.x = w * 0.8;
        if (mode === "top") prop.position.y = h * 0.25;
        if (mode === "bottom") prop.position.y = h * 0.75;
      });
      return;
    }
    if (selectedActorId) {
      commit("Выравнивание актёра", (draft) => {
        const actor = draft.scenes!.find((item) => item.id === scene.id)?.actors.find((item) => item.id === selectedActorId);
        if (!actor) return;
        if (mode === "center" || mode === "hcenter") actor.position.x = w / 2;
        if (mode === "center" || mode === "vcenter") actor.position.y = h / 2;
        if (mode === "left") actor.position.x = w * 0.2;
        if (mode === "right") actor.position.x = w * 0.8;
        if (mode === "top") actor.position.y = h * 0.35;
        if (mode === "bottom") actor.position.y = h * 0.8;
      });
    }
  }, [commit, currentScene, selectedActorId, selectedPropId]);

  const deleteAsset = useCallback((assetId: string) => withErrors(async () => {
    const asset = projectRef.current.assets.find((item) => item.id === assetId);
    if (!asset) return;
    const usedAsProp = (projectRef.current.scenes ?? []).some((scene) => scene.props.some((prop) => prop.assetId === assetId));
    const usedAsBg = (projectRef.current.scenes ?? []).some((scene) => scene.backgroundAssetId === assetId);
    const usedAsPart = projectRef.current.characters.some((character) => character.parts.some((part) => part.assetId === assetId));
    const usedAsAttach = (projectRef.current.scenes ?? []).some((scene) => (scene.attachments ?? []).some((item) => item.assetId === assetId));
    const warn = usedAsProp || usedAsBg || usedAsPart || usedAsAttach
      ? `«${asset.name}» используется на сцене/в риге. Удалить везде?`
      : `Удалить картинку «${asset.name}» из проекта?`;
    const ok = desktop.confirm ? await desktop.confirm(warn, "Удаление картинки") : window.confirm(warn);
    if (!ok) return;
    commit(`Картинка удалена: ${asset.name}`, (draft) => {
      draft.assets = draft.assets.filter((item) => item.id !== assetId);
      for (const character of draft.characters) {
        character.parts = character.parts.filter((part) => part.assetId !== assetId);
        character.bindPose = captureBindPose(character);
      }
      for (const scene of draft.scenes ?? []) {
        scene.props = scene.props.filter((prop) => prop.assetId !== assetId);
        if (scene.backgroundAssetId === assetId) delete scene.backgroundAssetId;
        scene.attachments = (scene.attachments ?? []).filter((item) => item.assetId !== assetId);
      }
    });
    if (selectedPropId) {
      const selected = currentScene.props.find((prop) => prop.id === selectedPropId);
      if (selected?.assetId === assetId) setSelectedPropIdState(null);
    }
    setStatus(`Удалено: ${asset.name}`);
  }), [commit, currentScene.props, desktop, selectedPropId, withErrors]);

  const addAction = useCallback((type: ActionType = "Idle") => { const actorId = type === "CameraShake" ? null : selectedActor?.id ?? null; commit("Action добавлен", (draft) => { draft.scenes!.find((scene) => scene.id === currentScene.id)!.actionSequence.push({ id: createId("action"), actorId, type, targetActorId: null, duration: 1, startMode: "AfterPrevious", parameters: {} }); }); }, [commit, currentScene.id, selectedActor?.id]);
  const updateAction = useCallback((actionId: string, patch: Partial<Omit<SceneAction, "parameters">> & { parameters?: Partial<SceneActionParameters> }) => { commit("Action изменён", (draft) => { const action = draft.scenes!.find((scene) => scene.id === currentScene.id)!.actionSequence.find((item) => item.id === actionId); if (action) { const { parameters, ...fields } = patch; Object.assign(action, fields); if (parameters) Object.assign(action.parameters, parameters); } }); }, [commit, currentScene.id]);
  const deleteAction = useCallback((actionId: string) => commit("Action удалён", (draft) => { const scene = draft.scenes!.find((item) => item.id === currentScene.id)!; scene.actionSequence = scene.actionSequence.filter((action) => action.id !== actionId); }), [commit, currentScene.id]);
  const duplicateAction = useCallback((actionId: string) => commit("Action дублирован", (draft) => { const scene = draft.scenes!.find((item) => item.id === currentScene.id)!; const index = scene.actionSequence.findIndex((action) => action.id === actionId); if (index >= 0) scene.actionSequence.splice(index + 1, 0, { ...structuredClone(scene.actionSequence[index]), id: createId("action") }); }), [commit, currentScene.id]);
  const moveAction = useCallback((actionId: string, direction: -1 | 1) => commit("Action перемещён", (draft) => { const actions = draft.scenes!.find((item) => item.id === currentScene.id)!.actionSequence; const index = actions.findIndex((action) => action.id === actionId); const target = index + direction; if (index >= 0 && target >= 0 && target < actions.length) [actions[index], actions[target]] = [actions[target], actions[index]]; }), [commit, currentScene.id]);
  const buildTimeline = useCallback((options?: { resetPlayhead?: boolean }): boolean => {
    const sceneNow = projectRef.current.scenes?.find((item) => item.id === currentScene.id) ?? currentScene;
    if (sceneNow.generatedTimeline?.manualEdits && !window.confirm("Generated Timeline содержит ручные правки. Пересобрать и заменить их?")) return false;
    commit("Timeline построен из Actions", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.generatedTimeline = new ActionCompiler().compile(scene);
      scene.duration = Math.max(scene.duration, scene.generatedTimeline.duration);
    });
    if (options?.resetPlayhead !== false) {
      setTime(0);
      setPreviewMotionState(null);
    }
    setStatus("Timeline собран из Actions");
    return true;
  }, [commit, currentScene]);
  const markTimelineManual = useCallback(() => { if (!currentScene.generatedTimeline) return; commit("Ручная правка Generated Timeline", (draft) => { const timeline = draft.scenes!.find((item) => item.id === currentScene.id)!.generatedTimeline; if (timeline) timeline.manualEdits = true; }); }, [commit, currentScene]);

  const insertMotionSegment = useCallback((motion: MotionName, options?: { actorId?: string; startTime?: number; duration?: number }) => {
    const actorId = options?.actorId ?? selectedActorRef.current;
    if (!actorId) {
      setStatus("Выберите актёра — затем поставьте анимацию на участок");
      return;
    }
    const startTime = Math.max(0, options?.startTime ?? timeRef.current);
    const duration = Math.max(0.05, options?.duration ?? (motion === "Walk" || motion === "Run" ? 2 : defaultGestureDuration(motion as ActionType)));
    commit(`Анимация: ${motion}`, (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      const generated = ensureSceneGeneratedTimeline(scene);
      generated.duration = Math.max(generated.duration, scene.duration, startTime + duration);
      scene.duration = Math.max(scene.duration, generated.duration);
      generated.motionSegments.push({
        id: createId("motion"),
        actorId,
        motion,
        start: startTime,
        duration,
        intensity: 1,
        hold: ["Angry", "Happy", "Scared", "Fall"].includes(motion),
      });
      generated.manualEdits = true;
    });
    setRequestedTimelineMode("scene");
    setStatus(`«${MOTION_LABELS_RU[motion] ?? motion}» ${startTime.toFixed(1)}–${(startTime + duration).toFixed(1)}с на таймлайне`);
  }, [commit, currentScene.id]);

  const insertDirectorAction = useCallback((type: ActionType, options?: { actorId?: string; startTime?: number; duration?: number }) => {
    const actorId = options?.actorId ?? selectedActorRef.current;
    if (type !== "CameraShake" && !actorId) {
      setStatus("Выберите актёра для анимации");
      return;
    }
    const startTime = options?.startTime ?? timeRef.current;
    const duration = options?.duration ?? defaultGestureDuration(type);
    const gestureMotions = new Set<ActionType>([
      "Idle", "Wave", "Talk", "Happy", "Angry", "Surprised", "Scared", "Laugh", "Jump", "Attack", "Hit", "Fall",
    ]);

    if (actorId && gestureMotions.has(type)) {
      insertMotionSegment(type as MotionName, { actorId, startTime, duration });
      commit(`Жест в Actions: ${type}`, (draft) => {
        const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
        scene.actionSequence.push(buildGestureAction(actorId, type, startTime, duration));
      });
      return;
    }

    const action = buildGestureAction(actorId ?? "camera", type, startTime, duration);
    commit(`Director: ${type}`, (draft) => {
      draft.scenes!.find((scene) => scene.id === currentScene.id)!.actionSequence.push(action);
    });
    buildTimeline({ resetPlayhead: false });
    setStatus(`Вставлено ${type} @ ${startTime.toFixed(2)}s`);
  }, [buildTimeline, commit, currentScene.id, insertMotionSegment]);

  const commitActorPath = useCallback((points: Vec2[], options?: { actorId?: string; mode?: DirectorLocomotion; startTime?: number }) => {
    const actorId = options?.actorId ?? selectedActorRef.current;
    if (!actorId) {
      setStatus("Выберите актёра для пути");
      return;
    }
    const scene = projectRef.current.scenes?.find((item) => item.id === currentScene.id) ?? currentScene;
    const actor = scene.actors.find((item) => item.id === actorId);
    if (!actor) return;
    const runtime = new SceneRuntime().setTime(scene, projectRef.current.characters, timeRef.current, {
      moveStyle: "slide",
    });
    const pose = runtime.actors[actorId];
    const origin = {
      x: pose?.position.x ?? actor.position.x,
      y: pose?.position.y ?? actor.position.y,
    };
    // Connect from current pose to the stroke, then follow the drawn line exactly (X and Y).
    const seeded = points.length && Math.hypot(points[0]!.x - origin.x, points[0]!.y - origin.y) > 12
      ? [origin, ...points]
      : points.length ? points : [origin];
    const mode = options?.mode ?? directorLocomotion;
    const startTime = options?.startTime ?? timeRef.current;
    const baked = bakeDirectorPath(seeded, { mode, startTime });
    if (!baked || baked.keys.length < 2) {
      setStatus("Путь слишком короткий");
      return;
    }
    const endTime = baked.startTime + baked.duration;
    commit(`Путь ${mode}: ${baked.keys.length} ключей`, (draft) => {
      const target = draft.scenes!.find((item) => item.id === currentScene.id)!;
      const live = target.actors.find((item) => item.id === actorId);
      const generated = ensureSceneGeneratedTimeline(target);
      generated.duration = Math.max(generated.duration, target.duration, endTime + 0.05);
      target.duration = Math.max(target.duration, generated.duration);

      // Replace dense/old X/Y keys for this actor — path owns position.
      generated.actorTracks = generated.actorTracks.filter(
        (track) => !(track.actorId === actorId && (track.property === "x" || track.property === "y")),
      );
      const xTrack = {
        id: createId("path-x"),
        actorId,
        property: "x" as const,
        keyframes: baked.keys.map((key) => ({
          id: createId("path-key"),
          time: key.time,
          value: key.x,
          easing: "linear" as const,
        })),
      };
      const yTrack = {
        id: createId("path-y"),
        actorId,
        property: "y" as const,
        keyframes: baked.keys.map((key) => ({
          id: createId("path-key"),
          time: key.time,
          value: key.y,
          easing: "linear" as const,
        })),
      };
      generated.actorTracks.push(xTrack, yTrack);

      // One Walk/Run block for the whole path — not a Walk segment per vertex.
      generated.motionSegments = generated.motionSegments.filter(
        (segment) => !(segment.actorId === actorId && segment.start < endTime && segment.start + segment.duration > baked.startTime),
      );
      generated.motionSegments.push({
        id: createId("path-motion"),
        actorId,
        motion: baked.motion,
        start: baked.startTime,
        duration: Math.max(0.15, baked.duration),
        intensity: 1,
      });

      const last = baked.keys[baked.keys.length - 1]!;
      if (live) {
        live.position = { x: last.x, y: last.y };
        const first = baked.keys[0]!;
        const dx = last.x - first.x;
        if (Math.abs(dx) > 8) live.facingDirection = dx < 0 ? "Left" : "Right";
      }

      // Bookkeeping only — do NOT rebuild timeline (that flooded keys + shoved X).
      target.actionSequence.push(...buildPathActions({
        actorId,
        points: baked.points,
        mode,
        startTime: baked.startTime,
        groundY: last.y,
        lockGroundY: false,
      }));
      generated.manualEdits = true;
    });
    setRequestedTimelineMode("scene");
    setTool("move");
    setStatus(`Путь: ${baked.keys.length} ключей (не сотни) · строго по линии · ▶ Play`);
  }, [commit, currentScene, directorLocomotion]);

  const updateRenderSettings = useCallback((settings: RenderSettings) => {
    commit("Настройки рендера обновлены", (draft) => {
      const prev = draft.renderSettings;
      draft.renderSettings = settings;
      draft.canvas = { width: settings.canvasWidth, height: settings.canvasHeight, background: settings.transparentBackground ? "#00000000" : settings.backgroundColor };
      draft.fps = ([24, 25, 30, 50, 60].includes(settings.fps) ? settings.fps : 30) as ProjectDocument["fps"];
      for (const scene of draft.scenes ?? []) {
        const prevW = scene.width;
        const prevH = scene.height;
        scene.width = settings.canvasWidth;
        scene.height = settings.canvasHeight;
        // Keep framing centered when switching 16:9 ↔ 9:16 (avoid offset safe-frame vs fill).
        if (prevW !== settings.canvasWidth || prevH !== settings.canvasHeight) {
          scene.camera = {
            ...scene.camera,
            x: settings.canvasWidth / 2,
            y: settings.canvasHeight / 2,
          };
        }
      }
      // Export «Фон» color → текущая сцена сразу (не нужен Save).
      const colorChanged = prev?.backgroundColor !== settings.backgroundColor
        || prev?.transparentBackground !== settings.transparentBackground;
      if (colorChanged && !settings.transparentBackground) {
        const scene = draft.scenes?.find((item) => item.id === currentSceneId);
        if (scene) {
          const next = applySolidColor(settings.backgroundColor);
          scene.background = next.background;
          scene.backgroundFill = next.backgroundFill;
        }
      }
    });
  }, [commit, currentSceneId]);
  const chooseExportDirectory = useCallback(() => withErrors(async () => {
    const result = await desktop.chooseDirectory(projectRef.current.renderSettings?.outputDirectory);
    if (!result.canceled && result.path) updateRenderSettings({ ...(projectRef.current.renderSettings ?? renderSettings), outputDirectory: result.path });
  }), [desktop, renderSettings, updateRenderSettings, withErrors]);
  const exportCurrentFrame = useCallback(() => withErrors(async () => {
    setPlaying(false);
    await ensureAmplitudeEnvelopes();
    const settings = projectRef.current.renderSettings ?? renderSettings;
    const result = await exportController.exportCurrentFrame(projectRef.current, currentScene, settings, timeRef.current);
    setStatus(result.phase === "completed" ? `Кадр сохранён: ${result.outputPath}` : result.error ?? "Экспорт кадра завершён");
    if (result.phase === "failed") setError(formatExportUserError(result.error, { logPath: result.ffmpegLogPath, kind: result.kind }));
  }), [currentScene, ensureAmplitudeEnvelopes, exportController, renderSettings, withErrors]);
  const exportPngSequence = useCallback(() => withErrors(async () => {
    setPlaying(false);
    await ensureAmplitudeEnvelopes();
    const settings = projectRef.current.renderSettings ?? renderSettings;
    const result = await exportController.exportPngSequence(projectRef.current, currentScene, settings);
    setStatus(result.phase === "completed" ? `PNG sequence: ${result.outputPath}` : formatExportStatusError(result.error) ?? "Экспорт sequence завершён");
    if (result.phase === "failed") setError(formatExportUserError(result.error, { logPath: result.ffmpegLogPath, kind: result.kind }));
  }), [currentScene, ensureAmplitudeEnvelopes, exportController, renderSettings, withErrors]);
  const exportVideo = useCallback(() => withErrors(async () => {
    setPlaying(false);
    await ensureAmplitudeEnvelopes();
    const settings = projectRef.current.renderSettings ?? renderSettings;
    const result = await exportController.exportVideo(projectRef.current, currentScene, settings);
    setStatus(result.phase === "completed" ? `Видео сохранено: ${result.outputPath}` : formatExportStatusError(result.error) ?? "Экспорт видео завершён");
    if (result.phase === "failed") setError(formatExportUserError(result.error, { logPath: result.ffmpegLogPath, kind: result.kind }));
  }), [currentScene, ensureAmplitudeEnvelopes, exportController, renderSettings, withErrors]);
  const exportMontageVideo = useCallback(() => withErrors(async () => {
    setPlaying(false);
    await ensureAmplitudeEnvelopes();
    const settings = projectRef.current.renderSettings ?? renderSettings;
    const result = await exportController.exportMontageVideo(projectRef.current, settings);
    setStatus(result.phase === "completed" ? `Монтаж сохранён: ${result.outputPath}` : formatExportStatusError(result.error) ?? "Экспорт монтажа завершён");
    if (result.phase === "failed") setError(formatExportUserError(result.error, { logPath: result.ffmpegLogPath, kind: "montage" }));
  }), [ensureAmplitudeEnvelopes, exportController, renderSettings, withErrors]);
  const exportMontagePngSequence = useCallback(() => withErrors(async () => {
    setPlaying(false);
    await ensureAmplitudeEnvelopes();
    const settings = projectRef.current.renderSettings ?? renderSettings;
    const result = await exportController.exportMontagePngSequence(projectRef.current, settings);
    setStatus(result.phase === "completed" ? `Montage PNG: ${result.outputPath}` : formatExportStatusError(result.error) ?? "Экспорт montage sequence завершён");
    if (result.phase === "failed") setError(formatExportUserError(result.error, { logPath: result.ffmpegLogPath, kind: "montage" }));
  }), [ensureAmplitudeEnvelopes, exportController, renderSettings, withErrors]);
  const exportSeriesPack = useCallback(() => withErrors(async () => {
    setPlaying(false);
    await ensureAmplitudeEnvelopes();
    const settings = projectRef.current.renderSettings ?? renderSettings;
    const result = await exportController.exportSeriesPack(projectRef.current, settings);
    setStatus(result.phase === "completed" ? `Series pack: ${result.outputPath}` : formatExportStatusError(result.error) ?? "Экспорт Series завершён");
    if (result.phase === "failed") setError(formatExportUserError(result.error, { logPath: result.ffmpegLogPath, kind: result.kind }));
  }), [ensureAmplitudeEnvelopes, exportController, renderSettings, withErrors]);
  const cancelExport = useCallback(() => { exportController.requestCancel(); setStatus("Отмена экспорта…"); }, [exportController]);
  const openExportOutput = useCallback(() => withErrors(async () => {
    const target = exportState.outputPath;
    if (!target) return;
    const result = await desktop.openPath(target);
    if (!result.ok) throw new Error(result.error ?? "Не удалось открыть путь");
  }), [desktop, exportState.outputPath, withErrors]);

  const importAudio = useCallback(() => withErrors(async () => {
    const result = await desktop.importAudio();
    if (result.canceled || !result.data?.length) return;
    commit(`Импортировано аудио: ${result.data.length}`, (draft) => {
      draft.audioAssets = draft.audioAssets ?? [];
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.audioTracks = scene.audioTracks ?? [];
      for (const item of result.data!) {
        const assetId = createId("audio");
        draft.audioAssets.push({ id: assetId, name: item.name, path: item.path, mediaType: item.mediaType, duration: item.duration });
        scene.audioTracks.push(createEmptyAudioTrack({
          id: createId("atrack"),
          assetId,
          name: item.name,
          duration: item.duration,
          startTime: timeRef.current,
        }));
      }
    });
  }), [commit, currentScene.id, desktop, withErrors]);

  const synthesizeDialogue = useCallback(() => withErrors(async () => {
    const text = window.prompt("Текст для локальной озвучки (Piper / Chatterbox)", "Привет! Это тест голоса.")?.trim();
    if (!text) return;
    const temp = await desktop.createTempDir("kcs-tts-");
    if (!temp.ok || !temp.path) throw new Error(temp.error ?? "Не удалось создать temp для TTS");
    const outPath = await desktop.joinPath(temp.path, `speech-${Date.now()}.wav`);
    const listed = await desktop.listSpeechVoices({
      extraFolders: speechSettingsRef.current.extraPiperFolders,
      extraModels: speechSettingsRef.current.customPiperModels.map((item) => ({
        name: item.name,
        modelPath: item.modelPath,
        culture: item.culture,
        gender: item.gender,
      })),
    });
    const piperVoice = pickPiperVoice(listed.ok ? listed.voices : []);
    const speaker = projectRef.current.scenes?.find((s) => s.id === currentScene.id)?.actors.find((a) => a.id === selectedActorRef.current)?.name ?? "";
    const spoken = await desktop.synthesizeSpeech(
      text,
      outPath,
      piperVoice ? piperSpeakOptions(piperVoice) : resolveSpeakOptions(speaker, speechSettingsRef.current, listed.ok ? listed.voices : []),
    );
    if (!spoken.ok || !spoken.path) {
      throw new Error(spoken.error ?? "Локальный TTS не удался. Нужен Piper или Chatterbox (Windows-робот отключён).");
    }
    const duration = spoken.duration ?? estimateSpeechDuration(text);
    commit("Добавлена локальная TTS-дорожка", (draft) => {
      draft.audioAssets = draft.audioAssets ?? [];
      const assetId = createId("audio");
      draft.audioAssets.push({ id: assetId, name: text.slice(0, 40), path: spoken.path!, mediaType: "audio/wav", duration });
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.audioTracks = scene.audioTracks ?? [];
      scene.dialogues = scene.dialogues ?? [];
      const trackId = createId("atrack");
      scene.audioTracks.push(createEmptyAudioTrack({ id: trackId, assetId, name: "TTS", duration, startTime: timeRef.current }));
      scene.dialogues.push(createEmptyDialogue({
        id: createId("dlg"),
        actorId: selectedActorRef.current,
        text,
        startTime: timeRef.current,
        duration,
        audioTrackId: trackId,
      }));
    });
    setStatus("Локальный TTS добавлен на timeline");
  }), [commit, currentScene.id, desktop, withErrors]);

  const synthesizeDialogueLine = useCallback((dialogueId: string) => withErrors(async () => {
    const scene = projectRef.current.scenes?.find((item) => item.id === currentScene.id);
    const line = scene?.dialogues?.find((item) => item.id === dialogueId);
    if (!line) throw new Error("Реплика не найдена.");
    const text = line.text.trim();
    if (!text || text === "Новая реплика") {
      throw new Error("Сначала впишите текст реплики (под Timeline или вкладка Аудио справа).");
    }
    const temp = await desktop.createTempDir("kcs-tts-");
    if (!temp.ok || !temp.path) throw new Error(temp.error ?? "Не удалось создать temp для TTS");
    const outPath = await desktop.joinPath(temp.path, `speech-${Date.now()}.wav`);
    const listed = await desktop.listSpeechVoices({
      extraFolders: speechSettingsRef.current.extraPiperFolders,
      extraModels: speechSettingsRef.current.customPiperModels.map((item) => ({
        name: item.name,
        modelPath: item.modelPath,
        culture: item.culture,
        gender: item.gender,
      })),
    });
    const piperVoice = pickPiperVoice(listed.ok ? listed.voices : []);
    const speaker = scene?.actors.find((a) => a.id === (line.actorId ?? selectedActorRef.current))?.name ?? "";
    const spoken = await desktop.synthesizeSpeech(
      text,
      outPath,
      piperVoice ? piperSpeakOptions(piperVoice) : resolveSpeakOptions(speaker, speechSettingsRef.current, listed.ok ? listed.voices : []),
    );
    if (!spoken.ok || !spoken.path) {
      throw new Error(spoken.error ?? "Локальный TTS не удался. Нужен Piper или Chatterbox (кнопка Voice).");
    }
    const duration = spoken.duration ?? estimateSpeechDuration(text);
    const startTime = line.startTime;
    commit("Реплика озвучена (TTS)", (draft) => {
      draft.audioAssets = draft.audioAssets ?? [];
      const assetId = createId("audio");
      draft.audioAssets.push({ id: assetId, name: text.slice(0, 40), path: spoken.path!, mediaType: "audio/wav", duration });
      const nextScene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      nextScene.audioTracks = nextScene.audioTracks ?? [];
      const trackId = createId("atrack");
      nextScene.audioTracks.push(createEmptyAudioTrack({
        id: trackId,
        assetId,
        name: `TTS: ${text.slice(0, 24)}`,
        duration,
        startTime,
      }));
      const target = nextScene.dialogues?.find((item) => item.id === dialogueId);
      if (target) {
        target.audioTrackId = trackId;
        target.duration = duration;
      }
      nextScene.duration = Math.max(nextScene.duration, startTime + duration + 0.25);
    });
    setStatus("Реплика озвучена — появилась аудиодорожка");
    setRequestedRightTab("audio");
  }), [commit, currentScene.id, desktop, withErrors]);

  const addDialogue = useCallback(() => {
    commit("Dialogue добавлен", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.dialogues = scene.dialogues ?? [];
      scene.dialogues.push(createEmptyDialogue({
        id: createId("dlg"),
        actorId: selectedActorRef.current,
        text: "Новая реплика",
        startTime: timeRef.current,
        duration: 2,
      }));
    });
    setRequestedRightTab("audio");
  }, [commit, currentScene.id]);

  const updateDialogue = useCallback((id: string, patch: Partial<DialogueLine>) => {
    commit("Dialogue изменён", (draft) => {
      const line = draft.scenes!.find((item) => item.id === currentScene.id)!.dialogues?.find((item) => item.id === id);
      if (line) Object.assign(line, patch);
    });
  }, [commit, currentScene.id]);

  const deleteDialogue = useCallback((id: string) => {
    commit("Dialogue удалён", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.dialogues = (scene.dialogues ?? []).filter((item) => item.id !== id);
    });
  }, [commit, currentScene.id]);

  const updateAudioTrack = useCallback((id: string, patch: Partial<SceneAudioTrack>) => {
    commit("Audio track изменён", (draft) => {
      const track = draft.scenes!.find((item) => item.id === currentScene.id)!.audioTracks?.find((item) => item.id === id);
      if (track) Object.assign(track, patch);
    });
  }, [commit, currentScene.id]);

  const deleteAudioTrack = useCallback((id: string) => {
    commit("Audio track удалён", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.audioTracks = (scene.audioTracks ?? []).filter((item) => item.id !== id);
      for (const line of scene.dialogues ?? []) if (line.audioTrackId === id) line.audioTrackId = null;
    });
    audioEngine.pauseAll();
  }, [audioEngine, commit, currentScene.id]);

  const updateSubtitleSettings = useCallback((settings: SubtitleSettings) => {
    commit("Subtitles обновлены", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.subtitleSettings = createDefaultSubtitleSettings(settings);
    });
  }, [commit, currentScene.id]);

  const updateLipSyncSettings = useCallback((settings: LipSyncSettings) => {
    commit("Lip sync обновлён", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.lipSyncSettings = createDefaultLipSyncSettings(settings);
    });
  }, [commit, currentScene.id]);

  const syncDialogueToLinkedTrack = useCallback((dialogueId: string) => {
    commit("Dialogue синхронизирован с audio track", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      const line = scene.dialogues?.find((item) => item.id === dialogueId);
      if (!line?.audioTrackId) return;
      const track = scene.audioTracks?.find((item) => item.id === line.audioTrackId);
      if (!track) return;
      Object.assign(line, syncDialogueToTrack(line, track));
    });
  }, [commit, currentScene.id]);

  const exportSubtitlesSrt = useCallback(() => withErrors(async () => {
    const settings = createDefaultSubtitleSettings(currentScene.subtitleSettings);
    const content = buildSrtFromDialogues(currentScene.dialogues, {
      showSpeaker: settings.showSpeaker,
      actors: currentScene.actors,
    });
    if (!content.trim()) throw new Error("Нет диалогов для экспорта субтитров.");
    const choice = await desktop.chooseSaveFile(`${currentScene.name || "scene"}.srt`, [
      { name: "SubRip Subtitles", extensions: ["srt"] },
    ]);
    if (choice.canceled || !choice.filePath) return;
    const written = await desktop.writeText(choice.filePath, content);
    if (!written.ok) throw new Error(written.error ?? "Не удалось сохранить SRT.");
    setStatus(`SRT сохранён: ${written.path ?? choice.filePath}`);
  }), [currentScene.actors, currentScene.dialogues, currentScene.name, currentScene.subtitleSettings, desktop, withErrors]);

  const selectEditableCharacter = useCallback((characterId: string) => {
    const definition = projectRef.current.characters.find((character) => character.id === characterId);
    if (!definition) return;
    const existing = currentScene.actors.find((actor) => actor.characterId === characterId);
    if (existing) {
      setSelectedActorIdState(existing.id);
      setSelectedPartId(definition.parts[0]?.id ?? null);
      return;
    }
    const id = createId("actor");
    commit(`Actor для ${definition.name}`, (draft) => {
      draft.scenes!.find((scene) => scene.id === currentScene.id)!.actors.push({
        id,
        name: definition.name,
        characterId,
        position: { x: currentScene.width / 2, y: currentScene.height / 2 },
        scale: 0.75,
        rotation: 0,
        facingDirection: "Right",
        visible: true,
        tint: "#ffffff",
      });
    });
    setSelectedActorIdState(id);
    setSelectedPartId(definition.parts[0]?.id ?? null);
  }, [commit, currentScene]);

  const createCharacterFromTemplate = useCallback((mode: "empty" | "procedural" | "library", nameInput?: string) => {
    const name = (nameInput ?? window.prompt("Имя персонажа", mode === "empty" ? "Новый персонаж" : "Hero"))?.trim();
    if (!name) return;
    const id = createId("character");
    const actorId = createId("actor");
    const built =
      mode === "empty" ? { character: buildEmptyCharacter(name, id), assets: [] as AssetDefinition[] }
        : mode === "library" ? buildLibraryCharacter(name, creatorPalette, id)
          : buildProceduralCharacter(name, creatorPalette, id, true);
    commit(`Character Creator: ${name}`, (draft) => {
      draft.characters.push(built.character);
      const existingIds = new Set(draft.assets.map((asset) => asset.id));
      for (const asset of built.assets) {
        if (!existingIds.has(asset.id)) draft.assets.push(asset);
      }
      draft.scenes!.find((scene) => scene.id === currentScene.id)!.actors.push({
        id: actorId,
        name,
        characterId: id,
        position: { x: currentScene.width / 2, y: currentScene.height / 2 },
        scale: 0.75,
        rotation: 0,
        facingDirection: "Right",
        visible: true,
        tint: "#ffffff",
      });
    });
    setSelectedActorIdState(actorId);
    setSelectedPartId(built.character.parts[0]?.id ?? null);
    setCharacterCreatorOpen(true);
    setStatus(`Создан персонаж ${name}`);
  }, [commit, creatorPalette, currentScene.height, currentScene.id, currentScene.width]);

  const renameCharacter = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const characterId = currentCharacter.id;
    commit("Персонаж переименован", (draft) => {
      const character = draft.characters.find((item) => item.id === characterId);
      if (character) character.name = trimmed;
      for (const scene of draft.scenes ?? []) {
        for (const actor of scene.actors) {
          if (actor.characterId === characterId && (actor.name === currentCharacter.name || actor.name.startsWith(currentCharacter.name))) {
            actor.name = trimmed;
          }
        }
      }
    });
  }, [commit, currentCharacter.id, currentCharacter.name]);

  const replaceCharacterAssets = useCallback((characterId: string, nextCharacter: CharacterDefinition, nextAssets: AssetDefinition[], selectPartId?: string | null) => {
    commit("Character Creator: обновлены части", (draft) => {
      const index = draft.characters.findIndex((item) => item.id === characterId);
      if (index < 0) return;
      draft.characters[index] = nextCharacter;
      const stillUsed = new Set<string>();
      for (const character of draft.characters) {
        for (const part of character.parts) stillUsed.add(part.assetId);
      }
      const byId = new Map<string, AssetDefinition>();
      for (const asset of draft.assets) {
        if (stillUsed.has(asset.id)) byId.set(asset.id, asset);
      }
      for (const asset of nextAssets) byId.set(asset.id, asset);
      draft.assets = [...byId.values()].filter((asset) => stillUsed.has(asset.id));
    });
    setSelectedPartId(selectPartId ?? nextCharacter.parts[0]?.id ?? null);
  }, [commit]);

  const assignLibraryPart = useCallback((slotId: CreatorSlotId) => {
    const slot = findSlot(slotId);
    const library = listDemoBotLibrary().find((item) => item.role === slot.role);
    if (!library) {
      setError(`В библиотеке DemoBot нет части для слота ${slot.label}. Используйте procedural или PNG.`);
      return;
    }
    const asset: AssetDefinition = { ...library.asset, id: createId(`asset-${slot.id}`) };
    const result = upsertSlotAsset(currentCharacter, projectRef.current.assets, slot, asset);
    const part = result.character.parts.find((item) => item.semanticRole === slot.role);
    replaceCharacterAssets(currentCharacter.id, result.character, result.assets, part?.id ?? null);
  }, [currentCharacter, replaceCharacterAssets]);

  const assignProceduralPart = useCallback((slotId: CreatorSlotId) => {
    const slot = findSlot(slotId);
    const asset = createProceduralAsset(slot, creatorPalette, createId(`asset-${slot.id}`));
    const result = upsertSlotAsset(currentCharacter, projectRef.current.assets, slot, asset);
    const part = result.character.parts.find((item) => item.semanticRole === slot.role && (slot.role !== "Custom" || item.customSemanticRole === slot.customRole));
    replaceCharacterAssets(currentCharacter.id, result.character, result.assets, part?.id ?? null);
  }, [creatorPalette, currentCharacter, replaceCharacterAssets]);

  const importPngToSlot = useCallback((slotId: CreatorSlotId) => withErrors(async () => {
    const slot = findSlot(slotId);
    const result = await desktop.importPng();
    if (result.canceled || !result.data?.length) return;
    const item = result.data[0];
    const asset: AssetDefinition = {
      id: createId(`asset-${slot.id}`),
      name: item.name,
      path: item.path,
      mediaType: "image/png",
      width: item.width,
      height: item.height,
    };
    const updated = upsertSlotAsset(currentCharacter, projectRef.current.assets, slot, asset);
    const part = updated.character.parts.find((entry) => entry.assetId === asset.id);
    if (part) {
      part.pivot = slot.role === "Body"
        ? { x: item.width / 2, y: item.height / 2 }
        : { x: item.width / 2, y: Math.min(item.height * 0.2, item.height / 2) };
      updated.character.bindPose = captureBindPose(updated.character);
    }
    replaceCharacterAssets(currentCharacter.id, updated.character, updated.assets, part?.id ?? null);
    setStatus(`PNG назначен на слот ${slot.label}`);
  }), [currentCharacter, desktop, replaceCharacterAssets, withErrors]);

  const applySpritesheetCrops = useCallback((assignments: Array<{
    slotId: CreatorSlotId;
    crop: { id: string; width: number; height: number; pngBytes: Uint8Array; dataUrl: string };
  }>) => withErrors(async () => {
    if (!assignments.length) throw new Error("Не выбран ни один слот для кусков sheet.");
    const temp = await desktop.createTempDir("kcs-sheet-");
    let character = currentCharacter;
    let assets = [...projectRef.current.assets];
    let selectPartId: string | null = null;

    for (const item of assignments) {
      const slot = findSlot(item.slotId);
      let filePath = item.crop.dataUrl;
      if (temp.ok && temp.path) {
        const dest = await desktop.joinPath(temp.path, `${slot.id}-${item.crop.id}.png`);
        const written = await desktop.writePng(dest, item.crop.pngBytes);
        if (written.ok) filePath = dest;
      }
      const asset: AssetDefinition = {
        id: createId(`asset-${slot.id}`),
        name: `${character.name}-${slot.id}`,
        path: filePath,
        mediaType: "image/png",
        width: item.crop.width,
        height: item.crop.height,
      };
      const updated = upsertSlotAsset(character, assets, slot, asset);
      character = updated.character;
      assets = updated.assets;
      const part = character.parts.find((entry) => entry.assetId === asset.id);
      if (part) {
        part.pivot = slot.role === "Body"
          ? { x: item.crop.width / 2, y: item.crop.height / 2 }
          : { x: item.crop.width / 2, y: Math.min(item.crop.height * 0.2, item.crop.height / 2) };
        character = { ...character, bindPose: captureBindPose(character) };
        selectPartId = part.id;
      }
    }

    character = {
      ...character,
      sockets: ensureCreatorSockets(character),
      bindPose: captureBindPose(character),
    };
    replaceCharacterAssets(character.id, character, assets, selectPartId);
    setStatus(`Sheet: назначено слотов ${assignments.length}`);
  }), [currentCharacter, desktop, replaceCharacterAssets, withErrors]);

  const clearCreatorSlot = useCallback((slotId: CreatorSlotId) => {
    const slot = findSlot(slotId);
    const result = removeSlotPart(currentCharacter, projectRef.current.assets, slot);
    replaceCharacterAssets(currentCharacter.id, result.character, result.assets, result.character.parts[0]?.id ?? null);
  }, [currentCharacter, replaceCharacterAssets]);

  const autoHierarchy = useCallback(() => {
    const characterId = currentCharacter.id;
    commit("Auto hierarchy", (draft) => {
      const index = draft.characters.findIndex((item) => item.id === characterId);
      if (index < 0) return;
      let character = applyCreatorHierarchy(draft.characters[index]);
      character = { ...character, sockets: ensureCreatorSockets(character), bindPose: captureBindPose(character) };
      draft.characters[index] = character;
    });
  }, [commit, currentCharacter.id]);

  const setSelectedActorTint = useCallback((tint: string) => {
    if (!selectedActorId) return;
    commit("Цвет актёра", (draft) => {
      const actor = draft.scenes!.find((scene) => scene.id === currentScene.id)!.actors.find((item) => item.id === selectedActorId);
      if (actor) actor.tint = tint;
    });
  }, [commit, currentScene.id, selectedActorId]);

  const montage = syncMontageWithScenes(project.montage, project.scenes);

  const syncMontage = useCallback(() => {
    commit("Монтаж синхронизирован со сценами", (draft) => {
      draft.montage = syncMontageWithScenes(draft.montage, draft.scenes);
    });
  }, [commit]);

  const toggleMontageClip = useCallback((clipId: string, enabled: boolean) => {
    commit(enabled ? "Сцена включена в монтаж" : "Сцена выключена из монтажа", (draft) => {
      draft.montage = syncMontageWithScenes(draft.montage, draft.scenes);
      const clip = draft.montage.clips.find((item) => item.id === clipId);
      if (clip) clip.enabled = enabled;
    });
  }, [commit]);

  const moveMontageClipUp = useCallback((clipId: string) => {
    commit("Монтаж: сцена выше", (draft) => {
      draft.montage = moveMontageClip(syncMontageWithScenes(draft.montage, draft.scenes), clipId, -1);
    });
  }, [commit]);

  const moveMontageClipDown = useCallback((clipId: string) => {
    commit("Монтаж: сцена ниже", (draft) => {
      draft.montage = moveMontageClip(syncMontageWithScenes(draft.montage, draft.scenes), clipId, 1);
    });
  }, [commit]);

  const reorderMontageClipTo = useCallback((clipId: string, toIndex: number) => {
    commit("Монтаж: порядок сцен", (draft) => {
      draft.montage = reorderMontageClip(syncMontageWithScenes(draft.montage, draft.scenes), clipId, toIndex);
    });
  }, [commit]);

  const jumpToMontageScene = useCallback((sceneId: string) => {
    setCurrentSceneId(sceneId);
    if (!montageMode) {
      setMontageModeState(true);
      setStatus("Montage playback: прыжок к сцене");
    }
    const segments = resolveMontageSegments(projectRef.current);
    const segment = segments.find((item) => item.scene.id === sceneId);
    setPlaying(false);
    setTime(segment?.offset ?? 0);
    setPreviewMotionState(null);
  }, [montageMode, setCurrentSceneId]);

  const resetMontageOrder = useCallback(() => {
    commit("Порядок монтажа сброшен", (draft) => {
      const previous = syncMontageWithScenes(draft.montage, draft.scenes);
      draft.montage = {
        ...createDefaultMontage(draft.scenes),
        transition: previous.transition,
        crossfadeDuration: previous.crossfadeDuration,
      };
    });
  }, [commit]);

  const updateMontageSettings = useCallback((patch: { transition?: import("../domain/montage").MontageTransitionType; crossfadeDuration?: number }) => {
    commit("Настройки перехода монтажа", (draft) => {
      draft.montage = syncMontageWithScenes(draft.montage, draft.scenes);
      if (patch.transition !== undefined) draft.montage.transition = patch.transition;
      if (patch.crossfadeDuration !== undefined) draft.montage.crossfadeDuration = patch.crossfadeDuration;
    });
  }, [commit]);

  const setMontageClipTransitionOut = useCallback((
    clipId: string,
    transitionOut: import("../domain/montage").MontageTransitionType | null,
  ) => {
    commit("Переход стыка монтажа", (draft) => {
      draft.montage = applyMontageClipTransitionOut(
        syncMontageWithScenes(draft.montage, draft.scenes),
        clipId,
        transitionOut,
      );
    });
  }, [commit]);

  const setMontageMode = useCallback((value: boolean) => {
    setMontageModeState(value);
    setPlaying(false);
    setTime(0);
    setPreviewMotionState(null);
    setStatus(value ? "Montage playback: глобальный timeline" : "Scene playback");
  }, []);

  const clearError = useCallback(() => setError(null), []);
  const reportError = useCallback((message: string) => {
    const text = message.trim() || "Неизвестная ошибка";
    setError(text);
    setStatus("Ошибка");
  }, []);

  const clearRequestedTimelineMode = useCallback(() => setRequestedTimelineMode(null), []);
  const requestRightTab = useCallback((tab: import("../domain/sceneConstructor").RightSidebarTab) => {
    setRequestedRightTab(tab);
  }, []);
  const clearRequestedRightTab = useCallback(() => setRequestedRightTab(null), []);
  const clearSceneSelection = useCallback(() => {
    setSelectedActorIdState(null);
    setSelectedPropIdState(null);
    setSelectedPartId(null);
    setSelectedSocketId(null);
    setSelectedAttachmentId(null);
    setRequestedRightTab("inspector");
    queueMicrotask(() => {
      document.getElementById("scene-background-panel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const listStudioImages = useCallback((kind: import("../domain/sceneConstructor").StudioImageKind) => withErrors(async () => {
    const root = await desktop.getAssetsRoot();
    if (!root.ok || !root.path) throw new Error(root.error ?? "Папка Assets не найдена рядом с программой.");
    const folderName = kind === "backgrounds" ? "Backgrounds" : "Props";
    const folder = await desktop.joinPath(root.path, folderName);
    const listed = await desktop.listImageFolder(folder);
    if (!listed.ok) throw new Error(listed.error ?? `Не удалось прочитать ${folderName}.`);
    return listed.files.map((file) => ({
      path: file.path,
      name: file.name,
      width: file.width,
      height: file.height,
    }));
  }), [desktop, withErrors]);

  const ensureAssetFromStudioFile = useCallback((file: import("../domain/sceneConstructor").StudioImageFile) => {
    const existing = projectRef.current.assets.find((asset) => asset.path === file.path || asset.name === file.name && asset.width === file.width && asset.height === file.height);
    if (existing) return existing.id;
    const id = createId("asset");
    commit(`Картинка «${file.name}» в проект`, (draft) => {
      draft.assets.push({
        id,
        name: file.name,
        path: file.path,
        mediaType: "image/png",
        width: file.width,
        height: file.height,
      });
    });
    return id;
  }, [commit]);

  const addStudioImageAsBackground = useCallback((file: import("../domain/sceneConstructor").StudioImageFile) => withErrors(async () => {
    const assetId = ensureAssetFromStudioFile(file);
    commit("PNG-фон сцены", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.backgroundAssetId = assetId;
    });
    setStatus(`Фон на сцене: ${file.name}`);
  }), [commit, currentScene.id, ensureAssetFromStudioFile, withErrors]);

  const addStudioImageAsProp = useCallback((file: import("../domain/sceneConstructor").StudioImageFile) => withErrors(async () => {
    const assetId = ensureAssetFromStudioFile(file);
    const id = createId("prop");
    commit("Предмет на сцене", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.props.push({
        id,
        name: file.name,
        assetId,
        position: { x: scene.width / 2, y: scene.height / 2 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
        visible: true,
        zIndex: 20 + scene.props.length,
      });
    });
    setSelectedPropIdState(id);
    setTool("move");
    setStatus(`Предмет на сцене: ${file.name}`);
  }), [commit, currentScene.id, ensureAssetFromStudioFile, withErrors]);

  const importPngAs = useCallback((role: "background" | "prop") => withErrors(async () => {
    const result = await desktop.importPng();
    if (result.canceled || !result.data?.length) return;
    const first = result.data[0]!;
    const assetIds: string[] = [];
    commit(`Импорт PNG (${role})`, (draft) => {
      for (const item of result.data!) {
        const id = createId("asset");
        draft.assets.push({
          id,
          name: item.name,
          path: item.path,
          mediaType: "image/png",
          width: item.width,
          height: item.height,
        });
        assetIds.push(id);
      }
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      const primary = assetIds[0]!;
      if (role === "background") {
        scene.backgroundAssetId = primary;
      } else {
        for (const assetId of assetIds) {
          const asset = draft.assets.find((item) => item.id === assetId)!;
          scene.props.push({
            id: createId("prop"),
            name: asset.name,
            assetId,
            position: { x: scene.width / 2, y: scene.height / 2 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
            visible: true,
            zIndex: 20 + scene.props.length,
          });
        }
      }
    });
    if (role === "prop" && assetIds.length) {
      const scene = projectRef.current.scenes?.find((item) => item.id === currentScene.id);
      const lastProp = scene?.props[scene.props.length - 1];
      if (lastProp) setSelectedPropIdState(lastProp.id);
      setTool("move");
    }
    setStatus(role === "background" ? `Фон: ${first.name}` : `Предмет(ы): ${result.data.length}`);
  }), [commit, currentScene.id, desktop, withErrors]);

  const addBundledCharacterToScene = useCallback((relativeFolder: string) => withErrors(async () => {
    const folder = relativeFolder.replace(/\\/g, "/").replace(/\.\./g, "").replace(/^\/+/, "").trim();
    if (!folder) throw new Error("Не указана папка персонажа.");

    const beastSpec = AUDIO_BEAST_FIGHT_CAST.find(
      (item) => item.folder === folder || item.folder.endsWith(`/${folder}`) || item.name === folder.split("/").pop(),
    );

    let characterId: string;
    let label: string;
    let actorScale = 0.75;

    if (beastSpec) {
      const rootResult = await desktop.getCharactersRoot();
      if (!rootResult.ok || !rootResult.path) {
        throw new Error(rootResult.error ?? "Не найдена папка Characters.");
      }
      const assetsDir = await desktop.joinPath(rootResult.path, ...beastSpec.folder.split("/"), "Assets");
      const resolvedFiles: Record<string, string> = {};
      for (const file of audioBeastAssetFiles()) {
        const assetPath = await desktop.joinPath(assetsDir, file);
        const exists = await desktop.pathExists(assetPath);
        if (!exists) throw new Error(`Нет файла: ${assetPath}`);
        resolvedFiles[file] = assetPath;
      }
      const pack = buildPackFromSpec(beastSpec, (fileName) => resolvedFiles[fileName]!);
      applyLoadedCharacter({ ...pack.character, assets: pack.assets });
      characterId = pack.character.id;
      label = pack.character.name;
      actorScale = beastSpec.actorScale;
    } else {
      const loaded = await desktop.loadBundledCharacter(folder);
      if (loaded.canceled || !loaded.data) {
        throw new Error(`Не удалось загрузить персонажа из Characters/${folder}.`);
      }
      applyLoadedCharacter(loaded.data);
      characterId = loaded.data.id;
      label = loaded.data.name || folder.split("/").pop() || "Актёр";
    }

    const id = createId("actor");
    commit(`Актёр «${label}» на сцене`, (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      const definition = draft.characters.find((item) => item.id === characterId);
      if (!definition) return;
      const x = Math.round(scene.width * 0.5);
      const y = groundedActorY(scene.height, actorScale);
      scene.actors.push({
        id,
        name: `${definition.name} ${scene.actors.length + 1}`,
        characterId,
        position: { x, y },
        scale: actorScale,
        rotation: 0,
        facingDirection: "Right",
        visible: true,
      });
    });
    setSelectedActorIdState(id);
    setSelectedPropIdState(null);
    setSelectedPartId(null);
    setTool("move");
    setRequestedRightTab("inspector");
    setStatus(`«${label}» на сцене — инструмент G: тащи / углы = масштаб. Справа «Свойства» = числа.`);
  }), [applyLoadedCharacter, commit, currentScene.id, desktop, withErrors]);

  const addDemoBotToScene = useCallback(
    () => addBundledCharacterToScene("DemoBot"),
    [addBundledCharacterToScene],
  );

  const insertGestureAtPlayhead = useCallback((motion: MotionName) => {
    if (!selectedActorRef.current) {
      reportError("Выберите актёра, чтобы вставить жест на Timeline.");
      return;
    }
    if (motion === "Walk" || motion === "Run") {
      reportError("Ходьбу и бег вставляйте инструментом Путь (W) на холсте.");
      return;
    }
    insertDirectorAction(motion as ActionType);
    setRequestedTimelineMode("scene");
    setStatus(`Жест «${MOTION_LABELS_RU[motion] ?? motion}» на Timeline`);
  }, [insertDirectorAction, reportError]);

  const openGestureClip = useCallback((clipId: string) => {
    const clip = projectRef.current.animationClips.find((item) => item.id === clipId);
    if (!clip) {
      reportError("Клип жеста не найден.");
      return;
    }
    setCurrentClipIdState(clipId);
    setPreviewMotionState(null);
    setTime(0);
    setPlaying(false);
    setRequestedTimelineMode("clip");
    setStatus(`Клип «${MOTION_LABELS_RU[clip.name as MotionName] ?? clip.name}» — режим Клип жеста`);
  }, [reportError]);

  const ensureGestureClips = useCallback(() => {
    commit("Клипы жестов подготовлены", (draft) => {
      const next = ensureBuiltinGestureClips(draft, draft.characters[0]);
      draft.animationClips = next.animationClips;
    });
    setStatus("Недостающие клипы жестов запечены");
  }, [commit]);

  const openBuiltinGestureClip = useCallback((motion: MotionName) => {
    commit(`Клип жеста ${MOTION_LABELS_RU[motion] ?? motion}`, (draft) => {
      const next = ensureBuiltinGestureClips(draft, draft.characters[0]);
      draft.animationClips = next.animationClips;
    });
    const clip = projectRef.current.animationClips.find((item) => item.name === motion);
    if (!clip) {
      reportError(`Не удалось запечь клип «${MOTION_LABELS_RU[motion] ?? motion}».`);
      return;
    }
    openGestureClip(clip.id);
  }, [commit, openGestureClip, reportError]);

  const duplicateGestureClip = useCallback((clipId?: string) => {
    const id = clipId ?? currentClipId;
    const source = projectRef.current.animationClips.find((item) => item.id === id);
    if (!source) {
      reportError("Нет клипа для копирования.");
      return;
    }
    const copy = duplicateAnimationClip(source);
    commit(`Копия клипа ${source.name}`, (draft) => {
      draft.animationClips.push(copy);
    });
    setCurrentClipIdState(copy.id);
    setRequestedTimelineMode("clip");
    setStatus(`Клип «${copy.name}» создан`);
  }, [commit, currentClipId, reportError]);

  const renameGestureClip = useCallback((clipId?: string, name?: string) => {
    const id = clipId ?? currentClipId;
    const source = projectRef.current.animationClips.find((item) => item.id === id);
    if (!source) {
      reportError("Нет клипа для переименования.");
      return;
    }
    const nextName = name?.trim() || window.prompt("Имя клипа", source.name)?.trim();
    if (!nextName) return;
    commit(`Клип переименован: ${nextName}`, (draft) => {
      const clip = draft.animationClips.find((item) => item.id === id);
      if (clip) Object.assign(clip, renameAnimationClip(clip, nextName));
    });
  }, [commit, currentClipId, reportError]);

  const createPoseClip = useCallback((name?: string) => {
    const label = name?.trim() || window.prompt("Имя клипа из позы", "Поза")?.trim();
    if (!label) return;
    const character = projectRef.current.characters.find((item) => item.id === currentCharacter.id) ?? currentCharacter;
    const clip = capturePoseClip(character, label);
    if (!clip.tracks.length) {
      reportError("Поза совпадает с базовой — нечего сохранить в клип.");
      return;
    }
    commit(`Клип из позы: ${clip.name}`, (draft) => {
      draft.animationClips.push(clip);
    });
    setCurrentClipIdState(clip.id);
    setRequestedTimelineMode("clip");
    setStatus(`Клип «${clip.name}» из текущей позы`);
  }, [commit, currentCharacter, reportError]);

  const openToolPanel = useCallback((panel: "export" | "character" | "montage" | "partforge" | "series" | "script" | "help" | "wizard" | "voice") => {
    if (isExportBusy(exportState.phase) && panel !== "export" && panel !== "montage" && panel !== "series" && panel !== "help" && panel !== "wizard" && panel !== "voice") {
      setError("Дождитесь окончания экспорта или нажмите Cancel.");
      return;
    }
    if (scriptGenerating && panel !== "script" && panel !== "help" && panel !== "wizard" && panel !== "voice") {
      setError("Дождитесь окончания генерации сценария.");
      return;
    }
    // Character Creator stacks on top of «＋ Мультик» — closing it returns to the wizard.
    if (panel === "character") {
      setExportPanelOpen(false);
      setMontagePanelOpen(false);
      setPartForgeOpen(false);
      setSeriesPanelOpen(false);
      setScriptPanelOpen(false);
      setHelpPanelOpen(false);
      setVoiceStudioOpen(false);
      setCharacterCreatorOpen(true);
      return;
    }
    setExportPanelOpen(panel === "export");
    setCharacterCreatorOpen(false);
    setMontagePanelOpen(panel === "montage");
    setPartForgeOpen(panel === "partforge");
    setSeriesPanelOpen(panel === "series");
    setScriptPanelOpen(panel === "script");
    setHelpPanelOpen(panel === "help");
    setCartoonWizardOpen(panel === "wizard");
    setVoiceStudioOpen(panel === "voice");
  }, [exportState.phase, scriptGenerating]);

  const closeTopPanel = useCallback(() => {
    const busy = isExportBusy(exportState.phase);
    if (voiceStudioOpen) {
      setVoiceStudioOpen(false);
      return;
    }
    // Close Character Creator first so wizard stays open underneath.
    if (characterCreatorOpen) {
      setCharacterCreatorOpen(false);
      return;
    }
    if (cartoonWizardOpen) {
      if (!scriptGenerating) setCartoonWizardOpen(false);
      return;
    }
    if (helpPanelOpen) {
      setHelpPanelOpen(false);
      return;
    }
    if (scriptPanelOpen) {
      if (!scriptGenerating) setScriptPanelOpen(false);
      return;
    }
    if (seriesPanelOpen) {
      if (!(busy && exportState.kind === "series")) setSeriesPanelOpen(false);
      return;
    }
    if (montagePanelOpen) {
      if (!(busy && exportState.kind === "montage")) setMontagePanelOpen(false);
      return;
    }
    if (exportPanelOpen) {
      if (!busy) setExportPanelOpen(false);
      return;
    }
    if (partForgeOpen) { setPartForgeOpen(false); return; }
  }, [cartoonWizardOpen, characterCreatorOpen, exportPanelOpen, exportState.kind, exportState.phase, helpPanelOpen, montagePanelOpen, partForgeOpen, scriptGenerating, scriptPanelOpen, seriesPanelOpen, voiceStudioOpen]);

  const upsertVoiceProfile = useCallback((profile: VoiceProfile) => {
    commit(`Voice Profile: ${profile.name}`, (draft) => {
      draft.voiceProfiles = draft.voiceProfiles ?? [];
      const index = draft.voiceProfiles.findIndex((item) => item.id === profile.id);
      if (index >= 0) draft.voiceProfiles[index] = profile;
      else draft.voiceProfiles.push(profile);
    });
  }, [commit]);

  const deleteVoiceProfile = useCallback((id: string) => {
    commit("Voice Profile удалён", (draft) => {
      draft.voiceProfiles = (draft.voiceProfiles ?? []).filter((item) => item.id !== id);
      for (const character of draft.characters) {
        if (character.voiceProfileId === id) character.voiceProfileId = null;
      }
    });
  }, [commit]);

  const assignCharacterVoice = useCallback((characterId: string, voiceProfileId: string | null) => {
    commit("Голос назначен персонажу", (draft) => {
      const character = draft.characters.find((item) => item.id === characterId);
      if (character) character.voiceProfileId = voiceProfileId;
    });
  }, [commit]);

  const updateCharacterMouthSet = useCallback((characterId: string, mouthSet: import("../domain/visemeSystem").MouthSetDefinition) => {
    commit("Mouth Set / Lip Sync mode", (draft) => {
      const character = draft.characters.find((item) => item.id === characterId);
      if (character) character.mouthSet = mouthSet;
    });
  }, [commit]);

  const addVoiceTake = useCallback((take: VoiceTake) => {
    setVoiceTakes((previous) => [...previous, take]);
  }, []);

  const updateVoiceTake = useCallback((id: string, patch: Partial<VoiceTake>) => {
    setVoiceTakes((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const clearVoiceTakes = useCallback(() => setVoiceTakes([]), []);

  const generateLipSyncForTake = useCallback(async (takeId: string, takeOverride?: VoiceTake) => {
    const take = takeOverride ?? voiceTakes.find((item) => item.id === takeId);
    if (!take) throw new Error("Take не найден");
    if (take.lipSync?.manuallyEdited) {
      const ok = await desktop.confirm("У Take есть ручная правка Lip Sync. Перезаписать автоматической генерацией?", "Lip Sync");
      if (!ok) return;
    }
    updateVoiceTake(takeId, { lipSyncStatus: "processing", lipSyncError: null });
    try {
      let audioAbs = take.audioPath;
      if (!/^[a-zA-Z]:[\\/]|^\//.test(audioAbs) && projectPathRef.current) {
        audioAbs = await desktop.resolvePath(audioAbs, projectPathRef.current);
      }
      const result = await desktop.lipSyncAlign({
        text: take.text,
        audioPath: audioAbs,
        projectPath: projectPathRef.current,
        languageId: take.languageId || "ru",
      });
      if (!result.ok) throw new Error(String(result.error ?? "Alignment failed"));
      const { lipSyncSourceKey, smoothVisemeCues, createEmptyLipSyncData, isCartoonViseme } = await import("../domain/visemeSystem");
      const rawCues = Array.isArray(result.cues) ? result.cues : [];
      const cues = smoothVisemeCues(rawCues.map((cue: unknown) => {
        const row = cue as Record<string, unknown>;
        const visemeRaw = String(row.viseme ?? "REST");
        return {
          time: Number(row.time) || 0,
          duration: Number(row.duration) || 0.05,
          viseme: isCartoonViseme(visemeRaw) ? visemeRaw : "CONSONANT",
          confidence: typeof row.confidence === "number" ? row.confidence : undefined,
          token: typeof row.token === "string" ? row.token : undefined,
        };
      }));
      const lipSync = createEmptyLipSyncData({
        audioPath: take.audioPath,
        text: take.text,
        duration: Number(result.duration) || take.duration,
        cues,
        engine: typeof result.engine === "string" ? result.engine : "ctc-forced-aligner",
        language: typeof result.language === "string" ? result.language : take.languageId,
        sourceKey: lipSyncSourceKey(take.audioPath, take.text),
        manuallyEdited: false,
      });
      updateVoiceTake(takeId, { lipSync, lipSyncStatus: "ready", lipSyncError: null });
      setStatus(`Lip Sync готов: ${cues.length} cues (Take ${take.takeIndex})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateVoiceTake(takeId, { lipSyncStatus: "failed", lipSyncError: message });
      throw error;
    }
  }, [desktop, updateVoiceTake, voiceTakes]);

  const clearLipSyncForTake = useCallback((takeId: string) => {
    updateVoiceTake(takeId, { lipSync: null, lipSyncStatus: "not_generated", lipSyncError: null });
  }, [updateVoiceTake]);

  const updateDialogueLipSync = useCallback((
    dialogueId: string,
    lipSync: import("../domain/visemeSystem").LipSyncData | null,
    status?: import("../domain/visemeSystem").LipSyncGenStatus,
  ) => {
    commit("Lip Sync реплики", (draft) => {
      const line = draft.scenes!.find((item) => item.id === currentScene.id)!.dialogues?.find((item) => item.id === dialogueId);
      if (!line) return;
      line.lipSync = lipSync;
      line.lipSyncStatus = status ?? (lipSync?.cues?.length ? "ready" : "not_generated");
    });
  }, [commit, currentScene.id]);

  const generateMissingLipSyncForScene = useCallback(async () => {
    const { isLipSyncOutdated, lipSyncSourceKey, smoothVisemeCues, createEmptyLipSyncData, isCartoonViseme } = await import("../domain/visemeSystem");
    const scene = projectRef.current.scenes?.find((item) => item.id === currentScene.id);
    const lines = (scene?.dialogues ?? []).filter((line) => {
      const path = line.audioPath;
      if (!path || !line.text.trim()) return false;
      if (line.lipSync?.manuallyEdited) return false;
      if (line.lipSyncStatus === "ready" && line.lipSync?.cues?.length) {
        return isLipSyncOutdated(line.lipSync, path, line.text);
      }
      return line.lipSyncStatus !== "ready";
    });
    let done = 0;
    for (const line of lines) {
      updateDialogueLipSync(line.id, line.lipSync ?? null, "processing");
      try {
        let audioAbs = line.audioPath!;
        if (!/^[a-zA-Z]:[\\/]|^\//.test(audioAbs) && projectPathRef.current) {
          audioAbs = await desktop.resolvePath(audioAbs, projectPathRef.current);
        }
        const result = await desktop.lipSyncAlign({
          text: line.text,
          audioPath: audioAbs,
          projectPath: projectPathRef.current,
          languageId: "ru",
        });
        const cues = smoothVisemeCues((Array.isArray(result.cues) ? result.cues : []).map((cue: unknown) => {
          const row = cue as Record<string, unknown>;
          const visemeRaw = String(row.viseme ?? "REST");
          return {
            time: Number(row.time) || 0,
            duration: Number(row.duration) || 0.05,
            viseme: isCartoonViseme(visemeRaw) ? visemeRaw : "CONSONANT",
            confidence: typeof row.confidence === "number" ? row.confidence : undefined,
          };
        }));
        const lipSync = createEmptyLipSyncData({
          audioPath: line.audioPath!,
          text: line.text,
          duration: Number(result.duration) || line.duration,
          cues,
          engine: "ctc-forced-aligner",
          sourceKey: lipSyncSourceKey(line.audioPath!, line.text),
        });
        updateDialogueLipSync(line.id, lipSync, "ready");
      } catch {
        updateDialogueLipSync(line.id, line.lipSync ?? null, "failed");
      }
      done += 1;
      setStatus(`Lip Sync batch ${done} / ${lines.length}`);
    }
    return { done, total: lines.length };
  }, [currentScene.id, desktop, updateDialogueLipSync]);

  const addVoiceTakeToTimeline = useCallback((take: VoiceTake) => {
    commit("Dialogue clip на Timeline", (draft) => {
      draft.audioAssets = draft.audioAssets ?? [];
      const assetId = createId("audio");
      draft.audioAssets.push({
        id: assetId,
        name: `Take ${take.takeIndex}: ${take.text.slice(0, 36)}`,
        path: take.audioPath,
        mediaType: "audio/wav",
        duration: take.duration,
      });
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.audioTracks = scene.audioTracks ?? [];
      scene.dialogues = scene.dialogues ?? [];
      const trackId = createId("atrack");
      const startTime = timeRef.current;
      scene.audioTracks.push(createEmptyAudioTrack({
        id: trackId,
        assetId,
        name: `Voice T${take.takeIndex}`,
        duration: take.duration,
        startTime,
      }));
      scene.dialogues.push(createEmptyDialogue({
        id: createId("dlg"),
        actorId: take.actorId,
        text: take.text,
        startTime,
        duration: take.duration,
        audioTrackId: trackId,
        voiceProfileId: take.voiceProfileId,
        emotion: take.emotion,
        audioPath: take.audioPath,
        takeIndex: take.takeIndex,
        takeId: take.id,
        lipSync: take.lipSync ?? null,
        lipSyncStatus: take.lipSyncStatus ?? (take.lipSync?.cues?.length ? "ready" : "not_generated"),
      }));
      scene.duration = Math.max(scene.duration, startTime + take.duration + 0.25);
    });
    setStatus(`Take ${take.takeIndex} добавлен на Timeline`);
  }, [commit, currentScene.id]);

  const generateCartoonFromScript = useCallback((options: {
    script: string;
    mapping: ScriptCharacterMapping;
    generateTts: boolean;
    voiceMode?: AdVoiceMode;
    replaceScenes: boolean;
    subtitles: boolean;
    exportAfter: boolean;
    skipPromptEnrich?: boolean;
  }) => withErrors(async () => {
    if (isExportBusy(exportState.phase)) throw new Error("Дождитесь окончания экспорта.");
    if (scriptGenerating) throw new Error("Генерация уже выполняется.");
    const parsed = parseCartoonScript(options.script);
    if (!parsed.scenes.length) throw new Error(parsed.errors[0] ?? "Пустой сценарий.");
    const mapping = Object.keys(options.mapping).length
      ? options.mapping
      : autoMapScriptCharacters(parsed.speakers, projectRef.current.characters);
    const validation = validateScriptMapping(parsed.speakers, mapping, projectRef.current.characters);
    if (!validation.ok) throw new Error(validation.errors.join(" "));

    setScriptGenerating(true);
    try {
      const ttsClips: ScriptTtsClip[] = [];
      const voiceMode: AdVoiceMode = options.voiceMode
        ?? (options.generateTts ? "natural" : "off");
      if (options.generateTts && voiceMode !== "off") {
        const prosody = assignProsodyToSpeakers(parsed.speakers, speechSettingsRef.current);
        setSpeechSettingsState((previous) => {
          const next = {
            ...previous,
            rateBySpeaker: { ...prosody.rateBySpeaker, ...previous.rateBySpeaker },
            pitchBySpeaker: { ...prosody.pitchBySpeaker, ...previous.pitchBySpeaker },
            pitchSemitonesBySpeaker: { ...prosody.pitchSemitonesBySpeaker, ...previous.pitchSemitonesBySpeaker },
          };
          speechSettingsRef.current = next;
          return next;
        });
        const temp = await desktop.createTempDir("kcs-script-tts-");
        if (!temp.ok || !temp.path) throw new Error(temp.error ?? "Не удалось создать temp для TTS");
        const lines = collectScriptLinesForTts(parsed);
        const voicesListed = await desktop.listSpeechVoices({
          extraFolders: speechSettingsRef.current.extraPiperFolders,
          extraModels: speechSettingsRef.current.customPiperModels.map((item) => ({
            name: item.name,
            modelPath: item.modelPath,
            culture: item.culture,
            gender: item.gender,
          })),
        });
        const piperVoice = pickPiperVoice(voicesListed.ok ? voicesListed.voices : []);
        const catalog = mergeVoiceCatalog(voicesListed.ok ? voicesListed.voices : [], speechSettingsRef.current);
        const assigned = assignVoicesToSpeakers(
          parsed.speakers,
          catalog,
          speechSettingsRef.current.preferCulture,
          true,
        );
        setSpeechSettingsState((previous) => {
          const next = {
            ...previous,
            voiceBySpeaker: { ...assigned, ...previous.voiceBySpeaker },
          };
          speechSettingsRef.current = next;
          return next;
        });
        let chatterboxReady = false;
        if (voiceMode === "natural") {
          const installed = await desktop.voiceInstalled();
          if (installed.ok && installed.installed) {
            setStatus("Загружаю живой голос (Chatterbox)…");
            try {
              const loaded = await desktop.voiceLoad({ preferCuda: true });
              chatterboxReady = loaded.state === "ready" || Boolean(loaded.installed);
            } catch {
              chatterboxReady = false;
            }
          }
        }
        if (voiceMode === "natural" && !chatterboxReady && !piperVoice) {
          throw new Error(
            "Живой голос недоступен. Поставьте Voice (Chatterbox) или Piper — робот Windows отключён.",
          );
        }
        if (voiceMode === "piper" && !piperVoice) {
          throw new Error("Piper не найден. scripts\\setup-piper.ps1 или Voice (Chatterbox). Робот Windows отключён.");
        }
        const profiles = projectRef.current.voiceProfiles ?? [];
        const isAd = /реклам/i.test(options.script);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index]!;
          const rawText = line.text.replace(/\s+/g, " ").trim();
          const text = isAd ? compressAdCaption(rawText) : rawText;
          const emotion = isAd ? "excited" : emotionFromDialogue(text);
          setStatus(`${chatterboxReady ? "Живой голос" : "Piper"} ${index + 1}/${lines.length}: ${line.speaker ?? "диктор"}`);
          const outPath = await desktop.joinPath(temp.path, `line-${line.sceneIndex}-${line.lineIndex}-${Date.now()}.wav`);
          let spoken: { ok: boolean; path?: string; duration?: number; error?: string } | null = null;
          const speakerName = line.speaker ?? "";
          const character = projectRef.current.characters.find(
            (item) => item.name.trim().toLowerCase() === speakerName.trim().toLowerCase(),
          );
          const profile = (character?.voiceProfileId
            ? profiles.find((item) => item.id === character.voiceProfileId)
            : null) ?? profiles[0] ?? null;
          if (chatterboxReady) {
            try {
              let promptAbs: string | null = null;
              if (profile?.referencePath) {
                promptAbs = await desktop.resolvePath(profile.referencePath, projectPathRef.current);
              }
              const params = isAd ? chatterboxParamsForAd(profile) : resolveEmotionParams(emotion, profile);
              spoken = await desktop.voiceGenerate({
                text,
                languageId: profile?.languageId || "ru",
                outPath,
                audioPromptPath: promptAbs,
                emotion,
                exaggeration: params.exaggeration,
                cfgWeight: params.cfgWeight,
              });
            } catch (error) {
              spoken = { ok: false, error: error instanceof Error ? error.message : String(error) };
            }
          }
          if (!spoken?.ok || !spoken.path) {
            if (!piperVoice && !catalog.some((voice) => voice.engine === "piper")) {
              throw new Error(spoken?.error ?? "Chatterbox не смог озвучить, Piper не установлен. Робот Windows отключён.");
            }
            const opts = resolveSpeakOptions(speakerName, speechSettingsRef.current, catalog);
            spoken = await desktop.synthesizeSpeech(
              text,
              outPath,
              opts.piperModel ? opts : piperSpeakOptions(piperVoice),
            );
          }
          if (!spoken.ok || !spoken.path) throw new Error(spoken.error ?? `TTS не удался для строки ${index + 1}`);
          ttsClips.push({
            sceneIndex: line.sceneIndex,
            lineIndex: line.lineIndex,
            path: spoken.path,
            duration: spoken.duration ?? estimateSpeechDuration(text),
          });
        }
      }

      const settings = projectRef.current.renderSettings ?? createDefaultRenderSettings();
      const built = buildCartoonFromScript(projectRef.current, parsed, {
        mapping,
        width: settings.canvasWidth || 1920,
        height: settings.canvasHeight || 1080,
        background: projectRef.current.scenes?.[0]?.background,
        replaceScenes: options.replaceScenes,
        subtitles: options.subtitles,
        addTalkActions: true,
        ttsClips,
      });
      let staged = built.project;
      if (!options.skipPromptEnrich) {
        const plan = parseCartoonPrompt(options.script);
        if (plan.scenes.length) staged = enrichScenesFromPromptPlan(staged, plan);
      }
      const migrated = migrateProject(staged);
      const committed = history.current.commit(migrated, "Script → Cartoon");
      projectRef.current = committed;
      setProject(committed);
      setHistoryTick((value) => value + 1);
      const firstScene = committed.scenes?.find((scene) => scene.id === built.sceneIds[0]) ?? committed.scenes?.[0];
      if (firstScene) {
        setCurrentSceneIdState(firstScene.id);
        setSelectedActorIdState(firstScene.actors[0]?.id ?? null);
        setSelectedPropIdState(null);
        setSelectedAttachmentId(null);
        setSelectedPartId(committed.characters.find((character) => character.id === firstScene.actors[0]?.characterId)?.parts[0]?.id ?? null);
      }
      setTime(0);
      setPlaying(false);
      setMontageModeState(true);
      await ensureAmplitudeEnvelopes();
      if (options.generateTts && voiceMode !== "off") {
        try {
          const {
            lipSyncSourceKey,
            smoothVisemeCues,
            createEmptyLipSyncData,
            isCartoonViseme,
          } = await import("../domain/visemeSystem");
          const updates: Array<{ sceneId: string; lineId: string; lipSync: import("../domain/visemeSystem").LipSyncData }> = [];
          for (const scene of projectRef.current.scenes ?? []) {
            for (const line of scene.dialogues ?? []) {
              let audioPath = line.audioPath ?? null;
              if (!audioPath && line.audioTrackId) {
                const track = (scene.audioTracks ?? []).find((item) => item.id === line.audioTrackId);
                const asset = (projectRef.current.audioAssets ?? []).find((item) => item.id === track?.assetId);
                audioPath = asset?.path ?? null;
              }
              if (!audioPath || !line.text.trim()) continue;
              setStatus(`Lip Sync: ${line.text.slice(0, 32)}…`);
              try {
                let audioAbs = audioPath;
                if (!/^[a-zA-Z]:[\\/]|^\//.test(audioAbs) && projectPathRef.current) {
                  audioAbs = await desktop.resolvePath(audioAbs, projectPathRef.current);
                }
                const result = await desktop.lipSyncAlign({
                  text: line.text,
                  audioPath: audioAbs,
                  projectPath: projectPathRef.current,
                  languageId: "ru",
                });
                const cues = smoothVisemeCues((Array.isArray(result.cues) ? result.cues : []).map((cue: unknown) => {
                  const row = cue as Record<string, unknown>;
                  const visemeRaw = String(row.viseme ?? "REST");
                  return {
                    time: Number(row.time) || 0,
                    duration: Number(row.duration) || 0.05,
                    viseme: isCartoonViseme(visemeRaw) ? visemeRaw : "CONSONANT",
                    confidence: typeof row.confidence === "number" ? row.confidence : undefined,
                  };
                }));
                updates.push({
                  sceneId: scene.id,
                  lineId: line.id,
                  lipSync: createEmptyLipSyncData({
                    audioPath,
                    text: line.text,
                    duration: Number(result.duration) || line.duration,
                    cues,
                    engine: "ctc-forced-aligner",
                    sourceKey: lipSyncSourceKey(audioPath, line.text),
                  }),
                });
              } catch {
                // Phoneme/text-driven mouth still runs from lipSyncSettings.
              }
            }
          }
          if (updates.length) {
            commit("Авто Lip Sync по репликам", (draft) => {
              for (const update of updates) {
                const scene = draft.scenes?.find((item) => item.id === update.sceneId);
                const line = scene?.dialogues?.find((item) => item.id === update.lineId);
                if (!line) continue;
                line.lipSync = update.lipSync;
                line.lipSyncStatus = "ready";
                if (!line.audioPath) line.audioPath = update.lipSync.audioPath;
              }
            });
          }
        } catch {
          // Aligner optional.
        }
      }
      const warn = built.warnings.length ? ` (${built.warnings.join("; ")})` : "";
      const voiceNote = options.generateTts && voiceMode !== "off"
        ? (voiceMode === "natural" ? ", живой голос" : ", Piper")
        : "";
      setStatus(`Собрано сцен: ${built.sceneIds.length}${voiceNote}${warn}`);
      setScriptPanelOpen(false);
      if (options.exportAfter) {
        await exportController.exportMontageVideo(committed, committed.renderSettings ?? settings);
      }
    } finally {
      setScriptGenerating(false);
    }
  }), [desktop, ensureAmplitudeEnvelopes, exportController, exportState.phase, scriptGenerating, withErrors]);

  const loadAudioBeastFightDemo = useCallback((options?: { generateTts?: boolean; exportAfter?: boolean }) => withErrors(async () => {
    if (isExportBusy(exportState.phase)) throw new Error("Дождитесь окончания экспорта.");
    if (scriptGenerating) throw new Error("Генерация уже выполняется.");
    setScriptGenerating(true);
    try {
      setStatus("Загрузка монстров AudioBeast…");
      const rootResult = await desktop.getCharactersRoot();
      if (!rootResult.ok || !rootResult.path) {
        throw new Error(rootResult.error ?? "Не найдена папка Characters (EmberPuff/FrostFang/GearBot).");
      }
      const packs: BundledCharacterPack[] = [];
      for (const monster of AUDIO_BEAST_FIGHT_CAST) {
        const assetsDir = await desktop.joinPath(rootResult.path, ...monster.folder.split("/"), "Assets");
        const resolvedFiles: Record<string, string> = {};
        for (const file of audioBeastAssetFiles()) {
          const assetPath = await desktop.joinPath(assetsDir, file);
          const exists = await desktop.pathExists(assetPath);
          if (!exists) throw new Error(`Нет файла: ${assetPath}`);
          resolvedFiles[file] = assetPath;
        }
        packs.push(buildPackFromSpec(monster, (fileName) => resolvedFiles[fileName]!));
      }

      let next = applyAudioBeastFightDemo(projectRef.current, packs);
      const scene = next.scenes![0]!;
      const dialogue = scene.dialogues?.[0];

      if (options?.generateTts !== false && dialogue) {
        setStatus("Local TTS: Эй, ты! Иди сюда!");
        const listed = await desktop.listSpeechVoices({
          extraFolders: speechSettingsRef.current.extraPiperFolders,
          extraModels: speechSettingsRef.current.customPiperModels.map((item) => ({
            name: item.name,
            modelPath: item.modelPath,
            culture: item.culture,
            gender: item.gender,
          })),
        });
        const piperVoice = pickPiperVoice(listed.ok ? listed.voices : []);
        if (!piperVoice) {
          throw new Error("Нужен Piper или Chatterbox для озвучки. Робот Windows отключён.");
        }
        const temp = await desktop.createTempDir("kcs-fight-tts-");
        if (!temp.ok || !temp.path) throw new Error(temp.error ?? "temp TTS");
        const outPath = await desktop.joinPath(temp.path, `ember-call-${Date.now()}.wav`);
        const spoken = await desktop.synthesizeSpeech(
          dialogue.text,
          outPath,
          piperSpeakOptions(piperVoice),
        );
        if (!spoken.ok || !spoken.path) throw new Error(spoken.error ?? "TTS не удался");
        const duration = spoken.duration ?? estimateSpeechDuration(dialogue.text);
        const assetId = createId("audio");
        const trackId = createId("atrack");
        next = structuredClone(next);
        next.audioAssets = next.audioAssets ?? [];
        next.audioAssets.push({
          id: assetId,
          name: dialogue.text.slice(0, 40),
          path: spoken.path,
          mediaType: "audio/wav",
          duration,
        });
        const fightScene = next.scenes![0]!;
        fightScene.audioTracks = fightScene.audioTracks ?? [];
        fightScene.audioTracks.push(createEmptyAudioTrack({
          id: trackId,
          assetId,
          name: "TTS EmberPuff",
          duration,
          startTime: dialogue.startTime,
        }));
        const line = fightScene.dialogues?.find((item) => item.id === dialogue.id);
        if (line) {
          line.duration = duration;
          line.audioTrackId = trackId;
        }
      }

      const migrated = migrateProject(next);
      const committed = history.current.commit(migrated, "AudioBeast Fight Demo");
      projectRef.current = committed;
      setProject(committed);
      setHistoryTick((value) => value + 1);
      const first = committed.scenes![0]!;
      setCurrentSceneIdState(first.id);
      setSelectedActorIdState(first.actors[0]?.id ?? null);
      setSelectedPropIdState(null);
      setSelectedAttachmentId(null);
      setSelectedPartId(committed.characters.find((character) => character.id === first.actors[0]?.characterId)?.parts[0]?.id ?? null);
      setTime(0);
      setPlaying(false);
      setMontageModeState(false);
      await ensureAmplitudeEnvelopes();
      setStatus(`Fight demo OK build-2026-08-08e: один размер у всех (${rootResult.path})`);
      setScriptPanelOpen(false);
      if (options?.exportAfter) {
        await exportController.exportMontageVideo(committed, committed.renderSettings ?? createDefaultRenderSettings());
      }
    } finally {
      setScriptGenerating(false);
    }
  }), [desktop, ensureAmplitudeEnvelopes, exportController, exportState.phase, scriptGenerating, withErrors]);

  const loadMeadowDialogueDemo = useCallback((options?: { generateTts?: boolean; exportAfter?: boolean }) => withErrors(async () => {
    if (isExportBusy(exportState.phase)) throw new Error("Дождитесь окончания экспорта.");
    if (scriptGenerating) throw new Error("Генерация уже выполняется.");
    setScriptGenerating(true);
    try {
      setStatus("Мультик: загрузка персонажей и сцен…");
      const rootResult = await desktop.getCharactersRoot();
      if (!rootResult.ok || !rootResult.path) {
        throw new Error(rootResult.error ?? "Не найдена папка Characters.");
      }
      const assetsRoot = await desktop.getAssetsRoot();
      if (!assetsRoot.ok || !assetsRoot.path) {
        throw new Error(assetsRoot.error ?? "Не найдена папка Assets (фон/музыка).");
      }

      const packs: BundledCharacterPack[] = [];
      for (const monster of AUDIO_BEAST_FIGHT_CAST) {
        const assetsDir = await desktop.joinPath(rootResult.path, ...monster.folder.split("/"), "Assets");
        const resolvedFiles: Record<string, string> = {};
        for (const file of audioBeastAssetFiles()) {
          const assetPath = await desktop.joinPath(assetsDir, file);
          const exists = await desktop.pathExists(assetPath);
          if (!exists) throw new Error(`Нет файла: ${assetPath}`);
          resolvedFiles[file] = assetPath;
        }
        packs.push(buildPackFromSpec(monster, (fileName) => resolvedFiles[fileName]!));
      }

      const meadowPath = await desktop.joinPath(assetsRoot.path, "Backgrounds", "meadow-sunny.png");
      const housePath = await desktop.joinPath(assetsRoot.path, "Backgrounds", "gear-cottage.png");
      const meetMusicPath = await desktop.joinPath(assetsRoot.path, "Audio", "Morning-in-the-Moss.mp3");
      const roadMusicPath = await desktop.joinPath(assetsRoot.path, "Audio", "Whimsical-Adventure.mp3");
      for (const [label, filePath] of [
        ["фон поляны", meadowPath],
        ["фон домика", housePath],
        ["музыка встречи", meetMusicPath],
        ["музыка дороги", roadMusicPath],
      ] as const) {
        if (!(await desktop.pathExists(filePath))) throw new Error(`Нет файла (${label}): ${filePath}`);
      }

      let next = applyMeadowDialogueDemo(projectRef.current, packs, {
        meadowBackground: { path: meadowPath, width: 1536, height: 1024 },
        houseBackground: { path: housePath, width: 1536, height: 1024 },
        musicMeet: {
          id: createId("audio"),
          name: "Morning in the Moss",
          path: meetMusicPath,
          mediaType: "audio/mpeg",
          duration: 22.2,
        },
        musicRoad: {
          id: createId("audio"),
          name: "Whimsical Adventure",
          path: roadMusicPath,
          mediaType: "audio/mpeg",
          duration: 98.04,
        },
      });

      if (options?.generateTts !== false) {
        const castNames = ["Огонёк", "Морозко", "Винтик"];
        const prosody = assignProsodyToSpeakers(castNames, speechSettingsRef.current);
        setSpeechSettingsState((previous) => {
          const nextSettings = {
            ...previous,
            rateBySpeaker: { ...prosody.rateBySpeaker, ...previous.rateBySpeaker },
            pitchBySpeaker: { ...prosody.pitchBySpeaker, ...previous.pitchBySpeaker },
            pitchSemitonesBySpeaker: { ...prosody.pitchSemitonesBySpeaker, ...previous.pitchSemitonesBySpeaker },
          };
          speechSettingsRef.current = nextSettings;
          return nextSettings;
        });
        const listed = await desktop.listSpeechVoices({
          extraFolders: speechSettingsRef.current.extraPiperFolders,
          extraModels: speechSettingsRef.current.customPiperModels.map((item) => ({
            name: item.name,
            modelPath: item.modelPath,
            culture: item.culture,
            gender: item.gender,
          })),
        });
        const piperVoice = pickPiperVoice(listed.ok ? listed.voices : []);
        if (!piperVoice) {
          throw new Error("Нужен Piper или Chatterbox для озвучки. Робот Windows отключён.");
        }
        const temp = await desktop.createTempDir("kcs-visit-tts-");
        if (!temp.ok || !temp.path) throw new Error(temp.error ?? "temp TTS");
        next = structuredClone(next);
        next.audioAssets = next.audioAssets ?? [];
        let lineNo = 0;
        const totalLines = next.scenes!.reduce((sum, scene) => sum + (scene.dialogues?.length ?? 0), 0);
        for (const scene of next.scenes!) {
          scene.audioTracks = scene.audioTracks ?? [];
          for (const dialogue of [...(scene.dialogues ?? [])]) {
            lineNo += 1;
            setStatus(`Озвучка ${lineNo}/${totalLines}: ${dialogue.text.slice(0, 36)}…`);
            const outPath = await desktop.joinPath(temp.path, `line-${lineNo}-${Date.now()}.wav`);
            const spoken = await desktop.synthesizeSpeech(
              dialogue.text,
              outPath,
              piperSpeakOptions(piperVoice),
            );
            if (!spoken.ok || !spoken.path) throw new Error(spoken.error ?? `TTS строка ${lineNo}`);
            const duration = spoken.duration ?? estimateSpeechDuration(dialogue.text);
            const assetId = createId("audio");
            const trackId = createId("atrack");
            next.audioAssets.push({
              id: assetId,
              name: dialogue.text.slice(0, 48),
              path: spoken.path,
              mediaType: "audio/wav",
              duration,
            });
            scene.audioTracks.push(createEmptyAudioTrack({
              id: trackId,
              assetId,
              name: `TTS ${lineNo}`,
              duration,
              startTime: dialogue.startTime,
              volume: 1,
            }));
            dialogue.duration = duration;
            dialogue.audioTrackId = trackId;
          }
          retimeSceneDialoguesWithTts(scene);
          // Re-tile this scene's own music bed after duration change
          const musicTracks = (scene.audioTracks ?? []).filter((track) => track.name.startsWith("Music:"));
          const nonMusic = (scene.audioTracks ?? []).filter((track) => !track.name.startsWith("Music:"));
          const musicAssetId = musicTracks[0]?.assetId;
          const musicAsset = musicAssetId ? next.audioAssets.find((item) => item.id === musicAssetId) : undefined;
          if (musicAsset) {
            const volume = musicTracks[0]?.volume ?? 0.28;
            scene.audioTracks = [...tileMusicForScene(musicAsset, scene.duration, volume), ...nonMusic];
          } else {
            scene.audioTracks = nonMusic;
          }
        }
      }

      const migrated = migrateProject(next);
      const committed = history.current.commit(migrated, "Visit Cartoon");
      projectRef.current = committed;
      setProject(committed);
      setHistoryTick((value) => value + 1);
      const first = committed.scenes![0]!;
      setCurrentSceneIdState(first.id);
      setSelectedActorIdState(first.actors[0]?.id ?? null);
      setSelectedPropIdState(null);
      setSelectedAttachmentId(null);
      setSelectedPartId(committed.characters.find((character) => character.id === first.actors[0]?.characterId)?.parts[0]?.id ?? null);
      setTime(0);
      setPlaying(false);
      setMontageModeState(true);
      await ensureAmplitudeEnvelopes();
      const total = Math.round(committed.scenes!.reduce((sum, scene) => sum + scene.duration, 0));
      setStatus(`Мультик OK build-2026-08-09b: 3 сцены, музыка по сценам, ~${total}с. Включите Montage+Play.`);
      setScriptPanelOpen(false);
      if (options?.exportAfter) {
        await exportController.exportMontageVideo(committed, committed.renderSettings ?? createDefaultRenderSettings());
      }
    } finally {
      setScriptGenerating(false);
    }
  }), [desktop, ensureAmplitudeEnvelopes, exportController, exportState.phase, scriptGenerating, withErrors]);

  const generateCartoonFromPrompt = useCallback((options: {
    prompt: string;
    musicFolder: string;
    generateTts: boolean;
    voiceMode?: AdVoiceMode;
    exportAfter: boolean;
    skipMusic?: boolean;
  }) => withErrors(async () => {
    const plan = parseCartoonPrompt(options.prompt);
    if (!plan.scenes.length) throw new Error(plan.warnings[0] ?? "Промпт не разобран. Добавьте «Имя: реплика» и ## сцены.");
    if (options.prompt.trim()) setStudioPrefs({ lastPrompt: options.prompt });
    const script = planToScript(plan);

    // Ensure AudioBeast cast only when the prompt actually names heroes.
    const onlyDemoOrEmpty = projectRef.current.characters.every(
      (item) => isDemoBotCharacter(item) || (item.parts?.length ?? 0) === 0,
    );
    const needPacks = plan.characters.length > 0 && (
      preferredCastCharacters(projectRef.current.characters).length < Math.min(3, plan.characters.length)
      || onlyDemoOrEmpty
    );
    if (plan.characters.length > 0 && (needPacks || projectRef.current.characters.every((item) => isDemoBotCharacter(item)))) {
      setStatus("Промпт: подгружаю AudioBeast rigs…");
      const rootResult = await desktop.getCharactersRoot();
      if (rootResult.ok && rootResult.path) {
        const packs: BundledCharacterPack[] = [];
        for (const monster of AUDIO_BEAST_FIGHT_CAST) {
          const assetsDir = await desktop.joinPath(rootResult.path, ...monster.folder.split("/"), "Assets");
          const resolvedFiles: Record<string, string> = {};
          let ok = true;
          for (const file of audioBeastAssetFiles()) {
            const assetPath = await desktop.joinPath(assetsDir, file);
            if (!(await desktop.pathExists(assetPath))) { ok = false; break; }
            resolvedFiles[file] = assetPath;
          }
          if (!ok) continue;
          packs.push(buildPackFromSpec(monster, (fileName) => resolvedFiles[fileName]!));
        }
        if (packs.length) {
          let draft = structuredClone(projectRef.current);
          for (const pack of packs) {
            const renamed = structuredClone(pack.character);
            if (renamed.id === "character-emberpuff") renamed.name = "Огонёк";
            if (renamed.id === "character-frostfang") renamed.name = "Морозко";
            if (renamed.id === "character-gearbot") renamed.name = "Винтик";
            const index = draft.characters.findIndex((item) => item.id === renamed.id);
            if (index >= 0) draft.characters[index] = renamed;
            else draft.characters.push(renamed);
            const ids = new Set(pack.assets.map((asset) => asset.id));
            draft.assets = [...draft.assets.filter((asset) => !ids.has(asset.id)), ...pack.assets];
          }
          // Drop DemoBot from cast so prompts never silently keep using it.
          if (!plan.characters.some((name) => /demobot/i.test(name))) {
            draft.characters = draft.characters.filter((item) => !isDemoBotCharacter(item));
            const keep = new Set(draft.characters.flatMap((item) => item.parts.map((part) => part.assetId)));
            draft.assets = draft.assets.filter((asset) => !String(asset.path).includes("builtin://demobot/") || keep.has(asset.id));
          }
          projectRef.current = draft;
          setProject(draft);
        }
      }
    }

    const mapping = autoMapScriptCharacters(plan.characters, projectRef.current.characters);
    const wantsDemo = plan.characters.some((name) => /demobot/i.test(name));
    if (!wantsDemo) {
      const stolen = plan.characters.filter((name) => {
        const id = mapping[name];
        const character = projectRef.current.characters.find((item) => item.id === id);
        return !id || (character ? isDemoBotCharacter(character) : true);
      });
      if (stolen.length) {
        throw new Error(
          `Нет рига для: ${stolen.join(", ")}. DemoBot больше не подставляю. Загрузите Characters (Огонёк/Морозко/Винтик) или Load Rig.`,
        );
      }
    }
    await generateCartoonFromScript({
      script,
      mapping,
      generateTts: options.generateTts,
      voiceMode: options.voiceMode
        ?? (options.generateTts ? "natural" : "off"),
      replaceScenes: true,
      subtitles: true,
      exportAfter: false,
      skipPromptEnrich: true,
    });

    // Backgrounds + props from Assets/Backgrounds and Assets/Props (dump folders), then paint/gestures.
    const assetsRoot = await desktop.getAssetsRoot();
    let dumpBgs: LocalImageFile[] = [];
    let dumpProps: LocalImageFile[] = [];
    if (assetsRoot.ok && assetsRoot.path) {
      const bgFolder = await desktop.joinPath(assetsRoot.path, STAGE_DUMP_BACKGROUNDS);
      const propFolder = await desktop.joinPath(assetsRoot.path, STAGE_DUMP_PROPS);
      await desktop.ensureDirectory(bgFolder);
      await desktop.ensureDirectory(propFolder);
      const listedBg = await desktop.listImageFolder(bgFolder);
      const listedProps = await desktop.listImageFolder(propFolder);
      if (listedBg.ok) dumpBgs = listedBg.files;
      if (listedProps.ok) dumpProps = listedProps.files;
    }
    const projectDump: LocalImageFile[] = (projectRef.current.assets ?? [])
      .filter((asset) => asset.mediaType.startsWith("image/"))
      .map((asset) => ({ path: asset.path, name: asset.name, width: asset.width, height: asset.height }));
    const dumpPropUsable = usableStagePropFiles(dumpProps);
    const projectPropUsable = usableStagePropFiles(projectDump);
    const usedBg = new Set<string>();
    const pickedBgs = plan.scenes.map((scenePlan) => pickBackgroundFromDump(usableStageBackgroundFiles(dumpBgs), scenePlan.backgroundKey, usedBg));
    const propNames = resolvePromptPropNames(plan, dumpPropUsable);

    commit("Промпт: фоны и мизансцена", (draft) => {
      const upsertDump = (file: LocalImageFile): string => {
        const label = file.name.replace(/\.[^.]+$/, "");
        let asset = draft.assets.find((item) => item.path === file.path);
        if (!asset) {
          asset = {
            id: createId("asset"),
            name: label,
            path: file.path,
            mediaType: "image/png",
            width: file.width,
            height: file.height,
          };
          draft.assets = [...draft.assets, asset];
        }
        return asset.id;
      };
      const bgIds = pickedBgs.map((file) => (file ? upsertDump(file) : undefined));
      const usedProps = new Set<string>();
      for (const name of propNames) {
        const file = matchDumpProp(dumpPropUsable, name, usedProps)
          ?? (plan.props.length ? matchDumpProp(projectPropUsable, name, usedProps) : undefined);
        if (file) upsertDump(file);
      }
      const enriched = enrichScenesFromPromptPlan(draft, { ...plan, props: propNames }, bgIds);
      draft.scenes = enriched.scenes;
      draft.montage = enriched.montage;
      draft.renderSettings = enriched.renderSettings;
      draft.assets = enriched.assets;
      draft.activeSceneId = enriched.activeSceneId;
    });

    // Music: keep the last chosen folder. Bundled Assets/Audio only if nothing was picked.
    if (!options.skipMusic) {
      let musicFolder = options.musicFolder.trim() || studioPrefsRef.current.musicFolder.trim();
      if (options.musicFolder.trim()) setStudioPrefs({ musicFolder: options.musicFolder.trim() });
      if (!musicFolder && !/реклам/i.test(plan.genre)) {
        const assetsRootForMusic = await desktop.getAssetsRoot();
        if (assetsRootForMusic.ok && assetsRootForMusic.path) {
          const bundled = await desktop.joinPath(assetsRootForMusic.path, STAGE_DUMP_AUDIO);
          if (await desktop.pathExists(bundled)) musicFolder = bundled;
        }
      }
      if (musicFolder) {
        const listed = await desktop.listAudioFolder(musicFolder);
        if (listed.ok && listed.files.length) {
          const used = new Set<string>();
          commit("Музыка по сценам из папки", (draft) => {
            draft.audioAssets = draft.audioAssets ?? [];
            draft.scenes?.forEach((scene, index) => {
              const mood = plan.musicHints[index] ?? plan.musicHints[0] ?? "neutral";
              const pick = pickMusicForMood(listed.files, mood, used);
              if (!pick) return;
              const assetId = createId("audio");
              const asset = toAudioAsset(pick, assetId, pick.duration || 30);
              draft.audioAssets = [...(draft.audioAssets ?? []).filter((item) => item.id !== assetId), asset];
              const nonMusic = (scene.audioTracks ?? []).filter((track) => !String(track.name).startsWith("Music:"));
              scene.audioTracks = [...tileMusicForScene(asset, scene.duration, 0.28), ...nonMusic];
            });
          });
        }
      }
    }

    const activeId = projectRef.current.activeSceneId ?? projectRef.current.scenes?.[0]?.id;
    if (activeId) {
      const activeScene = projectRef.current.scenes?.find((scene) => scene.id === activeId) ?? projectRef.current.scenes?.[0];
      if (activeScene) {
        setCurrentSceneIdState(activeScene.id);
        setSelectedActorIdState(activeScene.actors[0]?.id ?? null);
      }
    }

    setMontageModeState(false);
    setPlaying(false);
    setTime(0);
    const assets = projectRef.current.assets;
    const missingProps = propNames.filter((name) => {
      const needle = name.trim().toLowerCase();
      return !assets.some((asset) => {
        const label = asset.name.trim().toLowerCase();
        return label === needle || label.includes(needle) || needle.includes(label);
      });
    });
    const bgHits = pickedBgs.filter(Boolean).length;
    const bgNote = `${bgHits}/${plan.scenes.length} фонов`;
    const propNote = propNames.length
      ? (missingProps.length
        ? ` · props нет PNG: ${missingProps.join(", ")}`
        : ` · props: ${propNames.join(", ")}`)
      : "";
    setStatus(`Промпт→мультик: «${plan.title}», ${plan.scenes.length} сцен (${bgNote})${propNote}. Смотрите сцену 1; Монтаж ▶ — все подряд.`);
    if (options.exportAfter) {
      await exportController.exportMontageVideo(projectRef.current, projectRef.current.renderSettings ?? createDefaultRenderSettings());
    }
  }), [commit, desktop, exportController, generateCartoonFromScript, withErrors]);

  const addAttachmentFromLibrary = useCallback((libraryId: string, color?: string) => {
    const item = attachmentLibrary.find((entry) => entry.id === libraryId);
    if (!item || !selectedActorId) { setError("Выберите Actor для PartForge."); return; }
    const tint = color ?? partForgeColor;
    const asset = createLibraryAttachmentAsset(item, tint);
    const attachmentId = createId("attach");
    commit(`PartForge: ${item.label}`, (draft) => {
      draft.assets.push(asset);
      const scene = draft.scenes!.find((entry) => entry.id === currentScene.id)!;
      scene.attachments = scene.attachments ?? [];
      scene.attachments.push(createEmptyAttachment({
        id: attachmentId,
        name: item.label,
        actorId: selectedActorId,
        assetId: asset.id,
        socketType: item.preferredSocket === "Custom" ? "HeadTop" : item.preferredSocket,
        kind: item.kind,
        offset: item.kind === "hat" || item.kind === "glasses" || item.kind === "cloud"
          ? { x: 0, y: -8 }
          : item.kind === "sword" || item.kind === "wand" || item.kind === "flag"
            ? { x: 0, y: 20 }
            : { x: 40, y: -20 },
      }));
    });
    setSelectedAttachmentId(attachmentId);
    setStatus(`PartForge: добавлен ${item.label}`);
  }, [commit, currentScene.id, partForgeColor, selectedActorId]);

  const addAttachmentFromAsset = useCallback((assetId: string) => {
    if (!selectedActorId) { setError("Выберите Actor для attachment."); return; }
    const asset = projectRef.current.assets.find((item) => item.id === assetId);
    if (!asset) return;
    const attachmentId = createId("attach");
    const socketType = currentCharacter.sockets?.[0]?.type ?? "HandRight";
    commit(`Attachment из asset ${asset.name}`, (draft) => {
      const scene = draft.scenes!.find((entry) => entry.id === currentScene.id)!;
      scene.attachments = scene.attachments ?? [];
      scene.attachments.push(createEmptyAttachment({
        id: attachmentId,
        name: asset.name,
        actorId: selectedActorId,
        assetId,
        socketType,
        kind: "custom",
      }));
    });
    setSelectedAttachmentId(attachmentId);
  }, [commit, currentCharacter.sockets, currentScene.id, selectedActorId]);

  const updateAttachment = useCallback((id: string, patch: Partial<ActorAttachment>) => {
    commit("Attachment изменён", (draft) => {
      const attachment = draft.scenes!.find((scene) => scene.id === currentScene.id)!.attachments?.find((item) => item.id === id);
      if (attachment) Object.assign(attachment, patch);
    });
  }, [commit, currentScene.id]);

  const deleteAttachment = useCallback((id: string) => {
    commit("Attachment удалён", (draft) => {
      const scene = draft.scenes!.find((item) => item.id === currentScene.id)!;
      scene.attachments = (scene.attachments ?? []).filter((item) => item.id !== id);
    });
    setSelectedAttachmentId(null);
  }, [commit, currentScene.id]);

  const deleteSelectedFromScene = useCallback(() => {
    if (selectedAttachmentId) {
      deleteAttachment(selectedAttachmentId);
      return true;
    }
    if (selectedPropId) {
      deleteProp(selectedPropId);
      return true;
    }
    if (selectedActorId) {
      deleteActor(selectedActorId);
      return true;
    }
    setStatus("Нечего удалять — выберите актёра или предмет");
    return false;
  }, [deleteActor, deleteAttachment, deleteProp, selectedActorId, selectedAttachmentId, selectedPropId]);

  const duplicateSelectedAttachment = useCallback(() => {
    const source = (projectRef.current.scenes?.find((scene) => scene.id === currentScene.id)?.attachments ?? [])
      .find((item) => item.id === selectedAttachmentId);
    if (!source) { setError("Выберите attachment для дублирования."); return; }
    const copy = duplicateAttachment(source);
    commit("Attachment дублирован", (draft) => {
      const scene = draft.scenes!.find((entry) => entry.id === currentScene.id)!;
      scene.attachments = scene.attachments ?? [];
      scene.attachments.push(copy);
    });
    setSelectedAttachmentId(copy.id);
  }, [commit, currentScene.id, selectedAttachmentId]);

  const saveSelectedAttachmentPreset = useCallback((name?: string) => {
    const source = (projectRef.current.scenes?.find((scene) => scene.id === currentScene.id)?.attachments ?? [])
      .find((item) => item.id === selectedAttachmentId);
    if (!source) { setError("Выберите attachment для пресета."); return; }
    const preset = createPresetFromAttachment(source, name);
    commit(`Пресет PartForge: ${preset.name}`, (draft) => {
      draft.attachmentPresets = draft.attachmentPresets ?? [];
      draft.attachmentPresets.push(preset);
    });
    setStatus(`Пресет сохранён: ${preset.name}`);
  }, [commit, currentScene.id, selectedAttachmentId]);

  const applyAttachmentPreset = useCallback((presetId: string) => {
    if (!selectedActorId) { setError("Выберите Actor для пресета."); return; }
    const preset = (projectRef.current.attachmentPresets ?? []).find((item) => item.id === presetId);
    if (!preset) return;
    if (!projectRef.current.assets.some((asset) => asset.id === preset.assetId)) {
      setError("Asset пресета отсутствует в проекте.");
      return;
    }
    const attachment = attachmentFromPreset(preset, selectedActorId);
    commit(`Пресет применён: ${preset.name}`, (draft) => {
      const scene = draft.scenes!.find((entry) => entry.id === currentScene.id)!;
      scene.attachments = scene.attachments ?? [];
      scene.attachments.push(attachment);
    });
    setSelectedAttachmentId(attachment.id);
  }, [commit, currentScene.id, selectedActorId]);

  const deleteAttachmentPreset = useCallback((presetId: string) => {
    commit("Пресет PartForge удалён", (draft) => {
      draft.attachmentPresets = (draft.attachmentPresets ?? []).filter((item) => item.id !== presetId);
    });
  }, [commit]);

  const attachmentPresets = project.attachmentPresets ?? [];
  const series = syncSeriesWithScenes(project.series, project.scenes, project.name);

  const updateSeries = useCallback((patch: Partial<Pick<ProjectSeries, "name">>) => {
    commit("Series обновлена", (draft) => {
      draft.series = { ...syncSeriesWithScenes(draft.series, draft.scenes, draft.name), ...patch };
    });
  }, [commit]);

  const syncSeries = useCallback(() => {
    commit("Series синхронизирована со сценами", (draft) => {
      draft.series = syncSeriesWithScenes(draft.series, draft.scenes, draft.name);
    });
  }, [commit]);

  const addSeriesEpisode = useCallback(() => {
    commit("Episode добавлен", (draft) => {
      draft.series = syncSeriesWithScenes(draft.series, draft.scenes, draft.name);
      const nextNumber = (draft.series.episodes.reduce((max, item) => Math.max(max, item.number), 0) || 0) + 1;
      draft.series.episodes.push({
        id: createId("ep"),
        number: nextNumber,
        title: `Episode ${nextNumber}`,
        enabled: true,
        sceneIds: (draft.scenes ?? []).map((scene) => scene.id),
      });
    });
  }, [commit]);

  const applyEpisodeTemplate = useCallback((templateId: EpisodeTemplateId) => {
    if (!window.confirm("Заменить список эпизодов Series выбранным шаблоном?")) return;
    commit(`Series шаблон: ${templateId}`, (draft) => {
      const next = applyEpisodeTemplateToProject(draft, templateId);
      draft.series = next.series;
    });
    setStatus(`Series: применён шаблон ${templateId}`);
  }, [commit]);

  const updateSeriesEpisode = useCallback((id: string, patch: Partial<SeriesEpisode>) => {
    commit("Episode изменён", (draft) => {
      draft.series = syncSeriesWithScenes(draft.series, draft.scenes, draft.name);
      const episode = draft.series.episodes.find((item) => item.id === id);
      if (episode) Object.assign(episode, patch);
    });
  }, [commit]);

  const deleteSeriesEpisode = useCallback((id: string) => {
    commit("Episode удалён", (draft) => {
      draft.series = syncSeriesWithScenes(draft.series, draft.scenes, draft.name);
      draft.series.episodes = draft.series.episodes.filter((item) => item.id !== id);
    });
  }, [commit]);

  const moveSeriesEpisode = useCallback((id: string, direction: -1 | 1) => {
    commit(direction < 0 ? "Episode выше" : "Episode ниже", (draft) => {
      draft.series = moveSeriesEpisodeOrder(syncSeriesWithScenes(draft.series, draft.scenes, draft.name), id, direction);
    });
  }, [commit]);

  const renumberSeries = useCallback(() => {
    commit("Нумерация Series", (draft) => {
      draft.series = renumberSeriesEpisodes(syncSeriesWithScenes(draft.series, draft.scenes, draft.name));
    });
  }, [commit]);

  useEffect(() => {
    if (!montageMode || !montageMapped) return;
    if (montageMapped.scene.id === currentSceneId) return;
    setCurrentSceneIdState(montageMapped.scene.id);
    setSelectedActorIdState(montageMapped.scene.actors[0]?.id ?? null);
    setSelectedPropIdState(null);
    setSelectedAttachmentId(null);
    setSelectedPartId(project.characters.find((character) => character.id === montageMapped.scene.actors[0]?.characterId)?.parts[0]?.id ?? null);
  }, [currentSceneId, montageMapped, montageMode, project.characters]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        clearSceneSelection();
        setStatus("Выбор снят — свойства сцены / фона");
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      // Use event.code — on RU layout KeyZ still works (event.key would be «я»)
      if (event.code === "KeyZ" && !event.shiftKey) {
        event.preventDefault();
        if (history.current.canUndo()) undo();
        else setStatus("Нечего отменять");
        return;
      }
      if (event.code === "KeyZ" && event.shiftKey) {
        event.preventDefault();
        if (history.current.canRedo()) redo();
        else setStatus("Нечего повторить");
        return;
      }
      if (event.code === "KeyY") {
        event.preventDefault();
        if (history.current.canRedo()) redo();
        return;
      }
      if (event.code === "KeyS") {
        event.preventDefault();
        void saveProject(event.shiftKey);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [clearSceneSelection, redo, saveProject, undo]);
  useEffect(() => { if (currentScene.generatedTimeline && currentScene.generatedTimeline.sourceHash !== actionSequenceHash(currentScene.actionSequence)) setStatus("Actions изменены — нажмите Build Timeline"); }, [currentScene.actionSequence, currentScene.generatedTimeline]);
  useEffect(() => () => audioEngine.stopAll(), [audioEngine]);
  useEffect(() => { void ensureAmplitudeEnvelopes(); }, [ensureAmplitudeEnvelopes, project.audioAssets]);

  const value: EditorContextValue = { project, projectPath, recentProjects, projectGateOpen, projectDirty, autosaveEnabled, lastAutosaveAt, currentScene, currentSceneId, selectedActorId, selectedPropId, selectedPartId, selectedSocketId, selectedAttachmentId, currentCharacter, selectedPart, currentClip, currentClipId, previewMotion, time, sceneTime, playbackDuration, playing, loop, montageMode, onionSkinEnabled, tool, directorLocomotion, status, error,
    renderSettings, exportPanelOpen, characterCreatorOpen, montagePanelOpen, partForgeOpen, seriesPanelOpen, scriptPanelOpen, helpPanelOpen, cartoonWizardOpen, voiceStudioOpen, scriptGenerating, exportState, creatorPalette, partForgeColor,
    canUndo: history.current.canUndo(), canRedo: history.current.canRedo(), undoLabel: history.current.peekUndoLabel(), setCurrentSceneId, setSelectedActorId: (id) => { setSelectedActorIdState(id); setSelectedPropIdState(null); setSelectedAttachmentId(null); const actor = currentScene.actors.find((item) => item.id === id); setSelectedPartId(project.characters.find((character) => character.id === actor?.characterId)?.parts[0]?.id ?? null); if (id) setRequestedRightTab("inspector"); }, setSelectedPropId: (id) => { setSelectedPropIdState(id); if (id) { setSelectedActorIdState(null); setSelectedPartId(null); setSelectedSocketId(null); setSelectedAttachmentId(null); setRequestedRightTab("inspector"); } }, setSelectedPartId, setSelectedSocketId, setSelectedAttachmentId, clearSceneSelection, setCurrentClipId: (id) => { setCurrentClipIdState(id); setPreviewMotionState(null); setTime(0); setPlaying(false); }, setTime, setPlaying, setLoop, setMontageMode, setOnionSkinEnabled, setTool, setDirectorLocomotion, setPreviewMotion: (motion) => { setPreviewMotionState(motion); setTime(0); setPlaying(false); }, commit, preview, finishPreview, undo, redo,
    newProject, openProject, openProjectAt, saveProject, continueWithDemo, openProjectGate, dismissProjectGate, setAutosaveEnabled, removeRecentProject, refreshRecentProjects, getProjectsDir, openProjectsFolder, recoverAndRefreshProjects, openStudioFolder, importPng, createCharacter, saveCharacter, loadCharacter, loadCharacterPngFolder, changeParent, addKeyframe, deleteKeyframe, setCurrentAsBindPose, resetPose, applyPosePreset, saveCustomPose, deleteCustomPose, addSocket,
    newScene, newSceneFromTemplate, duplicateScene, renameScene, setSceneDuration, deleteScene, addActor, deleteActor, deleteProp, deleteAsset, clearSceneBackground, setSceneBackgroundColor, setSceneBackgroundFill, applySceneBackgroundPreset, syncExportBackgroundFromScene, nudgePropLayer, setPropVisible, setActorVisible, duplicateProp, duplicateActor, reorderActor, alignSelection, deleteSelectedFromScene, addAction, updateAction, deleteAction, duplicateAction, moveAction, buildTimeline, markTimelineManual, insertDirectorAction, insertMotionSegment, commitActorPath,
    requestedTimelineMode, clearRequestedTimelineMode, requestedRightTab, requestRightTab, clearRequestedRightTab, listStudioImages, addStudioImageAsBackground, addStudioImageAsProp, importPngAs, addDemoBotToScene, addBundledCharacterToScene, insertGestureAtPlayhead, openGestureClip, openBuiltinGestureClip, ensureGestureClips, duplicateGestureClip, renameGestureClip, createPoseClip,
    setExportPanelOpen, setCharacterCreatorOpen, setMontagePanelOpen, setPartForgeOpen, setSeriesPanelOpen, setScriptPanelOpen, setHelpPanelOpen, setCartoonWizardOpen, setVoiceStudioOpen, setPartForgeColor, openToolPanel, closeTopPanel, clearError, reportError, setStatus, desktop, voiceTakes, autoLipSyncEnabled, setAutoLipSyncEnabled: setAutoLipSyncEnabledPersist, upsertVoiceProfile, deleteVoiceProfile, assignCharacterVoice, updateCharacterMouthSet, addVoiceTake, updateVoiceTake, clearVoiceTakes, addVoiceTakeToTimeline, generateLipSyncForTake, clearLipSyncForTake, generateMissingLipSyncForScene, updateDialogueLipSync, generateCartoonFromScript, generateCartoonFromPrompt, loadAudioBeastFightDemo, loadMeadowDialogueDemo, speechSettings, setSpeechSettings, studioPrefs, setStudioPrefs, updateRenderSettings, chooseExportDirectory, exportCurrentFrame, exportPngSequence, exportVideo, exportMontageVideo, exportMontagePngSequence, exportSeriesPack, cancelExport, openExportOutput,
    importAudio, synthesizeDialogue, synthesizeDialogueLine, addDialogue, updateDialogue, deleteDialogue, updateAudioTrack, deleteAudioTrack, updateSubtitleSettings,
    updateLipSyncSettings, syncDialogueToLinkedTrack, exportSubtitlesSrt, ensureAmplitudeEnvelopes,
    setCreatorPalette, createCharacterFromTemplate, renameCharacter, selectEditableCharacter, assignLibraryPart, assignProceduralPart, importPngToSlot, applySpritesheetCrops, clearCreatorSlot, autoHierarchy, setSelectedActorTint,
    montage, montageBlend, montageCrossfade, syncMontage, toggleMontageClip, moveMontageClipUp, moveMontageClipDown, reorderMontageClipTo, jumpToMontageScene, resetMontageOrder, updateMontageSettings, setMontageClipTransitionOut,
    addAttachmentFromLibrary, addAttachmentFromAsset, updateAttachment, deleteAttachment, duplicateSelectedAttachment, saveSelectedAttachmentPreset, applyAttachmentPreset, deleteAttachmentPreset, attachmentPresets,
    series, updateSeries, syncSeries, addSeriesEpisode, applyEpisodeTemplate, updateSeriesEpisode, deleteSeriesEpisode, moveSeriesEpisode, renumberSeries,
    audioEngine };
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue { const value = useContext(EditorContext); if (!value) throw new Error("useEditor must be used inside EditorProvider"); return value; }
