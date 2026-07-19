import { apiHandler, jsonResponse, parseJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { userSettingsInputSchema } from "@/lib/schemas";
import { updateUserNotificationSettings, updateUserTimezone } from "@/lib/users";

export async function GET(): Promise<Response> {
  return apiHandler(async () => {
    const user = await requireApiUser();
    return jsonResponse({ user });
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return apiHandler(async () => {
    const currentUser = await requireApiUser();
    const input = await parseJson(request, userSettingsInputSchema);
    let user = currentUser;
    if (input.timezone !== undefined) user = await updateUserTimezone(currentUser.id, input.timezone);
    if (input.notification_settings !== undefined) {
      user = await updateUserNotificationSettings(currentUser.id, input.notification_settings);
    }
    return jsonResponse({ user });
  });
}
