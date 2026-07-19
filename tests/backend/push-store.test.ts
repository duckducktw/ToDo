import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimEmptyNotification, claimPushDispatch, getPushSubscriptions, removePushSubscription, savePushSubscription } from "@/lib/push-store";
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

  it("removes subscriptions and atomically deduplicates dispatches", async () => {
    await savePushSubscription("google_user_a", subscription);
    expect(await claimPushDispatch("google_user_a", "Asia/Taipei:2026-07-19T09:00")).toBe(true);
    expect(await claimPushDispatch("google_user_a", "Asia/Taipei:2026-07-19T09:00")).toBe(false);
    expect(await claimEmptyNotification("google_user_a", "2026-07-19")).toBe(true);
    expect(await claimEmptyNotification("google_user_a", "2026-07-19")).toBe(false);
    await removePushSubscription("google_user_a", subscription.endpoint);
    expect(await getPushSubscriptions("google_user_a")).toEqual([]);
  });
});
