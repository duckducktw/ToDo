// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TaskEditorDialog } from "@/components/task-editor-dialog";

describe("TaskEditorDialog", () => {
  it("validates a blank title without submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <TaskEditorDialog
        open
        onOpenChange={vi.fn()}
        defaultDate="2026-07-15"
        onSubmit={onSubmit}
      />,
    );
    await user.click(screen.getByRole("button", { name: "加入待辦" }));

    expect(screen.getByRole("alert")).toHaveTextContent("請輸入待辦名稱");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits normalized content and a locked scheduling choice", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <TaskEditorDialog
        open
        onOpenChange={onOpenChange}
        defaultDate="2026-07-15"
        onSubmit={onSubmit}
      />,
    );
    await user.type(screen.getByLabelText(/待辦名稱/), "  Finish proposal  ");
    await user.type(screen.getByLabelText(/說明/), "  Include appendix  ");
    await user.click(screen.getByRole("button", { name: /固定/ }));
    await user.click(screen.getByRole("button", { name: "加入待辦" }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: "Finish proposal",
      description: "Include appendix",
      scheduled_date: "2026-07-15",
      is_flexible: false,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
