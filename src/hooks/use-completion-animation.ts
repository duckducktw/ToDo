"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const COMPLETION_ANIMATION_MS = 220;

export function useCompletionAnimation() {
  const [completingIds, setCompletingIds] = useState<ReadonlySet<string>>(() => new Set());
  const activeIdsRef = useRef(new Set<string>());
  const timersRef = useRef(new Map<string, number>());

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const startCompletion = useCallback((id: string) => {
    if (activeIdsRef.current.size > 0) return false;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return true;

    activeIdsRef.current.add(id);
    setCompletingIds(new Set(activeIdsRef.current));
    const timer = window.setTimeout(() => {
      timersRef.current.delete(id);
      activeIdsRef.current.delete(id);
      setCompletingIds(new Set(activeIdsRef.current));
    }, COMPLETION_ANIMATION_MS);
    timersRef.current.set(id, timer);
    return true;
  }, []);

  return {
    completingIds,
    completionActive: completingIds.size > 0,
    startCompletion,
  };
}
