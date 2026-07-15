import { expect, test } from "./fixtures";

test("keeps the Today add button stable while Firefox hydrates a reload", async ({
  authenticatedPage: page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-firefox",
    "Firefox persists dynamic button disabled state and needs this browser-specific regression.",
  );

  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|server rendered HTML/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/hydrat|server rendered HTML/i.test(error.message)) hydrationErrors.push(error.message);
  });

  await page.goto("/");
  const todayAddButton = page.getByRole("button", { name: "新增待辦", exact: true }).first();
  await expect(todayAddButton).toBeEnabled({ timeout: 30_000 });
  await expect(todayAddButton).toHaveAttribute("autocomplete", "off");

  await page.reload();
  await expect(todayAddButton).toBeEnabled({ timeout: 30_000 });
  expect(hydrationErrors).toEqual([]);
});
