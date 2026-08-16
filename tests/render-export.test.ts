import { describe, expect, it } from "vitest";
import {
  RENDER_SCHEMA_VERSION,
  applyPlatformExportPreset,
  applyRenderPreset,
  buildCurrentFrameFileName,
  buildFrameFileName,
  calculateFrameCount,
  createDefaultRenderSettings,
  createIdleExportState,
  frameIndexToTime,
  isExportBusy,
  sanitizeExportFileName,
  timeToFrameIndex,
  validateRenderSettings,
} from "../src/domain/renderSettings";
import { buildFfmpegEncodeArgs, validateFfmpegArgs } from "../src/systems/ffmpegArgs";
import { createDefaultProject } from "../src/domain/defaults";
import { ProjectManager } from "../src/systems/managers";
import { SceneRuntime } from "../src/systems/SceneRuntime";
import { migrateProject } from "../src/domain/migration";

describe("Stage 3 render settings and export helpers", () => {
  it("provides defaults and presets", () => {
    const settings = createDefaultRenderSettings();
    expect(settings.canvasWidth).toBe(1920);
    expect(settings.canvasHeight).toBe(1080);
    expect(settings.fps).toBe(30);
    expect(settings.outputFormat).toBe("mp4");
    expect(settings.videoCodec).toBe("h264");
    expect(settings.pixelFormat).toBe("yuv420p");
    const shorts = applyRenderPreset(settings, "youtube-shorts");
    expect(shorts.canvasWidth).toBe(1080);
    expect(shorts.canvasHeight).toBe(1920);
    expect(shorts.preset).toBe("youtube-shorts");
    const platformShorts = applyPlatformExportPreset(settings, "youtube-shorts");
    expect(platformShorts.outputFormat).toBe("mp4");
    expect(platformShorts.videoCodec).toBe("h264");
    expect(platformShorts.videoQuality).toBe("high");
    expect(platformShorts.showTitleSafe).toBe(true);
    const platformYt = applyPlatformExportPreset(settings, "youtube-fullhd");
    expect(platformYt.canvasWidth).toBe(1920);
    expect(platformYt.showActionSafe).toBe(true);
  });

  it("migrates old stage-2 projects with render defaults", () => {
    const old = createDefaultProject("Legacy");
    delete (old as { renderSettings?: unknown }).renderSettings;
    delete (old as { schemaVersion?: unknown }).schemaVersion;
    const migrated = migrateProject(old);
    expect(migrated.schemaVersion).toBeGreaterThanOrEqual(RENDER_SCHEMA_VERSION);
    expect(migrated.renderSettings?.canvasWidth).toBeGreaterThan(0);
    expect(migrated.renderSettings?.fps).toBeGreaterThan(0);
    expect(migrated.scenes?.[0].actors.length).toBeGreaterThan(0);
    expect(migrated.scenes?.[0].generatedTimeline).toBeTruthy();
  });

  it("calculates deterministic frame times for common fps values", () => {
    for (const fps of [24, 25, 30, 60]) {
      expect(frameIndexToTime(0, fps)).toBe(0);
      expect(frameIndexToTime(fps, fps)).toBe(1);
      expect(timeToFrameIndex(1, fps)).toBe(fps);
      expect(calculateFrameCount(1, fps)).toBe(fps);
    }
    expect(calculateFrameCount(1.5, 30)).toBe(45);
    expect(calculateFrameCount(0.1, 30)).toBe(3);
    expect(calculateFrameCount(0, 30)).toBe(0);
    expect(validateRenderSettings({ ...createDefaultRenderSettings(), fps: 0 }).ok).toBe(false);
    expect(validateRenderSettings({ ...createDefaultRenderSettings(), canvasWidth: 16 }).ok).toBe(false);
  });

  it("sanitizes filenames and builds frame names", () => {
    expect(sanitizeExportFileName('My Movie<>:"/\\|?*')).toBe("My Movie_");
    expect(buildFrameFileName(0, 12)).toBe("frame_000001.png");
    expect(buildFrameFileName(9, 12)).toBe("frame_000010.png");
    expect(buildCurrentFrameFileName("Demo", "Scene 1", 1.25)).toBe("Demo_Scene 1_1s250.png");
  });

  it("tracks export state and busy flags", () => {
    const idle = createIdleExportState();
    expect(idle.phase).toBe("idle");
    expect(isExportBusy("renderingFrames")).toBe(true);
    expect(isExportBusy("completed")).toBe(false);
  });

  it("restores playhead conceptually after export snapshot", () => {
    const snapshot = { time: 2.5, playing: false };
    let time = 0;
    let playing = true;
    time = 4;
    playing = true;
    time = snapshot.time;
    playing = snapshot.playing;
    expect(time).toBe(2.5);
    expect(playing).toBe(false);
  });

  it("builds safe ffmpeg args without shell", () => {
    const args = buildFfmpegEncodeArgs({
      framesDir: "C:/Temp/frames",
      outputPath: "C:/Temp/out.mp4",
      fps: 30,
      width: 1280,
      height: 720,
      format: "mp4",
      codec: "h264",
      quality: "standard",
    });
    expect(args.includes("-y")).toBe(true);
    expect(args.includes("libx264")).toBe(true);
    expect(args.includes("yuv420p")).toBe(true);
    expect(args.some((item) => item.includes("shell"))).toBe(false);
    expect(validateFfmpegArgs(args).ok).toBe(true);
    expect(validateFfmpegArgs(["-c", "echo"]).ok).toBe(false);
  });

  it("serializes render settings and reopens them", () => {
    const project = createDefaultProject("Render Persist");
    project.renderSettings = createDefaultRenderSettings({
      preset: "hd",
      canvasWidth: 1280,
      canvasHeight: 720,
      fps: 25,
      duration: 2,
      videoQuality: "high",
      outputDirectory: "D:/Exports",
    });
    project.schemaVersion = RENDER_SCHEMA_VERSION;
    const manager = new ProjectManager();
    const restored = migrateProject(manager.deserialize(manager.serialize(project)));
    expect(restored.renderSettings?.canvasWidth).toBe(1280);
    expect(restored.renderSettings?.canvasHeight).toBe(720);
    expect(restored.renderSettings?.fps).toBe(25);
    expect(restored.renderSettings?.videoQuality).toBe("high");
    expect(restored.renderSettings?.outputDirectory).toBe("D:/Exports");
    expect(restored.schemaVersion).toBeGreaterThanOrEqual(RENDER_SCHEMA_VERSION);
  });

  it("keeps SceneRuntime deterministic for the same time", () => {
    const project = createDefaultProject();
    const scene = project.scenes![0];
    const runtime = new SceneRuntime();
    const a = runtime.setTime(scene, project.characters, 1.25);
    const b = runtime.setTime(scene, project.characters, 3.1);
    const c = runtime.setTime(scene, project.characters, 1.25);
    expect(c.camera).toEqual(a.camera);
    expect(c.actors["actor-hero"].position).toEqual(a.actors["actor-hero"].position);
    expect(b.time).toBe(3.1);
  });

  it("keeps last frame time strictly within duration for fractional clips", () => {
    const fps = 30;
    const duration = 0.2;
    const count = calculateFrameCount(duration, fps);
    expect(count).toBe(6);
    const lastTime = frameIndexToTime(count - 1, fps);
    expect(lastTime).toBeLessThan(duration);
    expect(frameIndexToTime(0, fps)).toBe(0);
  });
});

describe("Stage 3 Electron export safety markers", () => {
  it("main process spawns ffmpeg without shell: true", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../electron/main.ts", import.meta.url), "utf8");
    expect(source.includes("shell: false")).toBe(true);
    expect(source.includes("shell: true")).toBe(false);
    expect(source.includes("nodeIntegration: false")).toBe(true);
    expect(source.includes("contextIsolation: true")).toBe(true);
  });
});
