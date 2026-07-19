import { describe, expect, it } from "vitest";
import type { Task } from "@/types/domain";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  formatTaskNotification,
  isDndActive,
  isScheduledMinute,
  readNotificationSettings,
} from "@/lib/notifications";

function at(hour: number, minute: number) {
  const date = new Date(2026, 6, 19, hour, minute);
  return date;
}

function task(title: string, sequence_order: number, status: "todo" | "done" = "todo"): Task {
  return {
    id: title,
    title,
    description: "",
    status,
    scheduled_date: "2026-07-19",
    is_flexible: true,
    sequence_order,
    origin_date: "2026-07-19",
    rollover_count: 0,
    automatic_move: null,
    created_at: "2026-07-19T00:00:00Z",
    updated_at: "2026-07-19T00:00:00Z",
    completed_at: null,
  };
}

describe("notification scheduling", () => {
  it("schedules interval notifications from each slot start", () => {
    expect(isScheduledMinute(DEFAULT_NOTIFICATION_SETTINGS, at(7, 0))).toBe(true);
    expect(isScheduledMinute(DEFAULT_NOTIFICATION_SETTINGS, at(9, 0))).toBe(true);
    expect(isScheduledMinute(DEFAULT_NOTIFICATION_SETTINGS, at(13, 30))).toBe(true);
    expect(isScheduledMinute(DEFAULT_NOTIFICATION_SETTINGS, at(15, 30))).toBe(true);
    expect(isScheduledMinute(DEFAULT_NOTIFICATION_SETTINGS, at(12, 0))).toBe(false);
  });

  it("matches only configured fixed times", () => {
    const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, mode: "fixed" as const, fixedTimes: ["08:15", "16:45"] };
    expect(isScheduledMinute(settings, at(8, 15))).toBe(true);
    expect(isScheduledMinute(settings, at(8, 16))).toBe(false);
  });

  it("handles timed and indefinite do not disturb", () => {
    expect(isDndActive({ ...DEFAULT_NOTIFICATION_SETTINGS, dndUntil: 2000 }, 1000)).toBe(true);
    expect(isDndActive({ ...DEFAULT_NOTIFICATION_SETTINGS, dndUntil: 2000 }, 3000)).toBe(false);
    expect(isDndActive({ ...DEFAULT_NOTIFICATION_SETTINGS, dndIndefinite: true }, 3000)).toBe(true);
  });
});

describe("notification content", () => {
  it("lists at most three remaining tasks and the overflow count", () => {
    const result = formatTaskNotification("加油！", [task("第四項", 4), task("第一項", 1), task("已完成", 2, "done"), task("第三項", 3), task("第二項", 2)]);
    expect(result.title).toBe("加油！");
    expect(result.body).toContain("今天還有 4 項待辦");
    expect(result.body).toContain("1. 第一項\n2. 第二項\n3. 第三項");
    expect(result.body).toContain("…還有 1 項待辦");
    expect(result.body).not.toContain("第四項");
  });

  it("uses the encouraging empty message", () => {
    expect(formatTaskNotification("", []).body).toBe("今天沒有剩餘待辦，做得很好！");
  });

  it("falls back safely when persisted settings are invalid", () => {
    expect(readNotificationSettings("not-json")).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    const parsed = readNotificationSettings(JSON.stringify({ enabled: true, intervalHours: 99, fixedTimes: ["25:00", "09:30"] }));
    expect(parsed.enabled).toBe(true);
    expect(parsed.intervalHours).toBe(2);
    expect(parsed.fixedTimes).toEqual(["09:30"]);
  });
});
