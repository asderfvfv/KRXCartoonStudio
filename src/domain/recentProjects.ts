/** Last / recent .kcsproj paths — local-first, no cloud. */

export interface RecentProjectEntry {
  path: string;
  name: string;
  openedAt: number;
}

export interface RecentProjectsState {
  lastPath?: string;
  recent: RecentProjectEntry[];
}

const STORAGE_KEY = "kcs-recent-projects-v1";
const MAX_RECENT = 12;

export function createEmptyRecentProjects(): RecentProjectsState {
  return { recent: [] };
}

export function pathsEqual(a: string, b: string): boolean {
  return a.trim().replace(/\\/g, "/").toLowerCase() === b.trim().replace(/\\/g, "/").toLowerCase();
}

export function loadRecentProjects(): RecentProjectsState {
  if (typeof localStorage === "undefined") return createEmptyRecentProjects();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyRecentProjects();
    const parsed = JSON.parse(raw) as Partial<RecentProjectsState>;
    const seen = new Set<string>();
    const recent = Array.isArray(parsed.recent)
      ? parsed.recent
          .filter((item): item is RecentProjectEntry => Boolean(item && typeof item.path === "string" && item.path.trim()))
          .map((item) => ({
            path: item.path.trim(),
            name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : projectNameFromPath(item.path),
            openedAt: typeof item.openedAt === "number" ? item.openedAt : 0,
          }))
          .filter((item) => {
            const key = item.path.replace(/\\/g, "/").toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => b.openedAt - a.openedAt)
          .slice(0, MAX_RECENT)
      : [];
    const lastPath = typeof parsed.lastPath === "string" && parsed.lastPath.trim()
      ? parsed.lastPath.trim()
      : recent[0]?.path;
    if (lastPath && !recent.some((item) => pathsEqual(item.path, lastPath))) {
      recent.unshift({
        path: lastPath,
        name: projectNameFromPath(lastPath),
        openedAt: Date.now(),
      });
    }
    return { lastPath, recent: recent.slice(0, MAX_RECENT) };
  } catch {
    return createEmptyRecentProjects();
  }
}

export function saveRecentProjects(state: RecentProjectsState): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lastPath: state.lastPath,
      recent: state.recent.slice(0, MAX_RECENT),
    }));
  } catch {
    // ignore quota / private mode
  }
}

export function projectNameFromPath(filePath: string): string {
  const base = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  return base.replace(/\.kcsproj$/i, "") || base;
}

/** Remember a successfully opened/saved project path. */
export function rememberProjectPath(filePath: string, projectName?: string): RecentProjectsState {
  const path = filePath.trim();
  const current = loadRecentProjects();
  if (!path) return current;
  const name = (projectName?.trim() || projectNameFromPath(path));
  const next: RecentProjectsState = {
    lastPath: path,
    recent: [
      { path, name, openedAt: Date.now() },
      ...current.recent.filter((item) => !pathsEqual(item.path, path)),
    ].slice(0, MAX_RECENT),
  };
  saveRecentProjects(next);
  return next;
}

export function removeRecentProjectPath(filePath: string): RecentProjectsState {
  const current = loadRecentProjects();
  const recent = current.recent.filter((item) => !pathsEqual(item.path, filePath));
  const lastGone = current.lastPath ? pathsEqual(current.lastPath, filePath) : false;
  const next: RecentProjectsState = {
    lastPath: lastGone ? recent[0]?.path : current.lastPath,
    recent,
  };
  saveRecentProjects(next);
  return next;
}

/** Drop entries whose files no longer exist (caller provides exists check). */
export async function pruneMissingRecentProjects(
  exists: (filePath: string) => Promise<boolean>,
): Promise<RecentProjectsState> {
  const current = loadRecentProjects();
  const kept: RecentProjectEntry[] = [];
  for (const item of current.recent) {
    try {
      if (await exists(item.path)) kept.push(item);
    } catch {
      // treat as missing
    }
  }
  let lastPath = current.lastPath;
  if (lastPath) {
    try {
      if (!(await exists(lastPath))) lastPath = kept[0]?.path;
    } catch {
      lastPath = kept[0]?.path;
    }
  } else {
    lastPath = kept[0]?.path;
  }
  const next: RecentProjectsState = { lastPath, recent: kept.slice(0, MAX_RECENT) };
  saveRecentProjects(next);
  return next;
}

export function formatRecentOpenedAt(openedAt: number, now = Date.now()): string {
  if (!openedAt) return "";
  const delta = Math.max(0, now - openedAt);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return new Date(openedAt).toLocaleDateString();
}
