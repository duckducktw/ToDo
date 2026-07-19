import { afterEach, describe, expect, it, vi } from "vitest";

import { assertConfiguredAuthSecret, getWebPushConfig } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Web Push environment", () => {
  it("requires a complete VAPID configuration", () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "public");
    expect(getWebPushConfig()).toBeNull();
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:admin@example.test");
    expect(getWebPushConfig()).toEqual({ publicKey: "public", privateKey: "private", subject: "mailto:admin@example.test" });
  });
});

describe("authentication environment", () => {
  it("rejects short and example authentication secrets", () => {
    vi.stubEnv("AUTH_SECRET", "too-short");
    expect(() => assertConfiguredAuthSecret()).toThrow(/32 characters/);

    vi.stubEnv(
      "AUTH_SECRET",
      "replace-with-at-least-32-random-characters",
    );
    expect(() => assertConfiguredAuthSecret()).toThrow(/non-placeholder/);
  });

  it("accepts a generated-length authentication secret", () => {
    vi.stubEnv(
      "AUTH_SECRET",
      "unit-test-secret-with-more-than-32-characters",
    );
    expect(() => assertConfiguredAuthSecret()).not.toThrow();
  });
});
