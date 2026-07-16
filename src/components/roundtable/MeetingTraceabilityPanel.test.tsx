import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { getUiText } from "@/lib/i18n/ui-text";
import type { MeetingResult } from "@/lib/types";
import { MeetingTraceabilityPanel } from "./MeetingTraceabilityPanel";

describe("MeetingTraceabilityPanel", () => {
  test("retains recap, search, evidence, citation, and failure details", () => {
    const meeting: MeetingResult = {
      topic: "是否上线新流程",
      meetingStatus: "degraded",
      warnings: ["一个模型未完成回应。"],
      phases: [],
      summary: {
        consensus: ["先试点。"],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      searchSummary: {
        enabled: true,
        status: "failed",
        evidenceMode: "search_failed",
        totalReferences: 0,
        strongCount: 0,
        mediumCount: 0,
        weakCount: 0,
        hasRealtimeWarning: true,
        userMessage: "Web search failed. Failure type: Missing API key.",
      },
      evidencePack: { enabled: false, evidenceStatus: "none", items: [] },
      hasPartialFailures: true,
      failures: [
        {
          providerId: "beta",
          providerName: "BetaAI",
          model: "beta-large",
          stage: "response",
          message: "Provider unavailable",
        },
      ],
    };

    const html = renderToStaticMarkup(
      <MeetingTraceabilityPanel meeting={meeting} text={getUiText("zh")} />,
    );

    expect(html).toContain("会议已降级");
    expect(html).toContain("会议复盘总览");
    expect(html).toContain("联网搜索过程");
    expect(html).toContain("事实核验状态");
    expect(html).toContain("部分模型调用失败");
  });

  test("keeps developer search records hidden unless debug data is present", () => {
    const meeting: MeetingResult = {
      topic: "AI model benchmark",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      searchSummary: {
        enabled: true,
        status: "low_evidence",
        evidenceMode: "low_evidence",
        totalReferences: 1,
        strongCount: 0,
        mediumCount: 0,
        weakCount: 1,
        hasRealtimeWarning: true,
        userMessage: "Web search completed.",
      },
      evidencePack: {
        enabled: true,
        evidenceStatus: "low",
        items: [],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingTraceabilityPanel meeting={meeting} text={getUiText("en")} />,
    );

    expect(html).toContain("Web Search Process");
    expect(html).toContain("1 weaker");
    expect(html).toContain("manual verification");
    expect(html).not.toContain("Developer search details");
  });

  test("retains fact-hygiene and citation warnings", () => {
    const meeting: MeetingResult = {
      topic: "Current factual topic",
      isTimeSensitive: true,
      factCheckNotice: "请人工核验实时事实。",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      evidencePack: {
        enabled: true,
        evidenceStatus: "medium",
        items: [],
      },
      citationCheck: {
        hasInvalidCitations: true,
        invalidCitationIds: ["S9"],
        missingCitationIds: ["S9"],
        usedCitationIds: ["S9"],
        validCitationIds: [],
        hasCitationDisciplineWarning: false,
      },
    };

    const html = renderToStaticMarkup(
      <MeetingTraceabilityPanel meeting={meeting} text={getUiText("zh")} />,
    );

    expect(html).toContain("事实核验提示");
    expect(html).toContain("请人工核验实时事实。");
    expect(html).toContain("引用检查");
    expect(html).toContain("S9");
  });

  test("does not render tokens, stack traces, or local paths from provider failures", () => {
    const meeting: MeetingResult = {
      topic: "Sensitive failure",
      phases: [],
      summary: {
        consensus: [], differences: [], minorityViews: [], risks: [], nextSteps: [],
      },
      hasPartialFailures: true,
      failures: [{
        providerId: "alpha",
        providerName: "AlphaAI",
        model: "alpha-large",
        stage: "independent",
        message: "sk-live-abc123\nError: failed\n at C:\\Users\\secret\\provider.ts:10:2",
      }],
    };

    const html = renderToStaticMarkup(
      <MeetingTraceabilityPanel meeting={meeting} text={getUiText("zh")} />,
    );

    expect(html).toContain("错误详情已隐藏");
    expect(html).not.toContain("sk-live-abc123");
    expect(html).not.toContain("provider.ts");
    expect(html).not.toContain("Users");
  });

  test("does not render prefixed raw provider response bodies", () => {
    const rawBody = 'Request failed: {"error":"bad","api_key":"AIza-live-value"}';
    const meeting: MeetingResult = {
      topic: "Sensitive response body",
      phases: [],
      summary: {
        consensus: [], differences: [], minorityViews: [], risks: [], nextSteps: [],
      },
      hasPartialFailures: true,
      failures: [{
        providerId: "alpha",
        providerName: "AlphaAI",
        model: "alpha-large",
        stage: "independent",
        message: rawBody,
      }],
    };

    const html = renderToStaticMarkup(
      <MeetingTraceabilityPanel meeting={meeting} text={getUiText("zh")} />,
    );

    expect(html).toContain("Provider 请求失败，错误详情已隐藏。");
    expect(html).not.toContain("AIza-live-value");
    expect(html).not.toContain("api_key");
    expect(html).not.toContain(rawBody);
  });
});
