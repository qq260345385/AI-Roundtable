import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const searchDir = join(process.cwd(), "src/lib/search");

function readSearchFile(fileName: string) {
  return readFileSync(join(searchDir, fileName), "utf8");
}

describe("model-driven search architecture", () => {
  test("keeps the public entrypoint focused on orchestration", () => {
    const source = readSearchFile("model-driven-web-search.ts");
    const lineCount = source.split(/\r?\n/).length;

    expect(lineCount).toBeLessThanOrEqual(1600);
    expect(source).not.toContain("function evaluateSearchQueryQuality");
    expect(source).not.toContain("function buildTopicAnalysisFallbackSearchPasses");
    expect(source).not.toContain("function extractReadableTextFromHtml");
  });

  test("keeps search internals split by responsibility", () => {
    expect(readSearchFile("search-query-planning.ts")).toContain(
      "buildSearchPasses",
    );
    expect(readSearchFile("search-pass-runner.ts")).toContain(
      "searchWithConfiguredProvider",
    );
    expect(readSearchFile("search-fallbacks.ts")).toContain(
      "buildTopicAnalysisFallbackSearchPasses",
    );
    expect(readSearchFile("search-debug-summary.ts")).toContain(
      "getQualityDistribution",
    );
  });
});
