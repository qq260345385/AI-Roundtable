import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  formatEvidencePackForPrompt,
  isCoreEvidenceItem,
  normalizeEvidencePack,
  resolveEvidencePackDelivery,
  scoreEvidence,
  summarizeEvidenceQuality,
} from "./evidence-pack";
import { exportMeetingToMarkdown } from "../meeting/export-markdown";

describe("normalizeEvidencePack", () => {
  test("returns a disabled empty pack when input is missing or disabled", () => {
    expect(normalizeEvidencePack(undefined)).toEqual({
      enabled: false,
      evidenceStatus: "none",
      items: [],
    });
    expect(
      normalizeEvidencePack({
        enabled: false,
        items: [{ snippet: "会被忽略" }],
      }),
    ).toEqual({
      enabled: false,
      evidenceStatus: "none",
      items: [],
    });
  });

  test("regenerates evidence ids and filters empty snippets", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          id: "user-controlled-id",
          title: "资料 A",
          snippet: "第一条资料摘要",
        },
        {
          title: "空摘要",
          snippet: "   ",
        },
        {
          title: "资料 B",
          snippet: "第二条资料摘要",
        },
      ],
    });

    expect(pack.enabled).toBe(true);
    expect(pack.items.map((item) => item.id)).toEqual(["S1", "S2"]);
    expect(pack.items.map((item) => item.title)).toEqual(["资料 A", "资料 B"]);
  });

  test("keeps at most ten evidence items", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: Array.from({ length: 12 }, (_, index) => ({
        title: `资料 ${index + 1}`,
        url: `https://openai.com/research/${index + 1}`,
        snippet: `摘要 ${index + 1} ${"A".repeat(500)}`,
      })),
    });

    expect(pack.items).toHaveLength(10);
    expect(pack.items.map((item) => item.id)).toEqual([
      "S1",
      "S2",
      "S3",
      "S4",
      "S5",
      "S6",
      "S7",
      "S8",
      "S9",
      "S10",
    ]);
  });

  test("keeps low reliability evidence when high or medium candidates exist", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          title: "Reddit rumor",
          url: "https://reddit.com/r/test",
          snippet: "A".repeat(500),
        },
        {
          title: "Official announcement",
          url: "https://openai.com/index/test",
          snippet: "A".repeat(500),
        },
        {
          title: "YouTube reaction",
          url: "https://youtube.com/watch?v=test",
          snippet: "A".repeat(500),
        },
        {
          title: "Benchmark result",
          url: "https://lmarena.ai/leaderboard",
          snippet: "A".repeat(500),
        },
      ],
    });

    expect(pack.items.map((item) => item.title)).toEqual([
      "Official announcement",
      "Benchmark result",
      "Reddit rumor",
      "YouTube reaction",
    ]);
    expect(
      pack.items.every(
        (item) =>
          item.quality?.reliability === "high" ||
          item.quality?.reliability === "medium" ||
          item.quality?.reliability === "low",
      ),
    ).toBe(true);
  });

  test("does not treat long technical background as core evidence for company competition topics", () => {
    const topic = "OpenAI 和 Anthropic 哪个公司会笑到最后";
    const technicalBackground = {
      id: "S1",
      title: "OpenAI model safety evaluation and benchmark update",
      url: "https://openai.com/index/model-safety-evaluations",
      snippet:
        "OpenAI publishes a long technical safety and benchmark evaluation describing model capability, alignment evaluation, red teaming, benchmark design, product release details, and safety mitigations. ".repeat(
          12,
        ),
    };
    const quality = scoreEvidence({
      ...technicalBackground,
      topic,
    });

    expect(quality.topicRelevanceScore).toBeLessThan(60);
    expect(quality.coverageDimension).toBe("safety_alignment");
    expect(quality.matchedQuestionAspects).toEqual(["technical_capability"]);
    expect(
      isCoreEvidenceItem({
        ...technicalBackground,
        quality,
      }),
    ).toBe(false);
  });

  test("uses domain only for source identity and source credibility, not topic relevance or coverage", () => {
    const topic = "比较两家企业的长期竞争格局";
    const sharedEvidence = {
      title: "Enterprise adoption and funding analysis",
      snippet:
        "The article compares enterprise customer adoption, revenue quality, funding capacity, market share, governance risks, and long-term competitive position. ".repeat(
          10,
        ),
    };
    const official = scoreEvidence({
      ...sharedEvidence,
      url: "https://openai.com/news/company-analysis",
      topic,
    });
    const unknown = scoreEvidence({
      ...sharedEvidence,
      url: "https://example-research.test/company-analysis",
      topic,
    });

    expect(official.sourceType).not.toBe(unknown.sourceType);
    expect(official.score).not.toBe(unknown.score);
    expect(official.topicType).toBe(unknown.topicType);
    expect(official.coverageDimension).toBe(unknown.coverageDimension);
    expect(official.topicRelevanceScore).toBe(unknown.topicRelevanceScore);
    expect(official.matchedQuestionAspects).toEqual(
      unknown.matchedQuestionAspects,
    );
    expect(official.relevanceReason).toBe(unknown.relevanceReason);
  });

  test("scores Chinese title keyword matches as relevant instead of zero", () => {
    const quality = scoreEvidence({
      title: "甲方科技发布本地化战略更新",
      url: "https://example.com/news/local-strategy",
      snippet: "这是一条较短的新闻摘要，提到企业战略和市场竞争。",
      topic: "怎么看甲方科技最近发布的本地化战略",
    });

    expect(quality.topicRelevanceScore).toBeGreaterThan(0);
    expect(quality.relevanceScore).toBeGreaterThan(0);
  });

  test("scores strongly matching Chinese title and body as topic relevant", () => {
    const quality = scoreEvidence({
      title: "甲方科技本地化战略发布，覆盖市场竞争和客户采用",
      url: "https://stcn.com/article/local-strategy",
      snippet:
        "甲方科技本地化战略发布后，文章持续讨论甲方科技、本地化战略、市场竞争、客户采用、商业化收入和产业合作。".repeat(
          20,
        ),
      topic: "怎么看甲方科技最近发布的本地化战略",
    });

    expect(quality.topicRelevanceScore).toBeGreaterThanOrEqual(60);
    expect(quality.relevanceScore).toBeGreaterThanOrEqual(60);
  });

  test("does not treat weak downgraded coverage as complete coverage", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "甲方科技融资和市场竞争线索",
            url: "https://example.com/short-note",
            snippet: "甲方科技融资、市场竞争、客户采用、监管政策。",
          },
        ],
      },
      { topic: "甲方科技 与 乙方科技 谁更有长期竞争优势" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.coreEvidenceCount).toBe(0);
    expect(overview.coverageCompleteness).toBeLessThan(1);
    expect(overview.weakCoveredDimensions.length).toBeGreaterThan(0);
    expect(overview.strongCoveredDimensions).toHaveLength(0);
  });

  test("classifies localized Chinese media domains instead of unknown", () => {
    expect(
      scoreEvidence({
        title: "本地媒体报道",
        url: "https://people.com.cn/n1/test.html",
        snippet: "市场和产业新闻正文。".repeat(80),
      }).sourceType,
    ).toBe("reputable_media");
    expect(
      scoreEvidence({
        title: "证券时报报道",
        url: "https://stcn.com/article/detail/123.html",
        snippet: "金融市场和公司新闻正文。".repeat(80),
      }).sourceType,
    ).toBe("reputable_media");
    expect(
      scoreEvidence({
        title: "行业媒体报道",
        url: "https://gasgoo.com/news/123.html",
        snippet: "汽车产业链和行业分析正文。".repeat(80),
      }).sourceType,
    ).toBe("industry_report");
  });

  test("resolves official domains from generic topic entities without changing relevance or coverage", () => {
    const topic = "Acme Robotics 与 Beta Labs 谁更有长期竞争优势";
    const sharedEvidence = {
      title: "Acme Robotics enterprise adoption and market strategy",
      snippet:
        "Acme Robotics discusses enterprise adoption, customer contracts, revenue quality, governance, market strategy, and long-term competition. ".repeat(
          10,
        ),
      topic,
    };
    const official = scoreEvidence({
      ...sharedEvidence,
      url: "https://acme-robotics.com/news/company-update",
    });
    const mirror = scoreEvidence({
      ...sharedEvidence,
      url: "https://example-research.test/company-update",
    });

    expect(["official_statement", "official_blog", "official_docs"]).toContain(
      official.sourceType,
    );
    expect(mirror.sourceType).toBe("unknown");
    expect(official.topicRelevanceScore).toBe(mirror.topicRelevanceScore);
    expect(official.coverageDimension).toBe(mirror.coverageDimension);
  });

  test("caps company competition reliability when business capital and market dimensions are missing", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "OpenAI model card and safety evaluation",
            url: "https://openai.com/index/model-card",
            snippet:
              "OpenAI describes model capability, benchmark evaluations, safety alignment, red teaming, and product release behavior. ".repeat(
                16,
              ),
          },
          {
            title: "Anthropic safety alignment research update",
            url: "https://anthropic.com/news/safety-update",
            snippet:
              "Anthropic describes constitutional AI, safety alignment, model evaluations, benchmark analysis, and product safety practices. ".repeat(
                16,
              ),
          },
          {
            title: "AI benchmark comparison",
            url: "https://semianalysis.com/2026/ai-benchmark-comparison",
            snippet:
              "This industry analysis compares model benchmark performance, technical capability, latency, product behavior, safety evaluations, and model release cadence. ".repeat(
                16,
              ),
          },
        ],
      },
      { topic: "OpenAI 和 Anthropic 哪个公司会笑到最后" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.coreEvidenceCount).toBe(0);
    expect(overview.coveredDimensions).toEqual(
      expect.arrayContaining(["technical_capability", "safety_alignment"]),
    );
    expect(overview.missingDimensions).toEqual(
      expect.arrayContaining([
        "business_revenue_or_enterprise_adoption",
        "funding_capital_or_market_analysis",
        "regulation_governance_or_legal_lawsuit",
      ]),
    );
    expect(overview.coverageCompleteness).toBeLessThan(1);
    expect(overview.overallReliability).not.toBe("高");
  });

  test("keeps the best low quality evidence only as a fallback when no usable candidates exist", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          title: "Reddit rumor",
          url: "https://reddit.com/r/test",
          snippet: "A".repeat(500),
        },
        {
          title: "YouTube reaction",
          url: "https://youtube.com/watch?v=test",
          snippet: "A".repeat(500),
        },
      ],
    });

    expect(pack.items).toHaveLength(2);
    expect(
      pack.items.every(
        (item) =>
          item.quality?.reliability === "low" ||
          item.quality?.reliability === "very_low",
      ),
    ).toBe(true);
  });

  test("truncates long fields and drops non-http urls", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          title: "T".repeat(300),
          url: "javascript:alert(1)",
          source: "S".repeat(120),
          publishedAt: "P".repeat(120),
          snippet: "A".repeat(2000),
        },
      ],
    });

    expect(pack.items[0].title).toHaveLength(120);
    expect(pack.items[0].snippet).toHaveLength(2000);
    expect(pack.items[0].source).toHaveLength(80);
    expect(pack.items[0].publishedAt).toHaveLength(40);
    expect(pack.items[0].url).toBeUndefined();
  });

  test("adds quality metadata for normalized evidence", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          title: "资料标题",
          snippet: "A".repeat(50000),
        },
      ],
    });

    expect(pack.items[0].quality).toEqual(
      expect.objectContaining({
        textLength: 40000,
        wasTruncated: true,
        warnings: expect.arrayContaining(["内容已截断"]),
        score: expect.any(Number),
        sourceType: expect.any(String),
        reliability: expect.any(String),
        relevanceScore: expect.any(Number),
        authorityScore: expect.any(Number),
        freshnessScore: expect.any(Number),
        contentScore: expect.any(Number),
        diversityScore: expect.any(Number),
      }),
    );
  });

  test("keeps evidence status, warnings, and search queries on normalized packs", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      evidenceStatus: "low",
      evidenceWarnings: ["低证据提示"],
      searchQueries: ["DeepSeek benchmark"],
      items: [
        {
          title: "Reddit rumor",
          url: "https://reddit.com/r/test",
          snippet: "A".repeat(500),
        },
      ],
    });

    expect(pack.evidenceStatus).toBe("low");
    expect(pack.evidenceWarnings).toEqual(["低证据提示"]);
    expect(pack.searchQueries).toEqual(["DeepSeek benchmark"]);
  });

  test("scores official evidence as high reliability", () => {
    const quality = scoreEvidence({
      title: "Gemini model update",
      url: "https://blog.google/technology/ai/gemini-update/",
      snippet: "A".repeat(900),
    });

    expect(quality.sourceType).toBe("official_blog");
    expect(quality.reliability).toBe("high");
    expect(quality.citationLevel).toBe("fact");
    expect(quality.score).toBeGreaterThanOrEqual(80);
  });

  test("does not treat snippet-only evidence as high quality", () => {
    const quality = scoreEvidence({
      title: "Reuters short search result",
      url: "https://reuters.com/technology/artificial-intelligence/example",
      snippet: "Short search-result summary. ".repeat(6),
    });

    expect(quality).toEqual(
      expect.objectContaining({
        snippetOnly: true,
        reliability: expect.not.stringMatching(/^high$/),
      }),
    );
    expect(quality.score).toEqual(expect.any(Number));
  });

  test("classifies official community domains separately from strong official sources", () => {
    const communityQuality = scoreEvidence({
      title: "OpenAI community discussion",
      url: "https://community.openai.com/t/example-thread",
      snippet: "Community forum discussion. ".repeat(50),
    });
    const newsQuality = scoreEvidence({
      title: "OpenAI news post",
      url: "https://openai.com/news/example",
      snippet: "Official OpenAI news post. ".repeat(50),
    });

    expect(communityQuality.sourceType).toBe("official_community");
    expect(communityQuality.reliability).not.toBe("high");
    expect(newsQuality.sourceType).toBe("official_blog");
  });

  test("classifies nytimes.com as reputable media", () => {
    const quality = scoreEvidence({
      title: "New York Times AI financing report",
      url: "https://www.nytimes.com/2026/05/20/technology/ai-financing.html",
      snippet: "A New York Times technology report. ".repeat(40),
    });

    expect(quality.sourceType).toBe("reputable_media");
  });

  test("assigns internal citation levels from evidence reliability", () => {
    expect(
      scoreEvidence({
        title: "Official model release",
        url: "https://openai.com/index/model-release",
        snippet: "Official release notes. ".repeat(40),
      }),
    ).toEqual(
      expect.objectContaining({
        reliability: "high",
        citationLevel: "fact",
        citationGuidance: expect.stringContaining("factual"),
      }),
    );
    expect(
      scoreEvidence({
        title: "Reddit discussion",
        url: "https://reddit.com/r/artificial/comments/test",
        snippet: "Community discussion. ".repeat(40),
      }),
    ).toEqual(
      expect.objectContaining({
        reliability: "low",
        citationLevel: "context_only",
        citationGuidance: expect.stringContaining("context"),
      }),
    );
    expect(
      scoreEvidence({
        title: "Short social post",
        url: "https://x.com/example/status/1",
        snippet: "too short",
      }),
    ).toEqual(
      expect.objectContaining({
        reliability: "very_low",
        citationLevel: "not_citable",
      }),
    );
  });

  test("does not mark a short relevant unknown-source snippet as very low only because it is short", () => {
    const quality = scoreEvidence({
      title: "DeepSeek V3 benchmark leaderboard update",
      url: "https://example.org/deepseek-v3-benchmark",
      snippet: "DeepSeek V3 appears in current AI benchmark leaderboard results.",
      topic: "DeepSeek V3 benchmark leaderboard",
    });

    expect(quality.sourceType).toBe("unknown");
    expect(quality.reliability).toBe("low");
    expect(quality.citationLevel).toBe("context_only");
  });

  test("keeps unknown-source evidence when the content is usable", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          title: "Independent model benchmark notes",
          url: "https://example.org/model-benchmark-notes",
          snippet: "Independent model benchmark notes. ".repeat(30),
        },
      ],
    });

    expect(pack.enabled).toBe(true);
    expect(pack.items).toHaveLength(1);
    expect(pack.items[0].quality?.sourceType).toBe("unknown");
    expect(pack.items[0].quality?.reliability).not.toBe("very_low");
  });

  test("scores community, video, and social sources lower", () => {
    expect(
      scoreEvidence({
        title: "Reddit discussion",
        url: "https://www.reddit.com/r/LocalLLaMA/comments/test",
        snippet: "A".repeat(500),
      }),
    ).toEqual(
      expect.objectContaining({
        sourceType: "social_forum",
        reliability: "low",
      }),
    );
    expect(
      scoreEvidence({
        title: "YouTube analysis",
        url: "https://youtube.com/watch?v=test",
        snippet: "A".repeat(500),
      }),
    ).toEqual(
      expect.objectContaining({
        sourceType: "video_platform",
        reliability: "low",
      }),
    );
    expect(
      scoreEvidence({
        title: "Instagram post",
        url: "https://instagram.com/p/test",
        snippet: "A".repeat(500),
      }),
    ).toEqual(
      expect.objectContaining({
        sourceType: "social_forum",
        reliability: "low",
      }),
    );
  });

  test("warns for extremely short and clickbait evidence", () => {
    const quality = scoreEvidence({
      title: "全网首曝：新模型吊打所有对手",
      url: "https://zhihu.com/question/test",
      snippet: "只有一句话",
    });

    expect(quality.warnings).toEqual(
      expect.arrayContaining([
        "内容过短，可能不足以支撑可靠结论",
        "仅有标题或极短摘要，不能作为事实依据",
        "标题存在夸张或标题党风险",
      ]),
    );
    expect(quality.reliability).toBe("very_low");
  });

  test("sorts normalized usable evidence by source quality before assigning ids", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          title: "Reddit rumor",
          url: "https://reddit.com/r/test",
          snippet: "A".repeat(500),
        },
        {
          title: "Official announcement",
          url: "https://openai.com/index/test",
          snippet: "A".repeat(500),
        },
        {
          title: "Benchmark result",
          url: "https://lmarena.ai/leaderboard",
          snippet: "A".repeat(500),
        },
      ],
    });

    expect(pack.items.map((item) => item.title)).toEqual([
      "Official announcement",
      "Benchmark result",
      "Reddit rumor",
    ]);
    expect(pack.items.map((item) => item.id)).toEqual(["S1", "S2", "S3"]);
  });

  test("keeps a normalized document input strategy", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      strategy: "native_file",
      items: [
        {
          title: "report.docx",
          snippet: "文档内容",
        },
      ],
    });

    expect(pack.strategy).toBe("native_file");
  });

  test("keeps low reliability evidence but filters very low reliability evidence", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          title: "Official report",
          url: "https://openai.com/research/report",
          snippet: `Official evidence. ${"A".repeat(900)}`,
        },
        {
          title: "Community discussion with enough context",
          url: "https://reddit.com/r/artificial/comments/test",
          snippet: `Community discussion with enough details. ${"B".repeat(500)}`,
        },
        {
          title: "Short social post",
          url: "https://x.com/example/status/1",
          snippet: "too short",
        },
      ],
    });

    expect(pack.items.map((item) => item.title)).toEqual([
      "Official report",
      "Community discussion with enough context",
    ]);
    expect(
      pack.items.map((item) => item.quality?.reliability),
    ).toEqual(["high", "low"]);
  });

  test("marks low reliability web evidence as low evidence in the search process", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      searchProcess: {
        executedQueries: ["community model benchmark"],
        searchIntents: [
          {
            participantId: "gpt-mock",
            participantName: "GPT Mock",
            provider: "OpenAI",
            model: "gpt-mock",
            intents: ["community model benchmark"],
          },
        ],
      },
      items: [
        {
          title: "Community discussion",
          url: "https://reddit.com/r/artificial/comments/test",
          snippet: `Community discussion with enough details. ${"B".repeat(500)}`,
        },
      ],
    });

    expect(pack.items).toHaveLength(1);
    expect(pack.items[0].quality?.reliability).toBe("low");
    expect(pack.items[0].quality?.warnings).toContain("低证据资料：只能作为观点线索，不能单独支撑事实结论");
    expect(pack.searchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "low_evidence",
        qualityOverview: expect.objectContaining({
          includedCount: 1,
          lowEvidenceCount: 1,
          filteredCount: 0,
        }),
      }),
    );
  });

  test("filters very low reliability web evidence and records the filter reason", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      searchProcess: {
        executedQueries: ["mixed model benchmark"],
      },
      items: [
        {
          title: "Official report",
          url: "https://openai.com/research/report",
          snippet: `Official evidence. ${"A".repeat(500)}`,
        },
        {
          title: "Short social post",
          url: "https://x.com/example/status/1",
          snippet: "too short",
        },
      ],
    });

    expect(pack.items.map((item) => item.title)).toEqual(["Official report"]);
    expect(pack.searchProcess?.qualityOverview.filteredCount).toBe(1);
    expect(pack.searchProcess?.filteredReasons).toEqual([
      {
        reason: "very_low_quality",
        count: 1,
      },
    ]);
    expect(pack.searchProcess?.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Short social post",
          reliability: "very_low",
          citationLevel: "not_citable",
          includedInEvidencePack: false,
          filtered: true,
          filteredReason: "very_low_quality",
        }),
      ]),
    );
  });

  test("summarizes evidence hit rate, extraction rate, and degrade reasons for debug", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      searchProcess: {
        executedQueries: ["AI financing"],
        extractAttempted: 5,
        extractSucceededCount: 3,
      },
      items: [
        {
          title: "Official financing announcement",
          url: "https://openai.com/news/financing",
          snippet: "AI financing official announcement. ".repeat(40),
        },
        {
          title: "Reuters financing report",
          url: "https://reuters.com/technology/artificial-intelligence/financing",
          snippet: "AI financing Reuters report. ".repeat(40),
        },
        {
          title: "Short official search result",
          url: "https://openai.com/news/short-financing",
          snippet: "Official snippet only. ".repeat(4),
        },
        {
          title: "Short Reuters search result",
          url: "https://reuters.com/technology/artificial-intelligence/short",
          snippet: "Reuters snippet only. ".repeat(4),
        },
        {
          title: "Short unknown search result",
          url: "https://example.com/short",
          snippet: "Unknown snippet only. ".repeat(4),
        },
        {
          title: "Reddit financing discussion",
          url: "https://reddit.com/r/artificial/comments/financing",
          snippet: "Community discussion. ".repeat(40),
        },
        {
          title: "YouTube financing analysis",
          url: "https://youtube.com/watch?v=financing",
          snippet: "Video discussion. ".repeat(70),
        },
        {
          title: "LinkedIn financing post",
          url: "https://linkedin.com/posts/example-financing",
          snippet: "Social post. ".repeat(70),
        },
        {
          title: "Instagram financing post",
          url: "https://instagram.com/p/financing",
          snippet: "Instagram reaction. ".repeat(40),
        },
        {
          title: "Unknown short mention",
          url: "https://unknown.example/financing",
          snippet: "short clue",
        },
      ],
    });

    expect(pack.searchProcess?.debugSummary).toEqual(
      expect.objectContaining({
        evidenceHitRate: {
          candidateCount: 10,
          coreEvidenceCount: 2,
          evidenceHitRate: 0.2,
        },
        extractionSuccessRate: {
          extractAttemptCount: 5,
          extractSuccessCount: 3,
          extractionSuccessRate: 0.6,
        },
        degradeReasonsSummary: expect.objectContaining({
          snippetOnly: 5,
        }),
      }),
    );
  });

  test("records multiple low-evidence trigger reasons at the same time", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      searchProcess: {
        executedQueries: ["social dominated AI financing"],
        targetedSearchRetryTriggered: true,
        targetedSearchRetryReason: "social_video_ratio_above_threshold",
      },
      items: Array.from({ length: 10 }, (_, index) => ({
        title: `Social clue ${index + 1}`,
        url:
          index < 6
            ? `https://reddit.com/r/artificial/comments/${index + 1}`
            : `https://example.com/short-${index + 1}`,
        snippet: `Short low evidence clue ${index + 1}.`,
      })),
    });

    expect(pack.searchProcess?.debugSummary?.lowEvidenceTriggerReasons).toEqual(
      expect.objectContaining({
        coreEvidenceLessThan3: true,
        highMediumLessThan3: true,
        shortTextRatioTooHigh: true,
        socialVideoRatioTooHigh: true,
        searchFailed: false,
      }),
    );
  });

  test("falls back to text_pack strategy for invalid strategy values", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      strategy: "send_everything_directly",
      items: [
        {
          title: "report.docx",
          snippet: "文档内容",
        },
      ],
    });

    expect(pack.strategy).toBe("text_pack");
  });

  test("adds warnings for short snippets and empty titles", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      items: [
        {
          title: "   ",
          snippet: "短资料",
        },
      ],
    });

    expect(pack.items[0].title).toBe("未命名资料");
    expect(pack.items[0].quality?.textLength).toBe(3);
    expect(pack.items[0].quality?.wasTruncated).toBe(false);
    expect(pack.items[0].quality?.warnings).toEqual(
      expect.arrayContaining([
        "资料标题为空",
        "资料摘要较短，可能不足以支撑可靠讨论",
      ]),
    );
  });

  test("formats enabled and disabled packs for prompts", () => {
    const enabledPrompt = formatEvidencePackForPrompt(
      normalizeEvidencePack({
        enabled: true,
        items: [
          {
            title: "资料标题",
            source: "Example",
            publishedAt: "2026-05-19",
            url: "https://example.com/a",
            snippet: "资料摘要",
          },
        ],
      }),
    );
    const disabledPrompt = formatEvidencePackForPrompt(undefined);

    expect(enabledPrompt).toContain("## 外部资料包");
    expect(enabledPrompt).toContain("[S1]");
    expect(enabledPrompt).toContain("必须使用资料编号");
    expect(enabledPrompt).toContain("low / very_low 可信度资料只能作为社区观点");
    expect(enabledPrompt).toContain("不能作为事实依据");
    expect(enabledPrompt).toContain("文档输入策略");
    expect(enabledPrompt).toContain("不要编造资料编号");
    expect(disabledPrompt).toContain("本轮会议未启用外部资料包");
    expect(disabledPrompt).toContain("待核验");
  });

  test("formats low evidence status for prompts with uncertainty rules", () => {
    const prompt = formatEvidencePackForPrompt(
      normalizeEvidencePack({
        enabled: true,
        evidenceStatus: "low",
        evidenceWarnings: ["未找到高质量联网资料"],
        items: [
          {
            title: "社区资料",
            url: "https://reddit.com/r/test",
            snippet: "A".repeat(500),
          },
        ],
      }),
    );

    expect(prompt).toContain("证据状态：low");
    expect(prompt).toContain("不得声称掌握最新事实");
    expect(prompt).toContain("请人工核验");
  });

  test("marks low-quality snippet evidence as unverified and suppresses concrete claims in prompts", () => {
    const prompt = formatEvidencePackForPrompt(
      normalizeEvidencePack({
        enabled: true,
        evidenceStatus: "low",
        items: [
          {
            title: "Low quality social claim",
            url: "https://reddit.com/r/artificial/comments/test",
            snippet:
              "GPT-4o scored 1234 points and OpenAI raised $10 billion at a $100 billion valuation.",
            quality: {
              warnings: ["snippet only"],
              textLength: 96,
              wasTruncated: false,
              sourceType: "social_forum",
              reliability: "low",
              score: 35,
              snippetOnly: true,
            },
          },
        ],
      }),
    );

    expect(prompt).toContain("UNVERIFIED_LOW_EVIDENCE_DO_NOT_USE_AS_FACT");
    expect(prompt).toContain(
      "低可信资料中有相关线索，但由于正文不足，本轮不能确认。",
    );
    expect(prompt).not.toContain("$10 billion");
    expect(prompt).not.toContain("$100 billion");
    expect(prompt).not.toContain("1234 points");
  });

  test("formats native file intent with a text fallback note", () => {
    const prompt = formatEvidencePackForPrompt(
      normalizeEvidencePack({
        enabled: true,
        strategy: "native_file",
        items: [
          {
            title: "report.pdf",
            snippet: "资料正文",
          },
        ],
      }),
    );

    expect(prompt).toContain("优先使用原生文件附件");
    expect(prompt).toContain("回退为长文本资料包");
  });

  test("resolves native file intent to text pack when providers do not support native attachments", () => {
    const pack = resolveEvidencePackDelivery(
      normalizeEvidencePack({
        enabled: true,
        strategy: "native_file",
        items: [
          {
            title: "report.pdf",
            snippet: "资料正文",
          },
        ],
      }),
      [
        {
          provider: "DeepSeek",
          capabilities: {
            nativeEvidenceAttachments: false,
          },
        },
      ],
    );

    expect(pack.delivery).toEqual({
      requestedStrategy: "native_file",
      effectiveMode: "text_pack",
      reason:
        "当前参会 provider 未全部声明支持原生文件附件，系统已回退为长文本资料包。",
      nativeAttachmentProviderCount: 0,
      textPackProviderCount: 1,
      unsupportedProviderNames: ["DeepSeek"],
    });
  });

  test("missingDimensions is non-empty when coreEvidenceCount is zero for non-entity topics", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "Short social rumor",
            url: "https://reddit.com/r/test",
            snippet: "A short rumor about AI models.",
          },
        ],
      },
      { topic: "AI model comparison" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.coreEvidenceCount).toBe(0);
    expect(overview.strongCoveredDimensions).toHaveLength(0);
    expect(overview.missingDimensions).not.toHaveLength(0);
    expect(overview.coverageCompleteness).toBe(0);
  });

  test("coverageCompleteness is below 1 when only weak coverage exists", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "Technical background",
            url: "https://example.com/tech",
            snippet:
              "Technical capability and product release discussion. ".repeat(10),
          },
        ],
      },
      { topic: "AI model technical capability" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.coreEvidenceCount).toBe(0);
    expect(overview.weakCoveredDimensions.length).toBeGreaterThan(0);
    expect(overview.coverageCompleteness).toBeLessThan(1);
  });

  test("weak coverage does not clear missingDimensions", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "Business revenue analysis",
            url: "https://example.com/business",
            snippet:
              "Business revenue, enterprise adoption, and market analysis. ".repeat(
                10,
              ),
          },
          {
            title: "Technical capability review",
            url: "https://example.com/tech",
            snippet:
              "Technical capability, benchmark evaluation, and product release. ".repeat(
                10,
              ),
          },
        ],
      },
      { topic: "OpenAI 和 Anthropic 哪个公司会笑到最后" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.coreEvidenceCount).toBe(0);
    expect(overview.weakCoveredDimensions.length).toBeGreaterThan(0);
    expect(overview.missingDimensions.length).toBeGreaterThan(0);
    expect(overview.coverageCompleteness).toBeLessThan(1);
  });

  test("strong coverage contributes to coveredDimensions and reduces missingDimensions", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "Official business report",
            url: "https://openai.com/news/business-report",
            snippet:
              "OpenAI reports enterprise adoption, customer contracts, revenue growth, and market strategy. ".repeat(
                16,
              ),
          },
          {
            title: "Industry technical analysis",
            url: "https://semianalysis.com/2026/ai-analysis",
            snippet:
              "This industry report covers technical capability, benchmark performance, product release, and model evaluation. ".repeat(
                16,
              ),
          },
        ],
      },
      { topic: "OpenAI 和 Anthropic 哪个公司会笑到最后" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.coreEvidenceCount).toBeGreaterThan(0);
    expect(overview.strongCoveredDimensions.length).toBeGreaterThan(0);
    expect(overview.coverageCompleteness).toBeGreaterThan(0);
    expect(overview.missingDimensions.length).toBeLessThan(4);
  });

  test("exported markdown does not show coverage=0 with missingDimensions=none", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "Short social rumor",
            url: "https://reddit.com/r/test",
            snippet: "A short rumor.",
          },
        ],
      },
      { topic: "AI model comparison" },
    );
    const overview = summarizeEvidenceQuality(pack);
    const meeting = {
      topic: "AI model comparison",
      isTimeSensitive: false,
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      evidencePack: pack,
    };
    const participants = [
      {
        id: "test",
        name: "Test Model",
        provider: "TestProvider",
        model: "test-model",
        status: "available" as const,
        statusLabel: "available",
      },
    ];

    const markdown = exportMeetingToMarkdown(
      meeting as Parameters<typeof exportMeetingToMarkdown>[0],
      participants,
    );

    if (overview.coverageCompleteness === 0) {
      expect(markdown).not.toMatch(/缺失维度：\s*无/);
    }
  });

  test("resolves native file intent to native files when every provider supports attachments", () => {
    const pack = resolveEvidencePackDelivery(
      normalizeEvidencePack({
        enabled: true,
        strategy: "native_file",
        items: [
          {
            title: "report.pdf",
            snippet: "资料正文",
          },
        ],
      }),
      [
        {
          provider: "AttachmentProvider",
          capabilities: {
            nativeEvidenceAttachments: true,
          },
        },
      ],
    );

    expect(pack.delivery?.effectiveMode).toBe("native_file");
    expect(pack.delivery?.reason).toBe(
      "所有参会 provider 都声明支持原生文件附件。",
    );
  });

  test("generic: low topicRelevanceScore items cannot enter core evidence", () => {
    const quality = scoreEvidence({
      title: "Company A quarterly earnings report",
      url: "https://reuters.com/technology/earnings",
      snippet:
        "Company A reported quarterly earnings with revenue growth and market expansion details. ".repeat(
          10,
        ),
      topic: "Company B new product launch",
    });

    expect(quality.topicRelevanceScore).toBeLessThan(60);
    expect(
      isCoreEvidenceItem({
        id: "S1",
        title: "Company A quarterly earnings report",
        snippet:
          "Company A reported quarterly earnings with revenue growth and market expansion details. ".repeat(
            10,
          ),
        quality,
      }),
    ).toBe(false);
  });

  test("generic: disassociation signals reduce topic relevance score", () => {
    const withSignal = scoreEvidence({
      title: "Entity X clarifies no relationship with Entity Y technology",
      url: "https://reuters.com/tech/clarification",
      snippet:
        "Entity X issued a public clarification that it has no relationship with Entity Y regarding the new technology. Entity X denies any involvement. ".repeat(
          10,
        ),
      topic: "Entity Y new technology",
    });
    const withoutSignal = scoreEvidence({
      title: "Entity Y new technology launch details",
      url: "https://reuters.com/tech/launch",
      snippet:
        "Entity Y announced its new technology launch with detailed specifications and market analysis. ".repeat(
          10,
        ),
      topic: "Entity Y new technology",
    });

    expect(withSignal.topicRelevanceScore ?? 0).toBeLessThan(
      withoutSignal.topicRelevanceScore ?? 0,
    );
  });

  test("generic: CJK traditional title matches simplified query", () => {
    const quality = scoreEvidence({
      title: "華為發佈新技術突破",
      url: "https://example.com/news/tech",
      snippet: "華為發佈新技術突破，半導體領域取得重大進展。".repeat(10),
      topic: "华为新技术突破",
    });

    expect(quality.topicRelevanceScore).toBeGreaterThan(0);
  });

  test("generic: source credibility does not guarantee core evidence status", () => {
    const quality = scoreEvidence({
      title: "Company quarterly earnings report",
      url: "https://openai.com/news/earnings",
      snippet:
        "Company quarterly earnings report with revenue growth and market expansion. This report covers financial performance and business operations. ".repeat(
          10,
        ),
      topic: "quantum computing breakthroughs",
    });

    expect(quality.sourceType).toBe("official_blog");
    expect(quality.score).toBeGreaterThanOrEqual(60);
    expect(quality.topicRelevanceScore).toBeLessThan(60);
    expect(
      isCoreEvidenceItem({
        id: "S1",
        title: "Company quarterly earnings report",
        snippet:
          "Company quarterly earnings report with revenue growth and market expansion. This report covers financial performance and business operations. ".repeat(
            10,
          ),
        quality,
      }),
    ).toBe(false);
  });

  test("generic: lowEvidenceMode caps reliability at medium", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "Official AI company financing report",
            url: "https://openai.com/news/financing",
            snippet:
              "Official AI company financing report with detailed revenue and market analysis. ".repeat(
                16,
              ),
          },
          {
            title: "Industry AI company financing analysis",
            url: "https://semianalysis.com/ai-financing",
            snippet:
              "Industry AI company financing analysis with market data and revenue projections. ".repeat(
                16,
              ),
          },
        ],
      },
      { topic: "AI company financing" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.coreEvidenceCount).toBeLessThan(3);
    expect(overview.overallReliability).not.toBe("高");
  });

  test("generic: coverageCompleteness below 1 when coreEvidenceCount below 3", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "AI company financing official report",
            url: "https://openai.com/news/financing",
            snippet:
              "AI company financing official report with revenue details. ".repeat(
                16,
              ),
          },
        ],
      },
      { topic: "AI company financing" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.coreEvidenceCount).toBeLessThan(3);
    expect(overview.coverageCompleteness).toBeLessThan(1);
  });

  test("generic: exported markdown does not show Low-Evidence Mode with reliability 高", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "AI company financing report",
            url: "https://openai.com/news/financing",
            snippet:
              "AI company financing report details. ".repeat(16),
          },
        ],
      },
      { topic: "AI company financing" },
    );
    const meeting = {
      topic: "AI company financing",
      isTimeSensitive: false,
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      evidencePack: pack,
    };
    const participants = [
      {
        id: "test",
        name: "Test Model",
        provider: "TestProvider",
        model: "test-model",
        status: "available" as const,
        statusLabel: "available",
      },
    ];
    const markdown = exportMeetingToMarkdown(
      meeting as Parameters<typeof exportMeetingToMarkdown>[0],
      participants,
    );

    if (markdown.includes("Low-Evidence Mode")) {
      expect(markdown).not.toMatch(/本轮结论可靠性：\s*高/);
    }
  });
});

describe("source code scan: no fixture-specific terms in business logic", () => {
  test("evidence-pack.ts does not contain fixture-specific company or topic names", () => {
    const businessFiles = [
      "src/lib/search/evidence-pack.ts",
      "src/lib/meeting/export-markdown.ts",
      "src/lib/meeting/summary-quality-gate.ts",
    ];
    const fixturePatterns = [
      /华为/,
      /華為/,
      /韬定律/,
      /韜定律/,
      /雄韬股份/,
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

describe("topicRelevanceScore missing handling", () => {
  test("missing topicRelevanceScore prevents core evidence entry", () => {
    const quality = scoreEvidence({
      title: "Official company report",
      url: "https://openai.com/news/report",
      snippet: "Official company report with detailed analysis. ".repeat(20),
    });

    expect(quality.topicRelevanceScore).toBeDefined();
    expect(quality.topicRelevanceScore).toBeGreaterThanOrEqual(0);

    const withoutScore = {
      ...quality,
      topicRelevanceScore: undefined,
    };

    expect(
      isCoreEvidenceItem({
        id: "S1",
        title: "Official company report",
        snippet: "Official company report with detailed analysis. ".repeat(20),
        quality: withoutScore as never,
      }),
    ).toBe(false);
  });

  test("debug summary tracks missingTopicRelevanceScore count", () => {
    const pack = normalizeEvidencePack({
      enabled: true,
      searchProcess: {
        executedQueries: ["test query"],
      },
      items: [
        {
          title: "Item with score",
          url: "https://reuters.com/tech/example",
          snippet: "Long enough content for scoring. ".repeat(30),
        },
        {
          title: "Item without score",
          url: "https://example.com/test",
          snippet: "Another long enough content. ".repeat(30),
          quality: {
            textLength: 900,
            wasTruncated: false,
            warnings: [],
            sourceType: "unknown",
            reliability: "low",
            score: 30,
          },
        },
      ],
    });

    expect(pack.searchProcess?.debugSummary?.degradeReasonsSummary.missingTopicRelevanceScore)
      .toBeGreaterThanOrEqual(0);
  });
});

describe("topicType-based coverage profiles", () => {
  test("technical topic prioritizes technical_and_product group", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "AI model capability and performance analysis",
            url: "https://lmarena.ai/leaderboard",
            snippet:
              "AI model capability and performance analysis with detailed technical specifications and benchmark results. ".repeat(
                16,
              ),
          },
        ],
      },
      { topic: "AI model capability comparison" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.strongCoveredDimensions.length).toBeGreaterThan(0);
    expect(
      overview.strongCoveredDimensions.some((d) =>
        ["technical_capability", "benchmark_evaluation", "product_release"].includes(d),
      ),
    ).toBe(true);
  });

  test("policy topic prioritizes governance_and_compliance group", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "AI regulation governance policy update",
            url: "https://reuters.com/policy/ai-regulation",
            snippet:
              "AI regulation governance policy update with compliance requirements and regulatory framework details. ".repeat(
                16,
              ),
          },
        ],
      },
      { topic: "AI regulation governance policy" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.strongCoveredDimensions.length).toBeGreaterThan(0);
    expect(
      overview.strongCoveredDimensions.some((d) =>
        ["regulation_governance", "legal_lawsuit"].includes(d),
      ),
    ).toBe(true);
  });

  test("business topic prioritizes business_and_market group", () => {
    const pack = normalizeEvidencePack(
      {
        enabled: true,
        items: [
          {
            title: "AI company revenue growth analysis",
            url: "https://reuters.com/business/ai-revenue",
            snippet:
              "AI company revenue growth analysis with market share data and enterprise adoption metrics. ".repeat(
                16,
              ),
          },
        ],
      },
      { topic: "AI company revenue growth" },
    );
    const overview = summarizeEvidenceQuality(pack);

    expect(overview.strongCoveredDimensions.length).toBeGreaterThan(0);
  });
});
