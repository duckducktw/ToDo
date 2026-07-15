import { apiHandler, jsonResponse, parseJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { timezoneInputSchema } from "@/lib/schemas";
import { updateUserTimezone } from "@/lib/users";

export async function GET(): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    return jsonResponse({ user });
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const currentUser = await requireApiUser();
    const input = await parseJson(request, timezoneInputSchema);
    const user = await updateUserTimezone(currentUser.id, input.timezone);
    return jsonResponse({ user });
  });
}

