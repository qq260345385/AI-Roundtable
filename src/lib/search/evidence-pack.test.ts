import { describe, expect, test } from "vitest";
import {
  formatEvidencePackForPrompt,
  normalizeEvidencePack,
  resolveEvidencePackDelivery,
  scoreEvidence,
} from "./evidence-pack";

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
      snippet: "A".repeat(500),
    });

    expect(quality.sourceType).toBe("official");
    expect(quality.reliability).toBe("high");
    expect(quality.citationLevel).toBe("fact");
    expect(quality.score).toBeGreaterThanOrEqual(80);
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

  test("scores community, video, and social sources lower", () => {
    expect(
      scoreEvidence({
        title: "Reddit discussion",
        url: "https://www.reddit.com/r/LocalLLaMA/comments/test",
        snippet: "A".repeat(500),
      }),
    ).toEqual(
      expect.objectContaining({
        sourceType: "community",
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
        sourceType: "video",
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
        sourceType: "social",
        reliability: "very_low",
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
          snippet: `Official evidence. ${"A".repeat(500)}`,
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
});
