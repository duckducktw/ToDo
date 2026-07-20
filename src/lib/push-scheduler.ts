import { DateTime } from "luxon";
import webpush from "web-push";
import { getWebPushConfig } from "@/lib/env";
import { formatTaskNotification, isDndActive, isScheduledClockMinute } from "@/lib/notifications";
import {
  discardPushDelivery,
  enqueuePushDispatch,
  claimDuePushDeliveries,
  getPushSubscriptions,
  markPushDeliverySent,
  prunePushDeliveries,
  removePushSubscription,
  retryPushDelivery,
  type PendingPushDelivery,
} from "@/lib/push-store";
import { mutateTaskStore, readTaskRange, readTaskStore } from "@/lib/store";
import { rolloverTasks } from "@/lib/task-engine";
import { getAllUsers } from "@/lib/users";
import type { WebPushSubscription } from "@/types/domain";

function minuteKey(now: DateTime<boolean>) {
  return now.toFormat("yyyy-LL-dd'T'HH:mm");
}

const DELIVERY_WINDOW_MINUTES = 15;
const DELIVERY_LEASE_MINUTES = 1;
const MAX_DELIVERY_ATTEMPTS = 5;

async function sendToDevice(
  userId: string,
  subscription: WebPushSubscription,
  delivery: PendingPushDelivery,
  now: DateTime<boolean>,
) {
  try {
    await webpush.sendNotification(subscription, delivery.payload, { TTL: 60, urgency: "normal" });
    await markPushDeliverySent(userId, delivery.dispatch_key, subscription.endpoint, now.toUTC().toISO()!);
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await removePushSubscription(userId, subscription.endpoint);
      return;
    }
    if (delivery.attempts + 1 < MAX_DELIVERY_ATTEMPTS) {
      const delayMinutes = 2 ** delivery.attempts;
      await retryPushDelivery(
        userId,
        delivery.dispatch_key,
        subscription.endpoint,
        now.plus({ minutes: delayMinutes }).toUTC().toISO()!,
      );
    } else {
      await discardPushDelivery(userId, delivery.dispatch_key, subscription.endpoint);
    }
    console.error("Web Push delivery failed", { userId, statusCode });
  }
}

async function applyScheduledRollover(userId: string, today: string, movedAt: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const store = await readTaskStore(userId);
    try {
      await mutateTaskStore(userId, store.revision, (tasks) => rolloverTasks(tasks, today, movedAt));
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== "STALE_REVISION" || attempt === 2) throw error;
    }
  }
}

async function deliverPending(userId: string, subscriptions: readonly WebPushSubscription[], now: DateTime<boolean>) {
  const byEndpoint = new Map(subscriptions.map((subscription) => [subscription.endpoint, subscription]));
  const deliveries = await claimDuePushDeliveries(
    userId,
    now.toUTC().toISO()!,
    now.plus({ minutes: DELIVERY_LEASE_MINUTES }).toUTC().toISO()!,
  );
  await Promise.all(deliveries.map(async (delivery) => {
    const subscription = byEndpoint.get(delivery.endpoint);
    if (subscription) await sendToDevice(userId, subscription, delivery, now);
  }));
}

export async function runPushScheduler(now: DateTime<boolean> = DateTime.utc()) {
  const config = getWebPushConfig();
  if (!config) return;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  const users = await getAllUsers();
  await Promise.all(users.map(async (user) => {
    const settings = user.notification_settings;
    if (!settings.enabled) return;
    const localNow = now.setZone(user.timezone);
    const subscriptions = await getPushSubscriptions(user.id);
    if (subscriptions.length === 0) return;
    const dndActive = isDndActive(settings, localNow.toMillis());
    if (isScheduledClockMinute(settings, localNow.hour, localNow.minute) && !dndActive) {
      const date = localNow.toISODate();
      if (!date) return;
      await applyScheduledRollover(user.id, date, now.toUTC().toISO()!);
      const taskStore = await readTaskRange(user.id, date, date);
      const remaining = taskStore.tasks.filter((task) => task.status === "todo");
      const message = formatTaskNotification(settings.prefix, remaining);
      const payload = JSON.stringify({
        ...message,
        badgeEnabled: settings.badgeEnabled,
        remainingCount: remaining.length,
        tag: `flow-todo-${date}`,
        url: "/",
      });
      const dispatchMinute = `${user.timezone}:${minuteKey(localNow)}`;
      await enqueuePushDispatch(
        user.id,
        dispatchMinute,
        subscriptions,
        payload,
        now.toUTC().toISO()!,
        now.plus({ minutes: DELIVERY_WINDOW_MINUTES }).toUTC().toISO()!,
        remaining.length === 0 ? date : undefined,
      );
    }
    if (!dndActive) await deliverPending(user.id, subscriptions, now);
    await prunePushDeliveries(user.id, now.toUTC().toISO()!);
  }));
}

const schedulerGlobal = globalThis as typeof globalThis & { __flowTodoPushScheduler?: ReturnType<typeof setInterval> };

export function startPushScheduler() {
  if (schedulerGlobal.__flowTodoPushScheduler || !getWebPushConfig()) return;
  const run = () => void runPushScheduler().catch((error) => console.error("Web Push scheduler failed", error));
  run();
  schedulerGlobal.__flowTodoPushScheduler = setInterval(run, 30_000);
  schedulerGlobal.__flowTodoPushScheduler.unref();
}
