import type { ProjectDocument, Scene } from "../domain/types";
import {
  createDefaultLipSyncSettings,
  createDefaultSubtitleSettings,
  createEmptyAudioTrack,
  createEmptyDialogue,
  estimateSpeechDuration,
  evaluateMouthOpen,
  getActiveSubtitleText,
} from "../domain/audio";
import { createDefaultRenderSettings, calculateFrameCount, frameIndexToTime, buildFrameFileName } from "../domain/renderSettings";
import { buildFfmpegEncodeArgs } from "./ffmpegArgs";
import { SceneFrameRenderer } from "./SceneFrameRenderer";
import { SceneRuntime } from "./SceneRuntime";
import { amplitudeEnvelopeCache } from "./AmplitudeEnvelopeCache";
import { createId } from "../domain/ids";

/** Automated Stage 4/6 smoke: local TTS + WAV amplitude lip sync + video with audio. */
export async function runStage4SmokeAudio(options: {
  project: ProjectDocument;
  scene: Scene;
  resolveAssetUrl(path: string): Promise<string>;
  joinPath(...parts: string[]): Promise<string>;
  ensureDirectory(path: string): Promise<{ ok: boolean; error?: string }>;
  writePng(path: string, bytes: Uint8Array): Promise<{ ok: boolean; error?: string }>;
  createTempDir(prefix: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  removeDirectory(path: string): Promise<{ ok: boolean; error?: string }>;
  synthesizeSpeech(text: string, outPath: string): Promise<{ ok: boolean; path?: string; duration?: number; error?: string }>;
  resolvePath(assetPath: string, projectPath?: string): Promise<string>;
  checkFfmpeg(): Promise<{ ok: boolean; error?: string }>;
  runFfmpeg(args: string[], logPath: string): Promise<{ ok: boolean; error?: string; logPath?: string }>;
  rootDir: string;
}): Promise<{
  ok: boolean;
  wavPath?: string;
  videoPath?: string;
  mouthOpen?: number;
  amplitude?: number | null;
  subtitle?: string | null;
  frameCount?: number;
  error?: string;
}> {
  const root = options.rootDir;
  const ensured = await options.ensureDirectory(root);
  if (!ensured.ok) return { ok: false, error: ensured.error };

  const text = "Привет, я DemoBot.";
  const wavPath = await options.joinPath(root, "smoke_tts.wav");
  const spoken = await options.synthesizeSpeech(text, wavPath);
  if (!spoken.ok || !spoken.path) {
    return { ok: false, error: spoken.error ?? "TTS failed" };
  }

  const audioFile = spoken.path;
  const duration = Math.min(2, Math.max(0.8, spoken.duration ?? estimateSpeechDuration(text)));

  const project = structuredClone(options.project);
  const scene = structuredClone(options.scene);
  const assetId = createId("audio");
  const trackId = createId("atrack");
  project.audioAssets = project.audioAssets ?? [];
  project.audioAssets.push({
    id: assetId,
    name: "smoke_tts",
    path: audioFile,
    mediaType: "audio/wav",
    duration,
  });
  scene.audioTracks = [
    createEmptyAudioTrack({
      id: trackId,
      assetId,
      name: "Smoke TTS",
      startTime: 0,
      duration,
      volume: 1,
    }),
  ];
  scene.dialogues = [
    createEmptyDialogue({
      id: createId("dlg"),
      actorId: scene.actors[0]?.id ?? null,
      text,
      startTime: 0,
      duration,
      audioTrackId: trackId,
    }),
  ];
  scene.subtitleSettings = createDefaultSubtitleSettings({ enabled: true, showInExport: true, fontSize: 36 });
  scene.lipSyncSettings = createDefaultLipSyncSettings({ preferAmplitude: true, sensitivity: 1.2 });
  scene.duration = Math.max(scene.duration, duration + 0.2);

  const dataUrl = await options.resolveAssetUrl(audioFile);
  amplitudeEnvelopeCache.clear();
  amplitudeEnvelopeCache.setFromDataUrl(assetId, dataUrl);
  const amplitude = amplitudeEnvelopeCache.sample(assetId, 0.25, 1.2);

  const mouthOpen = evaluateMouthOpen(0.25, scene.dialogues, {
    actorId: scene.actors[0]?.id ?? null,
    lipSync: scene.lipSyncSettings,
    resolveAmplitude: () => amplitude,
  });
  const subtitle = getActiveSubtitleText(scene.dialogues, 0.25);
  const runtime = new SceneRuntime().setTime(scene, project.characters, 0.25);
  if (!runtime.actors[scene.actors[0]?.id ?? ""]) {
    return { ok: false, error: "SceneRuntime lost actors during lip-sync smoke", wavPath: audioFile, mouthOpen, amplitude, subtitle };
  }

  const settings = createDefaultRenderSettings({
    canvasWidth: 640,
    canvasHeight: 360,
    fps: 10,
    duration: Math.min(1.2, duration + 0.1),
    backgroundColor: scene.background,
    transparentBackground: false,
    outputFormat: "mp4",
    videoCodec: "h264",
    videoQuality: "draft",
  });

  const renderer = new SceneFrameRenderer();
  try {
    await renderer.prepare({
      project,
      scene,
      characters: project.characters,
      assets: project.assets,
      settings,
      resolveAssetUrl: options.resolveAssetUrl,
    });

    const framesDir = await options.joinPath(root, "smoke_audio_frames");
    await options.ensureDirectory(framesDir);
    const total = calculateFrameCount(settings.duration, settings.fps);
    for (let i = 0; i < total; i += 1) {
      const bytes = await renderer.renderPngBytes(frameIndexToTime(i, settings.fps));
      const file = await options.joinPath(framesDir, buildFrameFileName(i, Math.max(total, 100000)));
      const write = await options.writePng(file, bytes);
      if (!write.ok) return { ok: false, error: write.error, wavPath: audioFile, mouthOpen, amplitude, subtitle, frameCount: i };
    }

    const ffmpeg = await options.checkFfmpeg();
    if (!ffmpeg.ok) return { ok: false, error: ffmpeg.error ?? "FFmpeg missing", wavPath: audioFile, mouthOpen, amplitude, subtitle, frameCount: total };

    const absoluteAudio = await options.resolvePath(audioFile);
    const videoPath = await options.joinPath(root, "smoke_audio.mp4");
    const logPath = await options.joinPath(root, "ffmpeg_audio.log");
    const args = buildFfmpegEncodeArgs({
      framesDir,
      outputPath: videoPath,
      fps: settings.fps,
      width: settings.canvasWidth,
      height: settings.canvasHeight,
      format: "mp4",
      codec: "h264",
      quality: "draft",
      framePattern: "frame_%06d.png",
      audioInputs: [{ path: absoluteAudio, startTime: 0, volume: 1 }],
    });
    const encoded = await options.runFfmpeg(args, logPath);
    if (!encoded.ok) {
      return { ok: false, error: encoded.error, wavPath: audioFile, videoPath, mouthOpen, amplitude, subtitle, frameCount: total };
    }
    return { ok: true, wavPath: audioFile, videoPath, mouthOpen, amplitude, subtitle, frameCount: total };
  } finally {
    renderer.destroy();
  }
}
