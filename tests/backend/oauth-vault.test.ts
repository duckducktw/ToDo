import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getGoogleAccessToken,
  saveOAuthCredentials,
} from "@/lib/oauth-vault";

const USER_ID = "google_oauth_test";
let dataRoot: string;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(os.tmpdir(), "dual-track-oauth-"));
  process.env.DATA_STORE_DIR = dataRoot;
  process.env.AUTH_SECRET = "test-auth-secret-with-at-least-32-characters";
  process.env.AUTH_GOOGLE_ID = "fixture-client-id";
  process.env.AUTH_GOOGLE_SECRET = "fixture-client-secret";
});

afterEach(async () => {
  delete process.env.DATA_STORE_DIR;
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_GOOGLE_ID;
  delete process.env.AUTH_GOOGLE_SECRET;
  await rm(dataRoot, { recursive: true, force: true });
});

describe("encrypted OAuth vault", () => {
  it("keeps token values out of the JSON envelope", async () => {
    await saveOAuthCredentials(USER_ID, {
      accessToken: "sensitive-access-token",
      refreshToken: "sensitive-refresh-token",
      expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
      tokenType: "Bearer",
      scope: "calendar.readonly",
    });

    const source = await readFile(
      path.join(dataRoot, "oauth", `${USER_ID}.json`),
      "utf8",
    );
    expect(source).not.toContain("sensitive-access-token");
    expect(source).not.toContain("sensitive-refresh-token");
    await expect(getGoogleAccessToken(USER_ID)).resolves.toBe(
      "sensitive-access-token",
    );
  });

  it("refuses to decrypt an existing vault with a changed secret", async () => {
    await saveOAuthCredentials(USER_ID, {
      accessToken: "access-token",
      expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
    });
    process.env.AUTH_SECRET = "a-different-test-secret-with-32-characters";

    await expect(getGoogleAccessToken(USER_ID)).rejects.toMatchObject({
      code: "STORE_CORRUPT",
    });
  });

  it("replaces an unreadable vault after a fresh OAuth sign-in", async () => {
    await saveOAuthCredentials(USER_ID, {
      accessToken: "old-access-token",
      expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
    });
    process.env.AUTH_SECRET = "a-different-test-secret-with-32-characters";

    await saveOAuthCredentials(USER_ID, {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
      expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
    });

    await expect(getGoogleAccessToken(USER_ID)).resolves.toBe(
      "new-access-token",
    );
  });

  it("rejects a credential vault copied under another user identity", async () => {
    await saveOAuthCredentials(USER_ID, {
      accessToken: "private-access-token",
      expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
    });
    const otherUser = "google_other_oauth_user";
    await copyFile(
      path.join(dataRoot, "oauth", `${USER_ID}.json`),
      path.join(dataRoot, "oauth", `${otherUser}.json`),
    );

    await expect(getGoogleAccessToken(otherUser)).rejects.toMatchObject({
      code: "STORE_CORRUPT",
    });
  });

  it("serializes refreshes to avoid rotating the same token twice", async () => {
    await saveOAuthCredentials(USER_ID, {
      accessToken: "expired-access-token",
      refreshToken: "one-use-refresh-token",
      expiresAt: 1,
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "fresh-access-token", expires_in: 3600 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      Promise.all([
        getGoogleAccessToken(USER_ID),
        getGoogleAccessToken(USER_ID),
      ]),
    ).resolves.toEqual(["fresh-access-token", "fresh-access-token"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps a revoked refresh grant to a reconnect requirement", async () => {
    await saveOAuthCredentials(USER_ID, {
      accessToken: "expired-access-token",
      refreshToken: "revoked-refresh-token",
      expiresAt: 1,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(getGoogleAccessToken(USER_ID)).rejects.toMatchObject({
      code: "CALENDAR_RECONNECT_REQUIRED",
      status: 409,
    });
  });

  it("keeps OAuth client errors distinct from revoked user grants", async () => {
    await saveOAuthCredentials(USER_ID, {
      accessToken: "expired-access-token",
      refreshToken: "valid-refresh-token",
      expiresAt: 1,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_client" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(getGoogleAccessToken(USER_ID)).rejects.toMatchObject({
      code: "UPSTREAM_CALENDAR_ERROR",
      status: 502,
    });
  });
});
