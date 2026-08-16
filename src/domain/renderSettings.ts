export type RenderPresetId = "youtube-fullhd" | "youtube-shorts" | "square" | "hd" | "custom";
export type OutputFormat = "mp4" | "webm" | "png-sequence";
export type VideoCodec = "h264" | "vp9" | "vp8";
export type VideoQualityId = "draft" | "standard" | "high";
export type ExportPhase = "idle" | "preparing" | "renderingFrames" | "encodingVideo" | "completed" | "cancelled" | "failed";

export interface RenderSettings {
  preset: RenderPresetId;
  canvasWidth: number;
  canvasHeight: number;
  fps: number;
  duration: number;
  backgroundColor: string;
  transparentBackground: boolean;
  outputFormat: OutputFormat;
  outputDirectory: string;
  videoCodec: VideoCodec;
  videoQuality: VideoQualityId;
  pixelFormat: "yuv420p";
  showSafeFrame: boolean;
  showActionSafe: boolean;
  showTitleSafe: boolean;
}

export interface RenderPreset {
  id: RenderPresetId;
  label: string;
  width: number;
  height: number;
  fps: number;
}

export interface VideoQualityPreset {
  id: VideoQualityId;
  label: string;
  crf: number;
}

export interface ExportJobState {
  phase: ExportPhase;
  currentFrame: number;
  totalFrames: number;
  progress: number;
  outputPath: string;
  startedAt: number | null;
  error: string | null;
  ffmpegLogPath: string | null;
  framesWritten: number;
  kind: "frame" | "sequence" | "video" | "montage" | "series" | null;
}

export const RENDER_SCHEMA_VERSION = 2;
export const MIN_CANVAS_SIZE = 64;
export const MAX_CANVAS_SIZE = 4096;
export const MIN_FPS = 1;
export const MAX_FPS = 60;

export const renderPresets: RenderPreset[] = [
  { id: "youtube-fullhd", label: "YouTube Full HD (16:9)", width: 1920, height: 1080, fps: 30 },
  { id: "youtube-shorts", label: "YouTube Shorts / Reels (9:16)", width: 1080, height: 1920, fps: 30 },
  { id: "square", label: "Квадрат (1:1)", width: 1080, height: 1080, fps: 30 },
  { id: "hd", label: "HD 720p", width: 1280, height: 720, fps: 30 },
  { id: "custom", label: "Свой размер", width: 1920, height: 1080, fps: 30 },
];

export const videoQualityPresets: VideoQualityPreset[] = [
  { id: "draft", label: "Черновик", crf: 28 },
  { id: "standard", label: "Обычное", crf: 23 },
  { id: "high", label: "Высокое", crf: 18 },
];

export function createDefaultRenderSettings(partial?: Partial<RenderSettings>): RenderSettings {
  return {
    preset: "youtube-fullhd",
    canvasWidth: 1920,
    canvasHeight: 1080,
    fps: 30,
    duration: 1,
    backgroundColor: "#dfe9e7",
    transparentBackground: false,
    outputFormat: "mp4",
    outputDirectory: "",
    videoCodec: "h264",
    videoQuality: "standard",
    pixelFormat: "yuv420p",
    showSafeFrame: false,
    showActionSafe: false,
    showTitleSafe: false,
    ...partial,
  };
}

export function createIdleExportState(): ExportJobState {
  return {
    phase: "idle",
    currentFrame: 0,
    totalFrames: 0,
    progress: 0,
    outputPath: "",
    startedAt: null,
    error: null,
    ffmpegLogPath: null,
    framesWritten: 0,
    kind: null,
  };
}

export function applyRenderPreset(settings: RenderSettings, presetId: RenderPresetId): RenderSettings {
  const preset = renderPresets.find((item) => item.id === presetId) ?? renderPresets[0]!;
  return {
    ...settings,
    preset: presetId,
    canvasWidth: preset.width,
    canvasHeight: preset.height,
    fps: preset.fps,
  };
}

/** Size + export defaults for common platforms (MP4/H.264). Does not force safe-frame overlays. */
export function applyPlatformExportPreset(settings: RenderSettings, presetId: RenderPresetId): RenderSettings {
  const sized = applyRenderPreset(settings, presetId);
  if (presetId === "youtube-shorts") {
    return {
      ...sized,
      outputFormat: "mp4",
      videoCodec: "h264",
      videoQuality: "high",
      transparentBackground: false,
    };
  }
  if (presetId === "youtube-fullhd") {
    return {
      ...sized,
      outputFormat: "mp4",
      videoCodec: "h264",
      videoQuality: "standard",
      transparentBackground: false,
    };
  }
  if (presetId === "square") {
    return {
      ...sized,
      outputFormat: "mp4",
      videoCodec: "h264",
      videoQuality: "standard",
      transparentBackground: false,
    };
  }
  if (presetId === "hd") {
    return {
      ...sized,
      outputFormat: "mp4",
      videoCodec: "h264",
      videoQuality: "standard",
      transparentBackground: false,
    };
  }
  return sized;
}

export function frameIndexToTime(frameIndex: number, fps: number): number {
  if (!Number.isFinite(frameIndex) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.max(0, frameIndex) / fps;
}

export function timeToFrameIndex(time: number, fps: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(fps) || fps <= 0) return 0;
  return Math.max(0, Math.round(Math.max(0, time) * fps));
}

/** Inclusive count of frames covering [0, duration) with time = index / fps and last frame time < duration (or equal 0 for tiny clips). */
export function calculateFrameCount(duration: number, fps: number): number {
  if (!Number.isFinite(duration) || !Number.isFinite(fps) || duration <= 0 || fps <= 0) return 0;
  return Math.max(1, Math.ceil(duration * fps - 1e-9));
}

export function sanitizeExportFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "")
    .replace(/_+/g, "_")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "export";
}

export function buildFrameFileName(index: number, totalFrames: number): string {
  const width = Math.max(6, String(Math.max(1, totalFrames)).length);
  return `frame_${String(Math.max(0, index) + 1).padStart(width, "0")}.png`;
}

export function buildCurrentFrameFileName(projectName: string, sceneName: string, timeSeconds: number): string {
  const timeLabel = timeSeconds.toFixed(3).replace(".", "s");
  return `${sanitizeExportFileName(projectName)}_${sanitizeExportFileName(sceneName)}_${timeLabel}.png`;
}

export function buildSequenceFolderName(projectName: string, sceneName: string): string {
  return `${sanitizeExportFileName(projectName)}_${sanitizeExportFileName(sceneName)}_frames`;
}

export function buildVideoFileName(projectName: string, sceneName: string, format: OutputFormat): string {
  const extension = format === "webm" ? "webm" : "mp4";
  return `${sanitizeExportFileName(projectName)}_${sanitizeExportFileName(sceneName)}.${extension}`;
}

export function getQualityCrf(quality: VideoQualityId): number {
  return videoQualityPresets.find((item) => item.id === quality)?.crf ?? 23;
}

export interface RenderValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateRenderSettings(settings: Partial<RenderSettings> | null | undefined): RenderValidationResult {
  const errors: string[] = [];
  if (!settings) return { ok: false, errors: ["Настройки рендера отсутствуют."] };
  const width = Number(settings.canvasWidth);
  const height = Number(settings.canvasHeight);
  const fps = Number(settings.fps);
  const duration = Number(settings.duration);
  if (!Number.isFinite(width) || width < MIN_CANVAS_SIZE || width > MAX_CANVAS_SIZE) errors.push(`Ширина должна быть от ${MIN_CANVAS_SIZE} до ${MAX_CANVAS_SIZE}.`);
  if (!Number.isFinite(height) || height < MIN_CANVAS_SIZE || height > MAX_CANVAS_SIZE) errors.push(`Высота должна быть от ${MIN_CANVAS_SIZE} до ${MAX_CANVAS_SIZE}.`);
  if (!Number.isFinite(fps) || fps < MIN_FPS || fps > MAX_FPS) errors.push(`FPS должен быть от ${MIN_FPS} до ${MAX_FPS}.`);
  if (!Number.isFinite(duration) || duration <= 0) errors.push("Длительность должна быть больше нуля.");
  if (settings.outputFormat && !["mp4", "webm", "png-sequence"].includes(settings.outputFormat)) errors.push("Неизвестный формат вывода.");
  if (settings.videoCodec && !["h264", "vp9", "vp8"].includes(settings.videoCodec)) errors.push("Неизвестный видеокодек.");
  if (settings.videoQuality && !["draft", "standard", "high"].includes(settings.videoQuality)) errors.push("Неизвестный пресет качества.");
  return { ok: errors.length === 0, errors };
}

export function isExportBusy(phase: ExportPhase): boolean {
  return phase === "preparing" || phase === "renderingFrames" || phase === "encodingVideo";
}
