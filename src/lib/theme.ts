export const THEME_STORAGE_KEY = "flow-todo-theme";

export type ColorTheme = "light" | "dark";

export const THEME_COLORS: Record<ColorTheme, string> = {
  light: "#00b4d8",
  dark: "#00b4d8",
};

export function isColorTheme(value: unknown): value is ColorTheme {
  return value === "light" || value === "dark";
}

export const THEME_BOOTSTRAP_SCRIPT = `(() => {
  const root = document.documentElement;
  let saved = null;
  try {
    saved = window.localStorage.getItem("${THEME_STORAGE_KEY}");
  } catch {}
  const theme = saved === "light" || saved === "dark"
    ? saved
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", theme === "dark" ? "${THEME_COLORS.dark}" : "${THEME_COLORS.light}");
})();`;
