import type { ProjectDocument, Scene } from "../domain/types";
import {
  type ExportJobState,
  type RenderSettings,
  buildCurrentFrameFileName,
  buildFrameFileName,
  buildSequenceFolderName,
  buildVideoFileName,
  calculateFrameCount,
  createIdleExportState,
  frameIndexToTime,
  isExportBusy,
  validateRenderSettings,
} from "../domain/renderSettings";
import {
  buildMontageSequenceFolderName,
  buildMontageVideoFileName,
  mapMontageTime,
  montageTotalDuration,
  resolveMontageSegments,
  validateMontage,
} from "../domain/montage";
import {
  buildSeriesFolderName,
  buildSeriesManifest,
  enabledSeriesEpisodes,
  episodeDuration,
  formatEpisodeFileName,
  projectForEpisode,
  syncSeriesWithScenes,
  validateSeries,
  type SeriesManifestEpisode,
} from "../domain/series";
import { buildFfmpegEncodeArgs, validateFfmpegArgs } from "./ffmpegArgs";
import { blendPngBytes } from "./pngBlend";
import { SceneFrameRenderer } from "./SceneFrameRenderer";
import { formatExportUserError } from "../domain/exportErrors";

export interface ExportDesktopBridge {
  chooseSaveFile(defaultName: string, filters: Array<{ name: string; extensions: string[] }>): Promise<{ canceled: boolean; filePath?: string }>;
  chooseDirectory(defaultPath?: string): Promise<{ canceled: boolean; path?: string }>;
  ensureDirectory(path: string): Promise<{ ok: boolean; error?: string; existed?: boolean }>;
  writePng(filePath: string, bytes: Uint8Array): Promise<{ ok: boolean; error?: string }>;
  writeText(filePath: string, contents: string): Promise<{ ok: boolean; error?: string; path?: string }>;
  pathExists(path: string): Promise<boolean>;
  joinPath(...parts: string[]): Promise<string>;
  resolvePath(assetPath: string, projectPath?: string): Promise<string>;
  createTempDir(prefix: string): Promise<{ ok: boolean; path?: string; error?: string }>;
  removeDirectory(path: string): Promise<{ ok: boolean; error?: string }>;
  checkFfmpeg(): Promise<{ ok: boolean; path?: string; version?: string; error?: string }>;
  runFfmpeg(args: string[], logPath: string): Promise<{ ok: boolean; code?: number; error?: string; logPath?: string }>;
  cancelFfmpeg(): Promise<{ ok: boolean }>;
  openPath(targetPath: string): Promise<{ ok: boolean; error?: string }>;
}

export interface ExportSnapshot {
  time: number;
  playing: boolean;
  sceneId: string;
  selectedActorId: string | null;
  selectedPropId: string | null;
  selectedPartId: string | null;
}

export interface ExportControllerHooks {
  getSnapshot(): ExportSnapshot;
  restoreSnapshot(snapshot: ExportSnapshot): void;
  setExportState(state: ExportJobState): void;
  resolveAssetUrl(assetPath: string): Promise<string>;
  getProjectPath(): string | undefined;
  confirm(message: string): boolean;
  yieldToUi(): Promise<void>;
}

export class ExportController {
  private state: ExportJobState = createIdleExportState();
  private cancelRequested = false;
  private renderer: SceneFrameRenderer | null = null;

  constructor(
    private readonly desktop: ExportDesktopBridge,
    private readonly hooks: ExportControllerHooks,
  ) {}

  getState(): ExportJobState {
    return this.state;
  }

  requestCancel(): void {
    if (!isExportBusy(this.state.phase)) return;
    this.cancelRequested = true;
    void this.desktop.cancelFfmpeg();
    this.patch({ phase: "cancelled", error: "Экспорт отменён пользователем." });
  }

  async exportCurrentFrame(project: ProjectDocument, scene: Scene, settings: RenderSettings, timeSeconds: number): Promise<ExportJobState> {
    const validation = validateRenderSettings({ ...settings, duration: Math.max(settings.duration, 0.001) });
    if (!validation.ok) return this.fail(validation.errors.join(" "));
    if (isExportBusy(this.state.phase)) return this.fail("Экспорт уже выполняется.");

    const snapshot = this.hooks.getSnapshot();
    this.cancelRequested = false;
    this.patch({
      ...createIdleExportState(),
      phase: "preparing",
      kind: "frame",
      startedAt: Date.now(),
      totalFrames: 1,
      currentFrame: 1,
      progress: 0,
    });

    try {
      const defaultName = buildCurrentFrameFileName(project.name, scene.name, timeSeconds);
      const chosen = await this.desktop.chooseSaveFile(defaultName, [{ name: "PNG Image", extensions: ["png"] }]);
      if (chosen.canceled || !chosen.filePath) {
        this.patch({ phase: "cancelled", error: "Сохранение кадра отменено." });
        return this.state;
      }

      const renderer = await this.ensureRenderer(project, scene, settings);
      this.patch({ phase: "renderingFrames", outputPath: chosen.filePath, progress: 0.2 });
      const bytes = await renderer.renderPngBytes(timeSeconds);
      if (this.cancelRequested) return this.finishCancelled(0);
      const write = await this.desktop.writePng(chosen.filePath, bytes);
      if (!write.ok) return this.fail(write.error ?? "Не удалось записать PNG.");
      this.patch({
        phase: "completed",
        progress: 1,
        framesWritten: 1,
        currentFrame: 1,
        outputPath: chosen.filePath,
        error: null,
      });
      return this.state;
    } catch (reason) {
      return this.fail(reason instanceof Error ? reason.message : String(reason));
    } finally {
      this.hooks.restoreSnapshot(snapshot);
      this.destroyRenderer();
    }
  }

  async exportPngSequence(project: ProjectDocument, scene: Scene, settings: RenderSettings): Promise<ExportJobState> {
    const validation = validateRenderSettings(settings);
    if (!validation.ok) return this.fail(validation.errors.join(" "));
    if (isExportBusy(this.state.phase)) return this.fail("Экспорт уже выполняется.");

    const snapshot = this.hooks.getSnapshot();
    this.cancelRequested = false;
    const totalFrames = calculateFrameCount(settings.duration, settings.fps);
    this.patch({
      ...createIdleExportState(),
      phase: "preparing",
      kind: "sequence",
      startedAt: Date.now(),
      totalFrames,
      currentFrame: 0,
      progress: 0,
    });

    try {
      let folderChoice = await this.desktop.chooseDirectory(settings.outputDirectory || undefined);
      if (folderChoice.canceled || !folderChoice.path) {
        this.patch({ phase: "cancelled", error: "Выбор папки отменён." });
        return this.state;
      }

      const sequenceName = buildSequenceFolderName(project.name, scene.name);
      let outputDir = await this.desktop.joinPath(folderChoice.path, sequenceName);
      if (await this.desktop.pathExists(outputDir)) {
        const decision = this.hooks.confirm(`Папка уже существует:\n${outputDir}\n\nOK — заменить содержимое, Отмена — прервать. Для другой папки отмените и выберите заново.`)
          ? "replace"
          : "cancel";
        if (decision === "cancel") {
          this.patch({ phase: "cancelled", error: "Экспорт последовательности отменён." });
          return this.state;
        }
      }

      const ensured = await this.desktop.ensureDirectory(outputDir);
      if (!ensured.ok) return this.fail(ensured.error ?? "Не удалось создать папку.");

      const renderer = await this.ensureRenderer(project, scene, settings);
      this.patch({ phase: "renderingFrames", outputPath: outputDir });
      let written = 0;
      for (let index = 0; index < totalFrames; index += 1) {
        if (this.cancelRequested) return this.finishCancelled(written);
        const time = frameIndexToTime(index, settings.fps);
        if (time >= settings.duration && index > 0) break;
        const bytes = await renderer.renderPngBytes(time);
        const fileName = buildFrameFileName(index, totalFrames);
        const filePath = await this.desktop.joinPath(outputDir, fileName);
        const write = await this.desktop.writePng(filePath, bytes);
        if (!write.ok) return this.fail(write.error ?? `Ошибка записи ${fileName}`);
        written += 1;
        this.patch({
          currentFrame: index + 1,
          framesWritten: written,
          progress: written / totalFrames,
        });
        if (index % 2 === 1) await this.hooks.yieldToUi();
      }

      this.patch({
        phase: this.cancelRequested ? "cancelled" : "completed",
        progress: 1,
        framesWritten: written,
        outputPath: outputDir,
        error: this.cancelRequested ? `Экспорт отменён. Сохранено кадров: ${written}.` : null,
      });
      return this.state;
    } catch (reason) {
      return this.fail(reason instanceof Error ? reason.message : String(reason));
    } finally {
      this.hooks.restoreSnapshot(snapshot);
      this.destroyRenderer();
    }
  }

  async exportVideo(project: ProjectDocument, scene: Scene, settings: RenderSettings): Promise<ExportJobState> {
    const validation = validateRenderSettings(settings);
    if (!validation.ok) return this.fail(validation.errors.join(" "));
    if (isExportBusy(this.state.phase)) return this.fail("Экспорт уже выполняется.");
    if (settings.outputFormat === "png-sequence") return this.fail("Для видео выберите MP4 или WebM.");

    const snapshot = this.hooks.getSnapshot();
    this.cancelRequested = false;
    const totalFrames = calculateFrameCount(settings.duration, settings.fps);
    this.patch({
      ...createIdleExportState(),
      phase: "preparing",
      kind: "video",
      startedAt: Date.now(),
      totalFrames,
      currentFrame: 0,
      progress: 0,
    });

    let tempDir: string | undefined;
    try {
      const ffmpeg = await this.desktop.checkFfmpeg();
      if (!ffmpeg.ok) return this.fail(ffmpeg.error ?? "FFmpeg не найден.");

      const defaultName = buildVideoFileName(project.name, scene.name, settings.outputFormat);
      const chosen = await this.desktop.chooseSaveFile(defaultName, [
        settings.outputFormat === "webm"
          ? { name: "WebM Video", extensions: ["webm"] }
          : { name: "MP4 Video", extensions: ["mp4"] },
      ]);
      if (chosen.canceled || !chosen.filePath) {
        this.patch({ phase: "cancelled", error: "Сохранение видео отменено." });
        return this.state;
      }

      const temp = await this.desktop.createTempDir("kcs-export-");
      if (!temp.ok || !temp.path) return this.fail(temp.error ?? "Не удалось создать временную папку.");
      tempDir = temp.path;

      const renderer = await this.ensureRenderer(project, scene, settings);
      this.patch({ phase: "renderingFrames", outputPath: chosen.filePath });
      let written = 0;
      for (let index = 0; index < totalFrames; index += 1) {
        if (this.cancelRequested) return this.finishCancelled(written);
        const time = frameIndexToTime(index, settings.fps);
        const bytes = await renderer.renderPngBytes(time);
        const fileName = buildFrameFileName(index, Math.max(totalFrames, 100000));
        const filePath = await this.desktop.joinPath(tempDir, fileName);
        const write = await this.desktop.writePng(filePath, bytes);
        if (!write.ok) return this.fail(write.error ?? `Ошибка записи временного кадра ${fileName}`);
        written += 1;
        this.patch({
          currentFrame: index + 1,
          framesWritten: written,
          progress: (written / totalFrames) * 0.85,
        });
        if (index % 2 === 1) await this.hooks.yieldToUi();
      }

      if (this.cancelRequested) return this.finishCancelled(written);

      const logPath = await this.desktop.joinPath(tempDir, "ffmpeg.log");
      const audioInputs = await this.resolveAudioInputs(project, scene, settings);
      const args = buildFfmpegEncodeArgs({
        framesDir: tempDir,
        outputPath: chosen.filePath,
        fps: settings.fps,
        width: settings.canvasWidth,
        height: settings.canvasHeight,
        format: settings.outputFormat === "webm" ? "webm" : "mp4",
        codec: settings.outputFormat === "webm" ? (settings.videoCodec === "vp8" ? "vp8" : "vp9") : "h264",
        quality: settings.videoQuality,
        pixelFormat: "yuv420p",
        framePattern: "frame_%06d.png",
        audioInputs,
      });
      const argsCheck = validateFfmpegArgs(args);
      if (!argsCheck.ok) return this.fail(argsCheck.errors.join(" "));

      this.patch({ phase: "encodingVideo", ffmpegLogPath: logPath, progress: 0.9 });
      const encoded = await this.desktop.runFfmpeg(args, logPath);
      if (this.cancelRequested) return this.finishCancelled(written);
      if (!encoded.ok) {
        return this.fail(`FFmpeg завершился с ошибкой. Журнал: ${encoded.logPath ?? logPath}. ${encoded.error ?? ""}`.trim());
      }

      this.patch({
        phase: "completed",
        progress: 1,
        framesWritten: written,
        outputPath: chosen.filePath,
        ffmpegLogPath: logPath,
        error: null,
      });
      return this.state;
    } catch (reason) {
      return this.fail(reason instanceof Error ? reason.message : String(reason));
    } finally {
      this.hooks.restoreSnapshot(snapshot);
      this.destroyRenderer();
      // Auto-delete only successful temp renders. On failure/cancel keep temp for FFmpeg logs.
      if (tempDir && this.state.phase === "completed") await this.desktop.removeDirectory(tempDir);
    }
  }

  /** Export enabled montage scenes as one continuous video (local FFmpeg; cut or crossfade). */
  async exportMontageVideo(project: ProjectDocument, settings: RenderSettings): Promise<ExportJobState> {
    const montageCheck = validateMontage(project);
    if (!montageCheck.ok) return this.fail(montageCheck.errors.join(" "));
    if (isExportBusy(this.state.phase)) return this.fail("Экспорт уже выполняется.");
    if (settings.outputFormat === "png-sequence") return this.fail("Для монтажа выберите MP4 или WebM.");

    const totalDuration = montageTotalDuration(project);
    const montageSettings: RenderSettings = { ...settings, duration: totalDuration };
    const validation = validateRenderSettings(montageSettings);
    if (!validation.ok) return this.fail(validation.errors.join(" "));

    const snapshot = this.hooks.getSnapshot();
    this.cancelRequested = false;
    const totalFrames = calculateFrameCount(totalDuration, settings.fps);
    this.patch({
      ...createIdleExportState(),
      phase: "preparing",
      kind: "montage",
      startedAt: Date.now(),
      totalFrames,
      currentFrame: 0,
      progress: 0,
    });

    try {
      const ffmpeg = await this.desktop.checkFfmpeg();
      if (!ffmpeg.ok) return this.fail(ffmpeg.error ?? "FFmpeg не найден.");

      const format = settings.outputFormat === "webm" ? "webm" : "mp4";
      const defaultName = buildMontageVideoFileName(project.name, format);
      const chosen = await this.desktop.chooseSaveFile(defaultName, [
        format === "webm"
          ? { name: "WebM Video", extensions: ["webm"] }
          : { name: "MP4 Video", extensions: ["mp4"] },
      ]);
      if (chosen.canceled || !chosen.filePath) {
        this.patch({ phase: "cancelled", error: "Сохранение монтажа отменено." });
        return this.state;
      }

      const encoded = await this.encodeMontageToPath(project, settings, chosen.filePath, {
        progressStart: 0,
        progressEnd: 1,
        baseWritten: 0,
      });
      if (this.cancelRequested) return this.finishCancelled(encoded.framesWritten);
      if (!encoded.ok) return this.fail(encoded.error ?? "Ошибка экспорта монтажа.");

      this.patch({
        phase: "completed",
        progress: 1,
        framesWritten: encoded.framesWritten,
        outputPath: chosen.filePath,
        ffmpegLogPath: encoded.logPath ?? null,
        error: null,
      });
      return this.state;
    } catch (reason) {
      return this.fail(reason instanceof Error ? reason.message : String(reason));
    } finally {
      this.hooks.restoreSnapshot(snapshot);
      this.destroyRenderer();
    }
  }

  /** Local Series pack: batch-export enabled episodes into a folder + manifest.json (no cloud). */
  async exportSeriesPack(project: ProjectDocument, settings: RenderSettings): Promise<ExportJobState> {
    const seriesCheck = validateSeries(project);
    if (!seriesCheck.ok) return this.fail(seriesCheck.errors.join(" "));
    if (isExportBusy(this.state.phase)) return this.fail("Экспорт уже выполняется.");
    if (settings.outputFormat === "png-sequence") return this.fail("Для Series pack выберите MP4 или WebM.");

    const series = syncSeriesWithScenes(project.series, project.scenes, project.name);
    const episodes = enabledSeriesEpisodes(series);
    const format = settings.outputFormat === "webm" ? "webm" : "mp4";

    let totalFrames = 0;
    for (const episode of episodes) {
      totalFrames += calculateFrameCount(episodeDuration(project, episode), settings.fps);
    }

    const snapshot = this.hooks.getSnapshot();
    this.cancelRequested = false;
    this.patch({
      ...createIdleExportState(),
      phase: "preparing",
      kind: "series",
      startedAt: Date.now(),
      totalFrames,
      currentFrame: 0,
      progress: 0,
    });

    try {
      const ffmpeg = await this.desktop.checkFfmpeg();
      if (!ffmpeg.ok) return this.fail(ffmpeg.error ?? "FFmpeg не найден.");

      const folderChoice = await this.desktop.chooseDirectory(settings.outputDirectory || undefined);
      if (folderChoice.canceled || !folderChoice.path) {
        this.patch({ phase: "cancelled", error: "Выбор папки Series отменён." });
        return this.state;
      }

      const packDir = await this.desktop.joinPath(folderChoice.path, buildSeriesFolderName(series.name));
      if (await this.desktop.pathExists(packDir)) {
        if (!this.hooks.confirm(`Папка уже существует:\n${packDir}\n\nOK — продолжить запись, Отмена — прервать.`)) {
          this.patch({ phase: "cancelled", error: "Экспорт Series отменён." });
          return this.state;
        }
      }
      const ensured = await this.desktop.ensureDirectory(packDir);
      if (!ensured.ok) return this.fail(ensured.error ?? "Не удалось создать папку Series.");

      this.patch({ phase: "renderingFrames", outputPath: packDir });
      let framesWritten = 0;
      let framesDone = 0;
      const manifestEpisodes: SeriesManifestEpisode[] = [];

      for (let index = 0; index < episodes.length; index += 1) {
        if (this.cancelRequested) return this.finishCancelled(framesWritten);
        const episode = episodes[index];
        const scoped = projectForEpisode(project, episode);
        const duration = montageTotalDuration(scoped);
        const episodeFrames = calculateFrameCount(duration, settings.fps);
        const fileName = formatEpisodeFileName(episode, format);
        const outputPath = await this.desktop.joinPath(packDir, fileName);
        const progressStart = totalFrames > 0 ? framesDone / totalFrames : 0;
        const progressEnd = totalFrames > 0 ? (framesDone + episodeFrames) / totalFrames : 1;

        const encoded = await this.encodeMontageToPath(scoped, settings, outputPath, {
          progressStart,
          progressEnd,
          baseWritten: framesWritten,
        });
        if (this.cancelRequested) return this.finishCancelled(framesWritten + encoded.framesWritten);
        if (!encoded.ok) return this.fail(`E${String(episode.number).padStart(2, "0")}: ${encoded.error ?? "ошибка"}`);
        framesWritten += encoded.framesWritten;
        framesDone += episodeFrames;
        manifestEpisodes.push({
          number: episode.number,
          title: episode.title,
          fileName,
          sceneIds: [...episode.sceneIds],
          durationSeconds: duration,
          enabled: true,
        });
      }

      const manifest = buildSeriesManifest({
        series,
        projectName: project.name,
        format,
        fps: settings.fps,
        width: settings.canvasWidth,
        height: settings.canvasHeight,
        episodes: manifestEpisodes,
      });
      const manifestPath = await this.desktop.joinPath(packDir, "manifest.json");
      const writtenManifest = await this.desktop.writeText(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      if (!writtenManifest.ok) return this.fail(writtenManifest.error ?? "Не удалось записать manifest.json");

      this.patch({
        phase: "completed",
        progress: 1,
        framesWritten,
        outputPath: packDir,
        error: null,
      });
      return this.state;
    } catch (reason) {
      return this.fail(reason instanceof Error ? reason.message : String(reason));
    } finally {
      this.hooks.restoreSnapshot(snapshot);
      this.destroyRenderer();
    }
  }

  private async encodeMontageToPath(
    project: ProjectDocument,
    settings: RenderSettings,
    outputPath: string,
    options: { progressStart: number; progressEnd: number; baseWritten?: number },
  ): Promise<{ ok: boolean; framesWritten: number; logPath?: string; error?: string }> {
    const segments = resolveMontageSegments(project);
    const totalDuration = montageTotalDuration(project);
    const totalFrames = calculateFrameCount(totalDuration, settings.fps);
    const format = settings.outputFormat === "webm" ? "webm" : "mp4";
    const span = Math.max(0.01, options.progressEnd - options.progressStart);
    const baseWritten = options.baseWritten ?? 0;
    let tempDir: string | undefined;
    const pool = new Map<string, SceneFrameRenderer>();
    let written = 0;

    try {
      const temp = await this.desktop.createTempDir("kcs-montage-");
      if (!temp.ok || !temp.path) return { ok: false, framesWritten: 0, error: temp.error ?? "Не удалось создать временную папку." };
      tempDir = temp.path;

      for (let globalIndex = 0; globalIndex < totalFrames; globalIndex += 1) {
        if (this.cancelRequested) return { ok: false, framesWritten: written, error: "Отменено." };
        const time = frameIndexToTime(globalIndex, settings.fps);
        if (time >= totalDuration && globalIndex > 0) break;
        const bytes = await this.renderMontageFrame(project, settings, time, pool);
        const fileName = buildFrameFileName(globalIndex, Math.max(totalFrames, 100000));
        const filePath = await this.desktop.joinPath(tempDir, fileName);
        const write = await this.desktop.writePng(filePath, bytes);
        if (!write.ok) return { ok: false, framesWritten: written, error: write.error ?? `Ошибка записи ${fileName}` };
        written += 1;
        const localProgress = written / Math.max(1, totalFrames);
        this.patch({
          phase: "renderingFrames",
          currentFrame: baseWritten + written,
          framesWritten: baseWritten + written,
          progress: options.progressStart + localProgress * span * 0.85,
          outputPath,
        });
        if (globalIndex % 2 === 1) await this.hooks.yieldToUi();
      }

      if (this.cancelRequested) return { ok: false, framesWritten: written, error: "Отменено." };

      const logPath = await this.desktop.joinPath(tempDir, "ffmpeg.log");
      const audioInputs = await this.resolveMontageAudioInputs(project, segments);
      const args = buildFfmpegEncodeArgs({
        framesDir: tempDir,
        outputPath,
        fps: settings.fps,
        width: settings.canvasWidth,
        height: settings.canvasHeight,
        format,
        codec: format === "webm" ? (settings.videoCodec === "vp8" ? "vp8" : "vp9") : "h264",
        quality: settings.videoQuality,
        pixelFormat: "yuv420p",
        framePattern: "frame_%06d.png",
        audioInputs,
      });
      const argsCheck = validateFfmpegArgs(args);
      if (!argsCheck.ok) return { ok: false, framesWritten: written, error: argsCheck.errors.join(" ") };

      this.patch({ phase: "encodingVideo", ffmpegLogPath: logPath, progress: options.progressStart + span * 0.9, outputPath });
      const encoded = await this.desktop.runFfmpeg(args, logPath);
      if (this.cancelRequested) return { ok: false, framesWritten: written, logPath, error: "Отменено." };
      if (!encoded.ok) {
        return {
          ok: false,
          framesWritten: written,
          logPath: encoded.logPath ?? logPath,
          error: `FFmpeg ошибка. Журнал: ${encoded.logPath ?? logPath}. ${encoded.error ?? ""}`.trim(),
        };
      }
      return { ok: true, framesWritten: written, logPath };
    } finally {
      this.destroyRendererPool(pool);
      if (tempDir) await this.desktop.removeDirectory(tempDir);
    }
  }

  async exportMontagePngSequence(project: ProjectDocument, settings: RenderSettings): Promise<ExportJobState> {
    const montageCheck = validateMontage(project);
    if (!montageCheck.ok) return this.fail(montageCheck.errors.join(" "));
    if (isExportBusy(this.state.phase)) return this.fail("Экспорт уже выполняется.");

    const totalDuration = montageTotalDuration(project);
    const montageSettings: RenderSettings = { ...settings, duration: totalDuration };
    const validation = validateRenderSettings(montageSettings);
    if (!validation.ok) return this.fail(validation.errors.join(" "));

    const snapshot = this.hooks.getSnapshot();
    this.cancelRequested = false;
    const totalFrames = calculateFrameCount(totalDuration, settings.fps);
    this.patch({
      ...createIdleExportState(),
      phase: "preparing",
      kind: "montage",
      startedAt: Date.now(),
      totalFrames,
      currentFrame: 0,
      progress: 0,
    });

    const pool = new Map<string, SceneFrameRenderer>();
    try {
      const folderChoice = await this.desktop.chooseDirectory(settings.outputDirectory || undefined);
      if (folderChoice.canceled || !folderChoice.path) {
        this.patch({ phase: "cancelled", error: "Выбор папки монтажа отменён." });
        return this.state;
      }

      const sequenceName = buildMontageSequenceFolderName(project.name);
      const outputDir = await this.desktop.joinPath(folderChoice.path, sequenceName);
      if (await this.desktop.pathExists(outputDir)) {
        if (!this.hooks.confirm(`Папка уже существует:\n${outputDir}\n\nOK — продолжить запись, Отмена — прервать.`)) {
          this.patch({ phase: "cancelled", error: "Экспорт montage sequence отменён." });
          return this.state;
        }
      }
      const ensured = await this.desktop.ensureDirectory(outputDir);
      if (!ensured.ok) return this.fail(ensured.error ?? "Не удалось создать папку монтажа.");

      this.patch({ phase: "renderingFrames", outputPath: outputDir });
      let written = 0;
      for (let globalIndex = 0; globalIndex < totalFrames; globalIndex += 1) {
        if (this.cancelRequested) return this.finishCancelled(written);
        const time = frameIndexToTime(globalIndex, settings.fps);
        if (time >= totalDuration && globalIndex > 0) break;
        const bytes = await this.renderMontageFrame(project, settings, time, pool);
        const fileName = buildFrameFileName(globalIndex, Math.max(totalFrames, 100000));
        const filePath = await this.desktop.joinPath(outputDir, fileName);
        const write = await this.desktop.writePng(filePath, bytes);
        if (!write.ok) return this.fail(write.error ?? `Ошибка записи ${fileName}`);
        written += 1;
        this.patch({ currentFrame: globalIndex + 1, framesWritten: written, progress: written / totalFrames });
        if (globalIndex % 2 === 1) await this.hooks.yieldToUi();
      }

      this.patch({
        phase: this.cancelRequested ? "cancelled" : "completed",
        progress: 1,
        framesWritten: written,
        outputPath: outputDir,
        error: this.cancelRequested ? `Экспорт отменён. Сохранено кадров: ${written}.` : null,
      });
      return this.state;
    } catch (reason) {
      return this.fail(reason instanceof Error ? reason.message : String(reason));
    } finally {
      this.hooks.restoreSnapshot(snapshot);
      this.destroyRendererPool(pool);
      this.destroyRenderer();
    }
  }

  private async renderMontageFrame(
    project: ProjectDocument,
    settings: RenderSettings,
    globalTime: number,
    pool: Map<string, SceneFrameRenderer>,
  ): Promise<Uint8Array> {
    const mapped = mapMontageTime(project, globalTime);
    if (!mapped) throw new Error("Не удалось сопоставить время монтажа.");
    if (mapped.blend) {
      const fromBytes = await this.renderSceneAt(
        project,
        mapped.blend.from.scene,
        settings,
        mapped.blend.from.localTime,
        pool,
      );
      const toBytes = await this.renderSceneAt(
        project,
        mapped.blend.to.scene,
        settings,
        mapped.blend.to.localTime,
        pool,
      );
      return blendPngBytes(fromBytes, toBytes, mapped.blend.amount, mapped.blend.kind);
    }
    return this.renderSceneAt(project, mapped.scene, settings, mapped.localTime, pool);
  }

  private async renderSceneAt(
    project: ProjectDocument,
    scene: Scene,
    settings: RenderSettings,
    localTime: number,
    pool: Map<string, SceneFrameRenderer>,
  ): Promise<Uint8Array> {
    const renderer = await this.ensurePooledRenderer(project, scene, settings, pool);
    return renderer.renderPngBytes(localTime);
  }

  private async ensurePooledRenderer(
    project: ProjectDocument,
    scene: Scene,
    settings: RenderSettings,
    pool: Map<string, SceneFrameRenderer>,
  ): Promise<SceneFrameRenderer> {
    let renderer = pool.get(scene.id);
    if (!renderer) {
      renderer = new SceneFrameRenderer();
      const sceneSettings: RenderSettings = {
        ...settings,
        duration: scene.duration,
        backgroundColor: settings.transparentBackground ? settings.backgroundColor : scene.background,
      };
      await renderer.prepare({
        project,
        scene,
        characters: project.characters,
        assets: project.assets,
        settings: sceneSettings,
        resolveAssetUrl: this.hooks.resolveAssetUrl,
      });
      const assetError = this.criticalAssetError(renderer, scene.name);
      if (assetError) throw new Error(assetError);
      pool.set(scene.id, renderer);
    }
    return renderer;
  }

  private destroyRendererPool(pool: Map<string, SceneFrameRenderer>): void {
    for (const renderer of pool.values()) renderer.destroy();
    pool.clear();
  }

  private async ensureRenderer(project: ProjectDocument, scene: Scene, settings: RenderSettings): Promise<SceneFrameRenderer> {
    this.destroyRenderer();
    const renderer = new SceneFrameRenderer();
    await renderer.prepare({
      project,
      scene,
      characters: project.characters,
      assets: project.assets,
      settings,
      resolveAssetUrl: this.hooks.resolveAssetUrl,
    });
    const assetError = this.criticalAssetError(renderer, scene.name);
    if (assetError) throw new Error(assetError);
    this.renderer = renderer;
    return renderer;
  }

  private async resolveAudioInputs(project: ProjectDocument, scene: Scene, _settings: RenderSettings): Promise<Array<{ path: string; startTime: number; volume: number }>> {
    const inputs: Array<{ path: string; startTime: number; volume: number }> = [];
    for (const track of scene.audioTracks ?? []) {
      if (track.muted || track.volume <= 0) continue;
      const asset = project.audioAssets?.find((item) => item.id === track.assetId);
      if (!asset?.path) continue;
      const absolute = await this.desktop.resolvePath(asset.path, this.hooks.getProjectPath());
      inputs.push({ path: absolute, startTime: track.startTime, volume: track.volume });
    }
    return inputs;
  }

  private async resolveMontageAudioInputs(
    project: ProjectDocument,
    segments: ReturnType<typeof resolveMontageSegments>,
  ): Promise<Array<{ path: string; startTime: number; volume: number }>> {
    const inputs: Array<{ path: string; startTime: number; volume: number }> = [];
    for (const segment of segments) {
      for (const track of segment.scene.audioTracks ?? []) {
        if (track.muted || track.volume <= 0) continue;
        const asset = project.audioAssets?.find((item) => item.id === track.assetId);
        if (!asset?.path) continue;
        const absolute = await this.desktop.resolvePath(asset.path, this.hooks.getProjectPath());
        inputs.push({
          path: absolute,
          startTime: segment.offset + track.startTime,
          volume: track.volume,
        });
      }
    }
    return inputs;
  }

  private destroyRenderer(): void {
    this.renderer?.destroy();
    this.renderer = null;
  }

  private finishCancelled(framesWritten: number): ExportJobState {
    this.patch({
      phase: "cancelled",
      framesWritten,
      error: `Экспорт отменён. Сохранено кадров: ${framesWritten}.`,
    });
    return this.state;
  }

  private fail(message: string): ExportJobState {
    const friendly = /Что делать:/i.test(message)
      ? message
      : formatExportUserError(message, {
          logPath: this.state.ffmpegLogPath,
          kind: this.state.kind,
        });
    this.patch({ phase: "failed", error: friendly });
    return this.state;
  }

  private criticalAssetError(renderer: SceneFrameRenderer, sceneLabel: string): string | null {
    const warnings = renderer.getLoadWarnings();
    if (!warnings.length) return null;
    const critical = warnings.filter((item) => /Актёр|часть/i.test(item));
    if (!critical.length) return null;
    return `Не удалось загрузить картинки для экспорта (${sceneLabel}).\n${critical.slice(0, 4).join("\n")}${critical.length > 4 ? "\n…" : ""}\nПроверьте пути PNG / Load Rig / импорт ассетов.`;
  }

  private patch(partial: Partial<ExportJobState>): void {
    this.state = { ...this.state, ...partial };
    this.hooks.setExportState(this.state);
  }
}
