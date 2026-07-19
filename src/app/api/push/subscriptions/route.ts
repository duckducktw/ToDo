import { z } from "zod";
import { apiHandler, jsonResponse, parseJson } from "@/lib/api";
import { requireApiUser } from "@/lib/auth-user";
import { getPushSubscriptions, removePushSubscription, savePushSubscription } from "@/lib/push-store";
import { webPushSubscriptionSchema } from "@/lib/schemas";

const deleteSchema = z.object({ endpoint: z.url() }).strict();

export async function GET() {
  return apiHandler(async () => {
    const user = await requireApiUser();
    return jsonResponse({ subscriptions: await getPushSubscriptions(user.id) });
  });
}

export async function POST(request: Request) {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const subscription = await parseJson(request, webPushSubscriptionSchema);
    await savePushSubscription(user.id, subscription);
    return jsonResponse({ saved: true }, { status: 201 });
  });
}

export async function DELETE(request: Request) {
  return apiHandler(async () => {
    const user = await requireApiUser();
    const { endpoint } = await parseJson(request, deleteSchema);
    await removePushSubscription(user.id, endpoint);
    return jsonResponse({ removed: true });
  });
}
