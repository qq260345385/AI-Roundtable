import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  expect,
  test,
} from "vitest";

const FORBIDDEN_FIXED_OBJECTS =
  /OpenAI|Anthropic|Claude|GPT|DeepSeek|Gemini|Llama|Qwen|Grok|笑到最后|哪个会赢|谁会赢|AI公司|AI 公司/;
const FORBIDDEN_DOMAIN_INPUTS =
  /sourceType|hostname|\burl\b|openai\.com|anthropic\.com|community\.openai|docs\.anthropic|platform\.openai|forum\.anthropic/;

describe("topic and evidence rules", () => {
  test("do not hard-code fixed companies models or sample phrases in topic rules", () => {
    const checkedRules = [
      readFunctionBody("src/lib/search/evidence-pack.ts", "classifyEvidenceTopic"),
      readFunctionBody(
        "src/lib/search/evidence-pack.ts",
        "getEntityCompetitionRelevanceScore",
      ),
      readFunctionBody(
        "src/lib/search/evidence-pack.ts",
        "getEntityCompetitionRelevanceReason",
      ),
      readFunctionBody("src/lib/search/search-query-planning.ts", "buildSearchPasses"),
      readFunctionBody(
        "src/lib/search/search-query-planning.ts",
        "buildEntityCompetitionSearchPasses",
      ),
      readFunctionBody(
        "src/lib/search/search-query-planning.ts",
        "buildLocalizedMediaPasses",
      ),
      readFunctionBody(
        "src/lib/search/search-query-planning.ts",
        "getFreshnessTerms",
      ),
      readFunctionBody(
        "src/lib/search/search-query-planning.ts",
        "buildEntityCompetitionSearchPasses",
      ),
    ].join("\n");

    expect(checkedRules).not.toMatch(FORBIDDEN_FIXED_OBJECTS);
  });

  test("does not use domain or source type inside topic relevance or coverage rules", () => {
    const relevanceAndCoverageRules = [
      readFunctionBody("src/lib/search/evidence-pack.ts", "analyzeEvidenceTopicCoverage"),
      readFunctionBody("src/lib/search/evidence-pack.ts", "classifyEvidenceTopic"),
      readFunctionBody("src/lib/search/evidence-pack.ts", "detectCoverageDimension"),
      readFunctionBody(
        "src/lib/search/evidence-pack.ts",
        "getEntityCompetitionRelevanceScore",
      ),
    ].join("\n");

    expect(relevanceAndCoverageRules).not.toMatch(FORBIDDEN_DOMAIN_INPUTS);
  });
});

function readFunctionBody(relativePath: string, functionName: string): string {
  const source = readFileSync(join(process.cwd(), relativePath), "utf8");
  const startPattern = new RegExp(
    `(?:export\\s+)?function\\s+${functionName}\\s*\\(`,
  );
  const startMatch = startPattern.exec(source);

  if (!startMatch) {
    throw new Error(`Function not found: ${functionName}`);
  }

  const start = startMatch.index;
  const nextFunction = source
    .slice(start + startMatch[0].length)
    .search(/\n(?:export\s+)?function\s+\w+\s*\(/);

  if (nextFunction < 0) {
    return source.slice(start);
  }

  return source.slice(start, start + startMatch[0].length + nextFunction);
}
