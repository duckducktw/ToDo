import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/tasks/route";
import { PATCH } from "@/app/api/tasks/[id]/route";
import { requireApiUser } from "@/lib/auth-user";
import { todayInTimezone } from "@/lib/date";
import { AppError } from "@/lib/errors";
import type { UserProfile } from "@/types/domain";

let currentUser: UserProfile;

vi.mock("@/lib/auth-user", () => ({
  requireApiUser: vi.fn(async () => currentUser),
}));

const user = (id: string): UserProfile => ({
  id,
  email: `${id}@example.test`,
  name: id,
  avatar_url: null,
  timezone: "Asia/Taipei",
  notification_settings: {
    enabled: false,
    badgeEnabled: true,
    mode: "interval",
    intervalHours: 2,
    slots: [{ start: "09:00", end: "18:00" }],
    fixedTimes: [],
    dndUntil: null,
    dndIndefinite: false,
    prefix: "",
  },
  created_at: "2026-07-20T00:00:00.000Z",
  updated_at: "2026-07-20T00:00:00.000Z",
});

let dataRoot: string;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(os.tmpdir(), "todo-route-contract-"));
  process.env.DATA_STORE_DIR = dataRoot;
  process.env.AUTH_URL = "https://todo.example";
  currentUser = user("google_route_a");
});

afterEach(async () => {
  delete process.env.DATA_STORE_DIR;
  delete process.env.AUTH_URL;
  await rm(dataRoot, { recursive: true, force: true });
});

function taskRequest(body: unknown, revision: number) {
  return new Request("https://todo.example/api/tasks", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "if-match": String(revision),
      origin: "https://todo.example",
    },
    body: JSON.stringify(body),
  });
}

describe("task route contracts", () => {
  it("returns a stable private 401 contract without a session", async () => {
    vi.mocked(requireApiUser).mockRejectedValueOnce(
      new AppError("UNAUTHENTICATED", 401, "Sign in is required."),
    );
    const today = todayInTimezone(currentUser.timezone);
    const response = await GET(new Request(
      `https://todo.example/api/tasks?from=${today}&to=${today}`,
    ));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      error: { code: "UNAUTHENTICATED", message: "Sign in is required." },
    });
  });

  it("returns private data and physically isolates the authenticated user", async () => {
    const today = todayInTimezone(currentUser.timezone);
    const created = await POST(taskRequest({
      title: "User A task",
      description: "",
      scheduled_date: today,
      is_flexible: true,
    }, 0));
    expect(created.status).toBe(201);

    currentUser = user("google_route_b");
    const response = await GET(new Request(
      `https://todo.example/api/tasks?from=${today}&to=${today}`,
    ));
    const payload = await response.json();

    expect(payload.tasks).toEqual([]);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("etag")).toBe('"0"');
  });

  it("rejects stale revisions without losing the accepted mutation", async () => {
    const today = todayInTimezone(currentUser.timezone);
    const body = {
      title: "Accepted",
      description: "",
      scheduled_date: today,
      is_flexible: true,
    };
    expect((await POST(taskRequest(body, 0))).status).toBe(201);

    const stale = await POST(taskRequest({ ...body, title: "Stale" }, 0));
    expect(stale.status).toBe(412);
    await expect(stale.json()).resolves.toMatchObject({
      error: { code: "STALE_REVISION" },
    });

    const latest = await GET(new Request(
      `https://todo.example/api/tasks?from=${today}&to=${today}`,
    ));
    await expect(latest.json()).resolves.toMatchObject({
      revision: 1,
      tasks: [{ title: "Accepted" }],
    });
  });

  it("maps invalid input and missing task IDs to stable API errors", async () => {
    const invalid = await POST(taskRequest({ title: "" }, 0));
    expect(invalid.status).toBe(400);

    const missing = await PATCH(
      new Request("https://todo.example/api/tasks/missing", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "if-match": "0",
          origin: "https://todo.example",
        },
        body: JSON.stringify({ status: "done" }),
      }),
      { params: Promise.resolve({ id: "0198af4b-0c00-7000-8000-000000000099" }) },
    );
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});
