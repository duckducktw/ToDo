import { randomUUID } from "node:crypto";

import { calendarDaysBetween } from "@/lib/date";
import { AppError } from "@/lib/errors";
import type {
  CreateTaskInput,
  PatchTaskInput,
  ReorderTaskInput,
} from "@/lib/schemas";
import type { Task } from "@/types/domain";

export interface TaskOperationResult {
  tasks: Task[];
  changed: boolean;
  affectedDates: string[];
  rolledOverIds: string[];
  autoPulledIds: string[];
}

function compareStable(left: Task, right: Task): number {
  return (
    left.sequence_order - right.sequence_order ||
    left.created_at.localeCompare(right.created_at) ||
    left.id.localeCompare(right.id)
  );
}

function groupRank(task: Task): number {
  if (task.status === "done") {
    return 2;
  }

  return task.automatic_move?.kind === "rollover" ? 0 : 1;
}

function uniqueDates(dates: string[]): string[] {
  return [...new Set(dates)].sort();
}

/**
 * Produces the canonical on-disk ordering: rolled-over active tasks, regular
 * active tasks, and completed tasks. Sequence numbers are dense per date.
 */
export function normalizeTasks(tasks: readonly Task[]): Task[] {
  const byDate = new Map<string, Task[]>();

  for (const task of tasks) {
    const dateTasks = byDate.get(task.scheduled_date) ?? [];
    dateTasks.push({ ...task });
    byDate.set(task.scheduled_date, dateTasks);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, dateTasks]) =>
      dateTasks
        .sort(
          (left, right) =>
            groupRank(left) - groupRank(right) || compareStable(left, right),
        )
        .map((task, index) => ({ ...task, sequence_order: index + 1 })),
    );
}

export function createTask(
  tasks: readonly Task[],
  input: CreateTaskInput,
  now: string = new Date().toISOString(),
  id: string = randomUUID(),
): TaskOperationResult {
  const sameDayTasks = tasks.filter(
    (task) => task.scheduled_date === input.scheduled_date,
  );
  const nextOrder = sameDayTasks.reduce(
    (maximum, task) => Math.max(maximum, task.sequence_order),
    0,
  );
  const task: Task = {
    id,
    title: input.title,
    description: input.description,
    status: "todo",
    scheduled_date: input.scheduled_date,
    is_flexible: input.is_flexible,
    sequence_order: nextOrder + 1,
    origin_date: input.scheduled_date,
    rollover_count: 0,
    automatic_move: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  return {
    tasks: normalizeTasks([...tasks, task]),
    changed: true,
    affectedDates: [input.scheduled_date],
    rolledOverIds: [],
    autoPulledIds: [],
  };
}

export function rolloverTasks(
  tasks: readonly Task[],
  today: string,
  movedAt: string = new Date().toISOString(),
): TaskOperationResult {
  const overdue = tasks
    .filter(
      (task) => task.status === "todo" && task.scheduled_date < today,
    )
    .sort(
      (left, right) =>
        left.scheduled_date.localeCompare(right.scheduled_date) ||
        compareStable(left, right),
    );

  if (overdue.length === 0) {
    return {
      tasks: normalizeTasks(tasks),
      changed: false,
      affectedDates: [],
      rolledOverIds: [],
      autoPulledIds: [],
    };
  }

  const overdueIds = new Set(overdue.map((task) => task.id));
  const overdueOrder = new Map(
    overdue.map((task, index) => [task.id, index + 1]),
  );
  const sourceDates = overdue.map((task) => task.scheduled_date);
  const rolloverOrderBase = Math.max(
    0,
    ...tasks
      .filter(
        (task) =>
          task.scheduled_date === today &&
          task.status === "todo" &&
          task.automatic_move?.kind === "rollover",
      )
      .map((task) => task.sequence_order),
  );

  const updated = tasks.map((task): Task => {
    if (!overdueIds.has(task.id)) {
      return { ...task };
    }

    const fromDate = task.scheduled_date;
    return {
      ...task,
      scheduled_date: today,
      sequence_order: rolloverOrderBase + overdueOrder.get(task.id)!,
      rollover_count:
        task.rollover_count + calendarDaysBetween(fromDate, today),
      automatic_move: {
        kind: "rollover",
        from_date: fromDate,
        moved_at: movedAt,
      },
      updated_at: movedAt,
    };
  });

  return {
    tasks: normalizeTasks(updated),
    changed: true,
    affectedDates: uniqueDates([...sourceDates, today]),
    rolledOverIds: overdue.map((task) => task.id),
    autoPulledIds: [],
  };
}

/** Pulls one batch. Callers are responsible for invoking it only after a real
 * completion transition; this function also verifies that today has no active
 * tasks before selecting future candidates. */
export function autoPullTasks(
  tasks: readonly Task[],
  today: string,
  movedAt: string = new Date().toISOString(),
  limit = 3,
): TaskOperationResult {
  const hasActiveToday = tasks.some(
    (task) => task.scheduled_date === today && task.status === "todo",
  );
  const hasOverdueWork = tasks.some(
    (task) => task.scheduled_date < today && task.status === "todo",
  );
  if (hasActiveToday || hasOverdueWork || limit <= 0) {
    return {
      tasks: normalizeTasks(tasks),
      changed: false,
      affectedDates: [],
      rolledOverIds: [],
      autoPulledIds: [],
    };
  }

  const eligible = tasks
    .filter(
      (task) =>
        task.status === "todo" &&
        task.is_flexible &&
        task.scheduled_date > today,
    )
    .sort(
      (left, right) =>
        left.scheduled_date.localeCompare(right.scheduled_date) ||
        compareStable(left, right),
    );
  const nearestDate = eligible[0]?.scheduled_date;
  const candidates = eligible
    .filter((task) => task.scheduled_date === nearestDate)
    .slice(0, limit);

  if (candidates.length === 0) {
    return {
      tasks: normalizeTasks(tasks),
      changed: false,
      affectedDates: [],
      rolledOverIds: [],
      autoPulledIds: [],
    };
  }

  const candidateIds = new Set(candidates.map((task) => task.id));
  const candidateOrder = new Map(
    candidates.map((task, index) => [task.id, index + 1]),
  );
  const sourceDates = candidates.map((task) => task.scheduled_date);
  const nextOrder = Math.max(
    0,
    ...tasks
      .filter((task) => task.scheduled_date === today)
      .map((task) => task.sequence_order),
  );
  const updated = tasks.map((task): Task => {
    if (!candidateIds.has(task.id)) {
      return { ...task };
    }

    const fromDate = task.scheduled_date;
    return {
      ...task,
      scheduled_date: today,
      sequence_order: nextOrder + candidateOrder.get(task.id)!,
      automatic_move: {
        kind: "auto_pull",
        from_date: fromDate,
        moved_at: movedAt,
      },
      updated_at: movedAt,
    };
  });

  return {
    tasks: normalizeTasks(updated),
    changed: true,
    affectedDates: uniqueDates([...sourceDates, today]),
    rolledOverIds: [],
    autoPulledIds: candidates.map((task) => task.id),
  };
}

/** Builds the response-only Today Focus projection without changing scheduling. */
export function projectTodayFocus(
  tasks: readonly Task[],
  today: string,
  projectedAt: string = new Date().toISOString(),
  limit = 3,
): Task[] {
  const todayTasks = normalizeTasks(
    tasks.filter((task) => task.scheduled_date === today),
  );
  const hasCurrentWork = tasks.some(
    (task) => task.status === "todo" && task.scheduled_date <= today,
  );
  if (hasCurrentWork || limit <= 0) {
    return todayTasks;
  }

  const eligible = tasks
    .filter(
      (task) =>
        task.status === "todo" &&
        task.is_flexible &&
        task.scheduled_date > today,
    )
    .sort(
      (left, right) =>
        left.scheduled_date.localeCompare(right.scheduled_date) ||
        compareStable(left, right),
    );
  const nearestDate = eligible[0]?.scheduled_date;
  const previews = eligible
    .filter((task) => task.scheduled_date === nearestDate)
    .slice(0, limit)
    .map((task) => ({
      ...task,
      display_date: today,
      automatic_move: {
        kind: "auto_pull" as const,
        from_date: task.scheduled_date,
        moved_at: projectedAt,
      },
    }));

  return [...previews, ...todayTasks];
}

export function patchTask(
  tasks: readonly Task[],
  taskId: string,
  input: PatchTaskInput,
  _today: string,
  now: string = new Date().toISOString(),
): TaskOperationResult {
  const existing = tasks.find((task) => task.id === taskId);
  if (!existing) {
    throw new AppError("NOT_FOUND", 404, "Task not found.");
  }

  const patched: Task = {
    ...existing,
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.scheduled_date === undefined
      ? {}
      : { scheduled_date: input.scheduled_date }),
    ...(input.is_flexible === undefined
      ? {}
      : { is_flexible: input.is_flexible }),
  };

  if (input.status === "done" && existing.status === "todo") {
    patched.completed_at = now;
  } else if (input.status === "todo" && existing.status === "done") {
    patched.completed_at = null;
  }

  if (
    input.scheduled_date !== undefined &&
    input.scheduled_date !== existing.scheduled_date
  ) {
    patched.automatic_move = null;
  }

  const comparableFields: (keyof Task)[] = [
    "title",
    "description",
    "status",
    "scheduled_date",
    "is_flexible",
    "completed_at",
    "automatic_move",
  ];
  const changed = comparableFields.some((field) => {
    if (field === "automatic_move") {
      return (
        JSON.stringify(existing.automatic_move) !==
        JSON.stringify(patched.automatic_move)
      );
    }
    return existing[field] !== patched[field];
  });

  if (!changed) {
    return {
      tasks: normalizeTasks(tasks),
      changed: false,
      affectedDates: [],
      rolledOverIds: [],
      autoPulledIds: [],
    };
  }

  patched.updated_at = now;
  const nextTasks = normalizeTasks(
    tasks.map((task) => (task.id === taskId ? patched : { ...task })),
  );
  const affectedDates = [existing.scheduled_date, patched.scheduled_date];
  return {
    tasks: nextTasks,
    changed: true,
    affectedDates: uniqueDates(affectedDates),
    rolledOverIds: [],
    autoPulledIds: [],
  };
}

export function reorderTask(
  tasks: readonly Task[],
  input: ReorderTaskInput,
  now: string = new Date().toISOString(),
): TaskOperationResult {
  const canonical = normalizeTasks(tasks);
  const existing = canonical.find((task) => task.id === input.task_id);
  if (!existing) {
    throw new AppError("NOT_FOUND", 404, "Task not found.");
  }
  if (existing.status === "done") {
    throw new AppError(
      "INVALID_REQUEST",
      400,
      "Completed tasks cannot be reordered.",
    );
  }

  const changedDate = existing.scheduled_date !== input.destination_date;
  const moved: Task = {
    ...existing,
    scheduled_date: input.destination_date,
    automatic_move: changedDate ? null : existing.automatic_move,
    updated_at: now,
  };
  const withoutMoved = canonical.filter((task) => task.id !== input.task_id);
  const destinationActive = withoutMoved.filter(
    (task) =>
      task.scheduled_date === input.destination_date && task.status === "todo",
  );
  const insertAt = Math.min(input.destination_index, destinationActive.length);
  destinationActive.splice(insertAt, 0, moved);

  const destinationOrder = new Map(
    destinationActive.map((task, index) => [task.id, index + 1]),
  );
  const updated = [...withoutMoved, moved].map((task) => {
    const order = destinationOrder.get(task.id);
    return order === undefined ? { ...task } : { ...task, sequence_order: order };
  });
  const normalized = normalizeTasks(updated);
  const normalizedMoved = normalized.find((task) => task.id === input.task_id)!;
  const wasNoOp =
    !changedDate &&
    normalizedMoved.sequence_order === existing.sequence_order &&
    normalizedMoved.automatic_move === existing.automatic_move;

  return {
    tasks: wasNoOp ? canonical : normalized,
    changed: !wasNoOp,
    affectedDates: wasNoOp
      ? []
      : uniqueDates([existing.scheduled_date, input.destination_date]),
    rolledOverIds: [],
    autoPulledIds: [],
  };
}

export function deleteTask(
  tasks: readonly Task[],
  taskId: string,
): TaskOperationResult {
  const existing = tasks.find((task) => task.id === taskId);
  if (!existing) {
    throw new AppError("NOT_FOUND", 404, "Task not found.");
  }

  return {
    tasks: normalizeTasks(tasks.filter((task) => task.id !== taskId)),
    changed: true,
    affectedDates: [existing.scheduled_date],
    rolledOverIds: [],
    autoPulledIds: [],
  };
}
