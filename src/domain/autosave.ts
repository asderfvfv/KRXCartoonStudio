/** Autosave preferences — local-only. */

export const AUTOSAVE_STORAGE_KEY = "kcs-autosave-v1";
export const AUTOSAVE_INTERVAL_MS = 45_000;
export const AUTOSAVE_IDLE_MS = 8_000;

export interface AutosaveSettings {
  enabled: boolean;
  intervalMs: number;
}

export function loadAutosaveSettings(): AutosaveSettings {
  if (typeof localStorage === "undefined") {
    return { enabled: true, intervalMs: AUTOSAVE_INTERVAL_MS };
  }
  try {
    const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (!raw) return { enabled: true, intervalMs: AUTOSAVE_INTERVAL_MS };
    const parsed = JSON.parse(raw) as Partial<AutosaveSettings>;
    return {
      enabled: parsed.enabled !== false,
      intervalMs: typeof parsed.intervalMs === "number" && parsed.intervalMs >= 15_000
        ? Math.min(300_000, parsed.intervalMs)
        : AUTOSAVE_INTERVAL_MS,
    };
  } catch {
    return { enabled: true, intervalMs: AUTOSAVE_INTERVAL_MS };
  }
}

export function saveAutosaveSettings(settings: AutosaveSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify({
      enabled: settings.enabled,
      intervalMs: settings.intervalMs,
    }));
  } catch {
    // ignore
  }
}

export function formatAutosaveClock(at: number, now = Date.now()): string {
  if (!at) return "";
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (now - at < 60_000) return `только что (${time})`;
  return time;
}
