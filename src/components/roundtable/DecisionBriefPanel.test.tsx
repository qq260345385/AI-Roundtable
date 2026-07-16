import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { getUiText } from "@/lib/i18n/ui-text";
import type { DecisionBrief } from "@/lib/types";
import { DecisionBriefPanel } from "./DecisionBriefPanel";

const brief: DecisionBrief = {
  recommendation: "先进行一个可逆的两周试点。",
  status: "tentative",
  rationale: ["成本可控", "能够快速收集真实反馈"],
  conditions: ["指定一名负责人"],
  risks: ["样本量可能不足"],
  confidence: "medium",
  evidenceGaps: ["缺少长期留存数据"],
  reversalConditions: ["试点导致关键指标明显下降"],
  nextAction: "今天确认试点负责人和衡量指标。",
};

const summary = {
  consensus: [],
  differences: [],
  minorityViews: [],
  risks: [],
  nextSteps: [],
  decisionBrief: brief,
};

describe("DecisionBriefPanel", () => {
  test("puts the recommendation and decision state first", () => {
    const html = renderToStaticMarkup(
      <DecisionBriefPanel summary={summary} text={getUiText("zh")} />,
    );

    expect(html).toContain("决策简报");
    expect(html).toContain("暂定建议");
    expect(html).toContain("中置信度");
    expect(html).toContain(brief.recommendation);
    expect(html.indexOf(brief.recommendation)).toBeLessThan(
      html.indexOf("核心理由"),
    );
  });

  test("keeps every decision field visible even when a list is empty", () => {
    const html = renderToStaticMarkup(
      <DecisionBriefPanel
        summary={{ ...summary, decisionBrief: { ...brief, conditions: [], evidenceGaps: [] } }}
        text={getUiText("zh")}
      />,
    );

    expect(html).toContain("成立条件");
    expect(html).toContain("缺失证据");
    expect(html).toContain("本轮未识别到额外项目。");
    expect(html).toContain("推翻条件");
    expect(html).toContain("下一步行动");
  });

  test("renders a firm recommendation state", () => {
    const html = renderToStaticMarkup(
      <DecisionBriefPanel
        summary={{ ...summary, decisionBrief: { ...brief, status: "firm", confidence: "high" } }}
        text={getUiText("zh")}
      />,
    );

    expect(html).toContain("明确建议");
    expect(html).toContain("高置信度");
  });

  test("renders an unavailable recommendation state without hiding the rationale", () => {
    const html = renderToStaticMarkup(
      <DecisionBriefPanel
        summary={{ ...summary, decisionBrief: { ...brief, status: "unavailable", confidence: "low" } }}
        text={getUiText("zh")}
      />,
    );

    expect(html).toContain("暂不可用");
    expect(html).toContain("低置信度");
    expect(html).toContain("成本可控");
  });

  test("renders the same decision hierarchy in English", () => {
    const html = renderToStaticMarkup(
      <DecisionBriefPanel summary={summary} text={getUiText("en")} />,
    );

    expect(html).toContain("Decision Brief");
    expect(html).toContain("Tentative recommendation");
    expect(html).toContain("Medium confidence");
    expect(html).toContain("Next action");
  });
});
