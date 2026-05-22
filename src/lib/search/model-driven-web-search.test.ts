import { describe, expect, test } from "vitest";
import type { ModelParticipant, ModelProvider } from "../types";
import {
  buildModelDrivenWebEvidencePack,
  buildTavilySearchPlanFromIntents,
} from "./model-driven-web-search";
import type { SearchIntentRecord } from "./evidence-pack";
import type { SearchProvider } from "./search-provider";
import { TavilySearchError } from "./tavily-search";

const participant: ModelParticipant = {
  id: "deepseek-flash",
  name: "DeepSeek Flash",
  provider: "DeepSeek",
  model: "deepseek-v4-flash",
  status: "available",
  statusLabel: "available",
};

describe("buildModelDrivenWebEvidencePack", () => {
  test("converts structured SearchIntent to Tavily queries with generation reasons", () => {
    const records: SearchIntentRecord[] = [
      {
        participantId: "deepseek-flash",
        participantName: "DeepSeek Flash",
        provider: "DeepSeek",
        model: "deepseek-v4-flash",
        intents: [
          {
            question: "How does DeepSeek V3 perform on coding tasks?",
            mustInclude: ["DeepSeek V3"],
            shouldInclude: ["SWE-bench"],
            exclude: ["pricing"],
            freshness: "latest",
            sourcePreference: "benchmark",
            rationale: "Benchmarks reduce vague strength claims.",
          },
        ],
      },
    ];

    const plan = buildTavilySearchPlanFromIntents(
      "latest AI model benchmark ranking",
      records,
      { currentYear: 2026 },
    );

    expect(plan.queries).toHaveLength(1);
    expect(plan.queries[0]).toContain("DeepSeek V3");
    expect(plan.queries[0]).toContain("SWE-bench");
    expect(plan.queries[0]).toContain("2026");
    expect(plan.queries[0]).toContain("benchmark");
    expect(plan.queries[0]).toContain("leaderboard");
    expect(plan.queryPlans[0]).toEqual(
      expect.objectContaining({
        query: plan.queries[0],
        sourcePreference: "benchmark",
      }),
    );
    expect(plan.queryPlans[0].reason).toContain("benchmark");
    expect(plan.intentDecisions[0]).toEqual(
      expect.objectContaining({
        action: "used",
        question: "How does DeepSeek V3 perform on coding tasks?",
      }),
    );
  });

  test("merges duplicate SearchIntent queries and records the merge reason", () => {
    const records: SearchIntentRecord[] = [
      {
        participantId: "gpt",
        participantName: "GPT",
        provider: "OpenAI",
        model: "gpt-test",
        intents: [
          {
            question: "DeepSeek V3 benchmark leaderboard",
            mustInclude: ["DeepSeek V3"],
            shouldInclude: ["leaderboard"],
            exclude: [],
            freshness: "recent",
            sourcePreference: "benchmark",
            rationale: "Need ranking evidence.",
          },
        ],
      },
      {
        participantId: "claude",
        participantName: "Claude",
        provider: "Anthropic",
        model: "claude-test",
        intents: [
          {
            question: "DeepSeek V3 benchmark leaderboard",
            mustInclude: ["DeepSeek V3"],
            shouldInclude: ["leaderboard"],
            exclude: [],
            freshness: "recent",
            sourcePreference: "benchmark",
            rationale: "Same benchmark check from another model.",
          },
        ],
      },
    ];

    const plan = buildTavilySearchPlanFromIntents("AI benchmark", records, {
      currentYear: 2026,
    });

    expect(plan.queries).toHaveLength(1);
    expect(plan.intentDecisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "used" }),
        expect.objectContaining({
          action: "merged",
          reason: "duplicate_query",
          mergedInto: plan.queries[0],
        }),
      ]),
    );
  });

  test("discards vague or marketing-only SearchIntent records", () => {
    const records: SearchIntentRecord[] = [
      {
        participantId: "gpt",
        participantName: "GPT",
        provider: "OpenAI",
        model: "gpt-test",
        intents: [
          {
            question: "impact",
            mustInclude: [],
            shouldInclude: ["best", "ultimate"],
            exclude: [],
            freshness: "any",
            sourcePreference: "media",
            rationale: "Generic market framing.",
          },
        ],
      },
    ];

    const plan = buildTavilySearchPlanFromIntents("AI", records, {
      currentYear: 2026,
    });

    expect(plan.queries).toEqual([]);
    expect(plan.intentDecisions).toEqual([
      expect.objectContaining({
        action: "discarded",
        reason: "vague_intent",
      }),
    ]);
  });

  test("uses structured participant search intents before calling web search", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "How does DeepSeek V3 rank on benchmark leaderboards?",
            mustInclude: ["DeepSeek V3"],
            shouldInclude: ["Artificial Analysis"],
            exclude: [],
            freshness: "latest",
            sourcePreference: "benchmark",
            rationale: "Use public benchmark sources before strength claims.",
          },
          {
            question: "What does the official DeepSeek technical report say?",
            mustInclude: ["DeepSeek"],
            shouldInclude: ["technical report"],
            exclude: [],
            freshness: "recent",
            sourcePreference: "official",
            rationale: "Official sources help verify release details.",
          },
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

    expect(searchedQueries[0]).toContain("DeepSeek V3");
    expect(searchedQueries[0]).toContain("benchmark");
    expect(searchedQueries[1]).toContain("official");
    expect(pack.enabled).toBe(true);
    expect(pack.searchQueries).toEqual(searchedQueries);
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "normal",
        executedQueries: searchedQueries,
        searchIntents: [
          expect.objectContaining({
            participantId: "deepseek-flash",
            participantName: "DeepSeek Flash",
            intents: [
              expect.objectContaining({
                question: "How does DeepSeek V3 rank on benchmark leaderboards?",
                sourcePreference: "benchmark",
              }),
              expect.objectContaining({
                question: "What does the official DeepSeek technical report say?",
                sourcePreference: "official",
              }),
            ],
          }),
        ],
        queryPlans: [
          expect.objectContaining({
            query: searchedQueries[0],
            reason: expect.stringContaining("benchmark"),
          }),
          expect.objectContaining({
            query: searchedQueries[1],
            reason: expect.stringContaining("official"),
          }),
        ],
        intentDecisions: [
          expect.objectContaining({ action: "used" }),
          expect.objectContaining({ action: "used" }),
        ],
        qualityOverview: expect.objectContaining({
          includedCount: 1,
          filteredCount: 0,
        }),
      }),
    );
    expect(pack.searchProcess?.results[0]).toEqual(
      expect.objectContaining({
        includedInEvidencePack: true,
        filtered: false,
        query: searchedQueries[0],
        reliability: "medium",
        sourceType: "benchmark",
      }),
    );
    expect(pack.items[0].id).toBe("S1");
  });

  test("uses the SearchProvider interface for web searches", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Find official search provider evidence",
            mustInclude: ["search provider evidence"],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "official",
            rationale: "Exercise provider interface.",
          },
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
    const calls: string[] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        calls.push(request.query);

        return {
          provider: "test-search",
          diagnostics: { requestFreshness: request.freshness },
          results: [
            {
              title: "Provider result",
              url: "https://openai.com/provider-result",
              content: `Provider interface result. ${"A".repeat(500)}`,
              provider: "test-search",
              sourceQuery: request.query,
            },
          ],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic: "latest search provider architecture",
    });

    expect(calls).toHaveLength(1);
    expect(pack.items[0]).toEqual(
      expect.objectContaining({
        title: "Provider result",
        query: calls[0],
      }),
    );
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        provider: "test-search",
        providerDiagnostics: [
          expect.objectContaining({
            provider: "test-search",
            diagnostics: { requestFreshness: "latest" },
          }),
        ],
      }),
    );
  });

  test("returns none status instead of throwing when web search has no results", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Find a reliable source for no result query",
            mustInclude: ["no result query"],
            shouldInclude: [],
            exclude: [],
            freshness: "any",
            sourcePreference: "mixed",
            rationale: "Exercise empty Tavily result handling.",
          },
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

  test("returns search failed mode instead of throwing when Tavily fails", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Find official details for failing query",
            mustInclude: ["failing query"],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "official",
            rationale: "Failure should still show planned intent.",
          },
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

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI search failure",
      searcher: async () => {
        throw new TavilySearchError("Tavily search failed: unauthorized", {
          reason: "unauthorized",
          status: 502,
        });
      },
    });

    expect(pack.enabled).toBe(false);
    expect(pack.evidenceStatus).toBe("none");
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "search_failed",
        failureReason: "unauthorized",
        executedQueries: [expect.stringContaining("failing query")],
        searchIntents: [
          expect.objectContaining({
            intents: [
              expect.objectContaining({
                question: "Find official details for failing query",
              }),
            ],
          }),
        ],
        queryPlans: [
          expect.objectContaining({
            query: expect.stringContaining("failing query"),
          }),
        ],
      }),
    );
  });
});
