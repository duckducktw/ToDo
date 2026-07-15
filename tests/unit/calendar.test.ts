import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const getGoogleAccessTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/oauth-vault", () => ({
  getGoogleAccessToken: getGoogleAccessTokenMock,
}));

import {
  fetchCalendarEvents,
  normalizeGoogleEvent,
  type GoogleCalendarEvent,
} from "@/lib/calendar";

afterEach(() => {
  delete process.env.AUTH_TEST_MODE;
  delete process.env.CALENDAR_FIXTURE_PATH;
  getGoogleAccessTokenMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Google Calendar normalization", () => {
  it("normalizes timed and all-day events while preserving exclusive all-day end", () => {
    expect(
      normalizeGoogleEvent({
        id: "all-day",
        summary: "  Deadline  ",
        start: { date: "2026-07-15" },
        end: { date: "2026-07-17" },
      }),
    ).toEqual({
      id: "all-day",
      title: "Deadline",
      start: "2026-07-15",
      end: "2026-07-17",
      is_all_day: true,
    });
    expect(
      normalizeGoogleEvent({
        id: "timed",
        start: { dateTime: "2026-07-15T09:00:00+08:00" },
        end: { dateTime: "2026-07-15T10:00:00+08:00" },
      }),
    ).toMatchObject({ id: "timed", title: "(無標題)", is_all_day: false });
  });

  it.each([
    { id: "cancelled", status: "cancelled", start: { date: "2026-07-15" }, end: { date: "2026-07-16" } },
    { id: "backwards", start: { dateTime: "2026-07-15T10:00:00Z" }, end: { dateTime: "2026-07-15T09:00:00Z" } },
    { id: "mixed", start: { date: "2026-07-15" }, end: { dateTime: "2026-07-16T00:00:00Z" } },
  ] satisfies GoogleCalendarEvent[])("drops invalid event $id", (event) => {
    expect(normalizeGoogleEvent(event)).toBeNull();
  });

  it("loads and sorts the deterministic test fixture without network access", async () => {
    process.env.AUTH_TEST_MODE = "true";
    process.env.CALENDAR_FIXTURE_PATH = path.resolve(
      "tests/fixtures/google-calendar-events.json",
    );
    const fixtureSource = JSON.parse(
      await readFile(process.env.CALENDAR_FIXTURE_PATH, "utf8"),
    ) as { items: unknown[] };

    const events = await fetchCalendarEvents(
      "google_fixture_user",
      "2026-07-15",
      "2026-07-18",
      "Asia/Taipei",
    );

    expect(fixtureSource.items).toHaveLength(5);
    expect(events.map(({ id }) => id)).toEqual([
      "fixture-morning-review",
      "fixture-project-meeting",
      "fixture-all-day",
      "fixture-multi-day",
    ]);

    const oneDay = await fetchCalendarEvents(
      "google_fixture_user",
      "2026-07-16",
      "2026-07-16",
      "Asia/Taipei",
    );
    expect(oneDay.map(({ id }) => id)).toEqual(["fixture-all-day"]);
  });

  it("requests and combines every live Calendar page with bounded parameters", async () => {
    getGoogleAccessTokenMock.mockResolvedValue("calendar-access-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "first-page",
                summary: "First",
                start: { date: "2026-07-15" },
                end: { date: "2026-07-16" },
              },
            ],
            nextPageToken: "next-page",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "second-page",
                summary: "Second",
                start: { date: "2026-07-16" },
                end: { date: "2026-07-17" },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const events = await fetchCalendarEvents(
      "google_live_user",
      "2026-07-15",
      "2026-07-16",
      "Asia/Taipei",
    );

    expect(events.map(({ id }) => id)).toEqual(["first-page", "second-page"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(firstUrl.pathname).toContain("/calendars/primary/events");
    expect(firstUrl.searchParams.get("singleEvents")).toBe("true");
    expect(firstUrl.searchParams.get("orderBy")).toBe("startTime");
    expect(firstUrl.searchParams.get("timeZone")).toBe("Asia/Taipei");
    expect(firstUrl.searchParams.get("timeMin")).toBe(
      "2026-07-14T16:00:00.000Z",
    );
    expect(firstUrl.searchParams.get("timeMax")).toBe(
      "2026-07-16T16:00:00.000Z",
    );
    const secondUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(secondUrl.searchParams.get("pageToken")).toBe("next-page");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer calendar-access-token" },
    });
  });

  it("refreshes once after a 401 and retries with the new token", async () => {
    getGoogleAccessTokenMock
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("fresh-token");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 401 } }), { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchCalendarEvents(
        "google_live_user",
        "2026-07-15",
        "2026-07-15",
        "Asia/Taipei",
      ),
    ).resolves.toEqual([]);
    expect(getGoogleAccessTokenMock).toHaveBeenNthCalledWith(
      2,
      "google_live_user",
      true,
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: { authorization: "Bearer fresh-token" },
    });
  });

  it("distinguishes missing permissions from quota failures", async () => {
    getGoogleAccessTokenMock.mockResolvedValue("calendar-access-token");
    const googleError = (reason: string) =>
      new Response(
        JSON.stringify({ error: { errors: [{ reason }] } }),
        { status: 403 },
      );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(googleError("insufficientPermissions"));
    await expect(
      fetchCalendarEvents(
        "google_live_user",
        "2026-07-15",
        "2026-07-15",
        "Asia/Taipei",
      ),
    ).rejects.toMatchObject({
      code: "CALENDAR_RECONNECT_REQUIRED",
      status: 409,
    });

    fetchMock.mockResolvedValueOnce(googleError("rateLimitExceeded"));
    await expect(
      fetchCalendarEvents(
        "google_live_user",
        "2026-07-15",
        "2026-07-15",
        "Asia/Taipei",
      ),
    ).rejects.toMatchObject({
      code: "UPSTREAM_CALENDAR_ERROR",
      status: 502,
    });
  });
});
