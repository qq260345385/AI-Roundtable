import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { MeetingResult, ModelParticipant } from "@/lib/types";
import { getUiText } from "@/lib/i18n/ui-text";
import { MeetingBoard } from "./MeetingBoard";
import { MeetingRoom } from "./MeetingRoom";

describe("MeetingBoard", () => {
  test("renders a compact web search status by default", () => {
    const meeting: MeetingResult = {
      topic: "AI model benchmark",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      searchSummary: {
        enabled: true,
        status: "low_evidence",
        evidenceMode: "low_evidence",
        totalReferences: 1,
        strongCount: 0,
        mediumCount: 0,
        weakCount: 1,
        hasRealtimeWarning: true,
        userMessage:
          "Web search completed. System referenced 1 evidence item: 0 reliable, 0 general, 1 weaker. Some real-time information may still need manual verification.",
      },
      evidencePack: {
        enabled: true,
        evidenceStatus: "low",
        items: [
          {
            id: "S1",
            title: "Community source",
            url: "https://reddit.com/r/artificial/comments/test",
            source: "reddit.com",
            snippet: "Community discussion",
            quality: {
              warnings: [
                "Low evidence source: use as a lead, not as standalone proof",
              ],
              textLength: 500,
              wasTruncated: false,
              sourceType: "social_forum",
              reliability: "low",
              score: 35,
            },
          },
        ],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingBoard meeting={meeting} text={getUiText("en")} />,
    );

    expect(html).toContain("Web Search Process");
    expect(html).toContain("Web search completed");
    expect(html).toContain("System referenced 1 evidence item");
    expect(html).toContain("1 weaker");
    expect(html).toContain("manual verification");
    expect(html).not.toContain("Developer search details");
    expect(html).not.toContain("GPT Mock");
    expect(html).not.toContain("Which benchmark sources discuss the latest AI model ranking?");
    expect(html).not.toContain("Benchmark sources reduce vague model strength claims.");
    expect(html).not.toContain("AI model benchmark community");
    expect(html).not.toContain("duplicate_query");
    expect(html).not.toContain("vague_intent");
    expect(html).not.toContain("Filtered evidence");
    expect(html).not.toContain("very_low_quality");
    expect(html).not.toContain("score");
    expect(html).not.toContain("citationLevel");
    expect(html).not.toContain("citationGuidance");
  });

  test("localizes compact web search status in Chinese mode", () => {
    const meeting: MeetingResult = {
      topic: "AI model funding",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      searchSummary: {
        enabled: true,
        status: "low_evidence",
        evidenceMode: "low_evidence",
        totalReferences: 9,
        strongCount: 0,
        mediumCount: 0,
        weakCount: 9,
        hasRealtimeWarning: true,
        userMessage:
          "Web search completed. System referenced 9 evidence items: 0 reliable, 0 general, 9 weaker. Some real-time information may still need manual verification.",
      },
      evidencePack: {
        enabled: true,
        evidenceStatus: "low",
        items: [],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingBoard meeting={meeting} text={getUiText("zh")} />,
    );

    expect(html).toContain("联网搜索过程");
    expect(html).toContain("联网搜索已完成");
    expect(html).toContain("系统引用了 9 条资料");
    expect(html).toContain("0 可靠");
    expect(html).toContain("0 一般");
    expect(html).toContain("9 较弱");
    expect(html).toContain("部分实时信息仍需要人工核验");
    expect(html).not.toContain("Web search completed");
    expect(html).not.toContain("Reliable");
    expect(html).not.toContain("General");
    expect(html).not.toContain("Weaker");
  });

  test("renders full web search diagnostics when the API returns debugSearchProcess", () => {
    const meeting: MeetingResult = {
      topic: "AI model benchmark",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      searchSummary: {
        enabled: true,
        status: "low_evidence",
        evidenceMode: "low_evidence",
        totalReferences: 0,
        strongCount: 0,
        mediumCount: 0,
        weakCount: 0,
        hasRealtimeWarning: true,
        userMessage:
          "Web search completed. System referenced 0 evidence items. Some real-time information may still need manual verification.",
      },
      evidencePack: {
        enabled: true,
        evidenceStatus: "low",
        items: [],
      },
      debugSearchProcess: {
        evidenceMode: "low_evidence",
        searchIntents: [
          {
            participantId: "gpt-mock",
            participantName: "GPT Mock",
            provider: "OpenAI",
            model: "gpt-mock",
            intents: [
              {
                question: "Which benchmark sources discuss the latest AI model ranking?",
                mustInclude: ["AI model benchmark"],
                shouldInclude: ["leaderboard"],
                exclude: ["ads"],
                freshness: "latest",
                sourcePreference: "benchmark",
                rationale: "Benchmark sources reduce vague model strength claims.",
              },
            ],
          },
        ],
        executedQueries: ["AI model benchmark community"],
        queryPlans: [
          {
            query: "AI model benchmark community",
            reason: "Generated from benchmark intent with latest freshness.",
            participantIds: ["gpt-mock"],
            sourcePreference: "benchmark",
            freshness: "latest",
          },
        ],
        intentDecisions: [
          {
            participantId: "gemini-mock",
            participantName: "Gemini Mock",
            question: "impact",
            action: "discarded",
            reason: "vague_intent",
          },
        ],
        qualityOverview: {
          totalResults: 1,
          includedCount: 0,
          filteredCount: 1,
          lowEvidenceCount: 0,
          byReliability: {
            high: 0,
            medium: 0,
            low: 0,
            very_low: 1,
          },
          bySourceType: {
            official_statement: 0,
            official_blog: 0,
            official_docs: 0,
            official_community: 0,
            reputable_media: 0,
            industry_report: 0,
            social_forum: 1,
            video_platform: 0,
            unknown: 0,
          },
        },
        filteredReasons: [{ reason: "very_low_quality", count: 1 }],
        results: [
          {
            title: "Short social post",
            query: "AI model benchmark community",
            sourceType: "social_forum",
            reliability: "very_low",
            score: 10,
            citationLevel: "not_citable",
            citationGuidance: "Do not cite this result as evidence.",
            qualityWarnings: ["Too short"],
            includedInEvidencePack: false,
            filtered: true,
            filteredReason: "very_low_quality",
          },
        ],
        warnings: [],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingBoard meeting={meeting} text={getUiText("en")} />,
    );

    expect(html).toContain("Developer search details");
    expect(html).toContain("GPT Mock");
    expect(html).toContain("Which benchmark sources discuss the latest AI model ranking?");
    expect(html).toContain("AI model benchmark community");
    expect(html).toContain("vague_intent");
    expect(html).toContain("very_low_quality");
    expect(html).toContain("Raw searchProcess");
  });

  test("renders the web search process area in the meeting room result page", () => {
    const meeting: MeetingResult = {
      topic: "AI model benchmark",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
      searchSummary: {
        enabled: true,
        status: "failed",
        evidenceMode: "search_failed",
        totalReferences: 0,
        strongCount: 0,
        mediumCount: 0,
        weakCount: 0,
        hasRealtimeWarning: true,
        userMessage:
          "Web search failed. This round mainly uses model knowledge and reasoning. Failure type: Missing API key.",
      },
      evidencePack: {
        enabled: false,
        evidenceStatus: "none",
        items: [],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingRoom
        activeStageId="summary"
        copyMessage=""
        isCompleted
        isLive={false}
        meeting={meeting}
        onBackToSetup={() => undefined}
        onCopyMarkdown={() => undefined}
        onStageChange={() => undefined}
        participantStatuses={{}}
        participants={[]}
        statusMessage=""
        statusType="success"
        text={getUiText("en")}
      />,
    );

    expect(html).toContain("Web Search Process");
    expect(html).toContain("Web search failed");
    expect(html).toContain("Missing API key");
    expect(html).not.toContain("search_failed");
    expect(html).not.toContain("missing_api_key");
    expect(html).not.toContain("AI model benchmark latest");
  });

  test("renders stance-oriented summary labels without minority views or empty cards", () => {
    const meeting: MeetingResult = {
      topic: "你们认为什么水果更好吃",
      phases: [],
      summary: {
        consensus: ["多数人认可水果口味存在主观差异。"],
        differences: ["具体偏好仍有分歧。"],
        minorityViews: ["大樱桃支持者提出了少数派观点。"],
        risks: ["样本偏好可能不代表所有人。"],
        nextSteps: ["继续收集更多样本。"],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingRoom
        activeStageId="summary"
        copyMessage=""
        isCompleted
        isLive={false}
        meeting={meeting}
        onBackToSetup={() => undefined}
        onCopyMarkdown={() => undefined}
        onStageChange={() => undefined}
        participantStatuses={{}}
        participants={[]}
        statusMessage=""
        statusType="success"
        text={getUiText("zh")}
      />,
    );

    expect(html).toContain("主要立场");
    expect(html).toContain("主要分歧");
    expect(html).toContain("讨论局限");
    expect(html).toContain("可以继续讨论");
    expect(html).not.toContain("风险");
    expect(html).not.toContain("下一步");
    expect(html).not.toContain("该小节暂无内容");
    expect(html).not.toContain("有价值的少数派观点");
    expect(html).not.toContain("大樱桃支持者提出了少数派观点");
  });

  test("renders evidence-oriented summary labels for factual topics", () => {
    const meeting: MeetingResult = {
      topic: "某公司最近发布的新模型有什么影响",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        confirmableFacts: ["该公司发布了新模型。"],
        initialHypotheses: ["可能影响产品竞争。"],
        insufficientlyConfirmed: ["用户迁移影响仍需核验。"],
        risks: ["资料覆盖可能不足。"],
        nextSteps: ["核验发布公告和媒体报道。"],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingRoom
        activeStageId="summary"
        copyMessage=""
        isCompleted
        isLive={false}
        meeting={meeting}
        onBackToSetup={() => undefined}
        onCopyMarkdown={() => undefined}
        onStageChange={() => undefined}
        participantStatuses={{}}
        participants={[]}
        statusMessage=""
        statusType="success"
        text={getUiText("zh")}
      />,
    );

    expect(html).toContain("可确认事实");
    expect(html).toContain("低置信推测");
    expect(html).toContain("不能确认的关键问题");
    expect(html).toContain("风险点");
    expect(html).toContain("下一步核验建议");
    expect(html).not.toContain("主要立场");
    expect(html).not.toContain("讨论局限");
  });

  test("renders a stop meeting action while a live meeting is running", () => {
    const meeting: MeetingResult = {
      topic: "Live topic",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingRoom
        activeStageId="independent"
        copyMessage=""
        isCompleted={false}
        isLive
        meeting={meeting}
        onBackToSetup={() => undefined}
        onCopyMarkdown={() => undefined}
        onStageChange={() => undefined}
        onStopMeeting={() => undefined}
        participantStatuses={{}}
        participants={[]}
        statusMessage=""
        statusType="loading"
        text={getUiText("en")}
      />,
    );

    expect(html).toContain("Stop Meeting");
    expect(html).not.toContain("Back to Setup");
  });

  test("renders formatted model names in the live participant sidebar", () => {
    const meeting: MeetingResult = {
      topic: "Live topic",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
    };
    const participants: ModelParticipant[] = [
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek Flash deepseek-v4-flash",
        provider: "DeepSeek Flash",
        model: "deepseek-v4-flash",
        status: "available",
        statusLabel: "Connected",
      },
      {
        id: "mimo-v2.5-pro",
        name: "Xiaomi MiMo mimo-v2.5-pro",
        provider: "Xiaomi MiMo",
        model: "mimo-v2.5-pro",
        status: "available",
        statusLabel: "Connected",
      },
    ];

    const html = renderToStaticMarkup(
      <MeetingRoom
        activeStageId="independent"
        copyMessage=""
        isCompleted={false}
        isLive
        meeting={meeting}
        onBackToSetup={() => undefined}
        onCopyMarkdown={() => undefined}
        onStageChange={() => undefined}
        onStopMeeting={() => undefined}
        participantStatuses={{}}
        participants={participants}
        statusMessage=""
        statusType="loading"
        text={getUiText("en")}
      />,
    );

    expect(html).toContain("DeepSeek V4 Flash");
    expect(html).toContain("MiMo V2.5 Pro");
    expect(html).not.toContain("DeepSeek Flash deepseek-v4-flash");
    expect(html).not.toContain("Xiaomi MiMo mimo-v2.5-pro");
    expect(html).not.toContain("deepseek-v4-flash");
    expect(html).not.toContain("mimo-v2.5-pro");
  });

  test("keeps the live participant sidebar visible while scrolling on desktop", () => {
    const meeting: MeetingResult = {
      topic: "Long live topic",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingRoom
        activeStageId="independent"
        copyMessage=""
        isCompleted={false}
        isLive
        meeting={meeting}
        onBackToSetup={() => undefined}
        onCopyMarkdown={() => undefined}
        onStageChange={() => undefined}
        onStopMeeting={() => undefined}
        participantStatuses={{}}
        participants={[]}
        statusMessage=""
        statusType="loading"
        text={getUiText("en")}
      />,
    );

    expect(html).toContain("lg:sticky");
    expect(html).toContain("lg:top-4");
    expect(html).toContain("lg:max-h-[calc(100vh-2rem)]");
  });

  test("renders confirmation controls before stopping a live meeting", () => {
    const meeting: MeetingResult = {
      topic: "Live topic",
      phases: [],
      summary: {
        consensus: [],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
    };

    const html = renderToStaticMarkup(
      <MeetingRoom
        activeStageId="independent"
        copyMessage=""
        isCompleted={false}
        isLive
        isStopConfirming
        meeting={meeting}
        onBackToSetup={() => undefined}
        onCancelStopMeeting={() => undefined}
        onCopyMarkdown={() => undefined}
        onStageChange={() => undefined}
        onStopMeeting={() => undefined}
        participantStatuses={{}}
        participants={[]}
        statusMessage=""
        statusType="loading"
        text={getUiText("en")}
      />,
    );

    expect(html).toContain("Confirm Stop");
    expect(html).toContain("Continue Meeting");
    expect(html).toContain("The meeting will stop and return to setup.");
  });
});
