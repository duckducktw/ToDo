// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  DayCalendarReferences,
  eventOccursOnDate,
  formatEventTime,
} from "@/components/calendar-panel";
import type { CalendarEvent } from "@/types/domain";

const allDay: CalendarEvent = {
  id: "all-day",
  title: "Workshop",
  start: "2026-07-15",
  end: "2026-07-17",
  is_all_day: true,
};

const timed: CalendarEvent = {
  id: "timed",
  title: "Review",
  start: "2026-07-15T06:00:00.000Z",
  end: "2026-07-15T07:00:00.000Z",
  is_all_day: false,
};

describe("calendar references", () => {
  it("treats an all-day end date as exclusive", () => {
    expect(eventOccursOnDate(allDay, "2026-07-15", "Asia/Taipei")).toBe(true);
    expect(eventOccursOnDate(allDay, "2026-07-16", "Asia/Taipei")).toBe(true);
    expect(eventOccursOnDate(allDay, "2026-07-17", "Asia/Taipei")).toBe(false);
  });

  it("formats timed events in the viewer's timezone", () => {
    expect(formatEventTime(timed, "Asia/Taipei")).toBe("14:00–15:00");
  });

  it("clips a multi-day timed event to the displayed date", () => {
    const multiDay: CalendarEvent = {
      id: "multi-day",
      title: "Workshop",
      start: "2026-07-17T16:00:00+08:00",
      end: "2026-07-18T11:00:00+08:00",
      is_all_day: false,
    };

    expect(formatEventTime(multiDay, "Asia/Taipei", "2026-07-17")).toBe(
      "16:00–24:00",
    );
    expect(formatEventTime(multiDay, "Asia/Taipei", "2026-07-18")).toBe(
      "00:00–11:00",
    );
  });

  it("renders read-only event titles and an overflow count", () => {
    render(
      <DayCalendarReferences
        events={[allDay, timed]}
        date="2026-07-15"
        timezone="Asia/Taipei"
        limit={1}
      />,
    );

    expect(screen.getByText("Workshop")).toBeInTheDocument();
    expect(screen.getByText("另有 1 項")).toBeInTheDocument();
  });
});
