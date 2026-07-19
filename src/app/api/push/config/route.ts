import { apiHandler, jsonResponse } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { getWebPushConfig } from "@/lib/env";

export async function GET() {
  return apiHandler(async () => {
    await requireApiUser();
    const config = getWebPushConfig();
    return jsonResponse({ configured: Boolean(config), public_key: config?.publicKey ?? null });
  });
}
