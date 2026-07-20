import { DateTime } from "luxon";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications";

const mocks = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
  getAllUsers: vi.fn(),
  readTaskRange: vi.fn(),
  readTaskStore: vi.fn(),
  mutateTaskStore: vi.fn(),
  getPushSubscriptions: vi.fn(),
  enqueuePushDispatch: vi.fn(),
  claimDuePushDeliveries: vi.fn(),
  markPushDeliverySent: vi.fn(),
  prunePushDeliveries: vi.fn(),
  retryPushDelivery: vi.fn(),
  discardPushDelivery: vi.fn(),
  removePushSubscription: vi.fn(),
}));

vi.mock("web-push", () => ({ default: {
  sendNotification: mocks.sendNotification,
  setVapidDetails: mocks.setVapidDetails,
} }));
vi.mock("@/lib/users", () => ({ getAllUsers: mocks.getAllUsers }));
vi.mock("@/lib/store", () => ({
  readTaskRange: mocks.readTaskRange,
  readTaskStore: mocks.readTaskStore,
  mutateTaskStore: mocks.mutateTaskStore,
}));
vi.mock("@/lib/push-store", () => ({
  getPushSubscriptions: mocks.getPushSubscriptions,
  enqueuePushDispatch: mocks.enqueuePushDispatch,
  claimDuePushDeliveries: mocks.claimDuePushDeliveries,
  markPushDeliverySent: mocks.markPushDeliverySent,
  prunePushDeliveries: mocks.prunePushDeliveries,
  retryPushDelivery: mocks.retryPushDelivery,
  discardPushDelivery: mocks.discardPushDelivery,
  removePushSubscription: mocks.removePushSubscription,
}));

import { runPushScheduler } from "@/lib/push-scheduler";

const subscription = (endpoint = "https://push.example.test/device") => ({
  endpoint,
  expirationTime: null,
  keys: { p256dh: "p256dh", auth: "auth" },
});

const user = {
  id: "google_push_user",
  timezone: "Asia/Taipei",
  notification_settings: { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: true, mode: "fixed" as const, fixedTimes: ["09:00"] },
};

const task = (date = "2026-07-19") => ({
  id: "0198af4b-0c00-7000-8000-000000000001", title: "完成 Web Push", description: "", status: "todo" as const,
  scheduled_date: date, is_flexible: true, sequence_order: 1, origin_date: date, rollover_count: 0,
  automatic_move: null, created_at: "2026-07-18T00:00:00.000Z", updated_at: "2026-07-18T00:00:00.000Z", completed_at: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
  mocks.getAllUsers.mockResolvedValue([user]);
  mocks.getPushSubscriptions.mockResolvedValue([subscription()]);
  mocks.readTaskStore.mockResolvedValue({ revision: 1, tasks: [task()] });
  mocks.mutateTaskStore.mockImplementation(async (_id, _revision, mutation) => {
    mutation([task()]);
    return { document: { revision: 2 }, operation: { changed: false } };
  });
  mocks.readTaskRange.mockResolvedValue({ revision: 1, tasks: [task()] });
  mocks.enqueuePushDispatch.mockResolvedValue(true);
  mocks.claimDuePushDeliveries.mockResolvedValue([{
    dispatch_key: "Asia/Taipei:2026-07-19T09:00",
    endpoint: subscription().endpoint,
    payload: JSON.stringify({ title: "提醒", remainingCount: 1 }),
    attempts: 0,
    next_attempt_at: "2026-07-19T01:00:00.000Z",
    expires_at: "2026-07-19T01:15:00.000Z",
    sent_at: null,
  }]);
  mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
});

describe("Web Push scheduler", () => {
  it("rolls tasks over before enqueueing a local scheduled notification", async () => {
    mocks.readTaskStore.mockResolvedValue({ revision: 1, tasks: [task("2026-07-18")] });
    mocks.mutateTaskStore.mockImplementation(async (_id, _revision, mutation) => {
      const operation = mutation([task("2026-07-18")]);
      expect(operation.tasks[0]).toMatchObject({ scheduled_date: "2026-07-19", rollover_count: 1 });
      return { document: { revision: 2 }, operation };
    });
    mocks.readTaskRange.mockResolvedValue({ revision: 2, tasks: [task()] });

    await runPushScheduler(DateTime.utc(2026, 7, 19, 1, 0));

    expect(mocks.mutateTaskStore).toHaveBeenCalledOnce();
    expect(mocks.enqueuePushDispatch).toHaveBeenCalledWith(
      "google_push_user",
      "Asia/Taipei:2026-07-19T09:00",
      expect.any(Array),
      expect.stringContaining("完成 Web Push"),
      "2026-07-19T01:00:00.000Z",
      "2026-07-19T01:15:00.000Z",
      undefined,
    );
    expect(mocks.markPushDeliverySent).toHaveBeenCalledOnce();
  });

  it("does not claim a dispatch before DND and subscription prerequisites pass", async () => {
    mocks.getAllUsers.mockResolvedValue([{ ...user, notification_settings: { ...user.notification_settings, dndIndefinite: true } }]);
    await runPushScheduler(DateTime.utc(2026, 7, 19, 1, 0));
    expect(mocks.enqueuePushDispatch).not.toHaveBeenCalled();
    expect(mocks.readTaskStore).not.toHaveBeenCalled();
    expect(mocks.claimDuePushDeliveries).not.toHaveBeenCalled();
    expect(mocks.prunePushDeliveries).toHaveBeenCalledOnce();
  });

  it("retries a temporary endpoint failure while successful endpoints complete", async () => {
    const first = subscription("https://push.example.test/first");
    const second = subscription("https://push.example.test/second");
    mocks.getPushSubscriptions.mockResolvedValue([first, second]);
    mocks.claimDuePushDeliveries.mockResolvedValue([first, second].map(({ endpoint }) => ({
      dispatch_key: "dispatch", endpoint, payload: "{}", attempts: 0,
      next_attempt_at: "2026-07-19T01:00:00.000Z", expires_at: "2026-07-19T01:15:00.000Z", sent_at: null,
    })));
    mocks.sendNotification.mockResolvedValueOnce({ statusCode: 201 }).mockRejectedValueOnce({ statusCode: 503 });

    await runPushScheduler(DateTime.utc(2026, 7, 19, 1, 0));

    expect(mocks.markPushDeliverySent).toHaveBeenCalledWith("google_push_user", "dispatch", first.endpoint, expect.any(String));
    expect(mocks.retryPushDelivery).toHaveBeenCalledWith("google_push_user", "dispatch", second.endpoint, "2026-07-19T01:01:00.000Z");
  });

  it.each([404, 410])("removes an endpoint after a permanent %s response", async (statusCode) => {
    mocks.sendNotification.mockRejectedValue({ statusCode });
    await runPushScheduler(DateTime.utc(2026, 7, 19, 1, 0));
    expect(mocks.removePushSubscription).toHaveBeenCalledWith("google_push_user", subscription().endpoint);
    expect(mocks.retryPushDelivery).not.toHaveBeenCalled();
  });
});
