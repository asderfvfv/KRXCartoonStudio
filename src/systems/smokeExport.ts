import type { ProjectDocument, Scene } from "../domain/types";
import { createDefaultRenderSettings, calculateFrameCount, frameIndexToTime, buildFrameFileName } from "../domain/renderSettings";
import { buildFfmpegEncodeArgs } from "./ffmpegArgs";
import { SceneFrameRenderer } from "./SceneFrameRenderer";

/** Automated Stage 3 smoke export used only with ?smoke=1. */
export async function runStage3SmokeExport(options: {
  project: ProjectDocument;
  scene: Scene;
  resolveAssetUrl(path: string): Promise<string>;
  joinPath(...parts: string[]): Promise<string>;
  ensureDirectory(path: string): Promise<{ ok: boolean; error?: string }>;
  writePng(path: string, bytes: Uint8Array): Promise<{ ok: boolean; error?: string }>;
  createTempDir(prefix: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  removeDirectory(path: string): Promise<{ ok: boolean; error?: string }>;
  checkFfmpeg(): Promise<{ ok: boolean; error?: string }>;
  runFfmpeg(args: string[], logPath: string): Promise<{ ok: boolean; error?: string; logPath?: string }>;
  rootDir: string;
}): Promise<{ ok: boolean; framePath?: string; sequenceDir?: string; videoPath?: string; error?: string; frameCount?: number }> {
  const settings = createDefaultRenderSettings({
    canvasWidth: 640,
    canvasHeight: 360,
    fps: 10,
    duration: 1,
    backgroundColor: options.scene.background,
    transparentBackground: false,
    outputFormat: "mp4",
    videoCodec: "h264",
    videoQuality: "draft",
  });

  const root = options.rootDir;
  const ensured = await options.ensureDirectory(root);
  if (!ensured.ok) return { ok: false, error: ensured.error };

  const renderer = new SceneFrameRenderer();
  try {
    await renderer.prepare({
      project: options.project,
      scene: options.scene,
      characters: options.project.characters,
      assets: options.project.assets,
      settings,
      resolveAssetUrl: options.resolveAssetUrl,
    });

    const framePath = await options.joinPath(root, "smoke_frame.png");
    const frameBytes = await renderer.renderPngBytes(0);
    const frameWrite = await options.writePng(framePath, frameBytes);
    if (!frameWrite.ok) return { ok: false, error: frameWrite.error };

    const sequenceDir = await options.joinPath(root, "smoke_frames");
    await options.ensureDirectory(sequenceDir);
    const total = calculateFrameCount(settings.duration, settings.fps);
    for (let i = 0; i < total; i += 1) {
      const bytes = await renderer.renderPngBytes(frameIndexToTime(i, settings.fps));
      const file = await options.joinPath(sequenceDir, buildFrameFileName(i, Math.max(total, 100000)));
      const write = await options.writePng(file, bytes);
      if (!write.ok) return { ok: false, error: write.error };
    }

    const ffmpeg = await options.checkFfmpeg();
    if (!ffmpeg.ok) return { ok: false, error: ffmpeg.error ?? "FFmpeg missing", framePath, sequenceDir, frameCount: total };

    const videoPath = await options.joinPath(root, "smoke.mp4");
    const logPath = await options.joinPath(root, "ffmpeg.log");
    const args = buildFfmpegEncodeArgs({
      framesDir: sequenceDir,
      outputPath: videoPath,
      fps: settings.fps,
      width: settings.canvasWidth,
      height: settings.canvasHeight,
      format: "mp4",
      codec: "h264",
      quality: "draft",
      framePattern: "frame_%06d.png",
    });
    const encoded = await options.runFfmpeg(args, logPath);
    if (!encoded.ok) return { ok: false, error: encoded.error, framePath, sequenceDir, videoPath, frameCount: total };
    return { ok: true, framePath, sequenceDir, videoPath, frameCount: total };
  } finally {
    renderer.destroy();
  }
}
