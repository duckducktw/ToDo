import { afterEach, describe, expect, it, vi } from "vitest";

import { assertConfiguredAuthSecret } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
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
