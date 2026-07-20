import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  autoPullTasks,
  normalizeTasks,
  patchTask,
  projectPlanningRange,
  projectTodayFocus,
  reorderTask,
  rolloverTasks,
} from "@/lib/task-engine";
import type { Task } from "@/types/domain";
import { buildTask } from "../fixtures/tasks";

const TODAY = "2026-07-15";
const NOW = "2026-07-15T02:30:00.000Z";

function taskId(number: number): string {
  return `0198af4b-0c00-7000-8000-${String(number).padStart(12, "0")}`;
}

function task(number: number, overrides: Partial<Task> = {}): Task {
  return buildTask({ id: taskId(number), title: `Task ${number}`, ...overrides });
}

describe("normalizeTasks", () => {
  it("densely orders rollover, regular, and completed groups for each day", () => {
    const regular = task(1, { sequence_order: 8 });
    const completed = task(2, {
      status: "done",
      sequence_order: 1,
      completed_at: NOW,
    });
    const rollover = task(3, {
      sequence_order: 20,
      automatic_move: {
        kind: "rollover",
        from_date: "2026-07-14",
        moved_at: NOW,
      },
    });

    const normalized = normalizeTasks([completed, regular, rollover]);

    expect(normalized.map(({ id }) => id)).toEqual([
      rollover.id,
      regular.id,
      completed.id,
    ]);
    expect(normalized.map(({ sequence_order }) => sequence_order)).toEqual([
      1, 2, 3,
    ]);
  });
});

describe("rolloverTasks", () => {
  it("moves every overdue active task, including locked tasks, by missed days", () => {
    const oldFlexible = task(1, {
      scheduled_date: "2026-07-12",
      origin_date: "2026-07-12",
      sequence_order: 2,
    });
    const oldLocked = task(2, {
      scheduled_date: "2026-07-14",
      origin_date: "2026-07-14",
      is_flexible: false,
      sequence_order: 1,
    });
    const oldDone = task(3, {
      scheduled_date: "2026-07-13",
      origin_date: "2026-07-13",
      status: "done",
      completed_at: NOW,
    });
    const todayTask = task(4);

    const result = rolloverTasks(
      [todayTask, oldDone, oldLocked, oldFlexible],
      TODAY,
      NOW,
    );

    expect(result.rolledOverIds).toEqual([oldFlexible.id, oldLocked.id]);
    expect(result.affectedDates).toEqual([
      "2026-07-12",
      "2026-07-14",
      TODAY,
    ]);
    expect(
      result.tasks.map(({ id, scheduled_date, rollover_count }) => ({
        id,
        scheduled_date,
        rollover_count,
      })),
    ).toEqual([
      {
        id: oldDone.id,
        scheduled_date: "2026-07-13",
        rollover_count: 0,
      },
      { id: oldFlexible.id, scheduled_date: TODAY, rollover_count: 3 },
      { id: oldLocked.id, scheduled_date: TODAY, rollover_count: 1 },
      { id: todayTask.id, scheduled_date: TODAY, rollover_count: 0 },
    ]);
  });

  it("is idempotent after the first successful transition", () => {
    const initial = [
      task(1, {
        scheduled_date: "2026-07-14",
        origin_date: "2026-07-14",
      }),
    ];
    const first = rolloverTasks(initial, TODAY, NOW);
    const second = rolloverTasks(first.tasks, TODAY, NOW);

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.rolledOverIds).toEqual([]);
    expect(second.tasks).toEqual(first.tasks);
  });
});

describe("projectPlanningRange", () => {
  it("shows rolled-over work on its most recent scheduled date", () => {
    const rolled = task(1, {
      scheduled_date: TODAY,
      origin_date: "2026-07-12",
      rollover_count: 3,
      automatic_move: {
        kind: "rollover",
        from_date: "2026-07-14",
        moved_at: NOW,
      },
    });

    const planning = projectPlanningRange([rolled], "2026-07-14", "2026-07-14");

    expect(planning).toEqual([{ ...rolled, display_date: "2026-07-14" }]);
    expect(projectTodayFocus([rolled], TODAY)).toEqual([rolled]);
    expect(rolled.scheduled_date).toBe(TODAY);
  });
});

describe("autoPullTasks", () => {
  it("selects at most three flexible tasks across future dates", () => {
    const doneToday = task(1, { status: "done", completed_at: NOW });
    const laterFirst = task(2, {
      scheduled_date: "2026-07-18",
      origin_date: "2026-07-18",
      sequence_order: 1,
    });
    const nearestSecond = task(3, {
      scheduled_date: "2026-07-16",
      origin_date: "2026-07-16",
      sequence_order: 2,
    });
    const nearestFirst = task(4, {
      scheduled_date: "2026-07-16",
      origin_date: "2026-07-16",
      sequence_order: 1,
    });
    const fourth = task(5, {
      scheduled_date: "2026-07-17",
      origin_date: "2026-07-17",
    });
    const locked = task(6, {
      scheduled_date: "2026-07-16",
      origin_date: "2026-07-16",
      is_flexible: false,
    });

    const result = autoPullTasks(
      [doneToday, laterFirst, nearestSecond, nearestFirst, fourth, locked],
      TODAY,
      NOW,
    );

    expect(result.autoPulledIds).toEqual([
      nearestFirst.id,
      nearestSecond.id,
      fourth.id,
    ]);
    expect(
      result.tasks
        .filter((candidate) => candidate.scheduled_date === TODAY)
        .map(({ id }) => id),
    ).toEqual([nearestFirst.id, nearestSecond.id, fourth.id, doneToday.id]);
    expect(
      result.tasks.find((candidate) => candidate.id === fourth.id)
        ?.automatic_move,
    ).toMatchObject({ kind: "auto_pull", from_date: "2026-07-17" });
    expect(
      result.tasks.find((candidate) => candidate.id === locked.id)
        ?.scheduled_date,
    ).toBe("2026-07-16");
    expect(
      result.tasks.find((candidate) => candidate.id === laterFirst.id)
        ?.scheduled_date,
    ).toBe("2026-07-18");
  });

  it("does nothing while today still has active work", () => {
    const todayTask = task(1);
    const future = task(2, {
      scheduled_date: "2026-07-16",
      origin_date: "2026-07-16",
    });

    const result = autoPullTasks([todayTask, future], TODAY, NOW);

    expect(result.changed).toBe(false);
    expect(result.autoPulledIds).toEqual([]);
  });

  it("does not pull future work while an overdue task still needs rollover", () => {
    const overdue = task(1, {
      scheduled_date: "2026-07-14",
      origin_date: "2026-07-14",
    });
    const future = task(2, {
      scheduled_date: "2026-07-16",
      origin_date: "2026-07-16",
    });

    const result = autoPullTasks([overdue, future], TODAY, NOW);

    expect(result.changed).toBe(false);
    expect(result.autoPulledIds).toEqual([]);
    expect(result.tasks.find(({ id }) => id === future.id)?.scheduled_date).toBe(
      "2026-07-16",
    );
  });
});

describe("projectTodayFocus", () => {
  it("does not preview future work that has not been persistently pulled", () => {
    const tomorrow = task(1, {
      scheduled_date: "2026-07-16",
      origin_date: "2026-07-16",
    });

    expect(projectTodayFocus([tomorrow], TODAY)).toEqual([]);
  });

  it("does not preview future work while overdue work remains", () => {
    const overdue = task(1, {
      scheduled_date: "2026-07-14",
      origin_date: "2026-07-14",
    });
    const tomorrow = task(2, {
      scheduled_date: "2026-07-16",
      origin_date: "2026-07-16",
    });

    const result = projectTodayFocus([overdue, tomorrow], TODAY);

    expect(result).toEqual([]);
  });
});

describe("patchTask completion transitions", () => {
  it("persistently pulls up to three future tasks after today's work is complete", () => {
    const todayTask = task(1);
    const futures = [2, 3, 4, 5].map((number, index) =>
      task(number, {
        scheduled_date: index < 3 ? "2026-07-16" : "2026-07-17",
        origin_date: index < 3 ? "2026-07-16" : "2026-07-17",
      }),
    );

    const firstCompletion = patchTask(
      [todayTask, ...futures],
      todayTask.id,
      { status: "done" },
      TODAY,
      NOW,
    );
    expect(firstCompletion.autoPulledIds).toEqual(
      futures.slice(0, 3).map(({ id }) => id),
    );
    expect(
      firstCompletion.tasks
        .filter(({ id }) => futures.some((future) => future.id === id))
        .map(({ scheduled_date }) => scheduled_date),
    ).toEqual([TODAY, TODAY, TODAY, "2026-07-17"]);
    expect(projectTodayFocus(firstCompletion.tasks, TODAY)).toHaveLength(4);
  });

  it("does not pull for duplicate or future completion requests", () => {
    const alreadyDone = task(1, { status: "done", completed_at: NOW });
    const futureToComplete = task(2, {
      scheduled_date: "2026-07-16",
      origin_date: "2026-07-16",
    });
    const futureCandidate = task(3, {
      scheduled_date: "2026-07-17",
      origin_date: "2026-07-17",
    });

    const duplicate = patchTask(
      [alreadyDone, futureCandidate],
      alreadyDone.id,
      { status: "done" },
      TODAY,
      NOW,
    );
    const future = patchTask(
      [alreadyDone, futureToComplete, futureCandidate],
      futureToComplete.id,
      { status: "done" },
      TODAY,
      NOW,
    );

    expect(duplicate.changed).toBe(false);
    expect(duplicate.autoPulledIds).toEqual([]);
    expect(future.autoPulledIds).toEqual([]);
  });
});

describe("reorderTask", () => {
  it("clears automatic provenance when manually moved to another date", () => {
    const pulled = task(1, {
      automatic_move: {
        kind: "auto_pull",
        from_date: "2026-07-17",
        moved_at: NOW,
      },
    });

    const result = reorderTask(
      [pulled],
      {
        task_id: pulled.id,
        destination_date: "2026-07-16",
        destination_index: 0,
      },
      NOW,
    );

    expect(result.tasks[0]).toMatchObject({
      scheduled_date: "2026-07-16",
      automatic_move: null,
    });
  });

  it("refuses to reorder completed work", () => {
    const completed = task(1, { status: "done", completed_at: NOW });

    expect(() =>
      reorderTask([completed], {
        task_id: completed.id,
        destination_date: TODAY,
        destination_index: 0,
      }),
    ).toThrowError(AppError);
  });
});
