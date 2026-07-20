// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { replaceAffectedDates } from "@/hooks/use-productivity-data";
import type { TaskMutationResponse, TaskRangeResponse } from "@/types/domain";
import { buildTask } from "../fixtures/tasks";

describe("replaceAffectedDates", () => {
  it("immediately replaces Today Focus with persistently pulled tasks", () => {
    const client = new QueryClient();
    const key = ["tasks", "2026-07-15", "2026-07-15", true] as const;
    const completed = buildTask({
      title: "Completed today",
      scheduled_date: "2026-07-15",
      status: "done",
      completed_at: "2026-07-15T01:00:00.000Z",
    });
    const pulled = buildTask({
      title: "Pulled tomorrow task",
      scheduled_date: "2026-07-15",
      automatic_move: {
        kind: "auto_pull",
        from_date: "2026-07-16",
        moved_at: "2026-07-15T01:00:00.000Z",
      },
    });
    const current: TaskRangeResponse = {
      tasks: [completed],
      revision: 3,
      today: "2026-07-15",
      timezone: "Asia/Taipei",
    };
    const result: TaskMutationResponse = {
      revision: 4,
      affected_dates: ["2026-07-15", "2026-07-16"],
      tasks_by_date: {
        "2026-07-15": [pulled, completed],
        "2026-07-16": [],
      },
      rolled_over_ids: [],
      auto_pulled_ids: [pulled.id],
    };
    client.setQueryData(key, current);

    replaceAffectedDates(client, result);

    expect(client.getQueryData<TaskRangeResponse>(key)).toEqual({
      ...current,
      revision: 4,
      tasks: [pulled, completed],
    });
  });
});
