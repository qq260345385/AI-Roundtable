import { describe, expect, test } from "vitest";
import {
  checkEvidenceCitations,
  extractCitationIds,
} from "./evidence-citations";
import type { EvidencePack } from "./evidence-pack";

const evidencePack: EvidencePack = {
  enabled: true,
  items: [
    {
      id: "S1",
      title: "Official source",
      snippet: "Official summary",
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
      snippet: "Community summary",
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

describe("extractCitationIds", () => {
  test("extracts a single citation id", () => {
    expect(extractCitationIds("According to [S1], this is known.")).toEqual([
      "S1",
    ]);
  });

  test("extracts multiple citation ids", () => {
    expect(extractCitationIds("See [S1] and [S2].")).toEqual(["S1", "S2"]);
  });

  test("deduplicates citation ids while preserving first-use order", () => {
    expect(extractCitationIds("[S1] repeats [S1], then [S2].")).toEqual([
      "S1",
      "S2",
    ]);
  });
});

describe("checkEvidenceCitations", () => {
  test("recognizes valid citations", () => {
    const result = checkEvidenceCitations("According to [S1].", evidencePack);

    expect(result.validCitationIds).toEqual(["S1", "S2"]);
    expect(result.usedCitationIds).toEqual(["S1"]);
    expect(result.invalidCitationIds).toEqual([]);
    expect(result.hasInvalidCitations).toBe(false);
    expect(result.hasWeakCitations).toBe(false);
  });

  test("recognizes invalid citations", () => {
    const result = checkEvidenceCitations("According to [S9].", evidencePack);

    expect(result.invalidCitationIds).toEqual(["S9"]);
    expect(result.hasInvalidCitations).toBe(true);
  });

  test("recognizes evidence items that were not cited", () => {
    const result = checkEvidenceCitations("Only cite [S1].", evidencePack);

    expect(result.missingCitationIds).toEqual(["S2"]);
  });

  test("flags context-only evidence citations without marking them invalid", () => {
    const result = checkEvidenceCitations("Community claim [S2].", evidencePack);

    expect(result.invalidCitationIds).toEqual([]);
    expect(result.hasInvalidCitations).toBe(false);
    expect(result.weakCitationIds).toEqual(["S2"]);
    expect(result.hasWeakCitations).toBe(true);
    expect(result.citationWarnings).toEqual([
      "S2 is context-only evidence and should not support factual claims.",
    ]);
  });

  test("does not crash without an enabled evidence pack", () => {
    const result = checkEvidenceCitations("Still extracts [S9].");

    expect(result.validCitationIds).toEqual([]);
    expect(result.usedCitationIds).toEqual(["S9"]);
    expect(result.missingCitationIds).toEqual([]);
    expect(result.invalidCitationIds).toEqual(["S9"]);
    expect(result.hasInvalidCitations).toBe(true);
  });
});
