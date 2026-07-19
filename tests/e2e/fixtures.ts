import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { expect, test as base, type Page } from "@playwright/test";

interface AuthenticatedFixtures {
  authenticatedPage: Page;
}

async function resetTestData() {
  const dataDirectory = path.resolve("tests/.tmp/e2e-data");
  await rm(dataDirectory, { recursive: true, force: true });
  await mkdir(dataDirectory, { recursive: true });
}

async function signInWithHiddenProvider(page: Page, userId: string) {
  const csrfResponse = await page.request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBe(true);
  const csrf = (await csrfResponse.json()) as { csrfToken: string };

  const callbackResponse = await page.request.post("/api/auth/callback/test", {
    form: {
      csrfToken: csrf.csrfToken,
      callbackUrl: "/",
      secret: "local-playwright-test-secret",
      userId,
      email: `${userId}@example.test`,
      name: "Playwright User",
    },
    headers: { "X-Auth-Return-Redirect": "1" },
  });
  expect(callbackResponse.ok()).toBe(true);

  const sessionResponse = await page.request.get("/api/auth/session");
  expect(sessionResponse.ok()).toBe(true);
  const session = (await sessionResponse.json()) as {
    user?: { id?: string; email?: string };
  };
  expect(session.user?.id).toBe(`google_${userId}`);
}

export const test = base.extend<AuthenticatedFixtures>({
  authenticatedPage: async ({ page }, provide, testInfo) => {
    await resetTestData();
    await page.addInitScript(() => {
      window.localStorage.setItem("flow-todo.notification-intro.v1", "seen");
    });
    const projectName = testInfo.project.name.replace(/[^A-Za-z0-9_-]/g, "_");
    const userId = `e2e_${projectName}_${testInfo.workerIndex}_${testInfo.retry}`;
    await signInWithHiddenProvider(page, userId);
    await provide(page);
  },
});

export { expect } from "@playwright/test";
