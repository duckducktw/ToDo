import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("redirects signed-out pages and protects task APIs", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(
    page.getByRole("button", { name: "使用 Google 登入" }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);

  const response = await page.request.get(
    "/api/tasks?from=2026-07-15&to=2026-07-15",
  );
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toContain("private, no-store");
  await expect(response.json()).resolves.toEqual({
    error: {
      code: "UNAUTHENTICATED",
      message: "Sign in is required.",
    },
  });
});
