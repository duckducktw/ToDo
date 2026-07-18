"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ApiErrorPayload,
  CalendarResponse,
  Task,
  TaskMutationResponse,
  TaskRangeResponse,
} from "@/types/domain";
import { useNotice, useTimezoneReady } from "@/app/providers";
import { handleUnauthorizedResponse } from "@/lib/client-session";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "UNKNOWN_ERROR", status = 500) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  await handleUnauthorizedResponse(response);

  let payload: ApiErrorPayload | null = null;
  try {
    payload = (await response.json()) as ApiErrorPayload;
  } catch {
    // The fallback below also covers upstream HTML and empty responses.
  }
  throw new ApiError(payload?.error.message ?? "伺服器暫時無法完成要求", payload?.error.code, response.status);
}

export function useTasks(from: string, to: string) {
  const timezoneReady = useTimezoneReady();
  return useQuery({
    queryKey: ["tasks", from, to],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/tasks?${params}`, { cache: "no-store", signal });
      return parseResponse<TaskRangeResponse>(response);
    },
    enabled: timezoneReady,
  });
}

export function useCalendar(from: string, to: string) {
  const timezoneReady = useTimezoneReady();
  return useQuery({
    queryKey: ["calendar", from, to],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ from, to });
      const response = await fetch(`/api/calendar?${params}`, { cache: "no-store", signal });
      return parseResponse<CalendarResponse>(response);
    },
    enabled: timezoneReady,
  });
}

function replaceAffectedDates(client: QueryClient, result: TaskMutationResponse) {
  client.getQueriesData<TaskRangeResponse>({ queryKey: ["tasks"] }).forEach(([key, current]) => {
    if (!current) return;
    const [, from, to] = key as [string, string, string];
    const affected = new Set(result.affected_dates);
    const replacement = Object.values(result.tasks_by_date)
      .flat()
      .filter((task) => task.scheduled_date >= from && task.scheduled_date <= to);
    client.setQueryData<TaskRangeResponse>(key, {
      ...current,
      revision: result.revision,
      tasks: [
        ...current.tasks.filter(
          (task) => !affected.has(task.scheduled_date) && task.scheduled_date >= from && task.scheduled_date <= to,
        ),
        ...replacement,
      ],
    });
  });
}

type TaskCacheUpdater = (tasks: Task[]) => Task[];

interface MutationInput {
  url: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  revision?: number;
  body?: unknown;
  optimistic?: TaskCacheUpdater;
  successMessage?: string;
}

export function useTaskActions() {
  const client = useQueryClient();
  const { notify } = useNotice();

  const mutation = useMutation({
    mutationFn: async (input: MutationInput) => {
      const headers: Record<string, string> = {};
      if (input.body !== undefined) headers["Content-Type"] = "application/json";
      if (input.revision !== undefined) headers["If-Match"] = String(input.revision);
      const response = await fetch(input.url, {
        method: input.method,
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      });
      return parseResponse<TaskMutationResponse>(response);
    },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: ["tasks"] });
      const snapshots = client.getQueriesData<TaskRangeResponse>({ queryKey: ["tasks"] });
      if (input.optimistic) {
        snapshots.forEach(([key, current]) => {
          if (!current) return;
          const [, from, to] = key as [string, string, string];
          client.setQueryData<TaskRangeResponse>(key, {
            ...current,
            tasks: input.optimistic!(current.tasks).filter(
              (task) => task.scheduled_date >= from && task.scheduled_date <= to,
            ),
          });
        });
      }
      return { snapshots };
    },
    onSuccess: (result, input, context) => {
      if (result.affected_dates.length === 0) {
        context?.snapshots.forEach(([key, value]) => client.setQueryData(key, value));
      } else {
        replaceAffectedDates(client, result);
      }
      if (input.successMessage) notify(input.successMessage, "success");
      if (result.auto_pulled_ids.length > 0) {
        notify(`已從未來安排中帶入 ${result.auto_pulled_ids.length} 項彈性待辦`, "info");
      }
    },
    onError: (error, _input, context) => {
      context?.snapshots.forEach(([key, value]) => client.setQueryData(key, value));
      const apiError = error instanceof ApiError ? error : new ApiError("更新失敗，請稍後再試");
      if (apiError.status === 412) {
        notify("資料已在其他頁面更新，已重新載入最新內容", "error");
        void client.invalidateQueries({ queryKey: ["tasks"] });
      } else if (apiError.status === 401) {
        notify("登入狀態已失效，請重新登入", "error");
      } else {
        notify(apiError.message, "error");
      }
    },
  });

  return {
    isPending: mutation.isPending,
    createTask: (input: { title: string; description: string; scheduled_date: string; is_flexible: boolean }, revision: number) => {
      const temporaryId = `pending-${Date.now()}`;
      const now = new Date().toISOString();
      return mutation.mutateAsync({
        url: "/api/tasks",
        method: "POST",
        revision,
        body: input,
        successMessage: "待辦已加入",
        optimistic: (tasks) => [
          ...tasks,
          {
            id: temporaryId,
            ...input,
            status: "todo",
            sequence_order: Math.max(0, ...tasks.filter((task) => task.scheduled_date === input.scheduled_date).map((task) => task.sequence_order)) + 1,
            origin_date: input.scheduled_date,
            rollover_count: 0,
            automatic_move: null,
            created_at: now,
            updated_at: now,
            completed_at: null,
          },
        ],
      });
    },
    updateTask: (id: string, patch: Partial<Pick<Task, "title" | "description" | "status" | "scheduled_date" | "is_flexible">>, revision: number) =>
      mutation.mutateAsync({
        url: `/api/tasks/${encodeURIComponent(id)}`,
        method: "PATCH",
        revision,
        body: patch,
        optimistic: (tasks) => tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
      }),
    deleteTask: (task: Task, revision: number) =>
      mutation.mutateAsync({
        url: `/api/tasks/${encodeURIComponent(task.id)}`,
        method: "DELETE",
        revision,
        successMessage: "待辦已刪除",
        optimistic: (tasks) => tasks.filter((candidate) => candidate.id !== task.id),
      }),
    reorderTask: (task: Task, destinationDate: string, destinationIndex: number, revision: number) =>
      mutation.mutateAsync({
        url: "/api/tasks/reorder",
        method: "PUT",
        revision,
        body: { task_id: task.id, destination_date: destinationDate, destination_index: destinationIndex },
        optimistic: (tasks) => {
          const remaining = tasks.filter((candidate) => candidate.id !== task.id);
          const destination = remaining
            .filter((candidate) => candidate.scheduled_date === destinationDate && candidate.status === "todo")
            .sort((a, b) => a.sequence_order - b.sequence_order);
          const next = {
            ...task,
            scheduled_date: destinationDate,
            sequence_order: destinationIndex + 1,
            automatic_move:
              destinationDate === task.scheduled_date
                ? task.automatic_move
                : null,
          };
          destination.splice(Math.max(0, Math.min(destinationIndex, destination.length)), 0, next);
          const destinationIds = new Set(destination.map((candidate) => candidate.id));
          return [
            ...remaining.filter((candidate) => !destinationIds.has(candidate.id)),
            ...destination.map((candidate, index) => ({ ...candidate, sequence_order: index + 1 })),
          ];
        },
      }),
    runRollover: (revision: number) =>
      mutation.mutateAsync({
        url: "/api/tasks/rollover",
        method: "POST",
        revision,
      }),
  };
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "發生未預期的錯誤";
}
