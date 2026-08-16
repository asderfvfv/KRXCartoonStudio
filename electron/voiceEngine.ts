import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserWindow } from "electron";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type VoiceEngineState =
  | "not_installed"
  | "unloaded"
  | "starting"
  | "loading"
  | "ready"
  | "queued"
  | "generating"
  | "completed"
  | "failed";

export interface VoiceEngineStatus {
  state: VoiceEngineState;
  device?: string | null;
  modelLoaded?: boolean;
  lastError?: string | null;
  queueLength?: number;
  gpu?: {
    cuda_available?: boolean;
    gpu_name?: string | null;
    cuda_version?: string | null;
    torch_version?: string | null;
    vram_total_mb?: number;
  } | null;
  t3_model?: string | null;
  sample_rate?: number | null;
  languages?: Record<string, string>;
  emotions?: string[];
  emotion_presets?: Record<string, { exaggeration: number; cfg_weight: number }>;
  engineRoot?: string;
  pythonPath?: string | null;
  setupStatusPath?: string | null;
  installed?: boolean;
}

interface PendingRequest {
  id: string;
  cmd: string;
  params: Record<string, unknown>;
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

function resolveAppRoot(): string {
  // dist-electron/voiceEngine.js → project root in dev; resources in packaged builds
  const candidates = [
    path.resolve(__dirname, ".."),
    path.resolve(process.resourcesPath ?? "", ".."),
    path.resolve(process.resourcesPath ?? "", "app.asar.unpacked"),
    process.cwd(),
  ];
  for (const root of candidates) {
    if (existsSync(path.join(root, "voice-engine", "worker.py"))) return root;
    if (existsSync(path.join(root, "package.json")) && existsSync(path.join(root, "voice-engine"))) return root;
  }
  return path.resolve(__dirname, "..");
}

export function getVoiceEngineRoot(): string {
  const appRoot = resolveAppRoot();
  const packaged = path.join(process.resourcesPath ?? "", "voice-engine");
  if (existsSync(path.join(packaged, "worker.py"))) return packaged;
  return path.join(appRoot, "voice-engine");
}

export function getVoiceEnginePython(): string | null {
  const root = getVoiceEngineRoot();
  const win = path.join(root, ".venv", "Scripts", "python.exe");
  const nix = path.join(root, ".venv", "bin", "python");
  if (existsSync(win)) return win;
  if (existsSync(nix)) return nix;
  return null;
}

export function isVoiceEngineInstalled(): boolean {
  const root = getVoiceEngineRoot();
  return existsSync(path.join(root, "worker.py")) && Boolean(getVoiceEnginePython());
}

export class VoiceEngineManager {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pending = new Map<string, PendingRequest>();
  private queue: PendingRequest[] = [];
  private busy = false;
  private seq = 0;
  private lastStatus: VoiceEngineStatus = {
    state: "not_installed",
    installed: false,
    queueLength: 0,
  };
  private getWindow: () => BrowserWindow | null;

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow;
  }

  getStatus(): VoiceEngineStatus {
    return {
      ...this.lastStatus,
      installed: isVoiceEngineInstalled(),
      pythonPath: getVoiceEnginePython(),
      engineRoot: getVoiceEngineRoot(),
      setupStatusPath: path.join(getVoiceEngineRoot(), "setup-status.json"),
      queueLength: this.queue.length + (this.busy ? 1 : 0),
    };
  }

  private broadcast(): void {
    const win = this.getWindow();
    win?.webContents.send("voice:status", this.getStatus());
  }

  private setState(patch: Partial<VoiceEngineStatus>): void {
    this.lastStatus = { ...this.getStatus(), ...patch };
    this.broadcast();
  }

  async ensureWorker(): Promise<void> {
    if (this.process && !this.process.killed) return;
    const python = getVoiceEnginePython();
    const root = getVoiceEngineRoot();
    const worker = path.join(root, "worker.py");
    if (!python || !existsSync(worker)) {
      this.setState({ state: "not_installed", installed: false, lastError: "Voice Engine не установлен. Запустите setup-voice-engine.ps1." });
      throw new Error("Voice Engine не установлен. Запустите voice-engine\\setup-voice-engine.ps1");
    }
    this.setState({ state: "starting", lastError: null, installed: true, pythonPath: python, engineRoot: root });
    await new Promise<void>((resolve, reject) => {
      const child = spawn(python, ["-u", worker], {
        cwd: root,
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
          HF_HUB_DISABLE_TELEMETRY: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      this.process = child;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const ok = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
      child.stderr.on("data", (chunk: string) => {
        const text = String(chunk).trim();
        if (text) console.log(`[voice-engine] ${text}`);
      });
      child.on("error", (error) => {
        this.process = null;
        this.setState({ state: "failed", lastError: error.message });
        fail(error);
      });
      child.on("exit", (code) => {
        this.process = null;
        for (const item of this.pending.values()) {
          item.reject(new Error(`Voice Engine exited (code ${code})`));
        }
        this.pending.clear();
        this.queue = [];
        this.busy = false;
        this.setState({ state: "unloaded", modelLoaded: false, lastError: code ? `Worker exit ${code}` : null });
      });
      // hello event arrives via stdout handler
      const timer = setTimeout(() => {
        if (!settled) {
          this.setState({ state: "unloaded", lastError: null });
          ok();
        }
      }, 8000);
      child.stdout.once("data", () => {
        clearTimeout(timer);
        ok();
      });
    });
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        console.warn("[voice-engine] bad JSON:", line.slice(0, 200));
        continue;
      }
      if (msg.event === "hello") {
        this.setState({ state: "unloaded", installed: true, lastError: null });
        continue;
      }
      if (msg.event === "status" || (msg.state && !("id" in msg))) {
        this.applyWorkerStatus(msg);
        continue;
      }
      const id = typeof msg.id === "string" || typeof msg.id === "number" ? String(msg.id) : null;
      if (!id) continue;
      const pending = this.pending.get(id);
      if (!pending) continue;
      this.pending.delete(id);
      if (msg.ok) {
        const result = (msg.result && typeof msg.result === "object" ? msg.result : {}) as Record<string, unknown>;
        this.applyWorkerStatus(result);
        pending.resolve(result);
      } else {
        const error = new Error(String(msg.error ?? "Voice Engine error"));
        this.setState({ state: "failed", lastError: error.message });
        pending.reject(error);
      }
      this.busy = false;
      void this.pumpQueue();
    }
  }

  private applyWorkerStatus(raw: Record<string, unknown>): void {
    const stateRaw = typeof raw.state === "string" ? raw.state : this.lastStatus.state;
    const mapped: VoiceEngineState =
      stateRaw === "loading" ? "loading"
        : stateRaw === "ready" ? "ready"
          : stateRaw === "generating" ? "generating"
            : stateRaw === "failed" ? "failed"
              : stateRaw === "unloaded" ? "unloaded"
                : this.lastStatus.state;
    this.setState({
      state: mapped,
      device: typeof raw.device === "string" ? raw.device : this.lastStatus.device,
      modelLoaded: Boolean(raw.model_loaded ?? (mapped === "ready" || mapped === "generating")),
      lastError: typeof raw.last_error === "string" ? raw.last_error : (raw.last_error === null ? null : this.lastStatus.lastError),
      t3_model: typeof raw.t3_model === "string" ? raw.t3_model : this.lastStatus.t3_model,
      sample_rate: typeof raw.sample_rate === "number" ? raw.sample_rate : this.lastStatus.sample_rate,
      languages: (raw.languages as Record<string, string> | undefined) ?? this.lastStatus.languages,
      emotions: (raw.emotions as string[] | undefined) ?? this.lastStatus.emotions,
      emotion_presets: (raw.emotion_presets as VoiceEngineStatus["emotion_presets"]) ?? this.lastStatus.emotion_presets,
      gpu: (raw.gpu as VoiceEngineStatus["gpu"]) ?? this.lastStatus.gpu,
      installed: true,
    });
  }

  private enqueue(cmd: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const id = `ve-${++this.seq}`;
      const item: PendingRequest = { id, cmd, params, resolve, reject };
      this.queue.push(item);
      this.setState({ state: this.busy || this.lastStatus.state === "generating" || this.lastStatus.state === "loading" ? this.lastStatus.state : "queued" });
      void this.pumpQueue();
    });
  }

  private async pumpQueue(): Promise<void> {
    if (this.busy) return;
    const next = this.queue.shift();
    if (!next) return;
    this.busy = true;
    try {
      await this.ensureWorker();
      if (!this.process?.stdin) throw new Error("Voice Engine stdin unavailable");
      this.pending.set(next.id, next);
      if (next.cmd === "load") this.setState({ state: "loading" });
      if (next.cmd === "generate" || next.cmd === "self_test") this.setState({ state: this.lastStatus.modelLoaded ? "generating" : "loading" });
      this.process.stdin.write(`${JSON.stringify({ id: next.id, cmd: next.cmd, params: next.params })}\n`);
    } catch (error) {
      this.busy = false;
      this.pending.delete(next.id);
      next.reject(error instanceof Error ? error : new Error(String(error)));
      void this.pumpQueue();
    }
  }

  status(): Promise<VoiceEngineStatus> {
    if (!isVoiceEngineInstalled()) {
      const status = this.getStatus();
      this.setState(status);
      return Promise.resolve(status);
    }
    return this.enqueue("status", {}).then((result) => {
      this.applyWorkerStatus(result);
      return this.getStatus();
    }).catch(async () => {
      // Worker may not be running yet — report install probe only
      return this.getStatus();
    });
  }

  load(params?: { preferCuda?: boolean; t3Model?: string }): Promise<VoiceEngineStatus> {
    return this.enqueue("load", {
      prefer_cuda: params?.preferCuda ?? true,
      t3_model: params?.t3Model ?? "v3",
    }).then((result) => {
      this.applyWorkerStatus(result);
      this.setState({ state: "ready", modelLoaded: true });
      return this.getStatus();
    });
  }

  unload(): Promise<VoiceEngineStatus> {
    return this.enqueue("unload", {}).then((result) => {
      this.applyWorkerStatus(result);
      this.setState({ state: "unloaded", modelLoaded: false });
      return this.getStatus();
    });
  }

  generate(params: {
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
  }): Promise<Record<string, unknown>> {
    return this.enqueue("generate", {
      text: params.text,
      language_id: params.languageId,
      out_path: params.outPath,
      audio_prompt_path: params.audioPromptPath ?? undefined,
      emotion: params.emotion ?? "neutral",
      exaggeration: params.exaggeration,
      cfg_weight: params.cfgWeight,
      temperature: params.temperature,
      repetition_penalty: params.repetitionPenalty,
      min_p: params.minP,
      top_p: params.topP,
      prefer_cuda: true,
      t3_model: "v3",
    }).then((result) => {
      this.applyWorkerStatus({ ...result, state: "ready" });
      this.setState({ state: "completed", modelLoaded: true });
      // completed is momentary — settle to ready for UI
      setTimeout(() => {
        if (this.lastStatus.state === "completed") this.setState({ state: "ready" });
      }, 400);
      return result;
    });
  }

  async copyReferenceIntoProject(options: {
    sourcePath: string;
    projectPath: string;
    voiceName: string;
    emotion: string;
  }): Promise<{ relativePath: string; absolutePath: string }> {
    const ext = path.extname(options.sourcePath).toLowerCase() || ".wav";
    const allowed = new Set([".wav", ".mp3", ".flac", ".m4a", ".ogg"]);
    if (!allowed.has(ext)) throw new Error(`Неподдерживаемый формат reference: ${ext}`);
    const safeVoice = options.voiceName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "Voice";
    const safeEmotion = options.emotion.replace(/[<>:"/\\|?*]+/g, "_").trim() || "neutral";
    const projectDir = path.dirname(options.projectPath);
    const destDir = path.join(projectDir, "Voices", safeVoice, "References");
    await fs.mkdir(destDir, { recursive: true });
    const destAbs = path.join(destDir, `${safeEmotion}${ext}`);
    await fs.copyFile(options.sourcePath, destAbs);
    const relativePath = path.join("Voices", safeVoice, "References", `${safeEmotion}${ext}`).split(path.sep).join("/");
    return { relativePath, absolutePath: destAbs };
  }

  async ensureDialogueOutPath(options: {
    projectPath: string;
    sceneName: string;
    characterName: string;
    takeIndex: number;
  }): Promise<{ relativePath: string; absolutePath: string }> {
    const projectDir = path.dirname(options.projectPath);
    const safeScene = options.sceneName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "Scene";
    const safeChar = options.characterName.replace(/[<>:"/\\|?*]+/g, "_").trim() || "Character";
    const destDir = path.join(projectDir, "Audio", "Dialogue", safeScene, safeChar);
    await fs.mkdir(destDir, { recursive: true });
    const fileName = `take-${String(options.takeIndex).padStart(3, "0")}-${Date.now()}.wav`;
    const absolutePath = path.join(destDir, fileName);
    const relativePath = path.join("Audio", "Dialogue", safeScene, safeChar, fileName).split(path.sep).join("/");
    return { relativePath, absolutePath };
  }

  async createTempOutPath(prefix = "kcs-voice-"): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    return path.join(dir, `take-${Date.now()}.wav`);
  }

  align(params: {
    text: string;
    audioPath: string;
    languageId?: string;
    minCueDuration?: number;
    anticipation?: number;
  }): Promise<Record<string, unknown>> {
    return this.enqueue("align", {
      text: params.text,
      audio_path: params.audioPath,
      language_id: params.languageId ?? "ru",
      prefer_cuda: true,
      min_cue_duration: params.minCueDuration ?? 0.045,
      anticipation: params.anticipation ?? 0.03,
    });
  }

  alignLoad(preferCuda = true): Promise<Record<string, unknown>> {
    return this.enqueue("align_load", { prefer_cuda: preferCuda });
  }

  alignUnload(): Promise<Record<string, unknown>> {
    return this.enqueue("align_unload", {});
  }

  alignStatus(): Promise<Record<string, unknown>> {
    return this.enqueue("align_status", {}).catch(async () => ({ state: "unloaded" }));
  }

  dispose(): void {
    try {
      this.process?.stdin.end();
      this.process?.kill();
    } catch { /* ignore */ }
    this.process = null;
  }
}
