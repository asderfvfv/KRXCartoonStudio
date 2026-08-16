import { beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyRecentProjects,
  formatRecentOpenedAt,
  pathsEqual,
  projectNameFromPath,
  pruneMissingRecentProjects,
  rememberProjectPath,
  removeRecentProjectPath,
  saveRecentProjects,
  loadRecentProjects,
} from "../src/domain/recentProjects";
import { formatAutosaveClock, loadAutosaveSettings, saveAutosaveSettings } from "../src/domain/autosave";
import { loadStudioPrefs, patchStudioPrefs, saveStudioPrefs, createDefaultStudioPrefs } from "../src/domain/studioPrefs";

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
      clear: () => memory.clear(),
    },
  });
});

describe("recentProjects", () => {
  it("derives name from .kcsproj path", () => {
    expect(projectNameFromPath("D:\\\\Films\\\\My Show.kcsproj")).toBe("My Show");
  });

  it("compares windows/unix paths case-insensitively", () => {
    expect(pathsEqual("D:/a/One.kcsproj", "d:\\a\\one.kcsproj")).toBe(true);
  });

  it("remembers last path and recent order", () => {
    saveRecentProjects(createEmptyRecentProjects());
    rememberProjectPath("D:/a/one.kcsproj", "One");
    rememberProjectPath("D:/b/two.kcsproj", "Two");
    const state = loadRecentProjects();
    expect(state.lastPath).toBe("D:/b/two.kcsproj");
    expect(state.recent.map((item) => item.name)).toEqual(["Two", "One"]);
  });

  it("removes missing recent entry", () => {
    rememberProjectPath("D:/gone.kcsproj");
    const next = removeRecentProjectPath("D:/gone.kcsproj");
    expect(next.lastPath).toBeUndefined();
    expect(next.recent).toHaveLength(0);
  });

  it("prunes paths that no longer exist", async () => {
    rememberProjectPath("D:/keep.kcsproj", "Keep");
    rememberProjectPath("D:/gone.kcsproj", "Gone");
    const next = await pruneMissingRecentProjects(async (path) => path.includes("keep"));
    expect(next.recent.map((item) => item.name)).toEqual(["Keep"]);
    expect(next.lastPath?.toLowerCase()).toContain("keep");
  });

  it("formats recent opened-at labels", () => {
    const now = Date.now();
    expect(formatRecentOpenedAt(now - 30_000, now)).toBe("только что");
    expect(formatRecentOpenedAt(now - 10 * 60_000, now)).toBe("10 мин назад");
  });
});

describe("autosave settings", () => {
  it("defaults to enabled and persists toggle", () => {
    expect(loadAutosaveSettings().enabled).toBe(true);
    saveAutosaveSettings({ enabled: false, intervalMs: 45_000 });
    expect(loadAutosaveSettings().enabled).toBe(false);
  });

  it("formats autosave clock", () => {
    const now = Date.now();
    expect(formatAutosaveClock(now - 5_000, now)).toContain("только что");
  });
});

describe("studio prefs", () => {
  it("does not auto-open last project by default", () => {
    expect(createDefaultStudioPrefs().autoOpenLastProject).toBe(false);
    expect(loadStudioPrefs().autoOpenLastProject).toBe(false);
  });

  it("remembers music folder and prompt", () => {
    saveStudioPrefs({
      musicFolder: "D:/Music/Cartoon",
      lastPrompt: "# В гости\nОгонёк: Привет!",
      autoOpenLastProject: false,
      autoKey: true,
      moveStyle: "slide",
    });
    const loaded = loadStudioPrefs();
    expect(loaded.musicFolder).toBe("D:/Music/Cartoon");
    expect(loaded.lastPrompt).toContain("Огонёк");
    const patched = patchStudioPrefs({ autoOpenLastProject: true });
    expect(patched.autoOpenLastProject).toBe(true);
    expect(patched.musicFolder).toBe("D:/Music/Cartoon");
  });
});
