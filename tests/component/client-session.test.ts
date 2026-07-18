// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock("next-auth/react", () => ({ signOut }));

import {
  handleUnauthorizedResponse,
  signOutInvalidSession,
} from "@/lib/client-session";

describe("client session guard", () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it("signs out when the backend rejects a stale account session", async () => {
    signOut.mockResolvedValue(undefined);

    await expect(
      handleUnauthorizedResponse(new Response(null, { status: 401 })),
    ).resolves.toBe(true);

    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("leaves non-authentication errors to their caller", async () => {
    await expect(
      handleUnauthorizedResponse(new Response(null, { status: 500 })),
    ).resolves.toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("deduplicates logout attempts from concurrent failed requests", async () => {
    let finishSignOut: (() => void) | undefined;
    signOut.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSignOut = resolve;
      }),
    );

    const first = signOutInvalidSession();
    const second = signOutInvalidSession();

    expect(signOut).toHaveBeenCalledTimes(1);
    finishSignOut?.();
    await Promise.all([first, second]);
  });
});
