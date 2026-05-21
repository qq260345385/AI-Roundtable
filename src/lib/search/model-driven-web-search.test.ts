import { describe, expect, test } from "vitest";
import type { ModelParticipant, ModelProvider } from "../types";
import { buildModelDrivenWebEvidencePack } from "./model-driven-web-search";

const participant: ModelParticipant = {
  id: "deepseek-flash",
  name: "DeepSeek Flash",
  provider: "DeepSeek",
  model: "deepseek-v4-flash",
  status: "available",
  statusLabel: "available",
};

describe("buildModelDrivenWebEvidencePack", () => {
  test("uses participant-planned search queries before calling web search", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchQueries() {
        return [
          "DeepSeek V3 benchmark Artificial Analysis",
          "DeepSeek official technical report",
        ];
      },
      async generateIndependentView() {
        return "";
      },
      async generateResponse() {
        return "";
      },
      async generateSummary() {
        return {
          consensus: [],
          differences: [],
          minorityViews: [],
          risks: [],
          nextSteps: [],
        };
      },
    };
    const searchedQueries: string[] = [];

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "目前 DeepSeek 在全球 AI 大模型里面是什么实力",
      searcher: async (query) => {
        searchedQueries.push(query);

        return [
          {
            title: query,
            url: "https://artificialanalysis.ai/models/deepseek-v3",
            snippet: `Benchmark evidence for ${query}. ${"A".repeat(500)}`,
          },
        ];
      },
    });

    expect(searchedQueries).toEqual([
      "DeepSeek V3 benchmark Artificial Analysis",
      "DeepSeek official technical report",
    ]);
    expect(pack.enabled).toBe(true);
    expect(pack.searchQueries).toEqual(searchedQueries);
    expect(pack.items[0].id).toBe("S1");
  });

  test("returns none status instead of throwing when web search has no results", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchQueries() {
        return ["no result query"];
      },
      async generateIndependentView() {
        return "";
      },
      async generateResponse() {
        return "";
      },
      async generateSummary() {
        return {
          consensus: [],
          differences: [],
          minorityViews: [],
          risks: [],
          nextSteps: [],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "unknown topic",
      searcher: async () => [],
    });

    expect(pack.enabled).toBe(false);
    expect(pack.evidenceStatus).toBe("none");
    expect(pack.evidenceWarnings).toEqual(
      expect.arrayContaining([
        "未找到可用联网资料，本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。",
      ]),
    );
  });
});
