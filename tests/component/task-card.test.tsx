// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { TaskCard } from "@/components/task-card";
import { buildTask } from "../fixtures/tasks";

function callbacks() {
  return {
    onToggle: vi.fn(),
    onToggleFlexible: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onMove: vi.fn(),
  };
}

describe("TaskCard", () => {
  it("offers accessible complete and flexibility controls", async () => {
    const user = userEvent.setup();
    const task = buildTask({ title: "Prepare demo" });
    const handlers = callbacks();

    render(
      <TaskCard task={task} index={0} count={1} {...handlers} />,
    );
    await user.click(screen.getByRole("checkbox", { name: "完成「Prepare demo」" }));
    await user.click(
      screen.getByRole("button", { name: "將「Prepare demo」設為固定" }),
    );

    expect(handlers.onToggle).toHaveBeenCalledWith(task);
    expect(handlers.onToggleFlexible).toHaveBeenCalledWith(task);
    expect(screen.getByRole("button", { name: "拖曳「Prepare demo」" })).toBeEnabled();
  });

  it("keeps completed tasks reviewable but removes their drag control", () => {
    const task = buildTask({
      title: "Published report",
      status: "done",
      completed_at: "2026-07-15T02:30:00.000Z",
    });

    render(<TaskCard task={task} index={0} count={1} {...callbacks()} />);

    expect(
      screen.getByRole("checkbox", { name: "重新開啟「Published report」" }),
    ).toBeChecked();
    expect(
      screen.queryByRole("button", { name: "拖曳「Published report」" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a completing task checked in its source layout", () => {
    const task = buildTask({
      title: "Finishing report",
      status: "done",
      completed_at: "2026-07-15T02:30:00.000Z",
    });

    const { container } = render(
      <TaskCard task={task} index={0} count={1} completing {...callbacks()} />,
    );

    expect(container.querySelector(".task-card")).toHaveClass("completing");
    expect(container.querySelector(".task-card")).not.toHaveClass("done");
    expect(
      screen.getByRole("checkbox", { name: "正在完成「Finishing report」" }),
    ).toBeChecked();
    expect(
      screen.getByRole("button", { name: "拖曳「Finishing report」" }),
    ).toBeDisabled();
  });

  it("labels auto-pulled work with its original scheduled date", () => {
    const task = buildTask({
      scheduled_date: "2026-07-15",
      automatic_move: {
        kind: "auto_pull",
        from_date: "2026-07-17",
        moved_at: "2026-07-15T02:30:00.000Z",
      },
    });

    render(<TaskCard task={task} index={0} count={1} {...callbacks()} />);

    expect(screen.getByText("提前・7 月 17 日")).toBeInTheDocument();
  });
});
