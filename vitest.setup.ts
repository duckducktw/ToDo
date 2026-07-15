import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.clear();
    } catch {
      // Some node-only suites use an opaque JSDOM origin.
    }
  }
});
