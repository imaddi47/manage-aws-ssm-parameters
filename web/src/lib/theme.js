/** Persisted UI theme. Theme preference is non-sensitive (safe to store). */
export const THEME_KEY = "ssm-ui-theme";

/**
 * Read the stored theme, defaulting to dark.
 * @returns {"light" | "dark"}
 */
export function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/**
 * Apply a theme to the document root and persist the choice.
 * @param {"light" | "dark"} theme
 */
export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable (e.g. private mode) — theme still applies this session */
  }
}
