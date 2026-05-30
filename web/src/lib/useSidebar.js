import { useCallback, useEffect, useState } from "react";

const WIDTH_KEY = "ssm-ui-sidebar-w";
const COLLAPSED_KEY = "ssm-ui-sidebar-collapsed";
const MIN_W = 200;
const MAX_W = 560;
const DEFAULT_W = 300;

const clampWidth = (w) => Math.min(MAX_W, Math.max(MIN_W, w));

function readWidth() {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(v) && v > 0 ? clampWidth(v) : DEFAULT_W;
  } catch {
    return DEFAULT_W;
  }
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function persist(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (e.g. private mode) — keep working this session */
  }
}

/**
 * Sidebar width + collapsed state, persisted to localStorage (non-sensitive).
 * Width is committed to storage on drag end, not on every mouse move.
 * @returns {{ width: number, collapsed: boolean, toggle: () => void,
 *   reset: () => void, startResize: (e: { preventDefault: () => void, clientX: number }) => void }}
 */
export function useSidebar() {
  const [width, setWidth] = useState(readWidth);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    persist(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  const reset = useCallback(() => {
    setWidth(DEFAULT_W);
    persist(WIDTH_KEY, String(DEFAULT_W));
  }, []);

  const startResize = useCallback((e) => {
    e.preventDefault();
    let latest = clampWidth(e.clientX);
    const onMove = (ev) => {
      latest = clampWidth(ev.clientX);
      setWidth(latest);
    };
    const onUp = () => {
      persist(WIDTH_KEY, String(latest));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  return { width, collapsed, toggle, reset, startResize };
}
