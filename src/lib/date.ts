import { DateTime, IANAZone } from "luxon";

import { DEFAULT_TIMEZONE } from "@/lib/env";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = DateTime.fromISO(value, { zone: "utc" });
  return parsed.isValid && parsed.toISODate() === value;
}

export function isValidTimezone(value: string): boolean {
  return IANAZone.isValidZone(value);
}

export function normalizeTimezone(value: string | null | undefined): string {
  return value && isValidTimezone(value) ? value : DEFAULT_TIMEZONE;
}

export function todayInTimezone(
  timezone: string,
  now: DateTime = DateTime.utc(),
): string {
  return now.setZone(normalizeTimezone(timezone)).toISODate()!;
}

export function calendarDaysBetween(from: string, to: string): number {
  const fromDate = DateTime.fromISO(from, { zone: "utc" }).startOf("day");
  const toDate = DateTime.fromISO(to, { zone: "utc" }).startOf("day");
  return Math.round(toDate.diff(fromDate, "days").days);
}

export function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = DateTime.fromISO(from, { zone: "utc" }).startOf("day");
  const end = DateTime.fromISO(to, { zone: "utc" }).startOf("day");

  while (cursor <= end) {
    dates.push(cursor.toISODate()!);
    cursor = cursor.plus({ days: 1 });
  }

  return dates;
}

export function toCalendarBounds(
  from: string,
  to: string,
  timezone: string,
): { timeMin: string; timeMax: string } {
  const zone = normalizeTimezone(timezone);
  return {
    timeMin: DateTime.fromISO(from, { zone }).startOf("day").toUTC().toISO()!,
    timeMax: DateTime.fromISO(to, { zone })
      .plus({ days: 1 })
      .startOf("day")
      .toUTC()
      .toISO()!,
  };
}

