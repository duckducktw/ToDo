import { describe, expect, it } from "vitest";

import {
  createTaskInputSchema,
  dateRangeQuerySchema,
  patchTaskInputSchema,
  taskFileSchema,
  userProfileSchema,
  userSettingsInputSchema,
  webPushSubscriptionSchema,
} from "@/lib/schemas";
import { buildTask } from "../fixtures/tasks";

describe("task input schemas", () => {
  it("trims titles and supplies safe creation defaults", () => {
    expect(
      createTaskInputSchema.parse({
        title: "  Write proposal  ",
        scheduled_date: "2026-07-15",
      }),
    ).toEqual({
      title: "Write proposal",
      description: "",
      scheduled_date: "2026-07-15",
      is_flexible: true,
    });
  });

  it("rejects blank and oversized titles", () => {
    expect(
      createTaskInputSchema.safeParse({
        title: "   ",
        scheduled_date: "2026-07-15",
      }).success,
    ).toBe(false);
    expect(
      createTaskInputSchema.safeParse({
        title: "a".repeat(121),
        scheduled_date: "2026-07-15",
      }).success,
    ).toBe(false);
  });

  it("requires a non-empty strict patch", () => {
    expect(patchTaskInputSchema.safeParse({}).success).toBe(false);
    expect(
      patchTaskInputSchema.safeParse({ status: "done", unexpected: true }).success,
    ).toBe(false);
  });

  it("rejects reversed and overlong query ranges", () => {
    expect(
      dateRangeQuerySchema.safeParse({
        from: "2026-07-16",
        to: "2026-07-15",
      }).success,
    ).toBe(false);
    expect(
      dateRangeQuerySchema.safeParse({
        from: "2026-07-01",
        to: "2026-09-01",
      }).success,
    ).toBe(false);
  });
});

describe("notification setting schemas", () => {
  it("accepts WebKit push subscriptions without expirationTime", () => {
    expect(webPushSubscriptionSchema.parse({
      endpoint: "https://push.example.test/device",
      keys: { p256dh: "public-key", auth: "auth-key" },
    })).toEqual({
      endpoint: "https://push.example.test/device",
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-key" },
    });
  });

  it("adds default notification settings to existing user profiles", () => {
    const user = userProfileSchema.parse({
      id: "google_existing_user",
      email: "existing@example.test",
      name: "Existing User",
      avatar_url: null,
      timezone: "Asia/Taipei",
      created_at: "2026-07-19T00:00:00.000Z",
      updated_at: "2026-07-19T00:00:00.000Z",
    });
    expect(user.notification_settings).toMatchObject({ enabled: false, intervalHours: 2 });
  });

  it("accepts a strict synchronized notification setting update", () => {
    expect(userSettingsInputSchema.safeParse({
      notification_settings: {
        enabled: true,
        mode: "fixed",
        intervalHours: 2,
        slots: [{ start: "07:00", end: "11:30" }],
        fixedTimes: ["09:00", "15:30"],
        dndUntil: null,
        dndIndefinite: false,
        prefix: "加油！",
      },
    }).success).toBe(true);
    expect(userSettingsInputSchema.safeParse({ notification_settings: { enabled: true } }).success).toBe(false);
  });
});

describe("stored task schema", () => {
  it("accepts the versioned on-disk shape", () => {
    expect(
      taskFileSchema.parse({
        schema_version: 1,
        revision: 4,
        tasks: [buildTask()],
      }).revision,
    ).toBe(4);
  });

  it("refuses malformed data instead of coercing it", () => {
    const malformed = {
      schema_version: 1,
      revision: 0,
      tasks: [{ ...buildTask(), sequence_order: 0 }],
    };

    expect(taskFileSchema.safeParse(malformed).success).toBe(false);
  });
});
