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

function emptyUser(userId: string) {
  return {
    user_id: userId,
    subscriptions: [],
    last_dispatch_minute: null,
    empty_notification_date: null,
    deliveries: [],
  } satisfies PushStore["users"][number];
}

async function readUnlocked(filePath: string) {
  return (await readValidatedJson(filePath, pushStoreSchema)) ?? emptyStore();
}

async function mutate(operation: (store: PushStore) => PushStore) {
  const filePath = storePath();
  return withFileLock(filePath, async () => {
    const current = await readUnlocked(filePath);
    const candidate = operation(current);
    if (candidate === current) return current;
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
      : { ...emptyUser(userId), subscriptions };
    return {
      ...store,
      users: [
        ...store.users
          .filter((item) => item.user_id !== userId)
          .map((item) => ({
            ...item,
            subscriptions: item.subscriptions.filter((entry) => entry.endpoint !== subscription.endpoint),
            deliveries: item.deliveries.filter((delivery) => delivery.endpoint !== subscription.endpoint),
          })),
        next,
      ],
    };
  });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await mutate((store) => ({
    ...store,
    users: store.users.map((item) => item.user_id === userId
      ? {
        ...item,
        subscriptions: item.subscriptions.filter((subscription) => subscription.endpoint !== endpoint),
        deliveries: item.deliveries.filter((delivery) => delivery.endpoint !== endpoint),
      }
      : item),
  }));
}

export interface PendingPushDelivery {
  dispatch_key: string;
  endpoint: string;
  payload: string;
  attempts: number;
  next_attempt_at: string;
  expires_at: string;
  sent_at: string | null;
}

export async function enqueuePushDispatch(
  userId: string,
  dispatchKey: string,
  subscriptions: readonly WebPushSubscription[],
  payload: string,
  now: string,
  expiresAt: string,
  emptyNotificationDate?: string,
) {
  let enqueued = false;
  await mutate((store) => {
    const existing = store.users.find((item) => item.user_id === userId) ?? emptyUser(userId);
    if (existing.last_dispatch_minute === dispatchKey ||
      (emptyNotificationDate && existing.empty_notification_date === emptyNotificationDate)) return store;
    enqueued = true;
    const endpoints = new Set(subscriptions.map(({ endpoint }) => endpoint));
    const retained = existing.deliveries.filter((delivery) =>
      delivery.expires_at >= now && endpoints.has(delivery.endpoint));
    const deliveries = [
      ...retained,
      ...subscriptions.map(({ endpoint }) => ({
        dispatch_key: dispatchKey,
        endpoint,
        payload,
        attempts: 0,
        next_attempt_at: now,
        expires_at: expiresAt,
        sent_at: null,
      })),
    ].slice(-256);
    const next = {
      ...existing,
      last_dispatch_minute: dispatchKey,
      empty_notification_date: emptyNotificationDate ?? existing.empty_notification_date,
      deliveries,
    };
    return { ...store, users: [...store.users.filter((item) => item.user_id !== userId), next] };
  });
  return enqueued;
}

export async function claimDuePushDeliveries(
  userId: string,
  now: string,
  leaseUntil: string,
): Promise<PendingPushDelivery[]> {
  let claimed: PendingPushDelivery[] = [];
  await mutate((store) => {
    const existing = store.users.find((item) => item.user_id === userId);
    if (!existing) return store;
    claimed = existing.deliveries.filter(
      (delivery) =>
        !delivery.sent_at &&
        delivery.next_attempt_at <= now &&
        delivery.expires_at >= now,
    );
    if (claimed.length === 0) return store;
    const keys = new Set(
      claimed.map((delivery) => `${delivery.dispatch_key}\n${delivery.endpoint}`),
    );
    return {
      ...store,
      users: store.users.map((item) => item.user_id === userId ? {
        ...item,
        deliveries: item.deliveries.map((delivery) =>
          keys.has(`${delivery.dispatch_key}\n${delivery.endpoint}`)
            ? { ...delivery, next_attempt_at: leaseUntil }
            : delivery),
      } : item),
    };
  });
  return claimed;
}

export async function markPushDeliverySent(userId: string, dispatchKey: string, endpoint: string, sentAt: string) {
  await mutate((store) => ({
    ...store,
    users: store.users.map((item) => item.user_id === userId ? {
      ...item,
      deliveries: item.deliveries.map((delivery) =>
        delivery.dispatch_key === dispatchKey && delivery.endpoint === endpoint
          ? { ...delivery, sent_at: sentAt }
          : delivery),
    } : item),
  }));
}

export async function retryPushDelivery(
  userId: string,
  dispatchKey: string,
  endpoint: string,
  nextAttemptAt: string,
) {
  await mutate((store) => ({
    ...store,
    users: store.users.map((item) => item.user_id === userId ? {
      ...item,
      deliveries: item.deliveries.map((delivery) =>
        delivery.dispatch_key === dispatchKey && delivery.endpoint === endpoint
          ? { ...delivery, attempts: delivery.attempts + 1, next_attempt_at: nextAttemptAt }
          : delivery),
    } : item),
  }));
}

export async function discardPushDelivery(userId: string, dispatchKey: string, endpoint: string) {
  await mutate((store) => ({
    ...store,
    users: store.users.map((item) => item.user_id === userId ? {
      ...item,
      deliveries: item.deliveries.filter((delivery) =>
        delivery.dispatch_key !== dispatchKey || delivery.endpoint !== endpoint),
    } : item),
  }));
}

export async function prunePushDeliveries(userId: string, now: string) {
  await mutate((store) => {
    const existing = store.users.find((item) => item.user_id === userId);
    if (!existing) return store;
    const deliveries = existing.deliveries.filter((delivery) => !delivery.sent_at && delivery.expires_at >= now);
    if (deliveries.length === existing.deliveries.length) return store;
    return {
      ...store,
      users: store.users.map((item) => item.user_id === userId ? { ...item, deliveries } : item),
    };
  });
}
