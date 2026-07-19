import type { Task } from "@/types/domain";

export const NOTIFICATION_STORAGE_KEY = "flow-todo.notification-settings.v1";
export const NOTIFICATION_INTRO_KEY = "flow-todo.notification-intro.v1";
export const NOTIFICATION_RUNTIME_KEY = "flow-todo.notification-runtime.v1";

export type NotificationScheduleMode = "interval" | "fixed";

export interface NotificationTimeSlot {
  start: string;
  end: string;
}

export interface NotificationSettings {
  enabled: boolean;
  mode: NotificationScheduleMode;
  intervalHours: number;
  slots: NotificationTimeSlot[];
  fixedTimes: string[];
  dndUntil: number | null;
  dndIndefinite: boolean;
  prefix: string;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: false,
  mode: "interval",
  intervalHours: 2,
  slots: [
    { start: "07:00", end: "11:30" },
    { start: "13:30", end: "17:30" },
  ],
  fixedTimes: ["09:00", "14:00", "17:00"],
  dndUntil: null,
  dndIndefinite: false,
  prefix: "做得很好！",
};

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function readNotificationSettings(raw: string | null): NotificationSettings {
  if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      enabled: value.enabled === true,
      mode: value.mode === "fixed" ? "fixed" : "interval",
      intervalHours: [1, 2, 3, 4, 6].includes(Number(value.intervalHours)) ? Number(value.intervalHours) : 2,
      slots: Array.isArray(value.slots)
        ? value.slots.filter((slot) => validTime(slot?.start) && validTime(slot?.end)).slice(0, 4)
        : DEFAULT_NOTIFICATION_SETTINGS.slots,
      fixedTimes: Array.isArray(value.fixedTimes)
        ? [...new Set(value.fixedTimes.filter(validTime))].sort().slice(0, 8)
        : DEFAULT_NOTIFICATION_SETTINGS.fixedTimes,
      dndUntil: typeof value.dndUntil === "number" ? value.dndUntil : null,
      dndIndefinite: value.dndIndefinite === true,
      prefix: typeof value.prefix === "string" ? value.prefix.slice(0, 40) : DEFAULT_NOTIFICATION_SETTINGS.prefix,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function isScheduledMinute(settings: NotificationSettings, date: Date) {
  const current = date.getHours() * 60 + date.getMinutes();
  if (settings.mode === "fixed") {
    return settings.fixedTimes.some((time) => minutes(time) === current);
  }
  const frequency = settings.intervalHours * 60;
  return settings.slots.some((slot) => {
    const start = minutes(slot.start);
    const end = minutes(slot.end);
    return current >= start && current <= end && (current - start) % frequency === 0;
  });
}

export function isDndActive(settings: NotificationSettings, now = Date.now()) {
  return settings.dndIndefinite || (settings.dndUntil !== null && settings.dndUntil > now);
}

export function notificationMinuteKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function formatTaskNotification(prefix: string, tasks: Task[]) {
  const remaining = tasks.filter((task) => task.status === "todo").sort((a, b) => a.sequence_order - b.sequence_order);
  if (remaining.length === 0) {
    return { title: prefix || "流動待辦", body: "今天沒有剩餘待辦，做得很好！" };
  }
  const lines = remaining.slice(0, 3).map((task, index) => `${index + 1}. ${task.title}`);
  if (remaining.length > 3) lines.push(`…還有 ${remaining.length - 3} 項待辦`);
  return {
    title: prefix || "流動待辦",
    body: `今天還有 ${remaining.length} 項待辦需要處理：\n${lines.join("\n")}`,
  };
}
