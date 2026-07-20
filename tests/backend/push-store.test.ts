import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claimDuePushDeliveries,
  enqueuePushDispatch,
  getPushSubscriptions,
  markPushDeliverySent,
  prunePushDeliveries,
  removePushSubscription,
  retryPushDelivery,
  savePushSubscription,
} from "@/lib/push-store";
import type { WebPushSubscription } from "@/types/domain";

let dataRoot: string;
const subscription: WebPushSubscription = {
  endpoint: "https://push.example.test/device-1",
  expirationTime: null,
  keys: { p256dh: "public-key", auth: "auth-key" },
};

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(os.tmpdir(), "todo-push-"));
  process.env.DATA_STORE_DIR = dataRoot;
});

afterEach(async () => {
  delete process.env.DATA_STORE_DIR;
  await rm(dataRoot, { recursive: true, force: true });
});

describe("push subscription store", () => {
  it("moves a device endpoint when a different user signs in", async () => {
    await savePushSubscription("google_user_a", subscription);
    await savePushSubscription("google_user_b", subscription);
    expect(await getPushSubscriptions("google_user_a")).toEqual([]);
    expect(await getPushSubscriptions("google_user_b")).toEqual([subscription]);
  });

  it("removes subscriptions", async () => {
    await savePushSubscription("google_user_a", subscription);
    await removePushSubscription("google_user_a", subscription.endpoint);
    expect(await getPushSubscriptions("google_user_a")).toEqual([]);
  });

  it("tracks delivery results independently and exposes temporary failures when due", async () => {
    const second = { ...subscription, endpoint: "https://push.example.test/device-2" };
    await savePushSubscription("google_user_a", subscription);
    await savePushSubscription("google_user_a", second);
    const now = "2026-07-19T01:00:00.000Z";
    expect(await enqueuePushDispatch("google_user_a", "dispatch-1", [subscription, second], "{}", now, "2026-07-19T01:15:00.000Z")).toBe(true);
    expect(await enqueuePushDispatch("google_user_a", "dispatch-1", [subscription, second], "{}", now, "2026-07-19T01:15:00.000Z")).toBe(false);

    await markPushDeliverySent("google_user_a", "dispatch-1", subscription.endpoint, now);
    await retryPushDelivery("google_user_a", "dispatch-1", second.endpoint, "2026-07-19T01:02:00.000Z");
    expect(await claimDuePushDeliveries("google_user_a", "2026-07-19T01:01:00.000Z", "2026-07-19T01:02:00.000Z")).toEqual([]);
    expect(await claimDuePushDeliveries("google_user_a", "2026-07-19T01:02:00.000Z", "2026-07-19T01:03:00.000Z")).toEqual([
      expect.objectContaining({ endpoint: second.endpoint, attempts: 1 }),
    ]);
    expect(await claimDuePushDeliveries("google_user_a", "2026-07-19T01:02:30.000Z", "2026-07-19T01:03:30.000Z")).toEqual([]);
  });

  it("prunes completed and expired delivery records", async () => {
    await savePushSubscription("google_user_a", subscription);
    await enqueuePushDispatch(
      "google_user_a",
      "dispatch-1",
      [subscription],
      "{}",
      "2026-07-19T01:00:00.000Z",
      "2026-07-19T01:15:00.000Z",
    );
    await markPushDeliverySent("google_user_a", "dispatch-1", subscription.endpoint, "2026-07-19T01:01:00.000Z");
    await prunePushDeliveries("google_user_a", "2026-07-19T01:02:00.000Z");
    expect(await claimDuePushDeliveries("google_user_a", "2026-07-19T01:02:00.000Z", "2026-07-19T01:03:00.000Z")).toEqual([]);
  });
});
