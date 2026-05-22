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
          sourceType: "official",
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
          sourceType: "community",
          reliability: "low",
          score: 35,
          citationLevel: "context_only",
          citationGuidance: "Use only as community context.",
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
});
