import type { Task } from "@/types/domain";

const DEFAULT_TIMESTAMP = "2026-07-15T01:00:00.000Z";

export function buildTask(overrides: Partial<Task> = {}): Task {
  const scheduledDate = overrides.scheduled_date ?? "2026-07-15";
  return {
    id: "0198af4b-0c00-7000-8000-000000000001",
    title: "Prepare release notes",
    description: "",
    status: "todo",
    scheduled_date: scheduledDate,
    is_flexible: true,
    sequence_order: 1,
    origin_date: scheduledDate,
    rollover_count: 0,
    automatic_move: null,
    created_at: DEFAULT_TIMESTAMP,
    updated_at: DEFAULT_TIMESTAMP,
    completed_at: null,
    ...overrides,
  };
}

