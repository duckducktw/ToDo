import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/notifications";
import { getUser, updateUserNotificationSettings, upsertUser } from "@/lib/users";

let dataRoot: string;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(os.tmpdir(), "todo-users-"));
  process.env.DATA_STORE_DIR = dataRoot;
});

afterEach(async () => {
  delete process.env.DATA_STORE_DIR;
  await rm(dataRoot, { recursive: true, force: true });
});

describe("user notification settings", () => {
  it("persists settings on the shared user profile", async () => {
    await upsertUser({ id: "google_sync_user", email: "sync@example.test", name: "Sync User", avatarUrl: null });
    const next = { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: true, mode: "fixed" as const, fixedTimes: ["08:30"] };

    await updateUserNotificationSettings("google_sync_user", next);

    expect((await getUser("google_sync_user"))?.notification_settings).toEqual(next);
  });
});
