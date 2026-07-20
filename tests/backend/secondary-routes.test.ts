import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET as calendarGet } from "@/app/api/calendar/route";
import { GET as meGet, PATCH as mePatch } from "@/app/api/me/route";
import { GET as pushConfigGet } from "@/app/api/push/config/route";
import {
  DELETE as pushDelete,
  GET as pushGet,
  POST as pushPost,
} from "@/app/api/push/subscriptions/route";

const mocks = vi.hoisted(() => ({
  fetchCalendarEvents: vi.fn(),
  getPushSubscriptions: vi.fn(),
  removePushSubscription: vi.fn(),
  savePushSubscription: vi.fn(),
  updateUserNotificationSettings: vi.fn(),
  updateUserTimezone: vi.fn(),
}));

const profile = {
  id: "google_secondary_routes",
  email: "routes@example.test",
  name: "Route User",
  avatar_url: null,
  timezone: "Asia/Taipei",
  notification_settings: {
    enabled: false,
    badgeEnabled: true,
    mode: "interval" as const,
    intervalHours: 2 as const,
    slots: [{ start: "09:00", end: "18:00" }],
    fixedTimes: [],
    dndUntil: null,
    dndIndefinite: false,
    prefix: "",
  },
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
};

vi.mock("@/lib/auth-user", () => ({
  requireApiUser: vi.fn(async () => profile),
}));
vi.mock("@/lib/calendar", () => ({
  fetchCalendarEvents: mocks.fetchCalendarEvents,
}));
vi.mock("@/lib/push-store", () => ({
  getPushSubscriptions: mocks.getPushSubscriptions,
  removePushSubscription: mocks.removePushSubscription,
  savePushSubscription: mocks.savePushSubscription,
}));
vi.mock("@/lib/users", () => ({
  updateUserNotificationSettings: mocks.updateUserNotificationSettings,
  updateUserTimezone: mocks.updateUserTimezone,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("AUTH_URL", "https://todo.example");
  vi.stubEnv("VAPID_PUBLIC_KEY", "");
  vi.stubEnv("VAPID_PRIVATE_KEY", "");
  vi.stubEnv("VAPID_SUBJECT", "");
  mocks.fetchCalendarEvents.mockResolvedValue([]);
  mocks.getPushSubscriptions.mockResolvedValue([]);
  mocks.updateUserTimezone.mockResolvedValue(profile);
  mocks.updateUserNotificationSettings.mockResolvedValue(profile);
});

function mutationRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://todo.example",
    },
    body: JSON.stringify(body),
  });
}

describe("secondary API route contracts", () => {
  it("normalizes a validated Calendar range for the authenticated user", async () => {
    const response = await calendarGet(new Request(
      "https://todo.example/api/calendar?from=2026-07-20&to=2026-07-21",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.fetchCalendarEvents).toHaveBeenCalledWith(
      profile.id,
      "2026-07-20",
      "2026-07-21",
      profile.timezone,
    );
    await expect(response.json()).resolves.toEqual({
      events: [],
      timezone: profile.timezone,
    });

    const invalid = await calendarGet(new Request(
      "https://todo.example/api/calendar?from=bad&to=2026-07-21",
    ));
    expect(invalid.status).toBe(400);
  });

  it("reads and validates authenticated user settings", async () => {
    const read = await meGet();
    expect(read.status).toBe(200);
    await expect(read.json()).resolves.toEqual({ user: profile });

    const updated = await mePatch(mutationRequest(
      "https://todo.example/api/me",
      "PATCH",
      { timezone: "America/New_York" },
    ));
    expect(updated.status).toBe(200);
    expect(mocks.updateUserTimezone).toHaveBeenCalledWith(
      profile.id,
      "America/New_York",
    );
  });

  it("exposes Push config and validates subscription lifecycle payloads", async () => {
    const config = await pushConfigGet();
    await expect(config.json()).resolves.toEqual({
      configured: false,
      public_key: null,
    });

    const subscription = {
      endpoint: "https://push.example.test/device",
      expirationTime: null,
      keys: { p256dh: "public-key", auth: "auth-key" },
    };
    const created = await pushPost(mutationRequest(
      "https://todo.example/api/push/subscriptions",
      "POST",
      subscription,
    ));
    expect(created.status).toBe(201);
    expect(mocks.savePushSubscription).toHaveBeenCalledWith(
      profile.id,
      subscription,
    );

    const read = await pushGet();
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toContain("private");

    const removed = await pushDelete(mutationRequest(
      "https://todo.example/api/push/subscriptions",
      "DELETE",
      { endpoint: subscription.endpoint },
    ));
    expect(removed.status).toBe(200);
    expect(mocks.removePushSubscription).toHaveBeenCalledWith(
      profile.id,
      subscription.endpoint,
    );

    const invalid = await pushPost(mutationRequest(
      "https://todo.example/api/push/subscriptions",
      "POST",
      { endpoint: "not-a-url" },
    ));
    expect(invalid.status).toBe(400);
  });
});
