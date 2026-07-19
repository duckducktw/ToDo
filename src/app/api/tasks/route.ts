import { apiHandler, jsonResponse, parseExpectedRevision, parseJson, taskMutationPayload } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { todayInTimezone } from "@/lib/date";
import { createTaskInputSchema, dateRangeQuerySchema } from "@/lib/schemas";
import { mutateTaskStore, readTaskRange, readTaskStore } from "@/lib/store";
import { createTask, projectTodayFocus } from "@/lib/task-engine";
import type { TaskRangeResponse } from "@/types/domain";

export async function GET(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const url = new URL(request.url);
    const range = dateRangeQuerySchema.parse({
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    const today = todayInTimezone(user.timezone);
    const focus = url.searchParams.get("focus") === "today";
    const result = focus && range.from === today && range.to === today
      ? await readTaskStore(user.id).then((document) => ({
          revision: document.revision,
          tasks: projectTodayFocus(document.tasks, today),
        }))
      : await readTaskRange(user.id, range.from, range.to);
    const payload: TaskRangeResponse = {
      tasks: result.tasks,
      revision: result.revision,
      today,
      timezone: user.timezone,
    };
    return jsonResponse(payload, {
      headers: { etag: `"${result.revision}"` },
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const expectedRevision = parseExpectedRevision(request);
    const input = await parseJson(request, createTaskInputSchema);
    const transaction = await mutateTaskStore(
      user.id,
      expectedRevision,
      (tasks) => createTask(tasks, input),
    );
    return jsonResponse(taskMutationPayload(transaction), { status: 201 });
  });
}
