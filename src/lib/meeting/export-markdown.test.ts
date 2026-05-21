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
                sourceType: "benchmark",
                reliability: "medium",
                score: 70,
              },
            },
          ],
        },
      },
      participants,
    );

    expect(markdown).toContain("## 待核验资料候选");
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
                sourceType: "community",
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
                sourceType: "official",
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
                sourceType: "community",
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
                sourceType: "benchmark",
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
    expect(markdown).toContain("- 官方资料数量：1");
    expect(markdown).toContain("- 第三方评测资料数量：1");
    expect(markdown).toContain("- 社区 / 社交 / 视频资料数量：1");
    expect(markdown).toContain("- 内容过短资料数量：1");
    expect(markdown).toContain("- 本轮结论可靠性：高");
    expect(markdown.indexOf("## 资料质量概览")).toBeLessThan(
      markdown.indexOf("## 待核验资料候选"),
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

  test("exports a no-evidence notice when evidence pack is disabled", () => {
    const markdown = exportMeetingToMarkdown(meeting, participants);

    expect(markdown).toContain("## 待核验资料候选");
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

  test("exports minority views", () => {
    const markdown = exportMeetingToMarkdown(meeting, participants);

    expect(markdown).toContain("### 有价值的少数派观点");
    expect(markdown).toContain("少数派观点：保留人工阅读比自动评分更重要。");
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
});
