import { describe, expect, test } from "vitest";
import type { ModelParticipant, ModelProvider } from "../types";
import {
  buildModelDrivenWebEvidencePack,
  buildTavilySearchPlanFromIntents,
} from "./model-driven-web-search";
import type { SearchIntentRecord } from "./evidence-pack";
import type { ExtractProvider } from "./extract-provider";
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

    expect(searchedQueries[0]).toContain("official");
    expect(searchedQueries[0]).toContain("DeepSeek V3");
    expect(searchedQueries.some((query) => query.includes("Reuters"))).toBe(true);
    expect(searchedQueries.some((query) => query.includes("SemiAnalysis"))).toBe(true);
    expect(pack.enabled).toBe(true);
    expect(pack.searchQueries).toEqual(searchedQueries);
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "low_evidence",
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
        queryPlans: expect.arrayContaining([
          expect.objectContaining({
            reason: expect.stringContaining("benchmark"),
          }),
          expect.objectContaining({
            reason: expect.stringContaining("official"),
          }),
        ]),
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
        reliability: "low",
        sourceType: "industry_report",
      }),
    );
    expect(pack.items[0].id).toBe("S1");
  });

  test("uses the SearchProvider interface for web searches", async () => {
    const controller = new AbortController();
    let intentSignal: AbortSignal | undefined;
    let searchSignal: AbortSignal | undefined;
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents(_participant, _topic, options) {
        intentSignal = options?.signal;

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
        searchSignal = request.signal;

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
      signal: controller.signal,
      searchProvider,
      topic: "latest search provider architecture",
    });

    expect(calls).toHaveLength(4);
    expect(intentSignal).toBe(controller.signal);
    expect(searchSignal).toBe(controller.signal);
    expect(pack.items[0]).toEqual(
      expect.objectContaining({
        title: "Provider result",
        query: calls[0],
      }),
    );
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        provider: "test-search",
        providerDiagnostics: expect.arrayContaining([
          expect.objectContaining({
            provider: "test-search",
            diagnostics: { requestFreshness: "latest" },
          }),
        ]),
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
        executedQueries: expect.arrayContaining([
          expect.stringContaining("failing query"),
        ]),
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

  test("triggers extract rescue when fewer than three usable web results survive preflight", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Find official evidence for a sparse search topic",
            mustInclude: ["sparse search topic"],
            shouldInclude: [],
            exclude: [],
            freshness: "recent",
            sourcePreference: "official",
            rationale: "Sparse search should exercise extract rescue.",
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
    const extractedUrls: string[][] = [];
    const extractProvider: ExtractProvider = {
      id: "test-extract",
      displayName: "Test Extract",
      async extract(request) {
        extractedUrls.push(request.urls);

        return {
          provider: "test-extract",
          results: [
            {
              title: "Extracted official report",
              url: request.urls[0],
              content: `Extracted official report for sparse search topic. ${"A".repeat(900)}`,
              sourceQuery: request.query,
              provider: "test-extract",
            },
          ],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "sparse search topic",
      extractProvider,
      searcher: async () => [
        {
          title: "Sparse result",
          url: "https://openai.com/sparse-result",
          snippet: "Sparse result",
        },
      ],
    });

    expect(extractedUrls).toHaveLength(1);
    expect(pack.enabled).toBe(true);
    expect(pack.items[0]).toEqual(
      expect.objectContaining({
        title: "Extracted official report",
        url: "https://openai.com/sparse-result",
      }),
    );
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "rescued_evidence",
        rescueTriggered: true,
        extractAttempted: 1,
        extractSucceededCount: 1,
        finalEvidenceCount: 1,
      }),
    );
  });

  test("prioritizes official snippet-only sources for extract retry and records failures", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Find official financing evidence",
            mustInclude: ["AI financing"],
            shouldInclude: ["official"],
            exclude: [],
            freshness: "latest",
            sourcePreference: "official",
            rationale: "Official short snippets should be retried.",
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
    const extractedUrls: string[][] = [];
    const extractProvider: ExtractProvider = {
      id: "test-extract",
      displayName: "Test Extract",
      async extract(request) {
        extractedUrls.push(request.urls);

        return {
          provider: "test-extract",
          results: [],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI financing",
      extractProvider,
      searcher: async () => [
        {
          title: "Official OpenAI financing note",
          url: "https://openai.com/news/financing-note",
          snippet: "Official snippet only. ".repeat(6),
        },
        {
          title: "Reddit discussion",
          url: "https://reddit.com/r/artificial/comments/financing",
          snippet: "Community discussion. ".repeat(40),
        },
      ],
    });

    expect(extractedUrls).toHaveLength(1);
    expect(extractedUrls[0][0]).toBe("https://openai.com/news/financing-note");
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        rescueTriggered: true,
        officialExtractFailed: true,
      }),
    );
  });

  test("runs targeted source retry when social and video results dominate", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Find AI company financing evidence",
            mustInclude: ["AI company financing"],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "mixed",
            rationale: "Initial generic query may return social results.",
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
      topic: "AI company financing",
      searcher: async (query) => {
        searchedQueries.push(query);

        if (query.includes("official reputable media industry report")) {
          return [
            {
              title: "New York Times financing report",
              url: "https://nytimes.com/2026/05/20/technology/ai-financing.html",
              snippet: "Reported financing context. ".repeat(80),
            },
          ];
        }

        return [
          {
            title: "LinkedIn post",
            url: "https://linkedin.com/posts/example",
            snippet: "LinkedIn discussion. ".repeat(50),
          },
          {
            title: "YouTube reaction",
            url: "https://youtube.com/watch?v=example",
            snippet: "YouTube reaction. ".repeat(50),
          },
          {
            title: "Instagram post",
            url: "https://instagram.com/p/example",
            snippet: "Instagram reaction. ".repeat(50),
          },
          {
            title: "Reddit thread",
            url: "https://reddit.com/r/artificial/comments/example",
            snippet: "Reddit discussion. ".repeat(50),
          },
        ];
      },
    });

    expect(searchedQueries.some((query) =>
      query.includes("official reputable media industry report"),
    )).toBe(true);
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        targetedSearchRetryTriggered: true,
        targetedSearchRetryReason: "social_video_ratio_above_threshold",
      }),
    );
    expect(pack.items.some((item) => item.url?.includes("nytimes.com"))).toBe(true);
  });

  test("deep mode triggers extract rescue when results are only weak evidence", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Compare latest GPT-5.5 and DeepSeek V4 benchmark evidence",
            mustInclude: ["GPT-5.5", "DeepSeek V4"],
            shouldInclude: ["benchmark", "leaderboard"],
            exclude: [],
            freshness: "latest",
            sourcePreference: "benchmark",
            rationale: "Deep mode should improve weak search snippets with extraction.",
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
    const extractedUrls: string[][] = [];
    const extractProvider: ExtractProvider = {
      id: "test-extract",
      displayName: "Test Extract",
      async extract(request) {
        extractedUrls.push(request.urls);

        return {
          provider: "test-extract",
          results: [
            {
              title: "GPT-5.5 and DeepSeek V4 benchmark comparison",
              url: request.urls[0],
              content:
                "GPT-5.5 DeepSeek V4 latest benchmark leaderboard comparison. " +
                "Independent benchmark data and release notes are cross-checked. " +
                "A".repeat(900),
              sourceQuery: request.query,
              provider: "test-extract",
            },
          ],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchMode: "deep",
      topic: "GPT-5.5 DeepSeek V4 latest benchmark leaderboard",
      extractProvider,
      searcher: async () =>
        Array.from({ length: 10 }, (_, index) => ({
          title: `GPT-5.5 DeepSeek V4 benchmark note ${index + 1}`,
          url: `https://www.theverge.com/ai/weak-benchmark-${index + 1}`,
          snippet:
            "GPT-5.5 DeepSeek V4 latest benchmark leaderboard short note " +
            `${index + 1}. `.repeat(12),
        })),
    });

    expect(extractedUrls).toHaveLength(1);
    expect(extractedUrls[0].length).toBeGreaterThan(1);
    expect(pack.items.length).toBeLessThanOrEqual(10);
    expect(
      pack.items.some((item) =>
        item.quality?.reliability === "high" ||
        item.quality?.reliability === "medium",
      ),
    ).toBe(true);
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "rescued_evidence",
        rescueTriggered: true,
        rescueReason: "reliable_evidence_below_threshold",
        searchMode: "deep",
      }),
    );
  });

  test("deep search mode expands candidates but does not put every candidate into the evidence pack", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Find many current model benchmark sources",
            mustInclude: ["model benchmark"],
            shouldInclude: ["leaderboard"],
            exclude: [],
            freshness: "latest",
            sourcePreference: "benchmark",
            rationale: "Deep mode should gather more candidates.",
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
    const maxResultsRequests: number[] = [];

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchMode: "deep",
      topic: "latest model benchmark leaderboard",
      searcher: async (_query, options) => {
        maxResultsRequests.push(options?.maxResults ?? 0);

        return Array.from({ length: 60 }, (_, index) => ({
          title: `Benchmark source ${index + 1}`,
          url: `https://artificialanalysis.ai/models/${index + 1}`,
          snippet: `Benchmark source ${index + 1}. ${"A".repeat(900)}`,
        }));
      },
    });

    expect(maxResultsRequests[0]).toBeGreaterThan(5);
    expect(pack.items.length).toBeGreaterThan(0);
    expect(pack.items.length).toBeLessThanOrEqual(12);
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        searchMode: "deep",
        rawCandidateCount: 180,
        finalEvidenceCount: pack.items.length,
      }),
    );
  });

  test("runs an official pass that prioritizes official source queries", async () => {
    const provider = createNoIntentProvider();
    const searchedQueries: string[] = [];

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "OpenAI model update",
      searcher: async (query) => {
        searchedQueries.push(query);

        if (query.includes("site:openai.com")) {
          return [
            {
              title: "OpenAI model update",
              url: "https://openai.com/news/model-update",
              snippet: "Official OpenAI model update. ".repeat(50),
            },
          ];
        }

        return [];
      },
    });

    expect(searchedQueries[0]).toContain("site:openai.com");
    expect(pack.items[0].url).toBe("https://openai.com/news/model-update");
    expect(pack.searchProcess?.debugSummary?.passStats[0]).toEqual(
      expect.objectContaining({
        passName: "official",
        resultCount: 1,
        coreEvidenceCount: 1,
      }),
    );
  });

  test("skips social clue pass when trusted passes already provide enough core evidence", async () => {
    const provider = createNoIntentProvider();
    const searchedQueries: string[] = [];

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI company financing",
      searcher: async (query) => {
        searchedQueries.push(query);

        if (query.includes("site:openai.com")) {
          return [
            {
              title: "Official financing note",
              url: "https://openai.com/news/financing",
              snippet: "Official financing note. ".repeat(50),
            },
          ];
        }

        if (query.includes("Reuters")) {
          return [
            {
              title: "Reuters financing report",
              url: "https://reuters.com/technology/ai-financing",
              snippet: "Reuters financing report. ".repeat(50),
            },
          ];
        }

        if (query.includes("SemiAnalysis")) {
          return [
            {
              title: "SemiAnalysis financing report",
              url: "https://semianalysis.com/ai-financing",
              snippet: "SemiAnalysis financing report. ".repeat(50),
            },
          ];
        }

        if (query.includes("Reddit")) {
          return [
            {
              title: "Reddit financing thread",
              url: "https://reddit.com/r/artificial/comments/financing",
              snippet: "Reddit discussion. ".repeat(50),
            },
          ];
        }

        return [];
      },
    });

    expect(searchedQueries.some((query) => query.includes("Reddit"))).toBe(false);
    expect(pack.searchProcess?.debugSummary?.skippedPasses).toContain(
      "social_clue",
    );
    expect(pack.searchProcess?.debugSummary?.evidenceHitRate.coreEvidenceCount)
      .toBeGreaterThanOrEqual(3);
  });

  test("keeps social clue pass results out of core evidence", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI product rumor",
      searcher: async (query) => {
        if (!query.includes("Reddit")) {
          return [];
        }

        return [
          {
            title: "Reddit rumor",
            url: "https://reddit.com/r/artificial/comments/rumor",
            snippet: "Reddit rumor discussion. ".repeat(60),
          },
          {
            title: "YouTube analysis",
            url: "https://youtube.com/watch?v=rumor",
            snippet: "YouTube analysis. ".repeat(80),
          },
          {
            title: "LinkedIn post",
            url: "https://linkedin.com/posts/rumor",
            snippet: "LinkedIn post. ".repeat(80),
          },
        ];
      },
    });

    expect(pack.searchProcess?.debugSummary?.evidenceHitRate.coreEvidenceCount)
      .toBe(0);
    expect(
      pack.searchProcess?.results.every(
        (result) =>
          result.sourceType === "social_forum" ||
          result.sourceType === "video_platform",
      ),
    ).toBe(true);
  });

  test("dedupes the same URL across passes and records all seen passes", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI model release",
      searcher: async (query) => {
        if (query.includes("site:openai.com")) {
          return [
            {
              title: "Model release short official",
              url: "https://openai.com/news/model-release?utm_source=test",
              snippet: "Short official snippet.",
            },
          ];
        }

        if (query.includes("Reuters")) {
          return [
            {
              title: "Model release full official mirror",
              url: "https://openai.com/news/model-release",
              snippet: "Full official release text. ".repeat(50),
            },
          ];
        }

        return [];
      },
    });

    const matchingItems = pack.items.filter((item) =>
      item.url?.includes("openai.com/news/model-release"),
    );

    expect(matchingItems).toHaveLength(1);
    expect(matchingItems[0].quality?.textLength).toBeGreaterThanOrEqual(800);
    expect(matchingItems[0].seenInPasses).toEqual(
      expect.arrayContaining(["official", "reputable_media"]),
    );
  });

  test("records pass stats and selected evidence by pass", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI benchmark report",
      searcher: async (query) => {
        if (query.includes("site:openai.com")) {
          return [
            {
              title: "Official benchmark note",
              url: "https://openai.com/news/benchmark",
              snippet: "Official benchmark note. ".repeat(50),
            },
          ];
        }

        if (query.includes("Reuters")) {
          return [
            {
              title: "Reuters benchmark note",
              url: "https://reuters.com/technology/ai-benchmark",
              snippet: "Reuters benchmark note. ".repeat(50),
            },
          ];
        }

        if (query.includes("SemiAnalysis")) {
          return [
            {
              title: "SemiAnalysis benchmark note",
              url: "https://semianalysis.com/ai-benchmark",
              snippet: "SemiAnalysis benchmark note. ".repeat(50),
            },
          ];
        }

        return [];
      },
    });

    expect(pack.searchProcess?.debugSummary?.passStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          passName: "official",
          resultCount: 1,
          coreEvidenceCount: 1,
        }),
        expect.objectContaining({
          passName: "reputable_media",
          resultCount: 1,
          coreEvidenceCount: 1,
        }),
        expect.objectContaining({
          passName: "industry_report",
          resultCount: 1,
          coreEvidenceCount: 1,
        }),
      ]),
    );
    expect(pack.searchProcess?.debugSummary?.selectedEvidenceByPass).toEqual(
      expect.arrayContaining([
        { passName: "official", count: 1 },
        { passName: "reputable_media", count: 1 },
        { passName: "industry_report", count: 1 },
      ]),
    );
  });
});

function createNoIntentProvider(): ModelProvider {
  return {
    name: "TestProvider",
    async generateSearchIntents() {
      return [];
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
}
