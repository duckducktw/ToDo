import path from "node:path";
import { getDataStoreDir } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { atomicWriteJson, readValidatedJson, withFileLock } from "@/lib/json-file";
import { pushStoreSchema, type PushStore } from "@/lib/schemas";
import type { WebPushSubscription } from "@/types/domain";

function storePath() {
  return path.join(getDataStoreDir(), "push-subscriptions.json");
}

function emptyStore(): PushStore {
  return { schema_version: 1, revision: 0, users: [] };
}

async function readUnlocked(filePath: string) {
  return (await readValidatedJson(filePath, pushStoreSchema)) ?? emptyStore();
}

async function mutate(operation: (store: PushStore) => PushStore) {
  const filePath = storePath();
  return withFileLock(filePath, async () => {
    const current = await readUnlocked(filePath);
    const candidate = operation(current);
    const parsed = pushStoreSchema.safeParse({ ...candidate, revision: current.revision + 1 });
    if (!parsed.success) throw new AppError("INTERNAL_ERROR", 500, "Push subscription data is invalid.", parsed.error);
    await atomicWriteJson(filePath, parsed.data);
    return parsed.data;
  });
}

export async function getPushSubscriptions(userId: string): Promise<WebPushSubscription[]> {
  const filePath = storePath();
  return withFileLock(filePath, async () => {
    const store = await readUnlocked(filePath);
    return store.users.find((item) => item.user_id === userId)?.subscriptions ?? [];
  });
}

export async function savePushSubscription(userId: string, subscription: WebPushSubscription) {
  await mutate((store) => {
    const existing = store.users.find((item) => item.user_id === userId);
    const subscriptions = [...(existing?.subscriptions ?? []).filter((item) => item.endpoint !== subscription.endpoint), subscription].slice(-32);
    const next = existing
      ? { ...existing, subscriptions }
      : { user_id: userId, subscriptions, last_dispatch_minute: null, empty_notification_date: null };
    return {
      ...store,
      users: [
        ...store.users
          .filter((item) => item.user_id !== userId)
          .map((item) => ({ ...item, subscriptions: item.subscriptions.filter((entry) => entry.endpoint !== subscription.endpoint) })),
        next,
      ],
    };
  });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await mutate((store) => ({
    ...store,
    users: store.users.map((item) => item.user_id === userId
      ? { ...item, subscriptions: item.subscriptions.filter((subscription) => subscription.endpoint !== endpoint) }
      : item),
  }));
}

export async function claimPushDispatch(userId: string, minute: string) {
  let claimed = false;
  await mutate((store) => {
    const existing = store.users.find((item) => item.user_id === userId) ?? {
      user_id: userId,
      subscriptions: [],
      last_dispatch_minute: null,
      empty_notification_date: null,
    };
    if (existing.last_dispatch_minute === minute) return store;
    claimed = true;
    const next = { ...existing, last_dispatch_minute: minute };
    return { ...store, users: [...store.users.filter((item) => item.user_id !== userId), next] };
  });
  return claimed;
}

export async function claimEmptyNotification(userId: string, date: string) {
  let claimed = false;
  await mutate((store) => ({
    ...store,
    users: store.users.map((item) => {
      if (item.user_id !== userId || item.empty_notification_date === date) return item;
      claimed = true;
      return { ...item, empty_notification_date: date };
    }),
  }));
  return claimed;
}
