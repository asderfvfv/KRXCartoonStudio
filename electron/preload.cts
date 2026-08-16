import { contextBridge, ipcRenderer } from "electron";

const api = {
  openProject: () => ipcRenderer.invoke("project:open"),
  openProjectPath: (filePath: string) => ipcRenderer.invoke("project:open-path", filePath),
  saveProject: (document: unknown, currentPath?: string) => ipcRenderer.invoke("project:save", document, currentPath),
  saveProjectAs: (document: unknown) => ipcRenderer.invoke("project:save-as", document),
  saveNewProject: (document: unknown, projectName?: string) => ipcRenderer.invoke("project:save-new", document, projectName),
  getProjectsDir: () => ipcRenderer.invoke("project:get-projects-dir"),
  recoverRecentProjects: () => ipcRenderer.invoke("project:recover-recents"),
  importPng: () => ipcRenderer.invoke("asset:import-png"),
  readAsset: (assetPath: string, projectPath?: string) => ipcRenderer.invoke("asset:read", assetPath, projectPath),
  readAudioWav: (assetPath: string, projectPath?: string) => ipcRenderer.invoke("audio:decode-wav", assetPath, projectPath),
  saveCharacter: (character: unknown, assets: unknown, projectPath?: string) => ipcRenderer.invoke("character:save", character, assets, projectPath),
  loadCharacter: () => ipcRenderer.invoke("character:load"),
  loadCharacterPngFolder: () => ipcRenderer.invoke("character:load-png-folder"),
  loadBundledCharacter: (relativeFolder: string) => ipcRenderer.invoke("character:load-bundled", relativeFolder),
  getCharactersRoot: () => ipcRenderer.invoke("characters:get-root"),
  getAssetsRoot: () => ipcRenderer.invoke("assets:get-root"),
  importAudio: () => ipcRenderer.invoke("audio:import"),
  listSpeechVoices: (options?: {
    extraFolders?: string[];
    extraModels?: Array<{ name?: string; modelPath?: string; culture?: string; gender?: string }>;
  }) => ipcRenderer.invoke("audio:list-voices", options),
  importPiperModel: () => ipcRenderer.invoke("audio:import-piper-model"),
  listAudioFolder: (folderPath: string) => ipcRenderer.invoke("audio:list-folder", folderPath),
  listImageFolder: (folderPath: string) => ipcRenderer.invoke("assets:list-images", folderPath),
  chooseAudioFolderFromFile: (defaultPath?: string) => ipcRenderer.invoke("audio:choose-folder-from-file", defaultPath),
  synthesizeSpeech: (text: string, outPath: string, options?: { voiceName?: string; rate?: number; pitch?: string; pitchSemitones?: number; piperModel?: string }) =>
    ipcRenderer.invoke("audio:synthesize", text, outPath, options),
  chooseDirectory: (defaultPath?: string) => ipcRenderer.invoke("export:choose-directory", defaultPath),
  chooseSaveFile: (defaultName: string, filters: Array<{ name: string; extensions: string[] }>) => ipcRenderer.invoke("export:choose-save-file", defaultName, filters),
  ensureDirectory: (targetPath: string) => ipcRenderer.invoke("export:ensure-directory", targetPath),
  pathExists: (targetPath: string) => ipcRenderer.invoke("export:path-exists", targetPath),
  joinPath: (...parts: string[]) => ipcRenderer.invoke("export:join-path", ...parts),
  resolvePath: (assetPath: string, projectPath?: string) => ipcRenderer.invoke("export:resolve-path", assetPath, projectPath),
  writePng: (filePath: string, bytes: Uint8Array) => ipcRenderer.invoke("export:write-png", filePath, bytes),
  writeText: (filePath: string, contents: string) => ipcRenderer.invoke("export:write-text", filePath, contents),
  createTempDir: (prefix: string) => ipcRenderer.invoke("export:create-temp-dir", prefix),
  removeDirectory: (targetPath: string) => ipcRenderer.invoke("export:remove-directory", targetPath),
  checkFfmpeg: () => ipcRenderer.invoke("export:check-ffmpeg"),
  runFfmpeg: (args: string[], logPath: string) => ipcRenderer.invoke("export:run-ffmpeg", args, logPath),
  cancelFfmpeg: () => ipcRenderer.invoke("export:cancel-ffmpeg"),
  openPath: (targetPath: string) => ipcRenderer.invoke("export:open-path", targetPath),
  setExportBusy: (busy: boolean) => ipcRenderer.invoke("export:set-busy", busy),
  setProjectDirty: (dirty: boolean) => ipcRenderer.invoke("project:set-dirty", dirty),
  reportSaveBeforeCloseResult: (result: { saved?: boolean; discard?: boolean; canceled?: boolean }) =>
    ipcRenderer.invoke("app:save-before-close-result", result),
  onSaveBeforeClose: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("app:save-before-close", handler);
    return () => ipcRenderer.removeListener("app:save-before-close", handler);
  },
  confirm: (message: string, title?: string) => ipcRenderer.invoke("dialog:confirm", message, title),
  voiceStatus: () => ipcRenderer.invoke("voice:status"),
  voiceLoad: (options?: { preferCuda?: boolean; t3Model?: string }) => ipcRenderer.invoke("voice:load", options),
  voiceUnload: () => ipcRenderer.invoke("voice:unload"),
  voiceGenerate: (payload: {
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
  }) => ipcRenderer.invoke("voice:generate", payload),
  voiceImportReference: (payload: { projectPath: string; voiceName: string; emotion: string }) =>
    ipcRenderer.invoke("voice:import-reference", payload),
  voicePrepareOutPath: (payload: { projectPath?: string; sceneName?: string; characterName?: string; takeIndex?: number }) =>
    ipcRenderer.invoke("voice:prepare-out-path", payload),
  voiceRunSetup: () => ipcRenderer.invoke("voice:run-setup"),
  voiceInstalled: () => ipcRenderer.invoke("voice:installed"),
  lipSyncAlign: (payload: {
    text: string;
    audioPath: string;
    projectPath?: string;
    languageId?: string;
    minCueDuration?: number;
    anticipation?: number;
  }) => ipcRenderer.invoke("lipsync:align", payload),
  lipSyncAlignLoad: (options?: { preferCuda?: boolean }) => ipcRenderer.invoke("lipsync:align-load", options),
  lipSyncAlignUnload: () => ipcRenderer.invoke("lipsync:align-unload"),
  lipSyncAlignStatus: () => ipcRenderer.invoke("lipsync:align-status"),
  onVoiceStatus: (listener: (status: unknown) => void) => {
    const handler = (_event: unknown, status: unknown) => listener(status);
    ipcRenderer.on("voice:status", handler);
    return () => ipcRenderer.removeListener("voice:status", handler);
  },
};

contextBridge.exposeInMainWorld("kcs", Object.freeze(api));
