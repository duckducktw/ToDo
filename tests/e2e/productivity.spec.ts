import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { DateTime } from "luxon";

import type { TaskMutationResponse, TaskRangeResponse } from "@/types/domain";
import { expect, test } from "./fixtures";

async function createTask(
  page: Page,
  revision: number,
  task: {
    title: string;
    scheduled_date: string;
    is_flexible: boolean;
  },
) {
  const response = await page.request.post("/api/tasks", {
    headers: { "If-Match": String(revision) },
    data: { ...task, description: "" },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as TaskMutationResponse;
}

async function openTodayAfterRollover(page: Page) {
  const rolloverResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/tasks/rollover") &&
      response.request().method() === "POST",
  );
  await page.goto("/");
  expect((await rolloverResponse).ok()).toBe(true);
}

test("creates, edits, completes, reopens, and deletes a task", async ({
  authenticatedPage: page,
}) => {
  await openTodayAfterRollover(page);
  await expect(page.getByRole("heading", { name: "今日焦點" })).toBeVisible();
  await expect(page.getByText("今天還沒有待辦")).toBeVisible();

  await page.getByRole("button", { name: "新增待辦", exact: true }).first().click();
  await page.getByLabel(/待辦名稱/).fill("整理產品提案");
  await page.getByLabel(/說明/).fill("確認附錄與數據來源");
  await page.getByRole("button", { name: /固定/ }).click();
  await page.getByRole("button", { name: "加入待辦" }).click();

  await expect(page.getByRole("heading", { name: "整理產品提案" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "將「整理產品提案」設為彈性" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "「整理產品提案」更多操作" }).click();
  await page.getByRole("menuitem", { name: "編輯" }).click();
  await page.getByLabel(/待辦名稱/).fill("整理最終產品提案");
  await page.getByRole("button", { name: "儲存變更" }).click();
  await expect(
    page.getByRole("heading", { name: "整理最終產品提案" }),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: "完成「整理最終產品提案」" }).click();
  const completingCard = page.locator(".task-card.completing");
  await expect(completingCard).toBeVisible();
  const completionAnimations = await completingCard.locator(".task-checkbox").evaluate((element) =>
    element.getAnimations().map((animation) => animation instanceof CSSAnimation ? animation.animationName : ""),
  );
  expect(completionAnimations).toContain("checkbox-complete");

  const completedDisclosure = page.locator("details.completed-disclosure");
  const completedSummary = completedDisclosure.locator("summary");
  await completedSummary.click();
  const todayAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(todayAccessibility.violations).toEqual([]);

  await completedSummary.click();
  const closingState = await completedDisclosure.evaluate((element) => ({
    closing: element.classList.contains("closing"),
    open: (element as HTMLDetailsElement).open,
    animations: Array.from(element.querySelector(".animated-details-content")?.getAnimations() ?? [])
      .map((animation) => animation instanceof CSSAnimation ? animation.animationName : ""),
  }));
  expect(closingState).toMatchObject({ closing: true, open: true });
  expect(closingState.animations).toContain("disclosure-out");
  await expect(completedDisclosure).toHaveJSProperty("open", false, { timeout: 1_000 });

  await completedSummary.click();
  await page
    .getByRole("checkbox", { name: "重新開啟「整理最終產品提案」" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "完成「整理最終產品提案」" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "「整理最終產品提案」更多操作" }).click();
  await page.getByRole("menuitem", { name: "刪除" }).click();
  const confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "刪除", exact: true }).click();
  await expect(page.getByText("今天還沒有待辦")).toBeVisible();
});

test("rolls overdue work forward and auto-pulls the next flexible task", async ({
  authenticatedPage: page,
}) => {
  const today = DateTime.now().setZone("Asia/Taipei").toISODate()!;
  const yesterday = DateTime.fromISO(today).minus({ days: 1 }).toISODate()!;
  const tomorrow = DateTime.fromISO(today).plus({ days: 1 }).toISODate()!;
  const rangeResponse = await page.request.get(
    `/api/tasks?from=${yesterday}&to=${tomorrow}`,
  );
  expect(rangeResponse.ok()).toBe(true);
  let revision = ((await rangeResponse.json()) as TaskRangeResponse).revision;

  revision = (
    await createTask(page, revision, {
      title: "昨日固定任務",
      scheduled_date: yesterday,
      is_flexible: false,
    })
  ).revision;
  revision = (
    await createTask(page, revision, {
      title: "今日收尾任務",
      scheduled_date: today,
      is_flexible: true,
    })
  ).revision;
  await createTask(page, revision, {
    title: "明日彈性任務",
    scheduled_date: tomorrow,
    is_flexible: true,
  });

  await openTodayAfterRollover(page);
  await expect(page.getByText("延遲帶入")).toBeVisible();
  await expect(page.getByRole("heading", { name: "昨日固定任務" })).toBeVisible();

  const finalTask = page.getByRole("checkbox", { name: "完成「今日收尾任務」" });
  await page.getByRole("checkbox", { name: "完成「昨日固定任務」" }).click();
  await expect(finalTask).toBeDisabled();
  await expect(finalTask).toBeEnabled();
  await page.evaluate(
    () => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ),
  );
  const finalCompletion = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      response.url().includes("/api/tasks/"),
  );
  await finalTask.click();
  expect((await finalCompletion).ok()).toBe(true);

  await expect(page.getByRole("heading", { name: "明日彈性任務" })).toBeVisible();
  await expect(page.getByText(/提前・\d+ 月 \d+ 日/)).toBeVisible();

  await expect.poll(async () => {
    const persisted = (await (await page.request.get(
      `/api/tasks?from=${today}&to=${tomorrow}`,
    )).json()) as TaskRangeResponse;
    return persisted.tasks.find((task) => task.title === "明日彈性任務")
      ?.scheduled_date;
  }).toBe(today);

  const previewMenu = page.getByRole("button", { name: "「明日彈性任務」更多操作" });
  await expect(previewMenu).toBeEnabled();
  await previewMenu.click();
  await page.getByRole("menuitem", { name: "編輯" }).click();
  await expect(page.getByRole("dialog", { name: "編輯待辦" })).toBeVisible();
});

test("week and month planning views are responsive and pass WCAG AA smoke", async ({
  authenticatedPage: page,
}) => {
  const range = await page.request.get("/api/tasks?from=2026-07-15&to=2026-07-15");
  const revision = ((await range.json()) as TaskRangeResponse).revision;
  await createTask(page, revision, {
    title: "月檢視可辨識任務",
    scheduled_date: "2026-07-15",
    is_flexible: true,
  });
  await page.goto("/planning?view=week&date=2026-07-15");
  await expect(page.getByRole("heading", { name: "規劃" })).toBeVisible();
  await expect(page.getByRole("group", { name: "規劃檢視" })).toBeVisible();
  await expect(page.getByText("專案會議").first()).toBeVisible();

  const weekAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(weekAccessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "月", exact: true }).click();
  await expect(page).toHaveURL(/view=month/);
  await expect(page.locator(".month-cell")).toHaveCount(42);
  await expect(page.getByRole("list", { name: "7 月 15 日行程" })).toContainText("晨間檢視");
  await expect(page.getByRole("button", { name: "拖曳「月檢視可辨識任務」" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "查看 7 月 15 日安排" })).toHaveAccessibleDescription(/1 項待辦；2 項行程.*專案會議.*月檢視可辨識任務/);

  const hasPageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasPageOverflow).toBe(false);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("rejects a stale task revision without losing the accepted write", async ({
  authenticatedPage: page,
}) => {
  const today = DateTime.now().setZone("Asia/Taipei").toISODate()!;
  const range = await page.request.get(`/api/tasks?from=${today}&to=${today}`);
  const initial = (await range.json()) as TaskRangeResponse;

  const accepted = await createTask(page, initial.revision, {
    title: "已接受的更新",
    scheduled_date: today,
    is_flexible: true,
  });
  expect(accepted.revision).toBe(initial.revision + 1);

  const stale = await page.request.post("/api/tasks", {
    headers: { "If-Match": String(initial.revision) },
    data: {
      title: "過期分頁的更新",
      description: "",
      scheduled_date: today,
      is_flexible: true,
    },
  });
  expect(stale.status()).toBe(412);
  await expect(stale.json()).resolves.toMatchObject({
    error: { code: "STALE_REVISION" },
  });

  const latest = (await (
    await page.request.get(`/api/tasks?from=${today}&to=${today}`)
  ).json()) as TaskRangeResponse;
  expect(latest.tasks.map((task) => task.title)).toEqual(["已接受的更新"]);
});

test("supports keyboard ordering and persists the new order", async ({
  authenticatedPage: page,
}) => {
  const today = DateTime.now().setZone("Asia/Taipei").toISODate()!;
  const range = await page.request.get(`/api/tasks?from=${today}&to=${today}`);
  let revision = ((await range.json()) as TaskRangeResponse).revision;
  for (const title of ["第一項工作", "第二項工作"]) {
    revision = (
      await createTask(page, revision, {
        title,
        scheduled_date: today,
        is_flexible: true,
      })
    ).revision;
  }

  await page.goto("/");
  const handle = page.getByRole("button", { name: "拖曳「第一項工作」" });
  await expect(handle).toBeEnabled();
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => handle.evaluate((element) => element.closest<HTMLElement>(".sortable-task")?.style.transform ?? ""))
    .toMatch(/translate3d\(0px, (?!0px)-?\d+px, 0px\)/);
  await page.keyboard.press("Space");
  await expect(handle).not.toHaveAttribute("aria-pressed", "true");

  await expect
    .poll(async () =>
      page.locator(".regular-group .task-card h3, .task-group:not(.delayed-group) .task-card h3").allTextContents(),
    )
    .toEqual(["第二項工作", "第一項工作"]);

  await expect
    .poll(async () => {
      const persisted = (await (
        await page.request.get(`/api/tasks?from=${today}&to=${today}`)
      ).json()) as TaskRangeResponse;
      return persisted.tasks.map((task) => task.title);
    })
    .toEqual(["第二項工作", "第一項工作"]);
});

test("moves a task to another day with pointer drag", async ({
  authenticatedPage: page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Pointer drag is covered once at desktop width.");

  const today = DateTime.now().setZone("Asia/Taipei").toISODate()!;
  const tomorrow = DateTime.fromISO(today).plus({ days: 1 }).toISODate()!;
  const range = await page.request.get(`/api/tasks?from=${today}&to=${tomorrow}`);
  const revision = ((await range.json()) as TaskRangeResponse).revision;
  await createTask(page, revision, {
    title: "跨日拖曳工作",
    scheduled_date: today,
    is_flexible: true,
  });

  await page.goto(`/planning?view=week&date=${today}`);
  const handle = page.getByRole("button", { name: "拖曳「跨日拖曳工作」" });
  const target = page.locator(`[aria-labelledby="day-${tomorrow}"]`);
  const start = await handle.boundingBox();
  const destination = await target.boundingBox();
  expect(start).not.toBeNull();
  expect(destination).not.toBeNull();

  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    destination!.x + destination!.width / 2,
    destination!.y + Math.min(180, destination!.height / 2),
    { steps: 12 },
  );
  await page.mouse.up();

  await expect(target.getByRole("heading", { name: "跨日拖曳工作" })).toBeVisible();
  const persisted = (await (
    await page.request.get(`/api/tasks?from=${today}&to=${tomorrow}`)
  ).json()) as TaskRangeResponse;
  expect(persisted.tasks.find((task) => task.title === "跨日拖曳工作")?.scheduled_date).toBe(tomorrow);
});

test("moves a task to another day from the month grid", async ({
  authenticatedPage: page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Month pointer drag is covered once at desktop width.");

  const today = DateTime.now().setZone("Asia/Taipei").toISODate()!;
  const tomorrow = DateTime.fromISO(today).plus({ days: 1 }).toISODate()!;
  const range = await page.request.get(`/api/tasks?from=${today}&to=${tomorrow}`);
  const revision = ((await range.json()) as TaskRangeResponse).revision;
  await createTask(page, revision, {
    title: "月格跨日工作",
    scheduled_date: today,
    is_flexible: true,
  });

  await page.goto(`/planning?view=month&date=${today}`);
  const handle = page.getByRole("button", { name: "拖曳「月格跨日工作」" }).first();
  const targetLabel = `查看 ${DateTime.fromISO(tomorrow).setLocale("zh-TW").toFormat("M 月 d 日")}安排`;
  const target = page.locator(".month-cell").filter({ has: page.getByRole("button", { name: targetLabel }) });
  const start = await handle.boundingBox();
  const destination = await target.boundingBox();
  expect(start).not.toBeNull();
  expect(destination).not.toBeNull();

  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(destination!.x + destination!.width / 2, destination!.y + destination!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(target.getByRole("button", { name: "拖曳「月格跨日工作」" })).toBeVisible();
  await expect.poll(async () => {
    const persisted = (await (await page.request.get(`/api/tasks?from=${today}&to=${tomorrow}`)).json()) as TaskRangeResponse;
    return persisted.tasks.find((task) => task.title === "月格跨日工作")?.scheduled_date;
  }).toBe(tomorrow);
});
