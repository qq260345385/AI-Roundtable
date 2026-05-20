import { describe, expect, test } from "vitest";
import {
  FACT_HYGIENE_NOTICE,
  detectTimeSensitiveTopic,
  shouldShowFactHygieneNotice,
} from "./fact-hygiene";

describe("fact hygiene", () => {
  test("detects topics that ask for current information", () => {
    expect(detectTimeSensitiveTopic("现在最强的开源大模型是谁？")).toBe(true);
    expect(detectTimeSensitiveTopic("2026 年最新 AI 排名和价格")).toBe(true);
    expect(detectTimeSensitiveTopic("DeepSeek V4 发布了吗？")).toBe(true);
  });

  test("does not mark ordinary reasoning topics as time sensitive", () => {
    expect(detectTimeSensitiveTopic("如何设计用户反馈流程？")).toBe(false);
    expect(detectTimeSensitiveTopic("讨论测试的本质和风险")).toBe(false);
  });

  test("keeps the user-facing notice explicit about no web access", () => {
    expect(FACT_HYGIENE_NOTICE).toContain("无法联网");
    expect(FACT_HYGIENE_NOTICE).toContain("人工核验");
  });

  test("hides the no-web notice when web search is enabled", () => {
    expect(
      shouldShowFactHygieneNotice("今天最新大模型排名怎么样？", false),
    ).toBe(true);
    expect(
      shouldShowFactHygieneNotice("今天最新大模型排名怎么样？", true),
    ).toBe(false);
  });
});
