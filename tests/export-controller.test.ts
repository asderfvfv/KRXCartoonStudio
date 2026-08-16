import { describe, expect, it, vi } from "vitest";
import { createDefaultProject } from "../src/domain/defaults";
import { createDefaultRenderSettings } from "../src/domain/renderSettings";
import { ExportController, type ExportDesktopBridge, type ExportControllerHooks } from "../src/systems/ExportController";

function createMockDesktop(overrides: Partial<ExportDesktopBridge> = {}): ExportDesktopBridge {
  return {
    chooseSaveFile: async () => ({ canceled: true }),
    chooseDirectory: async () => ({ canceled: true }),
    ensureDirectory: async () => ({ ok: true }),
    writePng: async () => ({ ok: true }),
    writeText: async () => ({ ok: true }),
    pathExists: async () => false,
    joinPath: async (...parts) => parts.join("/"),
    resolvePath: async (assetPath) => assetPath,
    createTempDir: async () => ({ ok: true, path: "C:/Temp/kcs-test" }),
    removeDirectory: async () => ({ ok: true }),
    checkFfmpeg: async () => ({ ok: true, path: "ffmpeg" }),
    runFfmpeg: async () => ({ ok: true, code: 0 }),
    cancelFfmpeg: async () => ({ ok: true }),
    openPath: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("ExportController cancel and restore", () => {
  it("cancels current-frame export when dialog is dismissed and restores snapshot", async () => {
    const restored: Array<{ time: number; playing: boolean }> = [];
    const states: string[] = [];
    const hooks: ExportControllerHooks = {
      getSnapshot: () => ({ time: 1.5, playing: true, sceneId: "scene-1", selectedActorId: "a", selectedPropId: null, selectedPartId: "body" }),
      restoreSnapshot: (snapshot) => restored.push({ time: snapshot.time, playing: snapshot.playing }),
      setExportState: (state) => { states.push(state.phase); },
      resolveAssetUrl: async (path) => path,
      getProjectPath: () => undefined,
      confirm: () => true,
      yieldToUi: async () => undefined,
    };
    const controller = new ExportController(createMockDesktop(), hooks);
    const project = createDefaultProject();
    const scene = project.scenes![0];
    const result = await controller.exportCurrentFrame(project, scene, createDefaultRenderSettings({ duration: 1 }), 1.5);
    expect(result.phase).toBe("cancelled");
    expect(restored[0]).toEqual({ time: 1.5, playing: true });
    expect(states.includes("preparing")).toBe(true);
  });

  it("refuses a second export while busy", async () => {
    let resolveSave!: (value: { canceled: boolean; filePath?: string }) => void;
    const desktop = createMockDesktop({
      chooseSaveFile: () => new Promise((resolve) => { resolveSave = resolve; }),
    });
    const hooks: ExportControllerHooks = {
      getSnapshot: () => ({ time: 0, playing: false, sceneId: "scene-1", selectedActorId: null, selectedPropId: null, selectedPartId: null }),
      restoreSnapshot: () => undefined,
      setExportState: () => undefined,
      resolveAssetUrl: async (path) => path,
      getProjectPath: () => undefined,
      confirm: () => true,
      yieldToUi: async () => undefined,
    };
    const controller = new ExportController(desktop, hooks);
    const project = createDefaultProject();
    const scene = project.scenes![0];
    const settings = createDefaultRenderSettings({ duration: 1 });
    const first = controller.exportCurrentFrame(project, scene, settings, 0);
    await Promise.resolve();
    const second = await controller.exportCurrentFrame(project, scene, settings, 0);
    expect(second.phase).toBe("failed");
    expect(second.error).toMatch(/уже выполняется/i);
    resolveSave({ canceled: true });
    await first;
  });
});
