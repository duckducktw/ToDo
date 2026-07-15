import { z } from "zod";

import { apiHandler, jsonResponse, parseExpectedRevision, parseJson, taskMutationPayload } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { todayInTimezone } from "@/lib/date";
import { patchTaskInputSchema } from "@/lib/schemas";
import { mutateTaskStore } from "@/lib/store";
import { deleteTask, patchTask } from "@/lib/task-engine";

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function taskId(context: RouteContext): Promise<string> {
  const params = await context.params;
  return z.uuid().parse(params.id);
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const id = await taskId(context);
    const expectedRevision = parseExpectedRevision(request);
    const input = await parseJson(request, patchTaskInputSchema);
    const today = todayInTimezone(user.timezone);
    const transaction = await mutateTaskStore(
      user.id,
      expectedRevision,
      (tasks) => patchTask(tasks, id, input, today),
    );
    return jsonResponse(taskMutationPayload(transaction));
  });
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const id = await taskId(context);
    const expectedRevision = parseExpectedRevision(request);
    const transaction = await mutateTaskStore(
      user.id,
      expectedRevision,
      (tasks) => deleteTask(tasks, id),
    );
    return jsonResponse(taskMutationPayload(transaction));
  });
}

