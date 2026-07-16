import { expect, test } from "@playwright/test";
import { createDegradedMeeting, serializeLiveMeeting } from "./fixtures/meetings";

test("quick Mock meeting produces a conclusion-first decision", async ({ page }, testInfo) => {
  await page.goto("/");

  const advanced = page.locator("details").filter({ hasText: "更多设置" });
  await expect(advanced).not.toHaveAttribute("open", "");

  const topic = "如何用最小风险验证新的用户引导流程？";
  await page.getByPlaceholder("请输入你想交给多个模型共同讨论的问题").fill(topic);
  await page.getByRole("button", { name: "开始圆桌会议" }).click();

  await expect(page.getByRole("heading", { name: "决策简报" })).toBeVisible();
  await expect(
    page.getByText(/围绕“如何用最小风险验证新的用户引导流程？”先执行一个范围明确、可回滚的两周试点/),
  ).toBeVisible();
  await expect(page.getByText("明确建议")).toBeVisible();
  await expect(page.getByText("中置信度")).toBeVisible();
  await expect(page.getByRole("heading", { name: "成立条件" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "下一步行动" })).toBeVisible();

  const traceability = page.locator("details").filter({ hasText: "详细过程与依据" });
  await expect(traceability).not.toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: "会议复盘总览" })).not.toBeVisible();
  await traceability.getByText("详细过程与依据").click();
  await expect(page.getByRole("heading", { name: "会议复盘总览" })).toBeVisible();

  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("quick-mock-full-page.png"),
  });
});

test("low evidence and a partial failure stay visibly downgraded", async ({ page }, testInfo) => {
  const topic = "是否现在全面上线新的用户引导流程？";
  const meeting = createDegradedMeeting(topic);
  let postedBody: Record<string, unknown> | undefined;

  await page.route("**/api/meeting/live", async (route) => {
    postedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      body: serializeLiveMeeting(meeting),
      contentType: "application/x-ndjson; charset=utf-8",
      status: 200,
    });
  });

  await page.goto("/");
  await page.getByPlaceholder("请输入你想交给多个模型共同讨论的问题").fill(topic);

  const advanced = page.locator("details").filter({ hasText: "更多设置" });
  await advanced.getByText("更多设置").click();
  await advanced.getByRole("button", { name: "联网搜索" }).click();
  const searchDriverDialog = page.getByRole("dialog");
  await expect(searchDriverDialog.getByRole("heading", { name: "选择搜索驱动模型" })).toBeVisible();
  await searchDriverDialog.getByRole("radio", { name: /GPT Mock/ }).check();
  await searchDriverDialog.getByRole("button", { name: "确认" }).click();
  await advanced.getByRole("checkbox", { name: /启用简要会议模式/ }).check();
  await advanced.getByLabel("联网搜索地区").selectOption("us");
  await advanced.getByLabel("搜索强度").selectOption("deep");
  await advanced.getByLabel("搜索驱动模型").selectOption("gpt-mock");
  await advanced.getByLabel("第三阶段总结模型").selectOption("gpt-mock");
  await advanced.getByRole("checkbox", { name: /启用资料文件/ }).check();
  await advanced.locator('input[type="file"]').setInputFiles({
    name: "pilot-notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Pilot scope, owner, baseline metrics, and rollback threshold."),
  });
  await expect(advanced.getByText(/已导入 1 个资料文件/)).toBeVisible();

  await page.getByRole("button", { name: "开始圆桌会议" }).click();
  await expect(page.getByRole("heading", { name: "决策简报" })).toBeVisible();
  await expect(page.getByText("暂定建议")).toBeVisible();
  await expect(page.getByText("低置信度")).toBeVisible();
  await expect(page.getByText("联网资料质量较低，缺少可靠的长期效果数据。")).toBeVisible();
  await expect(page.getByText("若激活率低于基线，则停止试点并重新评估。")).toBeVisible();
  await expect(page.getByText("明确建议")).toHaveCount(0);
  await expect(page.getByText("高置信度")).toHaveCount(0);

  expect(postedBody).toMatchObject({
    isBriefMode: true,
    participantIds: ["gpt-mock", "claude-mock", "gemini-mock", "deepseek-mock"],
    question: topic,
    searchDriverParticipantId: "gpt-mock",
    searchMode: "deep",
    searchPreferences: { searchRegion: "us", searchIntensity: "deep" },
    summaryParticipantId: "gpt-mock",
    webSearchEnabled: true,
  });
  expect(postedBody?.evidencePack).toMatchObject({ enabled: true });

  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath("degraded-full-page.png"),
  });
});
