import { describe, expect, test } from "vitest";
import type { EvidencePack } from "../search/evidence-pack";
import type { DecisionBrief, MeetingSummary, MeetingTurn } from "../types";
import {
  collectMeetingCitationText,
  finalizeMeetingSummary,
} from "./summary-finalization";

function createDecisionBrief(
  overrides: Partial<DecisionBrief> = {},
): DecisionBrief {
  return {
    recommendation: "依据现有讨论先进行试点。",
    status: "firm",
    rationale: ["试点可以验证关键假设。"],
    conditions: ["预算受控。"],
    risks: ["样本有限。"],
    confidence: "high",
    evidenceGaps: [],
    reversalConditions: ["若指标低于基线则停止。"],
    nextAction: "今天指定负责人。",
    ...overrides,
  };
}

function createSummary(
  decisionBrief = createDecisionBrief(),
): MeetingSummary {
  return {
    consensus: ["试点方向可行。"],
    differences: [],
    minorityViews: [],
    risks: ["样本有限。"],
    nextSteps: ["今天指定负责人。"],
    decisionBrief,
  };
}

function createEvidencePack(): EvidencePack {
  return {
    enabled: true,
    evidenceStatus: "high",
    items: [
      {
        id: "S1",
        title: "Official pilot report",
        source: "example.com",
        url: "https://example.com/report",
        snippet: "Pilot results",
        quality: {
          textLength: 500,
          wasTruncated: false,
          warnings: [],
          sourceType: "official_docs",
          reliability: "high",
          score: 90,
          citationLevel: "fact",
        },
      },
    ],
  };
}

describe("finalizeMeetingSummary", () => {
  test("checks decision-brief citations before applying the decision gate", () => {
    const result = finalizeMeetingSummary({
      summary: createSummary(
        createDecisionBrief({
          recommendation: "依据 [S9] 先进行试点。",
        }),
      ),
      turns: [],
      evidencePack: createEvidencePack(),
      failures: [],
      insufficientParticipants: false,
    });

    expect(result.citationCheck.invalidCitationIds).toContain("S9");
    expect(result.summary.decisionBrief).toMatchObject({
      status: "tentative",
      confidence: "low",
    });
  });

  test("includes every decision section in canonical citation text", () => {
    const summary = createSummary(
      createDecisionBrief({
        conditions: ["满足资料 [S1] 的适用条件。"],
      }),
    );
    const turns: MeetingTurn[] = [
      {
        id: "independent-a",
        phaseId: "independent",
        speakerName: "A",
        provider: "Provider",
        model: "model-a",
        content: "发言内容。",
      },
    ];

    const text = collectMeetingCitationText(turns, summary);
    const result = finalizeMeetingSummary({
      summary,
      turns,
      evidencePack: createEvidencePack(),
      failures: [],
      insufficientParticipants: false,
    });

    expect(text).toContain("发言内容。");
    expect(text).toContain(summary.decisionBrief?.recommendation);
    expect(text).toContain(summary.decisionBrief?.nextAction);
    expect(result.citationCheck.usedCitationIds).toContain("S1");
  });

  test("normalizes a legacy summary before returning it", () => {
    const legacy = createSummary();
    delete legacy.decisionBrief;

    const result = finalizeMeetingSummary({
      summary: legacy,
      turns: [],
      failures: [],
      insufficientParticipants: false,
    });

    expect(result.summary.decisionBrief).toMatchObject({
      recommendation: "试点方向可行。",
      status: "tentative",
      confidence: "low",
    });
  });

  test("forces an unavailable brief when participants are insufficient", () => {
    const result = finalizeMeetingSummary({
      summary: createSummary(),
      turns: [],
      failures: [],
      insufficientParticipants: true,
    });

    expect(result.summary.decisionBrief).toMatchObject({
      recommendation: "有效发言模型不足，无法形成可靠推荐。",
      status: "unavailable",
      confidence: "low",
    });
  });
});
