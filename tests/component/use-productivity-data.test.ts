// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { replaceAffectedDates } from "@/hooks/use-productivity-data";
import type { TaskMutationResponse, TaskRangeResponse } from "@/types/domain";
import { buildTask } from "../fixtures/tasks";

describe("replaceAffectedDates", () => {
  it("preserves an edited Today Focus preview until its projection is refetched", () => {
    const client = new QueryClient();
    const key = ["tasks", "2026-07-15", "2026-07-15", true] as const;
    const preview = buildTask({
      title: "Edited future task",
      scheduled_date: "2026-07-17",
      display_date: "2026-07-15",
      automatic_move: {
        kind: "auto_pull",
        from_date: "2026-07-17",
        moved_at: "2026-07-15T01:00:00.000Z",
      },
    });
    const current: TaskRangeResponse = {
      tasks: [preview],
      revision: 3,
      today: "2026-07-15",
      timezone: "Asia/Taipei",
    };
    const result: TaskMutationResponse = {
      revision: 4,
      affected_dates: ["2026-07-17"],
      tasks_by_date: { "2026-07-17": [{ ...preview, display_date: undefined }] },
      rolled_over_ids: [],
      auto_pulled_ids: [],
    };
    client.setQueryData(key, current);

    replaceAffectedDates(client, result);

    expect(client.getQueryData<TaskRangeResponse>(key)).toEqual({
      ...current,
      revision: 4,
    });
  });
});
