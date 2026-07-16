import { describe, expect, test } from "vitest";
import type { EvidencePack } from "../search/evidence-pack";
import type {
  DecisionBrief,
  MeetingProviderFailure,
  MeetingSummary,
} from "../types";
import {
  applyDecisionBriefQualityGate,
  createEmptyDecisionBrief,
  DECISION_BRIEF_LIMITS,
  normalizeDecisionBrief,
} from "./decision-brief";

function createSummary(
  overrides: Partial<MeetingSummary> = {},
): MeetingSummary {
  return {
    consensus: ["先进行两周小规模试点。"],
    differences: ["成本上限仍有分歧。"],
    minorityViews: [],
    risks: ["样本量有限。"],
    nextSteps: ["指定负责人并启动试点。"],
    ...overrides,
  };
}

function createDecisionBrief(
  overrides: Partial<DecisionBrief> = {},
): DecisionBrief {
  return {
    recommendation: "先启动两周试点，再决定是否全面采购。",
    status: "firm",
    rationale: ["试点能以较低成本验证关键假设。"],
    conditions: ["预算不超过既定上限。"],
    risks: ["供应商锁定。"],
    confidence: "high",
    evidenceGaps: [],
    reversalConditions: ["若核心指标低于基线则停止采购。"],
    nextAction: "今天指定试点负责人。",
    ...overrides,
  };
}

function createLowEvidencePack(): EvidencePack {
  return {
    enabled: true,
    evidenceStatus: "low",
    items: [],
  };
}

describe("normalizeDecisionBrief", () => {
  test("preserves a complete legal decision brief", () => {
    const decisionBrief = createDecisionBrief();

    const result = normalizeDecisionBrief(createSummary({ decisionBrief }));

    expect(result).toEqual(decisionBrief);
  });

  test("converts a legacy summary into a tentative low-confidence view", () => {
    const brief = normalizeDecisionBrief(createSummary());

    expect(brief).toMatchObject({
      recommendation: "先进行两周小规模试点。",
      status: "tentative",
      confidence: "low",
      nextAction: "指定负责人并启动试点。",
    });
    expect(brief.rationale).toEqual(["先进行两周小规模试点。"]);
    expect(brief.risks).toEqual([
      "成本上限仍有分歧。",
      "样本量有限。",
    ]);
    expect(brief.reversalConditions).not.toHaveLength(0);
  });

  test("cleans, deduplicates, truncates, and limits untrusted fields", () => {
    const repeated = `  ${"理".repeat(DECISION_BRIEF_LIMITS.item + 10)}  `;
    const dirty = {
      ...createDecisionBrief(),
      recommendation: `  ${"建".repeat(
        DECISION_BRIEF_LIMITS.recommendation + 10,
      )}  `,
      rationale: [repeated, repeated, "第二条", "第三条", "第四条", "第五条", "第六条"],
      conditions: ["  条件一  ", "", "条件一"],
      nextAction: `  ${"行".repeat(DECISION_BRIEF_LIMITS.nextAction + 10)}  `,
    } as unknown as DecisionBrief;

    const result = normalizeDecisionBrief(
      createSummary({ decisionBrief: dirty }),
    );

    expect(result.recommendation).toHaveLength(
      DECISION_BRIEF_LIMITS.recommendation,
    );
    expect(result.rationale).toHaveLength(DECISION_BRIEF_LIMITS.list);
    expect(result.rationale[0]).toHaveLength(DECISION_BRIEF_LIMITS.item);
    expect(result.conditions).toEqual(["条件一"]);
    expect(result.nextAction).toHaveLength(DECISION_BRIEF_LIMITS.nextAction);
  });

  test("downgrades structurally present but semantically dirty briefs", () => {
    const dirty = {
      recommendation: "   ",
      status: "firm",
      rationale: [42],
      conditions: [],
      risks: [],
      confidence: "high",
      evidenceGaps: [],
      reversalConditions: [],
      nextAction: "   ",
    } as unknown as DecisionBrief;

    const result = normalizeDecisionBrief(
      createSummary({ decisionBrief: dirty }),
    );

    expect(result).toMatchObject({
      recommendation: "先进行两周小规模试点。",
      status: "tentative",
      confidence: "low",
      nextAction: "指定负责人并启动试点。",
    });
  });

  test("returns a legal unavailable view for a completely empty summary", () => {
    const result = normalizeDecisionBrief(
      createSummary({
        consensus: [],
        differences: [],
        risks: [],
        nextSteps: [],
      }),
    );

    expect(result).toMatchObject({
      recommendation: "本轮未形成可执行推荐。",
      status: "unavailable",
      confidence: "low",
      nextAction: "补充关键资料后重新开会。",
    });
  });

  test("creates a legal empty placeholder for streaming state", () => {
    expect(createEmptyDecisionBrief()).toEqual({
      recommendation: "会议总结尚未生成。",
      status: "unavailable",
      rationale: [],
      conditions: [],
      risks: [],
      confidence: "low",
      evidenceGaps: [],
      reversalConditions: [],
      nextAction: "等待会议总结完成。",
    });
  });
});

describe("applyDecisionBriefQualityGate", () => {
  test("downgrades low evidence and records a user-readable gap", () => {
    const result = applyDecisionBriefQualityGate(
      createDecisionBrief(),
      createSummary({ decisionBrief: createDecisionBrief() }),
      { evidencePack: createLowEvidencePack() },
    );

    expect(result.status).toBe("tentative");
    expect(result.confidence).toBe("low");
    expect(result.evidenceGaps).toContain(
      "当前核心证据不足，主要事实仍需补充可靠资料核验。",
    );
  });

  test("keeps gate-generated gaps when the provider list is already full", () => {
    const providerGaps = ["缺口一", "缺口二", "缺口三", "缺口四", "缺口五"];
    const brief = createDecisionBrief({ evidenceGaps: providerGaps });

    const result = applyDecisionBriefQualityGate(
      brief,
      createSummary({ decisionBrief: brief }),
      { evidencePack: createLowEvidencePack() },
    );

    expect(result.evidenceGaps).toContain(
      "当前核心证据不足，主要事实仍需补充可靠资料核验。",
    );
    expect(result.evidenceGaps).toHaveLength(DECISION_BRIEF_LIMITS.list);
  });

  test("downgrades invalid citations without copying internal details", () => {
    const result = applyDecisionBriefQualityGate(
      createDecisionBrief(),
      createSummary({ decisionBrief: createDecisionBrief() }),
      {
        citationCheck: {
          validCitationIds: ["S1"],
          usedCitationIds: ["S9"],
          missingCitationIds: [],
          invalidCitationIds: ["S9"],
          hasInvalidCitations: true,
        },
      },
    );

    expect(result.status).toBe("tentative");
    expect(result.confidence).toBe("low");
    expect(result.evidenceGaps.join(" ")).toContain("引用");
    expect(result.evidenceGaps.join(" ")).not.toContain("S9");
  });

  test("downgrades partial provider failures without leaking messages", () => {
    const failures: MeetingProviderFailure[] = [
      {
        providerId: "provider-a",
        providerName: "Provider A",
        model: "model-a",
        stage: "response",
        errorType: "api_error",
        message: "Bearer secret-token internal stack",
        responseBodySummary: "Authorization: secret response body",
      },
    ];

    const result = applyDecisionBriefQualityGate(
      createDecisionBrief(),
      createSummary({ decisionBrief: createDecisionBrief() }),
      { failures },
    );

    expect(result.status).toBe("tentative");
    expect(result.confidence).toBe("low");
    expect(result.evidenceGaps.join(" ")).toContain("部分参会模型未完成发言");
    expect(JSON.stringify(result)).not.toMatch(/Bearer|Authorization|secret-token/);
  });

  test("downgrades severe disagreement and adds an observable reversal condition", () => {
    const summary = createSummary({
      consensus: [],
      differences: ["方案 A 更快。", "方案 B 风险更低。"],
      decisionBrief: createDecisionBrief(),
    });

    const result = applyDecisionBriefQualityGate(
      createDecisionBrief(),
      summary,
      {},
    );

    expect(result.status).toBe("tentative");
    expect(result.confidence).toBe("low");
    expect(result.reversalConditions).toContain(
      "若主要分歧无法通过试点指标消解，应重新评估推荐。",
    );
  });

  test("forces unavailable when valid participants are insufficient", () => {
    const result = applyDecisionBriefQualityGate(
      createDecisionBrief(),
      createSummary({ decisionBrief: createDecisionBrief() }),
      { insufficientParticipants: true },
    );

    expect(result).toMatchObject({
      recommendation: "有效发言模型不足，无法形成可靠推荐。",
      status: "unavailable",
      confidence: "low",
      nextAction: "检查模型配置后重新开会。",
    });
  });
});
