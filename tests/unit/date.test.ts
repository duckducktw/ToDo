import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  calendarDaysBetween,
  enumerateDates,
  isValidDate,
  normalizeTimezone,
  toCalendarBounds,
  todayInTimezone,
} from "@/lib/date";

describe("date helpers", () => {
  it("uses the user's timezone when UTC and local dates differ", () => {
    const instant = DateTime.fromISO("2026-07-14T16:30:00.000Z");

    expect(todayInTimezone("Asia/Taipei", instant)).toBe("2026-07-15");
    expect(todayInTimezone("America/Los_Angeles", instant)).toBe("2026-07-14");
  });

  it("falls back for invalid IANA zones", () => {
    expect(normalizeTimezone("not/a-timezone")).toBe("Asia/Taipei");
    expect(normalizeTimezone(undefined)).toBe("Asia/Taipei");
  });

  it("rejects impossible and non-canonical calendar dates", () => {
    expect(isValidDate("2026-02-29")).toBe(false);
    expect(isValidDate("2026-2-09")).toBe(false);
    expect(isValidDate("2028-02-29")).toBe(true);
  });

  it("counts missed local calendar days rather than elapsed hours", () => {
    expect(calendarDaysBetween("2026-07-12", "2026-07-15")).toBe(3);
  });

  it("enumerates an inclusive date range", () => {
    expect(enumerateDates("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
  });

  it("creates exclusive UTC bounds across a daylight-saving transition", () => {
    expect(
      toCalendarBounds("2026-03-08", "2026-03-08", "America/New_York"),
    ).toEqual({
      timeMin: "2026-03-08T05:00:00.000Z",
      timeMax: "2026-03-09T04:00:00.000Z",
    });
  });
});

