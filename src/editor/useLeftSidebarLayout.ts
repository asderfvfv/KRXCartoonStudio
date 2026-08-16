import { useCallback, useEffect, useRef, useState } from "react";

export type LeftSidebarSectionId = "scenes" | "actors" | "props" | "motions";

export type LeftSidebarHeights = Record<LeftSidebarSectionId, number>;

const STORAGE_KEY = "kcs-left-sidebar-heights-v7";
const COLLAPSE_KEY = "kcs-left-sidebar-collapsed-v3";

export const LEFT_SIDEBAR_DEFAULT_HEIGHTS: LeftSidebarHeights = {
  scenes: 120,
  actors: 96,
  props: 480,
  motions: 280,
};

const MIN_HEIGHT = 96;
const MAX_HEIGHT = 900;

export type LeftSidebarCollapsed = Record<LeftSidebarSectionId, boolean>;

const DEFAULT_COLLAPSED: LeftSidebarCollapsed = {
  scenes: false,
  actors: false,
  props: false,
  motions: false,
};

function clampHeight(value: number): number {
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(value)));
}

function loadHeights(): LeftSidebarHeights {
  if (typeof localStorage === "undefined") return { ...LEFT_SIDEBAR_DEFAULT_HEIGHTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...LEFT_SIDEBAR_DEFAULT_HEIGHTS };
    const parsed = JSON.parse(raw) as Partial<LeftSidebarHeights>;
    return {
      scenes: clampHeight(Number(parsed.scenes) || LEFT_SIDEBAR_DEFAULT_HEIGHTS.scenes),
      actors: clampHeight(Number(parsed.actors) || LEFT_SIDEBAR_DEFAULT_HEIGHTS.actors),
      props: clampHeight(Number(parsed.props) || LEFT_SIDEBAR_DEFAULT_HEIGHTS.props),
      motions: clampHeight(Number(parsed.motions) || LEFT_SIDEBAR_DEFAULT_HEIGHTS.motions),
    };
  } catch {
    return { ...LEFT_SIDEBAR_DEFAULT_HEIGHTS };
  }
}

function loadCollapsed(): LeftSidebarCollapsed {
  if (typeof localStorage === "undefined") return { ...DEFAULT_COLLAPSED };
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if (!raw) return { ...DEFAULT_COLLAPSED };
    const parsed = JSON.parse(raw) as Partial<LeftSidebarCollapsed>;
    return {
      scenes: Boolean(parsed.scenes),
      actors: Boolean(parsed.actors),
      props: Boolean(parsed.props),
      motions: parsed.motions == null ? false : Boolean(parsed.motions),
    };
  } catch {
    return { ...DEFAULT_COLLAPSED };
  }
}

export function useLeftSidebarLayout() {
  const [heights, setHeights] = useState<LeftSidebarHeights>(() => loadHeights());
  const [collapsed, setCollapsed] = useState<LeftSidebarCollapsed>(() => loadCollapsed());
  const heightsRef = useRef(heights);
  heightsRef.current = heights;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(heights));
    } catch {
      // ignore
    }
  }, [heights]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const setSectionHeight = useCallback((id: LeftSidebarSectionId, height: number) => {
    setHeights((prev) => ({ ...prev, [id]: clampHeight(height) }));
  }, []);

  const nudgeSectionHeight = useCallback((id: LeftSidebarSectionId, delta: number) => {
    setHeights((prev) => ({ ...prev, [id]: clampHeight(prev[id] + delta) }));
  }, []);

  const toggleCollapsed = useCallback((id: LeftSidebarSectionId) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const beginResizeBelow = useCallback((id: LeftSidebarSectionId, clientY: number) => {
    const startY = clientY;
    const startH = heightsRef.current[id];
    const onMove = (event: PointerEvent) => {
      setSectionHeight(id, startH + (event.clientY - startY));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("is-resizing-sidebar");
    };
    document.body.classList.add("is-resizing-sidebar");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [setSectionHeight]);

  return { heights, collapsed, toggleCollapsed, beginResizeBelow, nudgeSectionHeight, setSectionHeight };
}
