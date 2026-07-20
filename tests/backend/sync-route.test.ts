import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/sync/route";
import { publishSyncEvent } from "@/lib/sync-events";

vi.mock("@/lib/auth-user", () => ({
  requireApiUser: vi.fn(async () => ({ id: "google_sync_route" })),
}));

describe("sync route stream", () => {
  it("streams isolated events with SSE headers and cleans up on cancel", async () => {
    const response = await GET(new Request("https://todo.example/api/sync"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    expect(response.headers.get("x-accel-buffering")).toBe("no");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    expect(decoder.decode((await reader.read()).value)).toBe("retry: 3000\n\n");

    publishSyncEvent("google_other", "tasks");
    publishSyncEvent("google_sync_route", "tasks");
    expect(decoder.decode((await reader.read()).value)).toBe(
      "event: tasks\ndata: {}\n\n",
    );

    await reader.cancel();
    expect(() => publishSyncEvent("google_sync_route", "settings")).not.toThrow();
  });
});
