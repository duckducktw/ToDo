import { apiHandler, jsonResponse, parseExpectedRevision, parseJson, taskMutationPayload } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { reorderTaskInputSchema } from "@/lib/schemas";
import { mutateTaskStore } from "@/lib/store";
import { reorderTask } from "@/lib/task-engine";

export async function PUT(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const expectedRevision = parseExpectedRevision(request);
    const input = await parseJson(request, reorderTaskInputSchema);
    const transaction = await mutateTaskStore(
      user.id,
      expectedRevision,
      (tasks) => reorderTask(tasks, input),
    );
    return jsonResponse(taskMutationPayload(transaction));
  });
}

