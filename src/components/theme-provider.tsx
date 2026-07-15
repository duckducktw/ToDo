"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  isColorTheme,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  type ColorTheme,
} from "@/lib/theme";

interface ThemeContextValue {
  theme: ColorTheme | null;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSavedTheme(): ColorTheme | null {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isColorTheme(value) ? value : null;
  } catch {
    return null;
  }
}

function deviceTheme(): ColorTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function rootTheme(): ColorTheme {
  const value = document.documentElement.dataset.theme;
  return isColorTheme(value) ? value : deviceTheme();
}

function applyTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeColor) {
    themeColor = document.createElement("meta");
    themeColor.name = "theme-color";
    document.head.append(themeColor);
  }
  themeColor.content = THEME_COLORS[theme];
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ColorTheme | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const syncTheme = () => {
      const nextTheme = readSavedTheme() ?? (media.matches ? "dark" : "light");
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };

    const handleDeviceChange = () => {
      if (!readSavedTheme()) syncTheme();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) syncTheme();
    };

    syncTheme();
    media.addEventListener("change", handleDeviceChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      media.removeEventListener("change", handleDeviceChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: ColorTheme = (theme ?? rootTheme()) === "dark" ? "light" : "dark";

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The current page can still switch themes when storage is unavailable.
    }

    applyTheme(nextTheme);
    setTheme(nextTheme);
  }, [theme]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme 必須在 ThemeProvider 內使用");
  }
  return value;
}
