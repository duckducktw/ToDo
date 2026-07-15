import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

test.describe("theme and motion preferences", () => {
  test("uses the device theme until the user chooses and persists an explicit choice", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Theme behavior is viewport-independent and covered once in Chromium.",
    );
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");

    const themeSwitch = page.getByRole("switch", { name: "深色模式" });
    await expect(themeSwitch).toBeVisible();
    await expect(themeSwitch).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const loginAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(loginAccessibility.violations).toEqual([]);
    await themeSwitch.hover();
    await expect(page.getByRole("tooltip")).toHaveText("切換至淺色模式");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(themeSwitch).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await themeSwitch.click();
    await expect(themeSwitch).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.getByRole("switch", { name: "深色模式" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("keeps authenticated dark surfaces accessible", async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Dark accessibility is viewport-independent and covered once in Chromium.",
    );
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator(".task-list-skeleton, .calendar-skeleton")).toHaveCount(0);

    const todayAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(todayAccessibility.violations).toEqual([]);

    await page.goto("/planning?view=month&date=2026-07-15");
    await expect(page.locator(".month-cell")).toHaveCount(42);
    await expect(page.locator(".planning-skeleton, .calendar-skeleton")).toHaveCount(0);
    const planningAccessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(planningAccessibility.violations).toEqual([]);
  });

  test("collapses decorative motion when the device requests reduced motion", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-chromium",
      "Motion preferences are viewport-independent and covered once in Chromium.",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/login");

    const motion = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.animation = "pulse 10s linear infinite";
      probe.style.scrollBehavior = "smooth";
      probe.style.transition = "transform 10s linear";
      document.body.append(probe);

      const style = getComputedStyle(probe);
      const toMilliseconds = (value: string) =>
        value.endsWith("ms") ? Number.parseFloat(value) : Number.parseFloat(value) * 1000;
      const result = {
        animationDurationMs: toMilliseconds(style.animationDuration),
        scrollBehavior: style.scrollBehavior,
        transitionDurationMs: toMilliseconds(style.transitionDuration),
      };
      probe.remove();
      return result;
    });

    expect(motion.animationDurationMs).toBeLessThanOrEqual(0.01);
    expect(motion.transitionDurationMs).toBeLessThanOrEqual(0.01);
    expect(motion.scrollBehavior).toBe("auto");
  });
});
