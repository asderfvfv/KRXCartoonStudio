import type { CharacterDefinition, ProjectDocument } from "../domain/types";

export interface ImportedAsset {
  path: string;
  name: string;
  width: number;
  height: number;
}

export interface DialogResult<T> {
  canceled: boolean;
  filePath?: string;
  data?: T;
}

export interface ImportedAudioAsset {
  path: string;
  name: string;
  mediaType: "audio/wav" | "audio/mpeg" | "audio/ogg" | "audio/mp4" | "audio/flac";
  duration: number;
}

export interface DesktopApi {
  openProject(): Promise<DialogResult<ProjectDocument>>;
  /** Open a known .kcsproj path (last/recent) without a file dialog. */
  openProjectPath(filePath: string): Promise<DialogResult<ProjectDocument>>;
  saveProject(document: ProjectDocument, currentPath?: string): Promise<DialogResult<ProjectDocument>>;
  saveProjectAs(document: ProjectDocument): Promise<DialogResult<ProjectDocument>>;
  /** Save a brand-new project into <app>/Projects without a file dialog. */
  saveNewProject(document: ProjectDocument, projectName?: string): Promise<DialogResult<ProjectDocument>>;
  /** Absolute path to the app-local Projects folder (created if missing). */
  getProjectsDir(): Promise<{ ok: boolean; path?: string; error?: string }>;
  /** Find .kcsproj in Downloads/Documents/Desktop + migrate into Projects; returns recovered paths. */
  recoverRecentProjects(): Promise<{
    ok: boolean;
    projectsDir?: string;
    recovered?: Array<{ path: string; name: string }>;
    error?: string;
  }>;
  importPng(): Promise<DialogResult<ImportedAsset[]>>;
  importAudio(): Promise<DialogResult<ImportedAudioAsset[]>>;
  synthesizeSpeech(
    text: string,
    outPath: string,
    options?: { voiceName?: string; rate?: number; pitch?: string; pitchSemitones?: number; piperModel?: string },
  ): Promise<{ ok: boolean; path?: string; duration?: number; error?: string; engine?: string }>;
  listSpeechVoices(options?: {
    extraFolders?: string[];
    extraModels?: Array<{ name?: string; modelPath?: string; culture?: string; gender?: string }>;
  }): Promise<{
    ok: boolean;
    voices: Array<{ name: string; culture: string; gender: string; engine?: "sapi" | "piper"; modelPath?: string; custom?: boolean }>;
    error?: string;
  }>;
  importPiperModel(): Promise<{
    canceled: boolean;
    voices?: Array<{ name: string; culture: string; gender: string; engine?: "sapi" | "piper"; modelPath?: string; custom?: boolean }>;
    folder?: string;
  }>;
  listAudioFolder(folderPath: string): Promise<{ ok: boolean; files: Array<{ path: string; name: string; duration: number }>; folder?: string; error?: string }>;
  listImageFolder(folderPath: string): Promise<{ ok: boolean; files: Array<{ path: string; name: string; width: number; height: number }>; folder?: string; error?: string }>;
  /** Pick an MP3/WAV; returns the parent folder so all tracks in that folder are used. */
  chooseAudioFolderFromFile(defaultPath?: string): Promise<{ canceled: boolean; path?: string }>;
  readAsset(assetPath: string, projectPath?: string): Promise<string>;
  /** Decode MP3/OGG/M4A/FLAC to a WAV data URL for waveforms / lip-sync. WAV is passed through. */
  readAudioWav(assetPath: string, projectPath?: string): Promise<string>;
  saveCharacter(character: CharacterDefinition, assets: ProjectDocument["assets"], projectPath?: string): Promise<DialogResult<CharacterDefinition>>;
  loadCharacter(): Promise<DialogResult<CharacterDefinition>>;
  /** Folder with separate part PNGs (тело/body, голова/башка/head…). Not a spritesheet. */
  loadCharacterPngFolder(): Promise<DialogResult<CharacterDefinition>>;
  loadBundledCharacter(relativeFolder: string): Promise<DialogResult<CharacterDefinition>>;
  getCharactersRoot(): Promise<{ ok: boolean; path?: string; error?: string }>;
  getAssetsRoot(): Promise<{ ok: boolean; path?: string; error?: string }>;
  chooseDirectory(defaultPath?: string): Promise<{ canceled: boolean; path?: string }>;
  chooseSaveFile(defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<{ canceled: boolean; filePath?: string }>;
  ensureDirectory(targetPath: string): Promise<{ ok: boolean; error?: string; existed?: boolean; path?: string }>;
  pathExists(targetPath: string): Promise<boolean>;
  joinPath(...parts: string[]): Promise<string>;
  resolvePath(assetPath: string, projectPath?: string): Promise<string>;
  writePng(filePath: string, bytes: Uint8Array): Promise<{ ok: boolean; error?: string; path?: string }>;
  writeText(filePath: string, contents: string): Promise<{ ok: boolean; error?: string; path?: string }>;
  createTempDir(prefix: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  removeDirectory(targetPath: string): Promise<{ ok: boolean; error?: string }>;
  checkFfmpeg(): Promise<{ ok: boolean; path?: string; version?: string; error?: string }>;
  runFfmpeg(args: string[], logPath: string): Promise<{ ok: boolean; code?: number; error?: string; logPath?: string }>;
  cancelFfmpeg(): Promise<{ ok: boolean }>;
  openPath(targetPath: string): Promise<{ ok: boolean; error?: string }>;
  setExportBusy(busy: boolean): Promise<{ ok: boolean }>;
  /** Sync unsaved flag to Electron main (for close dialog). */
  setProjectDirty?(dirty: boolean): Promise<{ ok: boolean }>;
  /** Main asks renderer to save before closing the window. */
  onSaveBeforeClose?(listener: () => void): () => void;
  /** Report save/discard/cancel outcome after onSaveBeforeClose. */
  reportSaveBeforeCloseResult?(result: { saved?: boolean; discard?: boolean; canceled?: boolean }): Promise<{ ok: boolean }>;
  /** Native confirm dialog (reliable in Electron; prefer over window.confirm). */
  confirm(message: string, title?: string): Promise<boolean>;
  voiceStatus(): Promise<import("./voiceEngine").VoiceEngineStatusUi>;
  voiceLoad(options?: { preferCuda?: boolean; t3Model?: string }): Promise<import("./voiceEngine").VoiceEngineStatusUi>;
  voiceUnload(): Promise<import("./voiceEngine").VoiceEngineStatusUi>;
  voiceGenerate(payload: {
    text: string;
    languageId: string;
    outPath: string;
    audioPromptPath?: string | null;
    emotion?: string;
    exaggeration?: number;
    cfgWeight?: number;
    temperature?: number;
    repetitionPenalty?: number;
    minP?: number;
    topP?: number;
  }): Promise<{ ok: boolean; path?: string; duration?: number; error?: string; [key: string]: unknown }>;
  voiceImportReference(payload: { projectPath: string; voiceName: string; emotion: string }): Promise<{
    canceled: boolean;
    relativePath?: string;
    absolutePath?: string;
  }>;
  voicePrepareOutPath(payload: {
    projectPath?: string;
    sceneName?: string;
    characterName?: string;
    takeIndex?: number;
  }): Promise<{ ok: boolean; relativePath?: string; absolutePath?: string; error?: string }>;
  voiceRunSetup(): Promise<{ ok: boolean; script?: string; error?: string }>;
  voiceInstalled(): Promise<{ ok: boolean; installed: boolean }>;
  lipSyncAlign(payload: {
    text: string;
    audioPath: string;
    projectPath?: string;
    languageId?: string;
    minCueDuration?: number;
    anticipation?: number;
  }): Promise<{ ok: boolean; cues?: unknown[]; duration?: number; error?: string; [key: string]: unknown }>;
  lipSyncAlignLoad(options?: { preferCuda?: boolean }): Promise<Record<string, unknown>>;
  lipSyncAlignUnload(): Promise<Record<string, unknown>>;
  lipSyncAlignStatus(): Promise<Record<string, unknown>>;
  onVoiceStatus?(listener: (status: import("./voiceEngine").VoiceEngineStatusUi) => void): () => void;
}
