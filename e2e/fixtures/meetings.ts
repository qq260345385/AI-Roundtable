import type { LiveMeetingEvent, MeetingResult } from "../../src/lib/types";

export function createDegradedMeeting(topic: string): MeetingResult {
  return {
    topic,
    meetingStatus: "degraded",
    warnings: ["一个参会模型未完成回应，本轮结论已降级。"],
    isBriefMode: true,
    isTimeSensitive: true,
    factCheckNotice: "本轮涉及实时事实，结论需要人工核验。",
    phases: [
      {
        id: "independent",
        title: "第一阶段：独立观点",
        description: "模型分别判断。",
        turns: [
          {
            id: "independent-gpt-mock",
            phaseId: "independent",
            speakerName: "GPT Mock",
            provider: "OpenAI",
            model: "gpt-mock",
            content: "建议先做小规模试点。",
          },
        ],
      },
      {
        id: "response",
        title: "第二阶段：自由回应",
        description: "模型回应其他观点。",
        turns: [],
      },
    ],
    summary: {
      consensus: ["先进行范围明确的可逆试点。"],
      differences: ["样本范围仍有分歧。"],
      minorityViews: [],
      risks: ["现有证据不足以支持全面上线。"],
      nextSteps: ["指定负责人和停止条件。"],
      decisionBrief: {
        recommendation: "先进行两周小规模试点，不直接全面上线。",
        status: "tentative",
        rationale: ["可在控制风险的同时收集真实反馈。"],
        conditions: ["上线前明确负责人、成功指标和预算上限。"],
        risks: ["试点样本可能不具代表性。"],
        confidence: "low",
        evidenceGaps: ["联网资料质量较低，缺少可靠的长期效果数据。"],
        reversalConditions: ["若激活率低于基线，则停止试点并重新评估。"],
        nextAction: "今天确认试点负责人和三项衡量指标。",
      },
    },
    evidencePack: {
      enabled: true,
      evidenceStatus: "low",
      items: [],
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
      userMessage: "未找到可靠联网资料。",
    },
    failures: [
      {
        providerId: "claude-mock",
        participantName: "Claude Mock",
        providerName: "Anthropic",
        model: "claude-mock",
        stage: "response",
        message: "Provider unavailable",
      },
    ],
    hasPartialFailures: true,
  };
}

export function serializeLiveMeeting(meeting: MeetingResult): string {
  const events: LiveMeetingEvent[] = [
    {
      type: "meeting_started",
      topic: meeting.topic,
      participants: [],
      isBriefMode: true,
      isTimeSensitive: true,
      factCheckNotice: meeting.factCheckNotice,
      evidencePack: meeting.evidencePack,
      searchSummary: meeting.searchSummary,
    },
    { type: "summary", summary: meeting.summary },
    { type: "meeting_completed", meeting },
  ];

  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}
