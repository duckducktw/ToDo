// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { COMPLETION_ANIMATION_MS, useCompletionAnimation } from "@/hooks/use-completion-animation";

describe("useCompletionAnimation", () => {
  afterEach(() => vi.useRealTimers());

  it("retains one completing task and locks concurrent completions", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCompletionAnimation());
    let firstStarted = false;
    let secondStarted = true;

    act(() => {
      firstStarted = result.current.startCompletion("task-1");
      secondStarted = result.current.startCompletion("task-2");
    });

    expect(firstStarted).toBe(true);
    expect(secondStarted).toBe(false);
    expect(result.current.completionActive).toBe(true);
    expect(result.current.completingIds.has("task-1")).toBe(true);

    act(() => vi.advanceTimersByTime(COMPLETION_ANIMATION_MS));
    expect(result.current.completionActive).toBe(false);
    expect(result.current.completingIds.size).toBe(0);
  });
});
