"use client";

import { useCallback, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";

interface AnimatedDetailsProps extends Omit<ComponentPropsWithoutRef<"details">, "open" | "onToggle"> {
  summary: ReactNode;
}

export function AnimatedDetails({ summary, children, className = "", ...props }: AnimatedDetailsProps) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const finishClose = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setOpen(false);
    setClosing(false);
  }, []);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
  }, []);

  function handleSummaryClick(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();

    if (closing) {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
      setClosing(false);
      return;
    }

    if (!open) {
      setOpen(true);
      return;
    }

    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOpen(false);
      return;
    }

    setClosing(true);
    closeTimerRef.current = window.setTimeout(finishClose, 300);
  }

  return (
    <details {...props} className={`${className} animated-details${closing ? " closing" : ""}`.trim()} open={open}>
      <summary onClick={handleSummaryClick}>{summary}</summary>
      <div
        className="animated-details-content"
        onAnimationEnd={(event) => {
          if (closing && event.target === event.currentTarget) finishClose();
        }}
      >
        <div className="animated-details-content-inner">{children}</div>
      </div>
    </details>
  );
}
