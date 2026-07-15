import { DateTime } from "luxon";

import type { TaskMutationResponse, TaskRangeResponse } from "@/types/domain";
import { expect, test } from "./fixtures";

test("captures the populated Today and month-planning surfaces", async ({
  authenticatedPage: page,
}, testInfo) => {
  const today = DateTime.now().setZone("Asia/Taipei").toISODate()!;
  const yesterday = DateTime.fromISO(today).minus({ days: 1 }).toISODate()!;
  const tomorrow = DateTime.fromISO(today).plus({ days: 1 }).toISODate()!;
  const rangeResponse = await page.request.get(
    `/api/tasks?from=${yesterday}&to=${tomorrow}`,
  );
  let revision = ((await rangeResponse.json()) as TaskRangeResponse).revision;

  for (const task of [
    {
      title: "確認季度報告數據",
      description: "核對營收與留存率來源",
      scheduled_date: yesterday,
      is_flexible: false,
    },
    {
      title: "完成產品提案初稿",
      description: "整理核心流程與決策依據",
      scheduled_date: today,
      is_flexible: true,
    },
    {
      title: "閱讀使用者訪談摘要",
      description: "標記下一輪驗證問題",
      scheduled_date: tomorrow,
      is_flexible: true,
    },
  ]) {
    const response = await page.request.post("/api/tasks", {
      headers: { "If-Match": String(revision) },
      data: task,
    });
    expect(response.ok()).toBe(true);
    revision = ((await response.json()) as TaskMutationResponse).revision;
  }

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "確認季度報告數據" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("today.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto(`/planning?view=month&date=${today}`);
  await expect(page.locator(".month-cell")).toHaveCount(42);
  await page.screenshot({
    path: testInfo.outputPath("planning-month.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.getByRole("switch", { name: "深色模式" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: testInfo.outputPath("planning-month-dark.png"),
    fullPage: true,
    animations: "disabled",
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "確認季度報告數據" })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("today-dark.png"),
    fullPage: true,
    animations: "disabled",
  });
});
