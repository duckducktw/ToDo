// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { ThemeSwitch } from "@/components/theme-switch";
import { THEME_STORAGE_KEY } from "@/lib/theme";

function ThemeHarness() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>{theme ?? "pending"}</button>;
}

describe("ThemeProvider", () => {
  let deviceIsDark = false;
  let changeListener: (() => void) | undefined;

  beforeEach(() => {
    window.localStorage.clear();
    deviceIsDark = false;
    changeListener = undefined;
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation(() => ({
        get matches() {
          return deviceIsDark;
        },
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => {
          changeListener = listener;
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.removeProperty("color-scheme");
  });

  it("uses the device preference until the user chooses a theme", async () => {
    deviceIsDark = true;
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("dark"));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

    deviceIsDark = false;
    act(() => changeListener?.());

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("light"));
  });

  it("persists an explicit choice and stops following device changes", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeHarness />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("light"));
    await user.click(screen.getByRole("button"));

    expect(screen.getByRole("button")).toHaveTextContent("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    deviceIsDark = false;
    act(() => changeListener?.());
    expect(screen.getByRole("button")).toHaveTextContent("dark");
  });

  it("exposes the theme toggle as an accessible switch", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeSwitch />
      </ThemeProvider>,
    );

    const themeSwitch = screen.getByRole("switch", { name: "深色模式" });
    await waitFor(() => expect(themeSwitch).toHaveAttribute("aria-checked", "false"));
    await user.click(themeSwitch);

    expect(themeSwitch).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });
});
