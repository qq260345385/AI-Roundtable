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
      title: "资料 1",
      snippet: "摘要 1",
    },
    {
      id: "S2",
      title: "资料 2",
      snippet: "摘要 2",
    },
  ],
};

describe("extractCitationIds", () => {
  test("extracts a single citation id", () => {
    expect(extractCitationIds("根据 [S1] 可以看到。")).toEqual(["S1"]);
  });

  test("extracts multiple citation ids", () => {
    expect(extractCitationIds("参考 [S1] 和 [S2]。")).toEqual(["S1", "S2"]);
  });

  test("deduplicates citation ids while preserving first-use order", () => {
    expect(extractCitationIds("[S1] 重复 [S1]，再看 [S2]。")).toEqual([
      "S1",
      "S2",
    ]);
  });
});

describe("checkEvidenceCitations", () => {
  test("recognizes valid citations", () => {
    const result = checkEvidenceCitations("根据 [S1] 可以得出。", evidencePack);

    expect(result.validCitationIds).toEqual(["S1", "S2"]);
    expect(result.usedCitationIds).toEqual(["S1"]);
    expect(result.invalidCitationIds).toEqual([]);
    expect(result.hasInvalidCitations).toBe(false);
  });

  test("recognizes invalid citations", () => {
    const result = checkEvidenceCitations("根据 [S9] 可以得出。", evidencePack);

    expect(result.invalidCitationIds).toEqual(["S9"]);
    expect(result.hasInvalidCitations).toBe(true);
  });

  test("recognizes evidence items that were not cited", () => {
    const result = checkEvidenceCitations("只引用 [S1]。", evidencePack);

    expect(result.missingCitationIds).toEqual(["S2"]);
  });

  test("does not crash without an enabled evidence pack", () => {
    const result = checkEvidenceCitations("仍然能提取 [S9]。");

    expect(result.validCitationIds).toEqual([]);
    expect(result.usedCitationIds).toEqual(["S9"]);
    expect(result.missingCitationIds).toEqual([]);
    expect(result.invalidCitationIds).toEqual(["S9"]);
    expect(result.hasInvalidCitations).toBe(true);
  });
});
