import { DateTime } from "luxon";
import webpush from "web-push";
import { getWebPushConfig } from "@/lib/env";
import { formatTaskNotification, isDndActive, isScheduledClockMinute } from "@/lib/notifications";
import { claimEmptyNotification, claimPushDispatch, getPushSubscriptions, removePushSubscription } from "@/lib/push-store";
import { readTaskRange } from "@/lib/store";
import { getAllUsers } from "@/lib/users";
import type { WebPushSubscription } from "@/types/domain";

function minuteKey(now: DateTime<boolean>) {
  return now.toFormat("yyyy-LL-dd'T'HH:mm");
}

async function sendToDevice(userId: string, subscription: WebPushSubscription, payload: string) {
  try {
    await webpush.sendNotification(subscription, payload, { TTL: 60, urgency: "normal" });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await removePushSubscription(userId, subscription.endpoint);
      return;
    }
    console.error("Web Push delivery failed", { userId, statusCode });
  }
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
    if (!isScheduledClockMinute(settings, localNow.hour, localNow.minute)) return;

    const dispatchMinute = `${user.timezone}:${minuteKey(localNow)}`;
    if (!await claimPushDispatch(user.id, dispatchMinute)) return;
    if (isDndActive(settings, localNow.toMillis())) return;

    const subscriptions = await getPushSubscriptions(user.id);
    if (subscriptions.length === 0) return;
    const date = localNow.toISODate();
    if (!date) return;
    const taskStore = await readTaskRange(user.id, date, date);
    const remaining = taskStore.tasks.filter((task) => task.status === "todo");
    if (remaining.length === 0 && !await claimEmptyNotification(user.id, date)) return;

    const message = formatTaskNotification(settings.prefix, remaining);
    const payload = JSON.stringify({
      ...message,
      badgeEnabled: settings.badgeEnabled,
      remainingCount: remaining.length,
      tag: `flow-todo-${date}`,
      url: "/",
    });
    await Promise.all(subscriptions.map((subscription) => sendToDevice(user.id, subscription, payload)));
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
