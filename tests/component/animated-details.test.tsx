// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnimatedDetails } from "@/components/animated-details";

function renderDetails() {
  render(
    <AnimatedDetails className="completed-disclosure" summary="已完成">
      <p>完成的待辦</p>
    </AnimatedDetails>,
  );
  const summary = screen.getByText("已完成");
  const details = summary.closest("details")!;
  const content = details.querySelector<HTMLElement>(".animated-details-content")!;
  return { content, details, summary };
}

describe("AnimatedDetails", () => {
  it("keeps content open until its closing animation finishes", () => {
    const { content, details, summary } = renderDetails();

    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");

    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(details).toHaveClass("closing");

    fireEvent.animationEnd(content);
    expect(details).not.toHaveAttribute("open");
    expect(details).not.toHaveClass("closing");
  });

  it("cancels a close when the summary is clicked again", () => {
    const { content, details, summary } = renderDetails();

    fireEvent.click(summary);
    fireEvent.click(summary);
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(details).not.toHaveClass("closing");

    fireEvent.animationEnd(content);
    expect(details).toHaveAttribute("open");
  });

  it("closes immediately when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const { details, summary } = renderDetails();

    fireEvent.click(summary);
    fireEvent.click(summary);
    expect(details).not.toHaveAttribute("open");

    vi.unstubAllGlobals();
  });
});
