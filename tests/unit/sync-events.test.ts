import { describe, expect, it, vi } from "vitest";
import { publishSyncEvent, subscribeToSyncEvents } from "@/lib/sync-events";

describe("cross-device sync events", () => {
  it("isolates users and removes disconnected listeners", () => {
    const userA = vi.fn();
    const userB = vi.fn();
    const unsubscribeA = subscribeToSyncEvents("google_user_a", userA);
    const unsubscribeB = subscribeToSyncEvents("google_user_b", userB);

    publishSyncEvent("google_user_a", "tasks");
    expect(userA).toHaveBeenCalledWith("tasks");
    expect(userB).not.toHaveBeenCalled();

    unsubscribeA();
    publishSyncEvent("google_user_a", "settings");
    expect(userA).toHaveBeenCalledOnce();

    unsubscribeB();
  });
});
