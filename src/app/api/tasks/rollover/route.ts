import { apiHandler, jsonResponse, parseExpectedRevision, taskMutationPayload } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { todayInTimezone } from "@/lib/date";
import { mutateTaskStore } from "@/lib/store";
import { prepareTodayTasks } from "@/lib/task-engine";

export async function POST(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const expectedRevision = parseExpectedRevision(request);
    const today = todayInTimezone(user.timezone);
    const transaction = await mutateTaskStore(
      user.id,
      expectedRevision,
      (tasks) => prepareTodayTasks(tasks, today),
    );
    return jsonResponse(taskMutationPayload(transaction));
  });
}
