import type { OutputFormat, VideoCodec, VideoQualityId } from "../domain/renderSettings";
import { getQualityCrf } from "../domain/renderSettings";

export interface FfmpegEncodeOptions {
  framesDir: string;
  outputPath: string;
  fps: number;
  width: number;
  height: number;
  format: Exclude<OutputFormat, "png-sequence">;
  codec: VideoCodec;
  quality: VideoQualityId;
  pixelFormat?: "yuv420p";
  framePattern?: string;
  audioInputs?: Array<{ path: string; startTime: number; volume: number }>;
}

/** Pure builder for FFmpeg argv. Never uses shell string concatenation. */
export function buildFfmpegEncodeArgs(options: FfmpegEncodeOptions): string[] {
  const pattern = options.framePattern ?? "frame_%06d.png";
  const inputPattern = joinPathSafe(options.framesDir, pattern);
  const audioInputs = (options.audioInputs ?? []).filter((item) => typeof item.path === "string" && item.path.length > 0);
  const args = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-framerate", String(options.fps),
    "-i", inputPattern,
  ];

  for (const audio of audioInputs) {
    args.push("-itsoffset", String(Math.max(0, audio.startTime)), "-i", audio.path);
  }

  args.push("-map", "0:v");
  if (audioInputs.length === 1) {
    args.push("-map", "1:a", "-filter:a", `volume=${clampVolume(audioInputs[0].volume)}`);
  } else if (audioInputs.length > 1) {
    const volumeFilters = audioInputs.map((audio, index) => `[${index + 1}:a]volume=${clampVolume(audio.volume)}[a${index}]`).join(";");
    const mixInputs = audioInputs.map((_, index) => `[a${index}]`).join("");
    args.push("-filter_complex", `${volumeFilters};${mixInputs}amix=inputs=${audioInputs.length}:dropout_transition=0[aout]`, "-map", "[aout]");
  }

  args.push("-s", `${Math.round(options.width)}x${Math.round(options.height)}`);

  if (options.format === "mp4") {
    args.push(
      "-c:v", "libx264",
      "-pix_fmt", options.pixelFormat ?? "yuv420p",
      "-crf", String(getQualityCrf(options.quality)),
      "-movflags", "+faststart",
    );
    if (audioInputs.length) args.push("-c:a", "aac", "-b:a", "192k", "-shortest");
  } else {
    const codec = options.codec === "vp8" ? "libvpx" : "libvpx-vp9";
    args.push(
      "-c:v", codec,
      "-pix_fmt", options.pixelFormat ?? "yuv420p",
      "-crf", String(getQualityCrf(options.quality)),
      "-b:v", "0",
    );
    if (audioInputs.length) args.push("-c:a", "libopus", "-b:a", "128k", "-shortest");
  }

  args.push(options.outputPath);
  return args;
}

export function validateFfmpegArgs(args: string[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(args) || args.length < 4) errors.push("Пустой или слишком короткий список аргументов FFmpeg.");
  if (args.some((item) => typeof item !== "string")) errors.push("Аргументы FFmpeg должны быть строками.");
  if (args.some((item) => /[\r\n]/.test(item))) errors.push("Аргументы FFmpeg не должны содержать переводы строк.");
  if (args.includes("-c") || args.includes("/c")) errors.push("Запрещён shell-флаг в аргументах FFmpeg.");
  return { ok: errors.length === 0, errors };
}

function joinPathSafe(dir: string, file: string): string {
  const normalized = dir.replace(/[\\/]+$/g, "");
  return `${normalized}/${file}`.replace(/\\/g, "/");
}

function clampVolume(volume: number): string {
  const value = Number.isFinite(volume) ? Math.max(0, Math.min(2, volume)) : 1;
  return value.toFixed(3);
}
