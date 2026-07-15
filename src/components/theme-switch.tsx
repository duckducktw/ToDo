"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";

export function ThemeSwitch({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const actionLabel = isDark ? "切換至淺色模式" : "切換至深色模式";

  return (
    <Tooltip.Provider delayDuration={450}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            className={`theme-switch ${className}`.trim()}
            type="button"
            role="switch"
            aria-label="深色模式"
            aria-checked={isDark}
            onClick={toggleTheme}
          >
            <Sun className="theme-icon theme-icon-sun" aria-hidden="true" size={18} />
            <Moon className="theme-icon theme-icon-moon" aria-hidden="true" size={18} />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip-content" sideOffset={7}>
            {actionLabel}
            <Tooltip.Arrow className="tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
