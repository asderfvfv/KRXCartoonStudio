import { useCallback, useEffect, useRef, useState } from "react";

const TIMELINE_KEY = "kcs-timeline-height-v3";
const DEFAULT_TIMELINE = 460;
const MIN_TIMELINE = 260;
const MAX_TIMELINE = 720;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function loadTimelineHeight(): number {
  if (typeof localStorage === "undefined") return DEFAULT_TIMELINE;
  try {
    const raw = localStorage.getItem(TIMELINE_KEY);
    if (!raw) return DEFAULT_TIMELINE;
    return clamp(Number(raw) || DEFAULT_TIMELINE, MIN_TIMELINE, MAX_TIMELINE);
  } catch {
    return DEFAULT_TIMELINE;
  }
}

/** Resizable Timeline height (px), persisted in localStorage. */
export function useTimelineHeight() {
  const [height, setHeight] = useState(() => loadTimelineHeight());
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    try {
      localStorage.setItem(TIMELINE_KEY, String(height));
    } catch {
      // ignore
    }
  }, [height]);

  const beginResize = useCallback((clientY: number) => {
    const startY = clientY;
    const startH = heightRef.current;
    const onMove = (event: PointerEvent) => {
      // Splitter is above Timeline: drag up → taller timeline
      setHeight(clamp(startH - (event.clientY - startY), MIN_TIMELINE, MAX_TIMELINE));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("is-resizing-sidebar");
    };
    document.body.classList.add("is-resizing-sidebar");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  return { height, beginResize };
}
