import { readFile } from "node:fs/promises";

import { DateTime } from "luxon";

import { toCalendarBounds } from "@/lib/date";
import { isTestAuthEnabled } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getGoogleAccessToken } from "@/lib/oauth-vault";
import type { CalendarEvent } from "@/types/domain";

export interface GoogleCalendarEvent {
  id?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
}

interface GoogleEventsPage {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
}

export function normalizeGoogleEvent(
  event: GoogleCalendarEvent,
): CalendarEvent | null {
  if (!event.id || event.status === "cancelled" || !event.start || !event.end) {
    return null;
  }

  if (event.start.date && event.end.date) {
    if (event.end.date <= event.start.date) {
      return null;
    }
    return {
      id: event.id,
      title: event.summary?.trim() || "(無標題)",
      start: event.start.date,
      end: event.end.date,
      is_all_day: true,
    };
  }

  if (event.start.dateTime && event.end.dateTime) {
    const start = DateTime.fromISO(event.start.dateTime, { setZone: true });
    const end = DateTime.fromISO(event.end.dateTime, { setZone: true });
    if (!start.isValid || !end.isValid || end <= start) {
      return null;
    }
    return {
      id: event.id,
      title: event.summary?.trim() || "(無標題)",
      start: event.start.dateTime,
      end: event.end.dateTime,
      is_all_day: false,
    };
  }

  return null;
}

function normalizeEvents(items: GoogleCalendarEvent[]): CalendarEvent[] {
  return items
    .map(normalizeGoogleEvent)
    .filter((event): event is CalendarEvent => event !== null)
    .sort(
      (left, right) =>
        left.start.localeCompare(right.start) ||
        left.end.localeCompare(right.end) ||
        left.id.localeCompare(right.id),
    );
}

function eventOverlapsRange(
  event: CalendarEvent,
  from: string,
  to: string,
  timezone: string,
): boolean {
  if (event.is_all_day) {
    // Google all-day event ends are exclusive.
    return event.start <= to && event.end > from;
  }

  const rangeStart = DateTime.fromISO(from, { zone: timezone }).startOf("day");
  const rangeEnd = DateTime.fromISO(to, { zone: timezone })
    .plus({ days: 1 })
    .startOf("day");
  const eventStart = DateTime.fromISO(event.start, { setZone: true });
  const eventEnd = DateTime.fromISO(event.end, { setZone: true });
  return eventStart < rangeEnd && eventEnd > rangeStart;
}

async function readFixtureEvents(): Promise<CalendarEvent[] | null> {
  const fixturePath = process.env.CALENDAR_FIXTURE_PATH;
  if (!isTestAuthEnabled() || !fixturePath) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(await readFile(fixturePath, "utf8"));
    if (Array.isArray(parsed)) {
      return normalizeEvents(parsed as GoogleCalendarEvent[]);
    }
    if (typeof parsed === "object" && parsed !== null) {
      if ("items" in parsed && Array.isArray(parsed.items)) {
        return normalizeEvents(parsed.items as GoogleCalendarEvent[]);
      }
      if ("events" in parsed && Array.isArray(parsed.events)) {
        const events = parsed.events as unknown[];
        if (
          events.every(
            (event) =>
              typeof event === "object" &&
              event !== null &&
              "is_all_day" in event &&
              "title" in event,
          )
        ) {
          return events as CalendarEvent[];
        }
        return normalizeEvents(events as GoogleCalendarEvent[]);
      }
    }
    throw new Error("Unsupported fixture shape");
  } catch (error) {
    throw new AppError(
      "UPSTREAM_CALENDAR_ERROR",
      502,
      "The configured calendar fixture is invalid.",
      error,
    );
  }
}

async function requestEventsPage(
  url: URL,
  accessToken: string,
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: controller.signal,
    });
    return { response, body: await response.json().catch(() => null) };
  } catch (error) {
    throw new AppError(
      "UPSTREAM_CALENDAR_ERROR",
      502,
      "Google Calendar could not be reached.",
      error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parseEventsPage(body: unknown): GoogleEventsPage {
  if (typeof body !== "object" || body === null) {
    throw new AppError(
      "UPSTREAM_CALENDAR_ERROR",
      502,
      "Google Calendar returned an invalid response.",
    );
  }
  const rawItems = "items" in body ? body.items : undefined;
  const rawToken = "nextPageToken" in body ? body.nextPageToken : undefined;
  if (rawItems !== undefined && !Array.isArray(rawItems)) {
    throw new AppError(
      "UPSTREAM_CALENDAR_ERROR",
      502,
      "Google Calendar returned invalid events.",
    );
  }
  return {
    items: (rawItems as GoogleCalendarEvent[] | undefined) ?? [],
    nextPageToken:
      typeof rawToken === "string" && rawToken ? rawToken : undefined,
  };
}

function googleErrorReasons(body: unknown): string[] {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return [];
  }
  const error = body.error;
  if (typeof error !== "object" || error === null || !("errors" in error)) {
    return [];
  }
  return Array.isArray(error.errors)
    ? error.errors.flatMap((entry) =>
        typeof entry === "object" &&
        entry !== null &&
        "reason" in entry &&
        typeof entry.reason === "string"
          ? [entry.reason]
          : [],
      )
    : [];
}

export async function fetchCalendarEvents(
  userId: string,
  from: string,
  to: string,
  timezone: string,
): Promise<CalendarEvent[]> {
  const fixture = await readFixtureEvents();
  if (fixture) {
    return fixture.filter((event) =>
      eventOverlapsRange(event, from, to, timezone),
    );
  }

  const { timeMin, timeMax } = toCalendarBounds(from, to, timezone);
  let accessToken = await getGoogleAccessToken(userId);
  let pageToken: string | undefined;
  let pageCount = 0;
  const items: GoogleCalendarEvent[] = [];

  do {
    pageCount += 1;
    if (pageCount > 100) {
      throw new AppError(
        "UPSTREAM_CALENDAR_ERROR",
        502,
        "Google Calendar returned too many pages.",
      );
    }
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("timeZone", timezone);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    let result = await requestEventsPage(url, accessToken);
    if (result.response.status === 401) {
      accessToken = await getGoogleAccessToken(userId, true);
      result = await requestEventsPage(url, accessToken);
    }
    const reasons = googleErrorReasons(result.body);
    const missingPermission = reasons.some((reason) =>
      ["authError", "insufficientPermissions"].includes(reason),
    );
    if (result.response.status === 401 || missingPermission) {
      throw new AppError(
        "CALENDAR_RECONNECT_REQUIRED",
        409,
        "Google Calendar authorization is missing or expired.",
      );
    }
    if (!result.response.ok) {
      throw new AppError(
        "UPSTREAM_CALENDAR_ERROR",
        502,
        `Google Calendar request failed (${result.response.status}).`,
      );
    }

    const page = parseEventsPage(result.body);
    items.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return normalizeEvents(items);
}
