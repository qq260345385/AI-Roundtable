import { describe, expect, test } from "vitest";
import type { EvidencePack } from "../search/evidence-pack";
import type { MeetingSummary } from "../types";
import { applyEvidenceQualityGateToSummary } from "./summary-quality-gate";

function createEvidencePack(): EvidencePack {
  return {
    enabled: true,
    items: [
      {
        id: "S1",
        title: "Official source",
        snippet: "Official evidence",
        quality: {
          warnings: [],
          textLength: 500,
          wasTruncated: false,
          sourceType: "official_statement",
          reliability: "high",
          score: 90,
          citationLevel: "fact",
          citationGuidance: "Can support factual claims.",
        },
      },
      {
        id: "S2",
        title: "Community discussion",
        snippet: "Community evidence",
        quality: {
          warnings: [],
          textLength: 500,
          wasTruncated: false,
          sourceType: "social_forum",
          reliability: "low",
          score: 35,
          citationLevel: "context_only",
          citationGuidance: "Use only as community context.",
        },
      },
    ],
  };
}

function createLowOnlyEvidencePack(): EvidencePack {
  return {
    enabled: true,
    evidenceStatus: "low",
    items: [
      {
        id: "S1",
        title: "Low quality discussion",
        snippet: "Community discussion only.",
        quality: {
          warnings: [],
          textLength: 120,
          wasTruncated: false,
          sourceType: "social_forum",
          reliability: "low",
          score: 30,
          citationLevel: "context_only",
          citationGuidance: "Use only as context.",
        },
      },
    ],
  };
}

describe("applyEvidenceQualityGateToSummary", () => {
  test("moves low-evidence citations out of confirmable facts", () => {
    const summary: MeetingSummary = {
      consensus: ["Consensus stays because it does not cite weak evidence."],
      differences: [],
      minorityViews: [],
      confirmableFacts: [
        "Official fact [S1]",
        "Community-only claim [S2]",
      ],
      insufficientlyConfirmed: ["Existing caveat"],
      risks: [],
      nextSteps: [],
    };

    const gated = applyEvidenceQualityGateToSummary(summary, createEvidencePack());

    expect(gated.confirmableFacts).toEqual(["Official fact [S1]"]);
    expect(gated.insufficientlyConfirmed).toEqual(
      expect.arrayContaining([
        "Existing caveat",
        expect.stringContaining("Community-only claim [S2]"),
      ]),
    );
  });

  test("deduplicates low-confidence hypotheses from insufficiently confirmed issues", () => {
    const summary: MeetingSummary = {
      consensus: [],
      differences: [],
      minorityViews: [],
      confirmableFacts: [],
      initialHypotheses: [
        "The product may have launched in May, but available evidence is weak.",
        "A separate product-market angle still needs checking.",
      ],
      insufficientlyConfirmed: [
        "The product may have launched in May, but available evidence is weak.",
        "Exact launch date cannot be confirmed.",
      ],
      risks: [],
      nextSteps: [],
    };

    const gated = applyEvidenceQualityGateToSummary(summary, createEvidencePack());

    expect(gated.initialHypotheses).toEqual([
      "The product may have launched in May, but available evidence is weak.",
      "A separate product-market angle still needs checking.",
    ]);
    expect(gated.insufficientlyConfirmed).toEqual([
      "Exact launch date cannot be confirmed.",
    ]);
  });

  test("downgrades specific money claims from weak or snippet-only evidence", () => {
    const summary: MeetingSummary = {
      consensus: ["OpenAI raised $10 billion according to [S2]."],
      differences: [],
      minorityViews: [],
      confirmableFacts: ["Anthropic valuation reached $60 billion [S2]."],
      initialHypotheses: [],
      insufficientlyConfirmed: [],
      risks: [],
      nextSteps: [],
    };

    const gated = applyEvidenceQualityGateToSummary(summary, createEvidencePack());

    expect(gated.consensus).toEqual([]);
    expect(gated.confirmableFacts).toEqual([]);
    expect(gated.insufficientlyConfirmed ?? []).toEqual(
      expect.arrayContaining([
        expect.stringContaining("OpenAI raised $10 billion"),
        expect.stringContaining("Anthropic valuation reached $60 billion [S2]"),
      ]),
    );
  });

  test("does not repeat the empty-confirmable-facts sentence in insufficient items", () => {
    const summary: MeetingSummary = {
      consensus: [],
      differences: [],
      minorityViews: [],
      confirmableFacts: ["无。当前资料不足以确认关键事实。"],
      initialHypotheses: ["多数模型认为该融资传闻需要继续核验。"],
      insufficientlyConfirmed: [
        "无。当前资料不足以确认关键事实。",
        "多数模型认为该融资传闻需要继续核验。",
      ],
      risks: [],
      nextSteps: [],
    };

    const gated = applyEvidenceQualityGateToSummary(summary, createEvidencePack());

    expect(gated.confirmableFacts).toEqual(["无。当前资料不足以确认关键事实。"]);
    expect(gated.initialHypotheses).toEqual([
      "多数模型认为该融资传闻需要继续核验。",
    ]);
    expect(gated.insufficientlyConfirmed).toEqual([]);
  });

  test("keeps discussion consensus in low-evidence mode with an explicit verification marker", () => {
    const summary: MeetingSummary = {
      consensus: [
        "Multiple participants agree the product is competitive in office workflows.",
      ],
      differences: [
        "当前资料不足以确认市场份额。",
        "Some participants emphasize office workflows while others emphasize coding assistance.",
      ],
      minorityViews: [],
      confirmableFacts: [],
      initialHypotheses: [],
      insufficientlyConfirmed: [],
      risks: [],
      nextSteps: [],
    };

    const gated = applyEvidenceQualityGateToSummary(summary, createLowOnlyEvidencePack());

    expect(gated.consensus).toEqual([
      expect.stringContaining("主要来自模型推理，需资料验证"),
    ]);
    expect(gated.consensus[0]).toContain("Multiple participants agree");
    expect(gated.differences).toEqual([
      "Some participants emphasize office workflows while others emphasize coding assistance.",
    ]);
    expect(gated.insufficientlyConfirmed ?? []).toEqual(
      expect.arrayContaining(["当前资料不足以确认市场份额。"]),
    );
  });
});
