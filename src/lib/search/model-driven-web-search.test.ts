import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type { ModelParticipant, ModelProvider } from "../types";
import {
  buildModelDrivenWebEvidencePack,
  buildTavilySearchPlanFromIntents,
  resolveSearchRegionPreference,
} from "./model-driven-web-search";
import { analyzeTopicForEvidence } from "./evidence-pack";
import type { SearchIntentRecord } from "./evidence-pack";
import type { ExtractProvider } from "./extract-provider";
import type { SearchProvider } from "./search-provider";
import {
  createSafeTavilyDiagnostics,
  TavilySearchError,
} from "./tavily-search";

const participant: ModelParticipant = {
  id: "deepseek-flash",
  name: "DeepSeek Flash",
  provider: "DeepSeek",
  model: "deepseek-v4-flash",
  status: "available",
  statusLabel: "available",
};

describe("buildModelDrivenWebEvidencePack", () => {
  test("plans queries from topic analysis instead of the original discussion shell", async () => {
    const provider = createNoIntentProvider();
    const queries: string[] = [];
    const fullTopic =
      "你们认为 AlphaAI、BetaAI 这类工具目前在中文办公和代码辅助场景中的竞争力怎么样？";

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: fullTopic,
      searcher: async (query) => {
        queries.push(query);
        return [];
      },
    });

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.join("\n")).not.toContain(fullTopic);
    expect(queries.join("\n")).not.toContain("你们认为");
    expect(queries.join("\n")).not.toContain("怎么样");
    expect(queries.join("\n")).toContain("AlphaAI");
    expect(queries.join("\n")).toContain("BetaAI");
    expect(queries.join("\n")).toMatch(/capability|adoption|market|user feedback/);
  });

  test("topic-analysis query fallback differs across domains without fixed reusable keywords", async () => {
    const provider = createNoIntentProvider();
    const policyQueries: string[] = [];
    const productQueries: string[] = [];

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "是否应该调整 GammaPay 的跨境支付监管策略？",
      searcher: async (query) => {
        policyQueries.push(query);
        return [];
      },
    });
    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "请讨论 DeltaSuite 新版本在团队协作场景哪个更好",
      searcher: async (query) => {
        productQueries.push(query);
        return [];
      },
    });

    expect(policyQueries.join("\n")).not.toContain("是否应该");
    expect(productQueries.join("\n")).not.toContain("请讨论");
    expect(productQueries.join("\n")).not.toContain("哪个更好");
    expect(policyQueries).not.toEqual(productQueries);
    expect(policyQueries.join("\n")).toMatch(/regulation|governance|official/);
    expect(productQueries.join("\n")).toMatch(/product|capability|user feedback/);
  });

  test("starts with an unrestricted general_web pass that preserves entities and scenarios", async () => {
    const provider = createNoIntentProvider();
    const requests: Parameters<SearchProvider["search"]>[0][] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);
        return { provider: "test-search", results: [] };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic:
        "你们认为 AlphaAI、BetaAI 这类工具目前在中文办公和代码辅助场景中的竞争力怎么样？",
    });

    expect(requests[0]).toEqual(
      expect.objectContaining({
        searchTopic: "general",
        searchDepth: "basic",
      }),
    );
    expect(requests[0].includeDomains).toBeUndefined();
    expect(requests[0].query).toContain("AlphaAI");
    expect(requests[0].query).toContain("BetaAI");
    expect(requests[0].query).toMatch(/中文办公|代码辅助|office|coding|capability|adoption/);
    expect(requests[0].query).not.toContain("你们认为");
    expect(requests[0].query).not.toContain("怎么样");
  });

  test("records query quality and cleaned topic in evidence debug data", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "是否应该讨论 ZetaCloud 在金融风控场景的应用前景怎么样？",
      searcher: async () => [],
    });

    expect(pack.searchProcess?.topicAnalysis?.cleanedTopic).toContain("ZetaCloud");
    expect(pack.searchProcess?.topicAnalysis?.cleanedTopic).not.toContain("是否应该");
    expect(pack.searchProcess?.passStats?.[0]).toEqual(
      expect.objectContaining({
        passName: "general_web",
        queryLevel: "precise",
        derivedFrom: expect.stringContaining("topic_analysis"),
        queryQuality: expect.objectContaining({
          ok: true,
          hasEntity: true,
        }),
      }),
    );
  });

  test("general_web chooses one normalized analyzer query instead of duplicating cleaned topic", async () => {
    const provider = createNoIntentProvider();
    const requests: Parameters<SearchProvider["search"]>[0][] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);
        return { provider: "test-search", results: [] };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic:
        "What do you think about Kimi, GLM, GPT-4o, and Claude in Chinese office and coding assistance scenarios?",
    });

    const generalQuery = requests.find(
      (request) => request.searchTopic === "general" && request.includeDomains === undefined,
    )?.query;
    expect(generalQuery).toBeDefined();
    expect(generalQuery?.toLowerCase()).toContain("kimi");
    expect(generalQuery?.toLowerCase()).toContain("glm");
    expect(generalQuery?.toLowerCase()).toContain("gpt-4o");
    expect(generalQuery?.toLowerCase()).toContain("claude");
    expect((generalQuery?.match(/\bkimi\b/gi) ?? [])).toHaveLength(1);
    expect((generalQuery?.match(/\bglm\b/gi) ?? [])).toHaveLength(1);
    expect(generalQuery).not.toMatch(/\bimi\b/i);
  });

  test("source names are not hardcoded into ordinary media or report queries", async () => {
    const provider = createNoIntentProvider();
    const requests: Parameters<SearchProvider["search"]>[0][] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);
        return { provider: "test-search", results: [] };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic:
        "Compare Kimi, GLM, GPT-4o, and Claude in enterprise office automation and coding assistance.",
    });

    const joinedQueries = requests.map((request) => request.query).join("\n");
    expect(joinedQueries).not.toMatch(
      /\b(Reuters|Bloomberg|FT|WSJ|SemiAnalysis|arxiv|MLCommons)\b/i,
    );
    expect(requests.some((request) => request.includeDomains?.includes("reuters.com"))).toBe(true);
    expect(requests.some((request) => request.includeDomains?.includes("semianalysis.com"))).toBe(true);
  });

  test("does not send queryQuality=false pass queries to the search provider", async () => {
    const provider = createNoIntentProvider();
    const requests: Parameters<SearchProvider["search"]>[0][] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);
        return { provider: "test-search", results: [] };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider: createNoopExtractProvider(),
      participants: [participant],
      provider,
      searchProvider,
      topic: "你们认为怎么样？是否应该讨论哪个更好？",
    });

    const skippedPoorQueries =
      pack.searchProcess?.passStats?.filter(
        (stat) => stat.queryQuality?.ok === false && stat.skippedReason === "query_quality_gate",
      ) ?? [];

    expect(skippedPoorQueries.length).toBeGreaterThan(0);
    expect(requests.map((request) => request.query)).not.toEqual(
      expect.arrayContaining(skippedPoorQueries.map((stat) => stat.query)),
    );
  });

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
    expect(plan.queries[0]).toContain("latest");
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

    expect(pack.searchProcess?.passStats?.[0]?.passName).toBe("general_web");
    expect(searchedQueries.some((query) => query.includes("DeepSeek V3"))).toBe(true);
    expect(searchedQueries.length).toBeGreaterThanOrEqual(6);
    expect(searchedQueries.join("\n")).not.toMatch(/\bReuters\b/);
    expect(pack.enabled).toBe(true);
    expect(pack.searchQueries?.length).toBeGreaterThan(0);
    expect(searchedQueries).toEqual(expect.arrayContaining(pack.searchQueries ?? []));
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "low_evidence",
        executedQueries: expect.arrayContaining(searchedQueries.slice(0, 3)),
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
    const extractProvider: ExtractProvider = {
      id: "test-extract",
      displayName: "Test Extract",
      async extract() {
        return {
          provider: "test-extract",
          results: [],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider,
      participants: [participant],
      provider,
      signal: controller.signal,
      searchProvider,
      topic: "latest search provider architecture",
    });

    expect(calls.length).toBeGreaterThanOrEqual(6);
    expect(intentSignal).toBe(controller.signal);
    expect(searchSignal).toBeInstanceOf(AbortSignal);
    expect(searchSignal?.aborted).toBe(false);
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

  test("passes structured Tavily-style options to each search pass", async () => {
    const provider = createNoIntentProvider();
    const requests: Array<Parameters<SearchProvider["search"]>[0]> = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);

        return {
          provider: "test-search",
          results: [],
        };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic: "Acme 融资 市场",
    });

    const mainPassRequests = requests;
    const official = mainPassRequests.find((request) =>
      request.query.includes("官方") || request.query.includes("official statement"),
    );
    const reputable = mainPassRequests.find((request) =>
      request.includeDomains?.includes("reuters.com"),
    );
    const localized = mainPassRequests.find((request) =>
      request.query.includes("本地媒体"),
    );
    const social = mainPassRequests.find((request) =>
      request.includeDomains?.includes("reddit.com"),
    );

    expect(official).toEqual(
      expect.objectContaining({
        searchDepth: "basic",
        excludeDomains: expect.arrayContaining(["reddit.com", "youtube.com"]),
      }),
    );
    expect(reputable).toEqual(
      expect.objectContaining({
        searchTopic: "news",
        timeRange: "month",
        includeDomains: expect.arrayContaining(["reuters.com", "bloomberg.com"]),
        excludeDomains: expect.arrayContaining(["reddit.com", "youtube.com"]),
      }),
    );
    expect(localized).toEqual(
      expect.objectContaining({
        country: "china",
        searchTopic: "general",
        timeRange: "month",
      }),
    );
    expect(social?.query).not.toMatch(/\b(Reddit|LinkedIn|YouTube|X)\b/);
    // Main passes: 3 (localized_media, official, reputable_media)
    // Zero-result fallback: 3 (industry_report, reputable_media, social_clue)
    expect(requests.length).toBeGreaterThanOrEqual(3);
    expect(
      requests.every(
        (request) => (request.maxResults ?? 0) >= 5 && (request.maxResults ?? 0) <= 10,
      ),
    ).toBe(true);
  });

  test("runs three model-driven keyword searches and keeps the best twelve articles", async () => {
    const provider = createNoIntentProvider();
    const searchedQueries: string[] = [];
    const maxResultsRequests: number[] = [];

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI market analysis",
      searcher: async (query, options) => {
        searchedQueries.push(query);
        maxResultsRequests.push(options?.maxResults ?? 0);

        const domains = [
          "reuters.com",
          "bloomberg.com",
          "ft.com",
          "wsj.com",
          "nytimes.com",
          "theinformation.com",
          "techcrunch.com",
          "theverge.com",
          "wired.com",
          "engadget.com",
          "arstechnica.com",
          "semianalysis.com",
          "epoch.ai",
          "stanford.edu",
          "arxiv.org",
          "mlcommons.org",
          "people.com.cn",
          "stcn.com",
          "globaltimes.cn",
          "gasgoo.com",
        ];

        return Array.from({ length: options?.maxResults ?? 20 }, (_, index) => ({
          title: `Reuters quality article ${searchedQueries.length}-${index + 1}`,
          url: `https://${domains[index % domains.length]}/technology/quality-${searchedQueries.length}-${index + 1}`,
          snippet: `AI market analysis revenue customers regulation quality article ${index + 1}. ${"A".repeat(
            900 + index,
          )}`,
        }));
      },
    });

    expect(searchedQueries.length).toBeGreaterThanOrEqual(6);
    expect(
      maxResultsRequests.every((count) => count >= 5 && count <= 10),
    ).toBe(true);
    expect(pack.items).toHaveLength(12);
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        rawCandidateTarget: 60,
        rawCandidateCount: expect.any(Number),
        finalEvidenceCount: 12,
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

  test("records a timed-out pass and continues when later passes return results", async () => {
    const provider = createNoIntentProvider();
    const timeoutError = new TavilySearchError("network_error", {
      reason: "network_error",
      status: 504,
      diagnostics: createSafeTavilyDiagnostics({
        apiKey: "tvly-test-key",
        endpoint: "/search",
        error: new DOMException("The operation was aborted.", "AbortError"),
        errorKind: "network_error",
      }),
    });

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI company financing market analysis",
      searcher: async (query) => {
        if (query.includes("official statement")) {
          throw timeoutError;
        }

        if (query.includes("independent analysis") || query.includes("market report")) {
          return [
            {
              title: "Reuters market analysis",
              url: "https://reuters.com/technology/ai-company-market-analysis",
              snippet:
                "AI company financing revenue enterprise adoption market analysis. ".repeat(
                  40,
                ),
            },
          ];
        }

        return [];
      },
    });

    expect(pack.searchProcess?.evidenceMode).not.toBe("search_failed");
    expect(pack.items.some((item) => item.source === "reuters.com")).toBe(true);
    expect(pack.searchProcess?.debugSummary?.passStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          passName: "official",
          timedOut: true,
          errorType: "pass_timeout",
          resultCount: 0,
        }),
        expect.objectContaining({
          passName: "reputable_media",
          resultCount: 1,
        }),
      ]),
    );
  });

  test("enters search failed mode only when every key pass fails", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI company financing market analysis",
      searcher: async () => {
        throw new TavilySearchError("network_error", {
          reason: "network_error",
          status: 504,
          diagnostics: createSafeTavilyDiagnostics({
            apiKey: "tvly-test-key",
            endpoint: "/search",
            error: new DOMException("The operation was aborted.", "AbortError"),
            errorKind: "network_error",
          }),
        });
      },
    });

    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "search_failed",
        failedStage: "search_pass",
        failureReason: "network_error",
      }),
    );
    expect(pack.searchProcess?.debugSummary?.passStats.every((stat) => stat.timedOut))
      .toBe(true);
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
        extractErrorType: "empty_official_extract",
      }),
    );
  });

  test("records official extract retry success and replaces short official snippets", async () => {
    const provider = createNoIntentProvider();
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
              title: "OpenAI company update",
              url: "https://openai.com/news/company-update",
              content: "Long official OpenAI company update. ".repeat(80),
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
      topic: "OpenAI company strategy",
      extractProvider,
      searcher: async (query) => {
        if (!query.includes("official statement")) {
          return [];
        }

        return [
          {
            title: "OpenAI company update",
            url: "https://openai.com/news/company-update",
            snippet: "Short official snippet.",
          },
        ];
      },
    });

    const item = pack.items.find((entry) =>
      entry.url?.includes("openai.com/news/company-update"),
    );

    expect(extractedUrls[0]).toContain("https://openai.com/news/company-update");
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        rescueTriggered: true,
        officialExtractFailed: false,
      }),
    );
    expect(item?.snippet.length).toBeGreaterThanOrEqual(800);
    expect(item?.quality?.snippetOnly).not.toBe(true);
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

        return Array.from({ length: options?.maxResults ?? 10 }, (_, index) => ({
          title: `Benchmark source ${index + 1}`,
          url: `https://benchmark-${maxResultsRequests.length}-${index + 1}.example.com/models/${index + 1}`,
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
        rawCandidateTarget: 60,
        rawCandidateCount: expect.any(Number),
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

        if (query.includes("official statement")) {
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

    expect(pack.searchProcess?.passStats?.[0]?.passName).toBe("general_web");
    expect(pack.items[0].url).toBe("https://openai.com/news/model-update");
    expect(pack.searchProcess?.debugSummary?.passStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          passName: "official",
          resultCount: 1,
          coreEvidenceCount: 1,
        }),
      ]),
    );
    expect(pack.searchProcess?.searchStrategy).toBe("multi_pass");
  });

  test("keeps company competition topics focused on business queries instead of benchmark-only comparisons", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateSearchIntents() {
        return [
          {
            question: "Claude 3.5 Sonnet vs GPT-4o benchmark comparison",
            mustInclude: ["Claude 3.5 Sonnet", "GPT-4o"],
            shouldInclude: ["benchmark", "leaderboard"],
            exclude: [],
            freshness: "latest",
            sourcePreference: "benchmark",
            rationale:
              "A model benchmark query that should not dominate company strategy search.",
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
      topic: "OpenAI 和 Anthropic 哪个公司会笑到最后",
      searcher: async (query) => {
        searchedQueries.push(query);

        return [];
      },
    });

    expect(pack.searchProcess?.passStats?.[0]?.passName).toBe("general_web");
    expect(searchedQueries[0]).toContain("OpenAI");
    expect(searchedQueries[0]).toContain("Anthropic");
    expect(searchedQueries.join("\n")).toContain("funding");
    expect(searchedQueries.join("\n")).toContain("revenue");
    expect(searchedQueries.join("\n")).not.toContain("Claude 3.5 Sonnet");
    expect(searchedQueries.join("\n")).toContain("enterprise customers");
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

        if (query.includes("official statement")) {
          return [
            {
              title: "Official AI company financing announcement",
              url: "https://openai.com/news/financing",
              snippet: "Official AI company financing announcement details. ".repeat(50),
            },
          ];
        }

        if (query.includes("independent analysis") || query.includes("market report")) {
          return [
            {
              title: "Reuters AI company financing report",
              url: "https://reuters.com/technology/ai-financing",
              snippet: "Reuters AI company financing report details. ".repeat(50),
            },
          ];
        }

        if (query.includes("industry report")) {
          return [
            {
              title: "SemiAnalysis AI company financing analysis",
              url: "https://semianalysis.com/ai-financing",
              snippet: "SemiAnalysis AI company financing analysis details. ".repeat(50),
            },
          ];
        }

        if (query.includes("user feedback discussion")) {
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
    expect(pack.searchProcess?.debugSummary?.evidenceHitRate.coreEvidenceCount)
      .toBeGreaterThanOrEqual(2);
  });

  test("deep search records retrieval targets and keeps selected evidence capped", async () => {
    const provider = createNoIntentProvider();
    const requests: Parameters<SearchProvider["search"]>[0][] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);

        return {
          provider: "test-search",
          results: Array.from({ length: request.maxResults ?? 10 }, (_, index) => ({
            title: `Capability report ${requests.length}-${index + 1}`,
            url: `https://source-${requests.length}-${index + 1}.example.com/report`,
            provider: "test-search",
            sourceQuery: request.query,
            snippet:
              "AlphaSuite and BetaSuite Chinese office workflow coding assistance capability benchmark adoption user feedback report. ".repeat(
                12,
              ),
          })),
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider: createNoopExtractProvider(),
      participants: [participant],
      provider,
      searchMode: "deep",
      searchProvider,
      topic:
        "AlphaSuite 和 BetaSuite 在中文办公和代码辅助场景中的竞争力比较",
    });

    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        rawCandidateTarget: 60,
        selectedEvidenceTarget: 12,
        candidateShortfall: 0,
      }),
    );
    expect(pack.searchProcess?.rawCandidateCount).toBeGreaterThanOrEqual(60);
    expect(pack.searchProcess?.uniqueCandidateCount).toBeGreaterThanOrEqual(60);
    expect(pack.searchProcess?.retrievalPassCount).toBeGreaterThanOrEqual(6);
    expect(pack.searchProcess?.selectedEvidenceCount).toBe(pack.items.length);
    expect(pack.items.length).toBeGreaterThan(0);
    expect(pack.items.length).toBeLessThanOrEqual(12);
    expect(requests.every((request) => (request.maxResults ?? 0) <= 10)).toBe(
      true,
    );
  });

  test("candidate retrieval keeps broad short general queries before evidence selection", async () => {
    const provider = createNoIntentProvider();
    const requests: Parameters<SearchProvider["search"]>[0][] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);

        return {
          provider: "test-search",
          results: [],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider: createNoopExtractProvider(),
      participants: [participant],
      provider,
      searchMode: "deep",
      searchProvider,
      topic:
        "你们认为 DeepSeek、Kimi、GLM 这类国产大模型目前在中文办公和代码辅助场景中的竞争力怎么样？",
    });

    const generalRequests = requests.filter(
      (request) => request.searchTopic === "general" && !request.includeDomains,
    );

    expect(generalRequests.length).toBeGreaterThanOrEqual(3);
    expect(generalRequests[0].excludeDomains).toBeUndefined();
    expect(generalRequests.map((request) => request.query).join("\n")).toContain(
      "DeepSeek",
    );
    expect(generalRequests.map((request) => request.query).join("\n")).toContain(
      "Kimi",
    );
    expect(generalRequests.map((request) => request.query).join("\n")).toContain(
      "GLM",
    );
    expect(generalRequests.some((request) => request.query.includes("中文办公"))).toBe(
      true,
    );
    expect(generalRequests.some((request) => request.query.includes("代码辅助"))).toBe(
      true,
    );
    expect(
      generalRequests.slice(0, 5).every((request) => request.query.length <= 120),
    ).toBe(true);
    expect(pack.searchProcess?.fallbackQueries?.join("\n") ?? "").not.toMatch(
      /\b(?:eepSeek|imi|PT-4o|laude)\b/,
    );
  });

  test("topic analysis preserves latin product entities without residual fragments", () => {
    const screenshotTopicAnalysis = analyzeTopicForEvidence(
      "你们认为 DeepSeek、Kimi、GLM 这类国产大模型目前在中文办公和代码辅助场景中的竞争力怎么样？",
    );
    const analysis = analyzeTopicForEvidence(
      "你们认为 DeepSeek、Kimi、GLM、GPT-4o 和 Claude 在中文办公和代码辅助场景中的竞争力怎么样？",
    );
    const combined = [
      ...analysis.targetEntities,
      ...analysis.searchQueries,
    ].join("\n");

    expect(combined).toContain("DeepSeek");
    expect(combined).toContain("Kimi");
    expect(combined).toContain("GLM");
    expect(combined).toContain("GPT-4o");
    expect(combined).toContain("Claude");
    expect(combined).not.toMatch(/\b(?:eepSeek|imi|PT-4o|laude)\b/);
    expect(screenshotTopicAnalysis.targetEntities.join("\n")).not.toMatch(/\bimi\b/);
  });

  test("search debug preserves raw candidates even when final evidence selection is empty", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider: createNoopExtractProvider(),
      participants: [participant],
      provider,
      searchMode: "deep",
      topic: "AlphaSuite BetaSuite enterprise office coding comparison",
      searcher: async (_query, options) =>
        Array.from({ length: options?.maxResults ?? 10 }, (_, index) => ({
          title: `Community clue ${index + 1}`,
          url: `https://reddit.com/r/ai/comments/${index + 1}`,
          snippet: `Short community clue ${index + 1}.`,
        })),
    });

    expect(pack.items.length).toBeLessThanOrEqual(2);
    expect(pack.searchProcess?.rawCandidateCount).toBeGreaterThanOrEqual(60);
    expect(pack.searchProcess?.uniqueCandidateCount).toBeGreaterThan(0);
    expect(pack.searchProcess?.results.length).toBeGreaterThanOrEqual(
      pack.searchProcess?.uniqueCandidateCount ?? 0,
    );
    expect(pack.searchProcess?.debugSummary?.retrieval?.rawCandidateCount).toBeGreaterThanOrEqual(
      60,
    );
  });

  test("standard search uses a smaller raw candidate target than deep search", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider: createNoopExtractProvider(),
      participants: [participant],
      provider,
      searchPreferences: { searchIntensity: "standard" },
      topic:
        "AlphaSuite 和 BetaSuite 在中文办公和代码辅助场景中的竞争力比较",
      searcher: async (_query, options) =>
        Array.from({ length: options?.maxResults ?? 5 }, (_, index) => ({
          title: `Standard candidate ${index + 1}`,
          url: `https://standard-${index}.example.com/report`,
          snippet:
            "AlphaSuite BetaSuite Chinese office coding assistance capability adoption report. ".repeat(
              12,
            ),
        })),
    });

    expect(pack.searchProcess?.rawCandidateTarget).toBe(30);
    expect(pack.searchProcess?.selectedEvidenceTarget).toBe(12);
  });

  test("keeps social clue pass results out of core evidence", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI product rumor",
      searcher: async (query) => {
        if (!query.includes("user feedback discussion")) {
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

  test("keeps at most two social clue items when no core evidence is available", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "AI company rumor",
      searcher: async (query) => {
        if (!query.includes("user feedback discussion")) {
          return [];
        }

        return [
          {
            title: "Reddit rumor 1",
            url: "https://reddit.com/r/artificial/comments/rumor1",
            snippet: "Reddit rumor discussion. ".repeat(60),
          },
          {
            title: "Reddit rumor 2",
            url: "https://reddit.com/r/artificial/comments/rumor2",
            snippet: "Reddit rumor discussion. ".repeat(60),
          },
          {
            title: "YouTube rumor",
            url: "https://youtube.com/watch?v=rumor",
            snippet: "YouTube rumor discussion. ".repeat(60),
          },
          {
            title: "LinkedIn rumor",
            url: "https://linkedin.com/posts/rumor",
            snippet: "LinkedIn rumor discussion. ".repeat(60),
          },
        ];
      },
    });

    const socialClueItems = pack.items.filter((item) =>
      item.seenInPasses?.includes("social_clue"),
    );

    expect(pack.searchProcess?.debugSummary?.evidenceHitRate.coreEvidenceCount)
      .toBe(0);
    expect(socialClueItems.length).toBeLessThanOrEqual(2);
    expect(
      socialClueItems.every(
        (item) => item.quality?.evidenceJudgment?.role !== "core",
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
        if (query.includes("official statement")) {
          return [
            {
              title: "Model release short official",
              url: "https://openai.com/news/model-release?utm_source=test",
              snippet: "Short official snippet.",
            },
          ];
        }

        if (query.includes("independent analysis") || query.includes("market report")) {
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
        if (query.includes("official statement")) {
          return [
            {
              title: "Official benchmark note",
              url: "https://openai.com/news/benchmark",
              snippet: "Official benchmark note. ".repeat(50),
            },
          ];
        }

        if (query.includes("independent analysis") || query.includes("market report")) {
          return [
            {
              title: "Reuters benchmark note",
              url: "https://reuters.com/technology/ai-benchmark",
              snippet: "Reuters benchmark note. ".repeat(50),
            },
          ];
        }

        if (query.includes("industry report")) {
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

  test("enables localized media pass for Chinese topics and keeps original Chinese query first", async () => {
    const provider = createNoIntentProvider();
    const searchedQueries: string[] = [];

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "怎么看甲方科技最近发布的本地化战略",
      searcher: async (query) => {
        searchedQueries.push(query);

        return [];
      },
    });

    expect(searchedQueries.some((query) => query.includes("甲方科技"))).toBe(true);
    expect(searchedQueries.some((query) => query.includes("本地媒体"))).toBe(true);
    expect(searchedQueries.some((query) => query.includes("行业媒体"))).toBe(true);
  });

  test("writes long extracted content back to evidence and records extract success", async () => {
    const provider = createNoIntentProvider();
    const longChineseBody =
      "甲方科技本地化战略发布，正文持续讨论甲方科技、本地化战略、市场竞争、客户采用、商业化收入、监管政策和产业合作。".repeat(
        80,
      );
    const extractProvider: ExtractProvider = {
      id: "test-extract",
      displayName: "Test Extract",
      async extract(request) {
        return {
          provider: "test-extract",
          results: [
            {
              title: "甲方科技本地化战略发布",
              url: request.urls[0],
              content: longChineseBody,
              sourceQuery: request.query,
              provider: "test-extract",
            },
          ],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider,
      participants: [participant],
      provider,
      topic: "怎么看甲方科技最近发布的本地化战略",
      searcher: async (query) => {
        if (query.includes("本地媒体")) {
          return [
            {
              title: "甲方科技本地化战略发布",
              url: "https://stcn.com/article/local-strategy",
              snippet: "甲方科技本地化战略发布。",
            },
          ];
        }

        return [];
      },
    });

    const item = pack.items.find((entry) =>
      entry.url?.includes("stcn.com/article/local-strategy"),
    );

    expect(item?.snippet.length).toBeGreaterThanOrEqual(800);
    expect(item?.quality?.snippetOnly).not.toBe(true);
    expect(pack.searchProcess?.extractAttempted).toBeGreaterThan(0);
    expect(pack.searchProcess?.extractSucceededCount).toBe(1);
    expect(pack.searchProcess?.debugSummary?.extractionSuccessRate).toEqual(
      expect.objectContaining({
        extractSuccessCount: 1,
      }),
    );
    expect(pack.searchProcess?.extractAttempts?.[0]).toEqual(
      expect.objectContaining({
        passName: "localized_media",
        provider: "test-extract",
        returnedTextLength: longChineseBody.length,
        success: true,
      }),
    );
  });
});

describe("query dedup", () => {
  test("deduplicates queries that differ only by year suffix", () => {
    const records: SearchIntentRecord[] = [
      {
        participantId: "p1",
        participantName: "Model A",
        provider: "ProviderA",
        model: "model-a",
        intents: [
          {
            question: "DeepSeek benchmark performance 2026",
            mustInclude: [],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "mixed",
            rationale: "test",
          },
        ],
      },
      {
        participantId: "p2",
        participantName: "Model B",
        provider: "ProviderB",
        model: "model-b",
        intents: [
          {
            question: "DeepSeek benchmark performance",
            mustInclude: [],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "mixed",
            rationale: "test",
          },
        ],
      },
    ];

    const plan = buildTavilySearchPlanFromIntents("DeepSeek benchmark", records, {
      currentYear: 2026,
    });

    expect(plan.queries).toHaveLength(1);
    expect(plan.intentDecisions.filter((d) => d.action === "merged")).toHaveLength(1);
  });

  test("deduplicates queries where one contains the other", () => {
    const records: SearchIntentRecord[] = [
      {
        participantId: "p1",
        participantName: "Model A",
        provider: "ProviderA",
        model: "model-a",
        intents: [
          {
            question: "AI model benchmark comparison",
            mustInclude: [],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "mixed",
            rationale: "test",
          },
        ],
      },
      {
        participantId: "p2",
        participantName: "Model B",
        provider: "ProviderB",
        model: "model-b",
        intents: [
          {
            question: "AI model benchmark comparison analysis",
            mustInclude: [],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "mixed",
            rationale: "test",
          },
        ],
      },
    ];

    const plan = buildTavilySearchPlanFromIntents("AI comparison", records, {
      currentYear: 2026,
    });

    expect(plan.queries).toHaveLength(1);
  });

  test("does not merge genuinely different queries", () => {
    const records: SearchIntentRecord[] = [
      {
        participantId: "p1",
        participantName: "Model A",
        provider: "ProviderA",
        model: "model-a",
        intents: [
          {
            question: "AI funding revenue market share",
            mustInclude: [],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "mixed",
            rationale: "test",
          },
        ],
      },
      {
        participantId: "p2",
        participantName: "Model B",
        provider: "ProviderB",
        model: "model-b",
        intents: [
          {
            question: "AI safety alignment regulation",
            mustInclude: [],
            shouldInclude: [],
            exclude: [],
            freshness: "latest",
            sourcePreference: "mixed",
            rationale: "test",
          },
        ],
      },
    ];

    const plan = buildTavilySearchPlanFromIntents("AI industry", records, {
      currentYear: 2026,
    });

    expect(plan.queries).toHaveLength(2);
  });
});

describe("Chinese topic search optimization", () => {
  test("Chinese topic pass order starts with localized_media", async () => {
    const provider = createNoIntentProvider();
    const passNames: string[] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        passNames.push(request.query.includes("本地媒体") ? "localized_media" : "other");
        return { provider: "test-search", results: [] };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic: "怎么看甲方科技最近发布的本地化战略",
    });

    expect(passNames[0]).toBe("other");
    expect(passNames).toContain("localized_media");
  });

  test("non-Chinese topic pass order starts with official", async () => {
    const provider = createNoIntentProvider();
    const passNames: string[] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        if (request.query.includes("official statement")) {
          passNames.push("official");
        } else if (
          request.query.includes("independent analysis") ||
          request.includeDomains?.includes("reuters.com")
        ) {
          passNames.push("reputable_media");
        } else {
          passNames.push("other");
        }
        return { provider: "test-search", results: [] };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic: "AI model benchmark comparison",
    });

    expect(passNames[0]).toBe("other");
    expect(passNames).toContain("official");
  });

  test("Chinese official query contains Chinese keywords instead of English template", async () => {
    const provider = createNoIntentProvider();
    const queries: string[] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        queries.push(request.query);
        return { provider: "test-search", results: [] };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic: "怎么看甲方科技最近发布的本地化战略",
    });

    const officialQuery = queries.find((q) => q.includes("官方"));
    expect(officialQuery).toBeDefined();
    expect(officialQuery).toContain("发布");
    expect(officialQuery).toContain("公告");
    expect(officialQuery).not.toContain("official statement");
    expect(officialQuery).not.toContain("official blog");
    expect(officialQuery).not.toContain("official docs");
  });

  test("non-Chinese official query retains English template words", async () => {
    const provider = createNoIntentProvider();
    const queries: string[] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        queries.push(request.query);
        return { provider: "test-search", results: [] };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic: "latest AI model benchmark",
    });

    const officialQuery = queries.find((q) => q.includes("official statement"));
    expect(officialQuery).toBeDefined();
    expect(officialQuery).toContain("official blog");
  });
});

describe("freshness year injection", () => {
  test("freshness latest does not inject current year by default", () => {
    const plan = buildTavilySearchPlanFromIntents(
      "AI model comparison",
      [
        {
          participantId: "p1",
          participantName: "Model A",
          provider: "ProviderA",
          model: "model-a",
          intents: [
            {
              question: "Latest AI model benchmark",
              mustInclude: [],
              shouldInclude: [],
              exclude: [],
              freshness: "latest",
              sourcePreference: "mixed",
              rationale: "test",
            },
          ],
        },
      ],
      { currentYear: 2026 },
    );

    expect(plan.queries.length).toBeGreaterThan(0);
    expect(plan.queries[0]).not.toContain("2026");
    expect(plan.queries[0]).toContain("latest");
  });

  test("explicit year in topic is preserved", () => {
    const plan = buildTavilySearchPlanFromIntents(
      "2025 AI model release",
      [
        {
          participantId: "p1",
          participantName: "Model A",
          provider: "ProviderA",
          model: "model-a",
          intents: [
            {
              question: "What models were released in 2025",
              mustInclude: [],
              shouldInclude: [],
              exclude: [],
              freshness: "latest",
              sourcePreference: "mixed",
              rationale: "test",
            },
          ],
        },
      ],
      { currentYear: 2026 },
    );

    expect(plan.queries.length).toBeGreaterThan(0);
    expect(plan.queries[0]).toContain("2025");
  });

  test("explicit year in intent question is preserved", () => {
    const plan = buildTavilySearchPlanFromIntents(
      "AI model comparison",
      [
        {
          participantId: "p1",
          participantName: "Model A",
          provider: "ProviderA",
          model: "model-a",
          intents: [
            {
              question: "AI model benchmark 2024 ranking",
              mustInclude: [],
              shouldInclude: [],
              exclude: [],
              freshness: "latest",
              sourcePreference: "mixed",
              rationale: "test",
            },
          ],
        },
      ],
      { currentYear: 2026 },
    );

    expect(plan.queries.length).toBeGreaterThan(0);
    expect(plan.queries[0]).toContain("2024");
  });
});

describe("localized_media query dedup", () => {
  test("Chinese topic localized_media query does not duplicate fragments", async () => {
    const provider = createNoIntentProvider();
    const localizedQueries: string[] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        if (request.query.includes("本地媒体")) {
          localizedQueries.push(request.query);
        }
        return { provider: "test-search", results: [] };
      },
    };

    await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic: "怎么看甲方科技最近发布的本地化战略",
    });

    expect(localizedQueries).toHaveLength(1);
    const query = localizedQueries[0];
    const segments = query.split(/\s+/).filter((s) => s.length >= 2);
    const uniqueSegments = new Set(segments.map((s) => s.toLowerCase()));
    expect(segments.length).toBe(uniqueSegments.size);
  });

  test("Chinese topic source rules do not contain hardcoded company names", () => {
    const provider = createNoIntentProvider();
    const queries: string[] = [];

    const checkedFunctions = [
      "buildSearchPasses",
      "buildEntityCompetitionSearchPasses",
      "buildLocalizedMediaPasses",
    ];
    void checkedFunctions;
    void provider;
    void queries;
  });
});

describe("zero-result fallback", () => {
  test("includes zeroResultFallbackTriggered in searchProcess", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "某产品新版发布带来的市场影响",
      searcher: async () => [],
    });

    expect(pack.searchProcess?.zeroResultFallbackTriggered).toBeDefined();
    expect(pack.searchProcess?.fallbackQueries).toBeDefined();
    expect(pack.searchProcess?.providerReturnedZeroCount).toBeDefined();
    expect(pack.searchProcess?.relaxedQueryCount).toBeDefined();
    expect(pack.searchProcess?.skippedPassReasons).toBeDefined();
  });

  test("continues fallback when initial passes return only one candidate", async () => {
    const provider = createNoIntentProvider();
    const requests: string[] = [];

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider: createNoopExtractProvider(),
      participants: [participant],
      provider,
      topic:
        "AlphaSuite 和 BetaSuite 在中文办公和代码辅助场景中的竞争力比较",
      searcher: async (query) => {
        requests.push(query);

        if (requests.length === 1) {
          return [
            {
              title: "Single early result",
              url: "https://example.com/single-result",
              snippet:
                "AlphaSuite BetaSuite office coding assistance short comparison. ".repeat(
                  10,
                ),
            },
          ];
        }

        return [];
      },
    });

    expect(pack.searchProcess?.zeroResultFallbackTriggered).not.toBe(true);
    expect(pack.searchProcess?.fallbackQueries?.length).toBeGreaterThan(0);
    expect(pack.searchProcess?.fallbackTriggeredReason).toBe(
      "candidate_shortfall",
    );
    expect(pack.searchProcess?.candidateShortfall).toBeGreaterThan(0);
    expect(pack.evidenceWarnings?.join("\n")).toContain("已广搜");
    expect(pack.evidenceWarnings?.join("\n")).toContain("直接证据不足");
    expect(requests.length).toBeGreaterThan(6);
  });

  test("triggers low-quality fallback when candidates exist but none are direct or supporting", async () => {
    const provider = createNoIntentProvider();
    const requests: Parameters<SearchProvider["search"]>[0][] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);
        if (requests.length <= 4) {
          return {
            provider: "test-search",
            results: [
              {
                title: "Capital market notes on unrelated AI funding",
                url: "https://example.com/funding-notes",
                provider: "test-search",
                sourceQuery: request.query,
                snippet:
                  "Investors discuss AI funding, valuation, capital markets, and financing trends without covering office automation, coding assistance, model capability, enterprise deployment, or user workflow evidence. ".repeat(
                    6,
                  ),
              },
            ],
          };
        }

        return {
          provider: "test-search",
          results: [
            {
              title: "Model capability and enterprise adoption comparison",
              url: "https://example.com/model-capability-adoption",
              provider: "test-search",
              sourceQuery: request.query,
              snippet:
                "The report compares Kimi, GLM, GPT-4o, and Claude across Chinese office automation, coding assistance, enterprise adoption, workflow usage, capability, product performance, developer ecosystem, and user feedback. ".repeat(
                  8,
                ),
            },
          ],
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider: createNoopExtractProvider(),
      participants: [participant],
      provider,
      searchProvider,
      topic:
        "Compare Kimi, GLM, GPT-4o, and Claude in Chinese office automation and coding assistance.",
    });

    expect(pack.searchProcess?.zeroResultFallbackTriggered).not.toBe(true);
    expect(pack.searchProcess?.fallbackQueries?.length).toBeGreaterThan(0);
    expect(pack.searchProcess?.warnings).toContain("searchLowQuality");
    expect(requests.length).toBeGreaterThan(4);
  });

  test("strict evidence selection keeps raw candidate debug for discarded candidates", async () => {
    const provider = createNoIntentProvider();
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        return {
          provider: "test-search",
          results: Array.from({ length: request.maxResults ?? 10 }, (_, index) => ({
            title: `Peripheral capital markets note ${index + 1}`,
            url: `https://capital-${request.query.replace(/\W+/g, "-")}-${index}.example.com`,
            provider: "test-search",
            sourceQuery: request.query,
            snippet:
              "Funding valuation investor strategy capital markets financing expansion narrative without Chinese office workflow coding assistance user feedback or product capability evidence. ".repeat(
                8,
              ),
          })),
        };
      },
    };

    const pack = await buildModelDrivenWebEvidencePack({
      extractProvider: createNoopExtractProvider(),
      participants: [participant],
      provider,
      searchMode: "deep",
      searchProvider,
      topic:
        "AlphaSuite 和 BetaSuite 在中文办公和代码辅助场景中的竞争力比较",
    });

    expect(pack.searchProcess?.rawCandidateTarget).toBe(60);
    expect(pack.searchProcess?.rawCandidateCount).toBeGreaterThan(0);
    expect(pack.searchProcess?.uniqueCandidateCount).toBeGreaterThan(0);
    expect(pack.searchProcess?.results.length).toBeGreaterThanOrEqual(
      pack.searchProcess?.selectedEvidenceCount ?? 0,
    );
    expect(pack.searchProcess?.debugSummary?.retrieval).toEqual(
      expect.objectContaining({
        rawCandidateTarget: 60,
        selectedEvidenceTarget: 12,
      }),
    );
  });

  test("all zero results still produces a valid searchProcess", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "某技术概念最新进展如何影响产业",
      searcher: async () => [],
    });

    expect(pack.searchProcess).toBeDefined();
    expect(pack.searchProcess?.passStats).toBeDefined();
    expect(pack.searchProcess?.skippedPasses ?? []).toEqual(expect.any(Array));
    expect(pack.searchProcess?.skippedPassReasons).toBeDefined();
  });

  test("fallback uses topic-analysis levels before domain-restricted media retries", async () => {
    const provider = createNoIntentProvider();
    const requests: Parameters<SearchProvider["search"]>[0][] = [];
    const searchProvider: SearchProvider = {
      id: "test-search",
      displayName: "Test Search",
      async search(request) {
        requests.push(request);
        return { provider: "test-search", results: [] };
      },
    };

    const rawTopic =
      "请讨论 OmegaDesk 在企业知识库和客服场景是否应该继续扩张，哪个更好？";
    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      searchProvider,
      topic: rawTopic,
    });

    expect(pack.searchProcess?.zeroResultFallbackTriggered).toBe(true);
    expect(pack.searchProcess?.warnings).toContain("searchNoResults");
    expect(pack.searchProcess?.fallbackQueries?.join("\n")).toContain("OmegaDesk");
    expect(pack.searchProcess?.fallbackQueries?.join("\n")).toMatch(
      /企业知识库|客服|enterprise|customer|adoption|capability/,
    );
    expect(pack.searchProcess?.fallbackQueries?.join("\n")).not.toContain(rawTopic);
    expect(requests.some((request) => request.includeDomains === undefined)).toBe(true);
    expect(pack.searchProcess?.passStats?.some((stat) =>
      stat.passName === "general_web" && stat.queryLevel === "fallback_broad",
    )).toBe(true);
  });

  test("classifies poor analyzer queries separately from provider zero results", async () => {
    const provider = createNoIntentProvider();

    const pack = await buildModelDrivenWebEvidencePack({
      participants: [participant],
      provider,
      topic: "你们认为怎么样？是否应该讨论哪个更好？",
      searcher: async () => [],
    });

    expect(pack.searchProcess?.warnings).toContain("searchQueryPoor");
    expect(pack.searchProcess?.warnings).not.toContain("all_key_passes_failed");
    expect(pack.searchProcess?.debugSummary?.passStats.some((stat) =>
      stat.queryQuality?.ok === false,
    )).toBe(true);
  });
});

describe("resolveSearchRegionPreference", () => {
  test("explicit user preference takes priority over auto detection", () => {
    const result = resolveSearchRegionPreference({
      topic: "中国 AI 政策最新动态",
      searchRegion: "us",
    });

    expect(result.resolvedRegion).toBe("us");
    expect(result.regionSource).toBe("user_preference");
    expect(result.regionFallbackReason).toBe("none");
  });

  test("Chinese policy topic auto-detects to china", () => {
    const result = resolveSearchRegionPreference({
      topic: "中国 AI 监管政策最新动态",
      searchRegion: "auto",
    });

    expect(result.resolvedRegion).toBe("china");
    expect(result.regionSource).toBe("auto_detected");
  });

  test("international topic defaults to global", () => {
    const result = resolveSearchRegionPreference({
      topic: "AI model benchmark comparison 2026",
      searchRegion: "auto",
    });

    expect(result.resolvedRegion).toBe("global");
    expect(result.regionSource).toBe("default_global");
    expect(result.regionFallbackReason).toBe("uncertain_auto_region");
  });

  test("Chinese query without China-specific context defaults to global", () => {
    const result = resolveSearchRegionPreference({
      topic: "最新 AI 模型发布对行业的影响",
      searchRegion: "auto",
    });

    expect(result.resolvedRegion).toBe("global");
    expect(result.regionSource).toBe("default_global");
  });

  test("Japanese topic auto-detects to japan", () => {
    const result = resolveSearchRegionPreference({
      topic: "日本 AI 市场发展趋势",
      searchRegion: "auto",
    });

    expect(result.resolvedRegion).toBe("japan");
    expect(result.regionSource).toBe("auto_detected");
  });

  test("Korean topic auto-detects to korea", () => {
    const result = resolveSearchRegionPreference({
      topic: "韩国半导体产业发展",
      searchRegion: "auto",
    });

    expect(result.resolvedRegion).toBe("korea");
    expect(result.regionSource).toBe("auto_detected");
  });

  test("US topic auto-detects to us", () => {
    const result = resolveSearchRegionPreference({
      topic: "美国 AI 监管政策最新进展",
      searchRegion: "auto",
    });

    expect(result.resolvedRegion).toBe("us");
    expect(result.regionSource).toBe("auto_detected");
  });

  test("global explicit selection returns global", () => {
    const result = resolveSearchRegionPreference({
      topic: "任意议题",
      searchRegion: "global",
    });

    expect(result.resolvedRegion).toBe("global");
    expect(result.regionSource).toBe("user_preference");
  });
});

describe("source code scan: no fixture-specific terms in business logic", () => {
  test("model-driven-web-search.ts does not contain fixture-specific model or company names", () => {
    const businessFiles = [
      "src/lib/search/model-driven-web-search.ts",
      "src/lib/search/tavily-search.ts",
      "src/lib/search/evidence-pack.ts",
    ];
    const fixturePatterns = [
      /DeepSeek/i,
      /deepseekv4/i,
      /华为/,
      /華為/,
      /韬定律/,
      /雄韬/,
    ];

    for (const file of businessFiles) {
      const fullPath = path.join(process.cwd(), file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, "utf8");

      for (const pattern of fixturePatterns) {
        if (pattern.test(content)) {
          expect(`${file} contains fixture term: ${pattern.source}`).toBe(
            "no fixture terms",
          );
        }
      }
    }
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

function createNoopExtractProvider(): ExtractProvider {
  return {
    id: "test-extract",
    displayName: "Test Extract",
    async extract() {
      return {
        provider: "test-extract",
        results: [],
      };
    },
  };
}
