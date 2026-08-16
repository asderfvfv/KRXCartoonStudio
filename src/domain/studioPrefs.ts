/** Session-independent studio prefs (music folder, prompt, boot). Local only. */

export type MoveStylePref = "walk" | "run" | "slide";

export interface StudioPrefs {
  musicFolder: string;
  lastPrompt: string;
  /** If false (default), Project Gate stays up — last .kcsproj is not auto-opened. */
  autoOpenLastProject: boolean;
  /** When true, moving/scaling an actor writes X/Y/scale keys at the playhead. */
  autoKey: boolean;
  /** Body animation while position keys move the actor (Walk/Run vs frozen slide). */
  moveStyle: MoveStylePref;
}

export const STUDIO_PREFS_KEY = "kcs-studio-prefs-v1";

export function createDefaultStudioPrefs(): StudioPrefs {
  return {
    musicFolder: "",
    lastPrompt: "",
    autoOpenLastProject: false,
    autoKey: true,
    moveStyle: "slide",
  };
}

export function loadStudioPrefs(): StudioPrefs {
  const fallback = createDefaultStudioPrefs();
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STUDIO_PREFS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StudioPrefs>;
    return {
      musicFolder: typeof parsed.musicFolder === "string" ? parsed.musicFolder : "",
      lastPrompt: typeof parsed.lastPrompt === "string" ? parsed.lastPrompt : "",
      autoOpenLastProject: parsed.autoOpenLastProject === true,
      autoKey: parsed.autoKey !== false,
      // Default slide: user places Walk/Wave manually on timeline ranges.
      moveStyle: parsed.moveStyle === "walk" || parsed.moveStyle === "run" ? parsed.moveStyle : "slide",
    };
  } catch {
    return fallback;
  }
}

export function saveStudioPrefs(prefs: StudioPrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STUDIO_PREFS_KEY, JSON.stringify({
      musicFolder: prefs.musicFolder,
      lastPrompt: prefs.lastPrompt,
      autoOpenLastProject: prefs.autoOpenLastProject === true,
      autoKey: prefs.autoKey !== false,
      moveStyle: prefs.moveStyle === "walk" || prefs.moveStyle === "run" ? prefs.moveStyle : "slide",
    }));
  } catch {
    // ignore quota / private mode
  }
}

export function patchStudioPrefs(patch: Partial<StudioPrefs>): StudioPrefs {
  const next = { ...loadStudioPrefs(), ...patch };
  saveStudioPrefs(next);
  return next;
}
