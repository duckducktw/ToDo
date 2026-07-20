import path from "node:path";

import { getDataStoreDir } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  atomicWriteJson,
  readValidatedJson,
  withFileLock,
} from "@/lib/json-file";
import { taskFileSchema, type TaskFile } from "@/lib/schemas";
import { normalizeTasks, type TaskOperationResult } from "@/lib/task-engine";
import type { Task } from "@/types/domain";
import { publishSyncEvent } from "@/lib/sync-events";

const USER_ID_PATTERN = /^google_[A-Za-z0-9_-]{1,200}$/;

function assertInternalUserId(userId: string): void {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new AppError("UNAUTHENTICATED", 401, "Invalid session identity.");
  }
}

export function getTaskFilePath(userId: string): string {
  assertInternalUserId(userId);
  return path.join(getDataStoreDir(), "tasks", `${userId}.json`);
}

function emptyTaskFile(): TaskFile {
  return { schema_version: 1, revision: 0, tasks: [] };
}

async function readOrInitializeUnlocked(filePath: string): Promise<TaskFile> {
  const existing = await readValidatedJson(filePath, taskFileSchema);
  if (existing) {
    return existing;
  }

  const initial = emptyTaskFile();
  await atomicWriteJson(filePath, initial);
  return initial;
}

export async function readTaskStore(userId: string): Promise<TaskFile> {
  const filePath = getTaskFilePath(userId);
  return withFileLock(filePath, async () => readOrInitializeUnlocked(filePath));
}

export async function readTaskRange(
  userId: string,
  from: string,
  to: string,
): Promise<{ revision: number; tasks: Task[] }> {
  const document = await readTaskStore(userId);
  return {
    revision: document.revision,
    tasks: normalizeTasks(
      document.tasks.filter(
        (task) => task.scheduled_date >= from && task.scheduled_date <= to,
      ),
    ),
  };
}

export interface TaskTransactionResult {
  document: TaskFile;
  operation: TaskOperationResult;
}

export async function mutateTaskStore(
  userId: string,
  expectedRevision: number,
  mutation: (tasks: readonly Task[]) => TaskOperationResult,
): Promise<TaskTransactionResult> {
  const filePath = getTaskFilePath(userId);

  const result = await withFileLock(filePath, async () => {
    const current = await readOrInitializeUnlocked(filePath);
    if (current.revision !== expectedRevision) {
      throw new AppError(
        "STALE_REVISION",
        412,
        "The task list changed. Refetch it before retrying.",
      );
    }

    const operation = mutation(current.tasks);
    if (!operation.changed) {
      return { document: current, operation };
    }

    const candidate: TaskFile = {
      schema_version: 1,
      revision: current.revision + 1,
      tasks: normalizeTasks(operation.tasks),
    };
    const validated = taskFileSchema.safeParse(candidate);
    if (!validated.success) {
      throw new AppError(
        "INTERNAL_ERROR",
        500,
        "The task mutation produced invalid data.",
        validated.error,
      );
    }

    await atomicWriteJson(filePath, validated.data);
    return { document: validated.data, operation };
  });
  if (result.operation.changed) publishSyncEvent(userId, "tasks");
  return result;
}
