import { describe, expect, test } from "vitest";
import type { MeetingResult, ModelParticipant } from "../types";
import { exportMeetingToMarkdown } from "./export-markdown";

const participants: ModelParticipant[] = [
  {
    id: "gpt-mock",
    name: "GPT Mock",
    provider: "OpenAI",
    model: "gpt-mock",
    status: "mock",
    statusLabel: "Mock / 无需 API",
  },
  {
    id: "claude-mock",
    name: "Claude Mock",
    provider: "Anthropic",
    model: "claude-mock",
    status: "mock",
    statusLabel: "Mock / 无需 API",
  },
];

const meeting: MeetingResult = {
  topic: "如何验证真实模型圆桌会议质量？",
  phases: [
    {
      id: "independent",
      title: "第一阶段：独立观点",
      description: "独立发言",
      turns: [
        {
          id: "independent-gpt",
          phaseId: "independent",
          speakerName: "GPT Mock",
          provider: "OpenAI",
          model: "gpt-mock",
          content: "先看结构和评估维度。",
        },
      ],
    },
    {
      id: "response",
      title: "第二阶段：自由回应",
      description: "自由回应",
      turns: [
        {
          id: "response-claude",
          phaseId: "response",
          speakerName: "Claude Mock",
          provider: "Anthropic",
          model: "claude-mock",
          content: "补充边界和风险。",
        },
      ],
    },
  ],
  summary: {
    consensus: ["需要同时看过程和结论。"],
    differences: ["是否需要更多自动评分仍有分歧。"],
    minorityViews: ["少数派观点：保留人工阅读比自动评分更重要。"],
    risks: ["真实 API 会产生费用。"],
    nextSteps: ["保存脱敏 Markdown 示例。"],
  },
};

describe("exportMeetingToMarkdown", () => {
  test("exports a meeting with all three stage titles", () => {
    const markdown = exportMeetingToMarkdown(meeting, participants);

    expect(markdown).toContain("# AI Roundtable 会议纪要");
    expect(markdown).toContain("## 会议议题");
    expect(markdown).toContain("## 参会模型");
    expect(markdown).toContain("## 第一阶段：独立观点");
    expect(markdown).toContain("## 第二阶段：自由回应");
    expect(markdown).toContain("## 第三阶段：共识整理");
  });

  test("exports evidence sources when evidence pack is enabled", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: true,
          strategy: "native_file",
          items: [
            {
              id: "S1",
              title: "资料标题",
              source: "Example News",
              url: "https://example.com/news",
              snippet: "资料摘要",
            },
            {
              id: "S3",
              title: "评测资料",
              source: "LMArena",
              url: "https://lmarena.ai/leaderboard",
              snippet: "A".repeat(500),
              quality: {
                textLength: 500,
                wasTruncated: false,
                warnings: [],
                sourceType: "industry_report",
                reliability: "medium",
                score: 70,
              },
            },
          ],
        },
      },
      participants,
    );

    expect(markdown).toContain("## Evidence Pack");
    expect(markdown).toContain("文档输入策略：优先原生附件");
    expect(markdown).toContain(
      "- [S1] 资料标题 - Example News - https://example.com/news",
    );
  });

  test("exports fact verification status for low evidence meetings", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: true,
          evidenceStatus: "low",
          evidenceWarnings: ["未找到高质量联网资料"],
          items: [
            {
              id: "S1",
              title: "社区资料",
              source: "Reddit",
              url: "https://reddit.com/r/test",
              snippet: "A".repeat(500),
              quality: {
                textLength: 500,
                wasTruncated: false,
                warnings: [],
                sourceType: "social_forum",
                reliability: "low",
                score: 40,
              },
            },
          ],
        },
      },
      participants,
    );

    expect(markdown).toContain("## 事实核验状态");
    expect(markdown).toContain("本次会议未找到高质量资料，结论仅供参考。");
    expect(markdown).toContain("- 提示：未找到高质量联网资料");
  });

  test("exports fact verification status for no web evidence meetings", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: false,
          evidenceStatus: "none",
          evidenceWarnings: ["未找到可用联网资料"],
          items: [],
        },
      },
      participants,
    );

    expect(markdown).toContain("## 事实核验状态");
    expect(markdown).toContain(
      "本次会议没有可用联网资料，主要基于模型已有知识和推理。",
    );
  });

  test("exports evidence quality overview before evidence candidates", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: true,
          items: [
            {
              id: "S1",
              title: "官方资料",
              source: "OpenAI",
              url: "https://openai.com/index/test",
              snippet: "A".repeat(500),
              quality: {
                textLength: 500,
                wasTruncated: false,
                warnings: [],
                sourceType: "official_statement",
                reliability: "high",
                score: 90,
              },
            },
            {
              id: "S2",
              title: "社区资料",
              source: "Reddit",
              url: "https://reddit.com/r/test",
              snippet: "短",
              quality: {
                textLength: 1,
                wasTruncated: false,
                warnings: [
                  "内容过短，可能不足以支撑可靠结论",
                  "仅有标题或极短摘要，不能作为事实依据",
                ],
                sourceType: "social_forum",
                reliability: "very_low",
                score: 0,
              },
            },
            {
              id: "S3",
              title: "评测资料",
              source: "LMArena",
              url: "https://lmarena.ai/leaderboard",
              snippet: "A".repeat(500),
              quality: {
                textLength: 500,
                wasTruncated: false,
                warnings: [],
                sourceType: "industry_report",
                reliability: "medium",
                score: 70,
              },
            },
          ],
        },
      },
      participants,
    );

    expect(markdown).toContain("## 资料质量概览");
    expect(markdown).toContain("- 强官方资料数量：1");
    expect(markdown).toContain("- 行业报告资料数量：1");
    expect(markdown).toContain("- 社区 / 社交 / 视频资料数量：1");
    expect(markdown).toContain("- 内容过短资料数量：1");
    expect(markdown).toContain("- 本轮结论可靠性：中");
    expect(markdown.indexOf("## 资料质量概览")).toBeLessThan(
      markdown.indexOf("## Evidence Pack"),
    );
  });

  test("exports evidence quality metadata and warnings", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: true,
          items: [
            {
              id: "S1",
              title: "report.pdf",
              source: "本地文档",
              snippet: "资料摘要",
              quality: {
                textLength: 800,
                wasTruncated: true,
                warnings: ["内容已截断", "资料摘要较短，可能不足以支撑可靠讨论"],
                sourceType: "unknown",
                reliability: "low",
                score: 0,
              },
            },
          ],
        },
      },
      participants,
    );

    expect(markdown).toContain("  - 字符数：800");
    expect(markdown).toContain("  - 状态：内容已截断");
    expect(markdown).toContain(
      "  - 提示：内容已截断；资料摘要较短，可能不足以支撑可靠讨论",
    );
  });

  test("does not export undefined evidence scores", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: true,
          items: [
            {
              id: "S1",
              title: "Evidence without score",
              source: "Example",
              url: "https://example.com/report",
              snippet: "Long enough evidence. ".repeat(80),
              quality: {
                textLength: 1600,
                wasTruncated: false,
                warnings: [],
                sourceType: "reputable_media" as never,
                reliability: "medium",
                score: 0,
              },
            },
          ],
        },
      },
      participants,
    );

    expect(markdown).not.toContain("undefined/100");
    expect(markdown).toMatch(/0\/100|未评分/);
  });

  test("splits evidence into core clues and downgraded sections", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: true,
          items: [
            {
              id: "S1",
              title: "Reuters long report",
              source: "Reuters",
              url: "https://reuters.com/technology/example",
              snippet: "Long Reuters report. ".repeat(80),
              quality: {
                textLength: 1600,
                wasTruncated: false,
                warnings: [],
                sourceType: "reputable_media" as never,
                reliability: "high",
                score: 82,
              },
            },
            {
              id: "S2",
              title: "Reddit discussion",
              source: "Reddit",
              url: "https://reddit.com/r/artificial/comments/example",
              snippet: "Long Reddit discussion. ".repeat(80),
              quality: {
                textLength: 1600,
                wasTruncated: false,
                warnings: [],
                sourceType: "social_forum" as never,
                reliability: "low",
                score: 35,
              },
            },
            {
              id: "S3",
              title: "YouTube reaction",
              source: "YouTube",
              url: "https://youtube.com/watch?v=example",
              snippet: "Long YouTube transcript summary. ".repeat(80),
              quality: {
                textLength: 1600,
                wasTruncated: false,
                warnings: [],
                sourceType: "video_platform" as never,
                reliability: "low",
                score: 30,
              },
            },
            {
              id: "S4",
              title: "LinkedIn post",
              source: "LinkedIn",
              url: "https://linkedin.com/posts/example",
              snippet: "Long LinkedIn post. ".repeat(80),
              quality: {
                textLength: 1600,
                wasTruncated: false,
                warnings: [],
                sourceType: "social_forum" as never,
                reliability: "low",
                score: 25,
              },
            },
            {
              id: "S5",
              title: "Short official snippet",
              source: "OpenAI",
              url: "https://openai.com/news/example",
              snippet: "Short official snippet.",
              quality: {
                textLength: 120,
                wasTruncated: false,
                warnings: ["仅有搜索摘要，不能作为核心证据"],
                sourceType: "official_blog" as never,
                reliability: "low",
                score: 50,
                snippetOnly: true,
              } as never,
            },
          ],
        },
      },
      participants,
    );

    expect(markdown).toContain("## 核心证据");
    expect(markdown).toContain("## 舆论线索");
    expect(markdown).toContain("## 被降级资料");
    expect(markdown).toContain("本轮核心证据少于 3 条，会议已进入 low-evidence mode");
    expect(sectionText(markdown, "## 核心证据")).toContain("Reuters long report");
    expect(sectionText(markdown, "## 核心证据")).not.toContain("Reddit discussion");
    expect(sectionText(markdown, "## 核心证据")).not.toContain("YouTube reaction");
    expect(sectionText(markdown, "## 核心证据")).not.toContain("LinkedIn post");
    expect(sectionText(markdown, "## 舆论线索")).toContain("Reddit discussion");
    expect(sectionText(markdown, "## 舆论线索")).toContain("YouTube reaction");
    expect(sectionText(markdown, "## 舆论线索")).toContain("LinkedIn post");
    expect(sectionText(markdown, "## 被降级资料")).toContain("Short official snippet");
  });

  test("exports a no-evidence notice when evidence pack is disabled", () => {
    const markdown = exportMeetingToMarkdown(meeting, participants);

    expect(markdown).toContain("## Evidence Pack");
    expect(markdown).toContain("本轮会议未启用外部资料包");
    expect(markdown).toContain("需要额外核验");
  });

  test("exports citation check results", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
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
        },
        citationCheck: {
          validCitationIds: ["S1", "S2"],
          usedCitationIds: ["S1"],
          missingCitationIds: ["S2"],
          invalidCitationIds: [],
          hasInvalidCitations: false,
        },
      },
      participants,
    );

    expect(markdown).toContain("## 引用检查");
    expect(markdown).toContain("- 有效资料编号：S1, S2");
    expect(markdown).toContain("- 已使用资料编号：S1");
    expect(markdown).toContain("- 未被引用资料编号：S2");
    expect(markdown).toContain("- 无效引用编号：无");
  });

  test("exports a warning when citation check finds invalid ids", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: true,
          items: [
            {
              id: "S1",
              title: "资料 1",
              snippet: "摘要 1",
            },
          ],
        },
        citationCheck: {
          validCitationIds: ["S1"],
          usedCitationIds: ["S9"],
          missingCitationIds: ["S1"],
          invalidCitationIds: ["S9"],
          hasInvalidCitations: true,
        },
      },
      participants,
    );

    expect(markdown).toContain("- 无效引用编号：S9");
    expect(markdown).toContain("会议内容中存在资料包之外的引用编号");
  });

  test("exports a citation check notice when evidence pack is disabled", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        citationCheck: {
          validCitationIds: [],
          usedCitationIds: [],
          missingCitationIds: [],
          invalidCitationIds: [],
          hasInvalidCitations: false,
        },
      },
      participants,
    );

    expect(markdown).toContain("## 引用检查");
    expect(markdown).toContain("本轮会议未启用外部资料包");
  });

  test("exports the compact third-stage structure", () => {
    const markdown = exportMeetingToMarkdown(meeting, participants);

    expect(markdown).toContain("### 可确认事实");
    expect(markdown).toContain("### 低置信推测");
    expect(markdown).toContain("### 不能确认的关键问题");
    expect(markdown).toContain("### 下一步核验建议");
    expect(markdown).not.toContain("### 初步推测");
    expect(markdown).not.toContain("### 不足以确认");
  });

  test("does not export api key fields", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        evidencePack: {
          enabled: true,
          items: [
            {
              id: "S1",
              title: "资料",
              source: "secret-openai-key",
              snippet: "Authorization Bearer secret-openai-key",
            },
          ],
        },
      },
      participants,
    );

    expect(markdown.toLowerCase()).not.toContain("api_key");
    expect(markdown.toLowerCase()).not.toContain("apikey");
    expect(markdown.toLowerCase()).not.toContain("secret");
    expect(markdown).not.toContain("Authorization");
    expect(markdown).not.toContain("Bearer");
  });

  test("exports sanitized provider failure records", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        hasPartialFailures: true,
        failures: [
          {
            providerId: "openai-gpt",
            providerName: "OpenAI",
            model: "gpt-test",
            stage: "independent",
            message: "OpenAI API request failed: 500",
          },
        ],
      },
      participants,
    );

    expect(markdown).toContain("## 模型调用失败记录");
    expect(markdown).toContain("OpenAI / gpt-test / 独立观点");
    expect(markdown).toContain("OpenAI API request failed: 500");
    expect(markdown).toContain("建议：检查 provider 配置或稍后重试。");
    expect(markdown).not.toContain("secret-openai-key");
    expect(markdown).not.toContain("Authorization");
    expect(markdown).not.toContain("Bearer");
  });

  test("exports actionable suggestions for common failure messages", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        hasPartialFailures: true,
        failures: [
          {
            providerId: "openai-auth",
            providerName: "OpenAI",
            model: "gpt-test",
            stage: "summary",
            message: "OpenAI API request failed: 401",
          },
          {
            providerId: "qwen-model",
            providerName: "Qwen",
            model: "missing-model",
            stage: "response",
            message: "model not found",
          },
          {
            providerId: "deepseek-timeout",
            providerName: "DeepSeek",
            model: "deepseek-chat",
            stage: "independent",
            message: "request timeout",
          },
          {
            providerId: "rate-limit",
            providerName: "RateLimit",
            model: "limited-model",
            stage: "response",
            message: "429 rate limit",
          },
        ],
      },
      participants,
    );

    expect(markdown).toContain("OpenAI / gpt-test / 共识整理");
    expect(markdown).toContain("建议：检查 API key 是否正确。");
    expect(markdown).toContain("Qwen / missing-model / 自由回应");
    expect(markdown).toContain("建议：检查 MODEL 是否正确。");
    expect(markdown).toContain("DeepSeek / deepseek-chat / 独立观点");
    expect(markdown).toContain(
      "建议：检查 base URL、网络或 provider 响应速度。",
    );
    expect(markdown).toContain("建议：稍后重试，或检查额度和限流设置。");
  });

  test("does not export failure section when there are no failures", () => {
    const markdown = exportMeetingToMarkdown(meeting, participants);

    expect(markdown).not.toContain("## 模型调用失败记录");
  });

  test("exports a fact hygiene notice for time-sensitive meetings", () => {
    const markdown = exportMeetingToMarkdown(
      {
        ...meeting,
        isTimeSensitive: true,
        factCheckNotice:
          "当前议题可能涉及实时信息。参会模型无法联网，输出仅代表模型已有知识或推测，请人工核验。",
      },
      participants,
    );

    expect(markdown).toContain("## 事实核验提示");
    expect(markdown).toContain("参会模型无法联网");
    expect(markdown).toContain("请人工核验");
  });

  test("does not export a fact hygiene notice for ordinary meetings", () => {
    const markdown = exportMeetingToMarkdown(meeting, participants);

    expect(markdown).not.toContain("## 事实核验提示");
  });
  test("hides evidence debug by default and exports it when debug is enabled", () => {
    const meetingWithDebug: MeetingResult = {
      ...meeting,
      debugSearchProcess: {
        evidenceMode: "low_evidence",
        searchIntents: [],
        executedQueries: ["AI financing"],
        queryPlans: [],
        intentDecisions: [],
        qualityOverview: {
          totalResults: 10,
          includedCount: 2,
          filteredCount: 8,
          lowEvidenceCount: 0,
          byReliability: {
            high: 1,
            medium: 1,
            low: 4,
            very_low: 4,
          },
          bySourceType: {
            official_statement: 1,
            official_blog: 0,
            official_docs: 0,
            official_community: 0,
            reputable_media: 1,
            industry_report: 0,
            social_forum: 6,
            video_platform: 0,
            unknown: 2,
          },
        },
        filteredReasons: [],
        results: [],
        warnings: [],
        debugSummary: {
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
          sourceMix: {
            officialCount: 1,
            reputableMediaCount: 1,
            industryReportCount: 0,
            socialVideoCount: 6,
            unknownCount: 2,
          },
          degradeReasonsSummary: {
            snippetOnly: 3,
            sourceTooWeak: 8,
            textTooShort: 8,
            scoreTooLow: 4,
            extractionFailed: 2,
            socialVideoSource: 6,
          },
          lowEvidenceTriggerReasons: {
            coreEvidenceLessThan3: true,
            highMediumLessThan3: true,
            shortTextRatioTooHigh: true,
            socialVideoRatioTooHigh: true,
            searchFailed: false,
          },
          passStats: [
            {
              passName: "official",
              query: "site:openai.com AI financing",
              resultCount: 2,
              extractedCount: 1,
              coreEvidenceCount: 1,
              socialVideoCount: 0,
              unknownCount: 0,
            },
          ],
          selectedEvidenceByPass: [{ passName: "official", count: 1 }],
          skippedPasses: ["social_clue"],
        },
      },
    };

    expect(exportMeetingToMarkdown(meetingWithDebug, participants)).not.toContain(
      "## Evidence Debug",
    );

    const markdown = exportMeetingToMarkdown(meetingWithDebug, participants, {
      includeEvidenceDebug: true,
    });

    expect(markdown).toContain("## Evidence Debug");
    expect(markdown).toContain("- candidateCount: 10");
    expect(markdown).toContain("- evidenceHitRate: 0.2");
    expect(markdown).toContain("- extractionSuccessRate: 0.6");
    expect(markdown).toContain("- snippetOnly: 3");
    expect(markdown).toContain("- coreEvidenceLessThan3: true");
    expect(markdown).toContain("- socialVideoRatioTooHigh: true");
    expect(markdown).toContain("### Pass Stats");
    expect(markdown).toContain("- official: resultCount=2");
    expect(markdown).toContain("### Selected Evidence By Pass");
    expect(markdown).toContain("- official: 1");
    expect(markdown).toContain("- social_clue");
  });
});

function sectionText(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);

  if (start < 0) {
    return "";
  }

  const nextHeading = markdown.indexOf("\n## ", start + heading.length);

  return nextHeading < 0 ? markdown.slice(start) : markdown.slice(start, nextHeading);
}
