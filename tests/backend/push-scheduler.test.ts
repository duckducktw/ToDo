import { DateTime } from "luxon";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications";

const mocks = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
  getAllUsers: vi.fn(),
  readTaskRange: vi.fn(),
  getPushSubscriptions: vi.fn(),
  claimPushDispatch: vi.fn(),
  claimEmptyNotification: vi.fn(),
  removePushSubscription: vi.fn(),
}));

vi.mock("web-push", () => ({ default: {
  sendNotification: mocks.sendNotification,
  setVapidDetails: mocks.setVapidDetails,
} }));
vi.mock("@/lib/users", () => ({ getAllUsers: mocks.getAllUsers }));
vi.mock("@/lib/store", () => ({ readTaskRange: mocks.readTaskRange }));
vi.mock("@/lib/push-store", () => ({
  getPushSubscriptions: mocks.getPushSubscriptions,
  claimPushDispatch: mocks.claimPushDispatch,
  claimEmptyNotification: mocks.claimEmptyNotification,
  removePushSubscription: mocks.removePushSubscription,
}));

import { runPushScheduler } from "@/lib/push-scheduler";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VAPID_PUBLIC_KEY", "public-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "private-key");
  vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
  mocks.claimPushDispatch.mockResolvedValue(true);
  mocks.claimEmptyNotification.mockResolvedValue(true);
  mocks.getPushSubscriptions.mockResolvedValue([{
    endpoint: "https://push.example.test/device",
    expirationTime: null,
    keys: { p256dh: "p256dh", auth: "auth" },
  }]);
  mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
});

describe("Web Push scheduler", () => {
  it("sends the remaining tasks at the user's local scheduled minute", async () => {
    mocks.getAllUsers.mockResolvedValue([{
      id: "google_push_user",
      email: "push@example.test",
      name: "Push User",
      avatar_url: null,
      timezone: "Asia/Taipei",
      notification_settings: { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: true, mode: "fixed", fixedTimes: ["09:00"] },
      created_at: "2026-07-19T00:00:00.000Z",
      updated_at: "2026-07-19T00:00:00.000Z",
    }]);
    mocks.readTaskRange.mockResolvedValue({ revision: 1, tasks: [{
      id: "task-1", title: "完成 Web Push", description: "", status: "todo", scheduled_date: "2026-07-19",
      is_flexible: true, sequence_order: 1, origin_date: "2026-07-19", rollover_count: 0,
      automatic_move: null, created_at: "2026-07-19T00:00:00.000Z", updated_at: "2026-07-19T00:00:00.000Z", completed_at: null,
    }] });

    await runPushScheduler(DateTime.utc(2026, 7, 19, 1, 0));

    expect(mocks.claimPushDispatch).toHaveBeenCalledWith("google_push_user", "Asia/Taipei:2026-07-19T09:00");
    expect(mocks.sendNotification).toHaveBeenCalledOnce();
    const [, payload, options] = mocks.sendNotification.mock.calls[0];
    expect(JSON.parse(payload)).toMatchObject({
      title: "做得很好！",
      body: expect.stringContaining("完成 Web Push"),
      remainingCount: 1,
    });
    expect(options).toMatchObject({ TTL: 60, urgency: "normal" });
  });

  it("discards a scheduled notification during do not disturb", async () => {
    mocks.getAllUsers.mockResolvedValue([{
      id: "google_push_user", timezone: "Asia/Taipei",
      notification_settings: { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: true, mode: "fixed", fixedTimes: ["09:00"], dndIndefinite: true },
    }]);
    await runPushScheduler(DateTime.utc(2026, 7, 19, 1, 0));
    expect(mocks.claimPushDispatch).toHaveBeenCalledOnce();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });
});
