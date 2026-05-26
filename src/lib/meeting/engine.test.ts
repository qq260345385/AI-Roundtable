import { describe, expect, test } from "vitest";
import { runMeeting } from "./engine";
import { runLiveMeeting } from "./live-engine";
import type {
  MeetingRequest,
  MeetingSummary,
  MeetingTurn,
  ModelParticipant,
  ModelProvider,
} from "../types";

describe("runMeeting", () => {
  const gptParticipant: ModelParticipant = {
    id: "gpt",
    name: "GPT Mock",
    provider: "OpenAI",
    model: "gpt-mock",
    status: "mock",
    statusLabel: "Mock / 无需 API",
  };
  const claudeParticipant: ModelParticipant = {
    id: "claude",
    name: "Claude Mock",
    provider: "Anthropic",
    model: "claude-mock",
    status: "mock",
    statusLabel: "Mock / 无需 API",
  };

  test("runs equal model participants through independent and response phases", async () => {
    const participants: ModelParticipant[] = [gptParticipant, claudeParticipant];

    const request: MeetingRequest = {
      topic: "AI Roundtable 的产品定位",
      participants,
    };

    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView(participant, topic) {
        return `${participant.name} 独立讨论 ${topic}`;
      },
      async generateResponse(participant, topic, previousTurns) {
        return `${participant.name} 阅读 ${previousTurns.length} 条观点后回应 ${topic}`;
      },
      async generateSummary(topic, turns): Promise<MeetingSummary> {
        return {
          consensus: [`围绕 ${topic} 形成基础共识`],
          differences: [`保留 ${turns.length} 条发言中的差异`],
          minorityViews: ["不同模型可以自由补充"],
          risks: ["Mock 内容不能代表真实模型"],
          nextSteps: ["接入真实 Provider 前继续完善流程"],
        };
      },
    };

    const result = await runMeeting(request, provider);
    const independentPhase = result.phases[0];
    const responsePhase = result.phases[1];

    expect(result.topic).toBe(request.topic);
    expect(result.phases).toHaveLength(2);
    expect(independentPhase.title).toBe("第一阶段：独立观点");
    expect(responsePhase.title).toBe("第二阶段：自由回应");
    expect(independentPhase.turns).toHaveLength(2);
    expect(responsePhase.turns).toHaveLength(2);
    expect(result.summary.consensus[0]).toContain("基础共识");
    expect(result.hasPartialFailures).toBe(false);
    expect(result.failures).toEqual([]);
    expect(result.isTimeSensitive).toBe(false);
    expect(result.factCheckNotice).toBeUndefined();
  });

  test("marks time-sensitive topics in the meeting result", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView(participant) {
        return `${participant.name} 独立观点`;
      },
      async generateResponse(participant) {
        return `${participant.name} 自由回应`;
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["共识"],
          differences: ["分歧"],
          minorityViews: ["少数派观点"],
          risks: ["风险"],
          nextSteps: ["下一步"],
        };
      },
    };

    const result = await runMeeting(
      {
        topic: "现在最强的 AI 模型排名是什么？",
        participants: [gptParticipant],
      },
      provider,
    );

    expect(result.isTimeSensitive).toBe(true);
    expect(result.factCheckNotice).toContain("无法联网");
  });

  test("passes brief mode options through every meeting stage", async () => {
    const briefFlags: boolean[] = [];
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView(_participant, _topic, _evidencePack, options) {
        briefFlags.push(options?.isBriefMode ?? false);
        return "简短独立观点";
      },
      async generateResponse(
        _participant,
        _topic,
        _previousTurns,
        _evidencePack,
        options,
      ) {
        briefFlags.push(options?.isBriefMode ?? false);
        return "简短自由回应";
      },
      async generateSummary(_topic, _turns, _evidencePack, options): Promise<MeetingSummary> {
        briefFlags.push(options?.isBriefMode ?? false);
        return {
          consensus: ["简要共识"],
          differences: [],
          minorityViews: [],
          risks: [],
          nextSteps: [],
        };
      },
    };

    const result = await runMeeting(
      {
        topic: "简要会议模式",
        participants: [gptParticipant],
        isBriefMode: true,
      },
      provider,
    );

    expect(briefFlags).toEqual([true, true, true]);
    expect(result.isBriefMode).toBe(true);
  });

  test("assigns mostly unique discussion focuses to four participants", async () => {
    const participants: ModelParticipant[] = [
      gptParticipant,
      claudeParticipant,
      {
        id: "gemini",
        name: "Gemini Mock",
        provider: "Google",
        model: "gemini-mock",
        status: "mock",
        statusLabel: "Mock / 无需 API",
      },
      {
        id: "deepseek",
        name: "DeepSeek Mock",
        provider: "DeepSeek",
        model: "deepseek-mock",
        status: "mock",
        statusLabel: "Mock / 无需 API",
      },
    ];
    const focuses: string[] = [];
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView(_participant, _topic, _evidencePack, options) {
        focuses.push(options?.discussionFocus ?? "");
        return "独立观点";
      },
      async generateResponse() {
        return "自由回应";
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["共识"],
          differences: [],
          minorityViews: [],
          risks: [],
          nextSteps: [],
        };
      },
    };

    await runMeeting(
      {
        topic: "讨论关注点分配",
        participants,
      },
      provider,
    );

    expect(new Set(focuses).size).toBe(4);
    expect(focuses).toEqual([
      "风险与不确定性：监管、安全、治理、黑天鹅、不确定性",
      "商业与资本效率：收入、成本、融资、客户结构、商业闭环",
      "技术与产品能力：模型能力、产品化、工程效率、技术路线",
      "生态与用户采用：开发者生态、用户迁移成本、开源竞争、企业采用、长期格局",
    ]);
    expect(focuses.join("\n")).not.toContain("分析师");
  });

  test("adds citation check results after the meeting is generated", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView() {
        return "独立观点引用 [S1] 和不存在的 [S9]。";
      },
      async generateResponse() {
        return "自由回应继续引用 [S1]。";
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["有来源事实 [S1]。"],
          differences: ["模型推测 / 待核验。"],
          minorityViews: ["少数派观点。"],
          risks: ["风险点。"],
          nextSteps: ["下一步。"],
        };
      },
    };

    const result = await runMeeting(
      {
        topic: "引用检查",
        participants: [gptParticipant],
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
      },
      provider,
    );

    expect(result.citationCheck).toEqual(
      expect.objectContaining({
        validCitationIds: ["S1", "S2"],
        usedCitationIds: ["S1", "S9"],
        missingCitationIds: ["S2"],
        invalidCitationIds: ["S9"],
        hasInvalidCitations: true,
      }),
    );
  });

  test("moves consensus into insufficiently confirmed when all evidence is low quality", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView() {
        return "根据社区资料讨论。";
      },
      async generateResponse() {
        return "继续讨论社区资料。";
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["某模型已经追平竞品 [S1]。"],
          differences: [],
          minorityViews: [],
          risks: [],
          nextSteps: [],
        };
      },
    };

    const result = await runMeeting(
      {
        topic: "最新模型对比",
        participants: [gptParticipant],
        evidencePack: {
          enabled: true,
          items: [
            {
              id: "S1",
              title: "Reddit rumor",
              url: "https://reddit.com/r/test",
              snippet: "短消息",
              quality: {
                textLength: 3,
                wasTruncated: false,
                warnings: ["仅有标题或极短摘要，不能作为事实依据"],
                sourceType: "social_forum",
                reliability: "very_low",
                score: 0,
              },
            },
          ],
        },
      },
      provider,
    );

    expect(result.summary.consensus).toEqual([]);
    expect(result.summary.insufficientlyConfirmed).toEqual([
      "某模型已经追平竞品 [S1]。（仅由低可信资料支持，不能确认。）",
    ]);
  });

  test("stores model identity instead of role responsibility on each turn", async () => {
    const participant: ModelParticipant = {
      id: "gemini",
      name: "Gemini Mock",
      provider: "Google",
      model: "gemini-mock",
      status: "mock",
      statusLabel: "Mock / 无需 API",
    };

    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView() {
        return "独立观点";
      },
      async generateResponse() {
        return "自由回应";
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["共识"],
          differences: ["分歧"],
          minorityViews: ["少数派观点"],
          risks: ["风险"],
          nextSteps: ["下一步"],
        };
      },
    };

    const result = await runMeeting(
      {
        topic: "测试议题",
        participants: [participant],
      },
      provider,
    );

    const turn: MeetingTurn = result.phases[0].turns[0];

    expect(turn.speakerName).toBe("Gemini Mock");
    expect(turn.provider).toBe("Google");
    expect(turn.model).toBe("gemini-mock");
    expect("roleDescription" in turn).toBe(false);
  });

  test("continues independent phase when one provider fails", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView(participant) {
        if (participant.id === "gpt") {
          throw new Error(
            "Authorization Bearer secret-openai-key independent failed",
          );
        }

        return `${participant.name} 独立观点`;
      },
      async generateResponse(participant) {
        return `${participant.name} 自由回应`;
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["共识"],
          differences: ["分歧"],
          minorityViews: ["少数派观点"],
          risks: ["风险"],
          nextSteps: ["下一步"],
        };
      },
    };

    const result = await runMeeting(
      {
        topic: "测试议题",
        participants: [gptParticipant, claudeParticipant],
      },
      provider,
    );

    expect(result.phases[0].turns).toHaveLength(1);
    expect(result.phases[0].turns[0].speakerName).toBe("Claude Mock");
    expect(result.failures).toEqual([
      expect.objectContaining({
        providerId: "gpt",
        providerName: "OpenAI",
        model: "gpt-mock",
        stage: "independent",
      }),
    ]);
    expect(JSON.stringify(result.failures)).not.toContain("secret-openai-key");
    expect(JSON.stringify(result.failures)).not.toContain("Authorization");
    expect(JSON.stringify(result.failures)).not.toContain("Bearer");
    expect(result.hasPartialFailures).toBe(true);
  });

  test("continues response phase when one provider fails", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView(participant) {
        return `${participant.name} 独立观点`;
      },
      async generateResponse(participant) {
        if (participant.id === "claude") {
          throw new Error("secret-openai-key response failed");
        }

        return `${participant.name} 自由回应`;
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["共识"],
          differences: ["分歧"],
          minorityViews: ["少数派观点"],
          risks: ["风险"],
          nextSteps: ["下一步"],
        };
      },
    };

    const result = await runMeeting(
      {
        topic: "测试议题",
        participants: [gptParticipant, claudeParticipant],
      },
      provider,
    );

    expect(result.phases[1].turns).toHaveLength(1);
    expect(result.phases[1].turns[0].speakerName).toBe("GPT Mock");
    expect(result.failures?.[0]).toMatchObject({
      providerId: "claude",
      stage: "response",
    });
  });

  test("tries the next successful provider when summary generation fails", async () => {
    const summaryAttempts: string[] = [];
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView(participant) {
        return `${participant.name} 独立观点`;
      },
      async generateResponse(participant) {
        return `${participant.name} 自由回应`;
      },
      async generateSummary(): Promise<MeetingSummary> {
        throw new Error("default summary should not be used");
      },
      async generateSummaryForParticipant(participant): Promise<MeetingSummary> {
        summaryAttempts.push(participant.id);

        if (participant.id === "gpt") {
          throw new Error("secret-openai-key summary failed");
        }

        return {
          consensus: [`${participant.name} 生成总结`],
          differences: ["分歧"],
          minorityViews: ["少数派观点"],
          risks: ["风险"],
          nextSteps: ["下一步"],
        };
      },
    };

    const result = await runMeeting(
      {
        topic: "测试议题",
        participants: [gptParticipant, claudeParticipant],
      },
      provider,
    );

    expect(summaryAttempts).toEqual(["gpt", "claude"]);
    expect(result.summary.consensus[0]).toContain("Claude Mock");
    expect(result.failures).toEqual([
      expect.objectContaining({
        providerId: "gpt",
        stage: "summary",
      }),
    ]);
  });

  test("returns fallback summary when every summary provider fails", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView(participant) {
        return `${participant.name} 独立观点`;
      },
      async generateResponse(participant) {
        return `${participant.name} 自由回应`;
      },
      async generateSummary(): Promise<MeetingSummary> {
        throw new Error("summary failed");
      },
    };

    const result = await runMeeting(
      {
        topic: "测试议题",
        participants: [gptParticipant],
      },
      provider,
    );

    expect(result.summary.risks[0]).toContain("未能生成模型总结");
    expect(result.failures?.[0]).toMatchObject({
      providerId: "gpt",
      stage: "summary",
    });
  });

  test("throws a sanitized error when all providers fail to speak", async () => {
    const provider: ModelProvider = {
      name: "TestProvider",
      async generateIndependentView() {
        throw new Error("Authorization Bearer secret-openai-key failed");
      },
      async generateResponse() {
        throw new Error("Authorization Bearer secret-openai-key failed");
      },
      async generateSummary(): Promise<MeetingSummary> {
        throw new Error("summary should not run");
      },
    };

    await expect(
      runMeeting(
        {
          topic: "测试议题",
          participants: [gptParticipant, claudeParticipant],
        },
        provider,
      ),
    ).rejects.toThrow("All providers failed to generate meeting responses.");
  });
});

describe("runLiveMeeting", () => {
  const gptParticipant: ModelParticipant = {
    id: "gpt",
    name: "GPT Mock",
    provider: "OpenAI",
    model: "gpt-mock",
    status: "mock",
    statusLabel: "Mock / 无需 API",
  };
  const claudeParticipant: ModelParticipant = {
    id: "claude",
    name: "Claude Mock",
    provider: "Anthropic",
    model: "claude-mock",
    status: "mock",
    statusLabel: "Mock / 无需 API",
  };

  test("emits meeting progress events as each participant turn completes", async () => {
    const events: string[] = [];
    const provider: ModelProvider = {
      name: "LiveProvider",
      async generateIndependentView(participant) {
        return `${participant.name} independent`;
      },
      async generateResponse(participant) {
        return `${participant.name} response`;
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["live consensus"],
          differences: [],
          minorityViews: [],
          risks: [],
          nextSteps: [],
        };
      },
    };

    const result = await runLiveMeeting(
      {
        topic: "实时会议",
        participants: [gptParticipant, claudeParticipant],
      },
      provider,
      (event) => {
        if (event.type === "turn") {
          events.push(`turn:${event.turn.phaseId}:${event.turn.speakerName}`);
        } else {
          events.push(event.type);
        }
      },
    );

    expect(events).toEqual([
      "meeting_started",
      "phase_started",
      "participant_started",
      "turn:independent:GPT Mock",
      "participant_started",
      "turn:independent:Claude Mock",
      "phase_started",
      "participant_started",
      "turn:response:GPT Mock",
      "participant_started",
      "turn:response:Claude Mock",
      "phase_started",
      "participant_started",
      "summary",
      "meeting_completed",
    ]);
    expect(result.phases[0].turns).toHaveLength(2);
    expect(result.summary.consensus).toEqual(["live consensus"]);
  });

  test("passes abort signal through live provider calls", async () => {
    const controller = new AbortController();
    const receivedSignals: (AbortSignal | undefined)[] = [];
    const provider: ModelProvider = {
      name: "LiveProvider",
      async generateIndependentView(_participant, _topic, _evidencePack, options) {
        receivedSignals.push(options?.signal);

        return "independent";
      },
      async generateResponse(
        _participant,
        _topic,
        _previousTurns,
        _evidencePack,
        options,
      ) {
        receivedSignals.push(options?.signal);

        return "response";
      },
      async generateSummary(_topic, _turns, _evidencePack, options): Promise<MeetingSummary> {
        receivedSignals.push(options?.signal);

        return {
          consensus: ["summary"],
          differences: [],
          minorityViews: [],
          risks: [],
          nextSteps: [],
        };
      },
    };

    await runLiveMeeting(
      {
        topic: "abortable live meeting",
        participants: [gptParticipant],
        signal: controller.signal,
      },
      provider,
      () => undefined,
    );

    expect(receivedSignals).toEqual([
      controller.signal,
      controller.signal,
      controller.signal,
    ]);
  });

  test("emits sanitized failure events and keeps successful turns", async () => {
    const failures: string[] = [];
    const provider: ModelProvider = {
      name: "LiveProvider",
      async generateIndependentView(participant) {
        if (participant.id === "gpt") {
          throw new Error("Authorization Bearer secret-openai-key failed");
        }

        return `${participant.name} independent`;
      },
      async generateResponse(participant) {
        return `${participant.name} response`;
      },
      async generateSummary(): Promise<MeetingSummary> {
        return {
          consensus: ["kept"],
          differences: [],
          minorityViews: [],
          risks: [],
          nextSteps: [],
        };
      },
    };

    const result = await runLiveMeeting(
      {
        topic: "实时容错",
        participants: [gptParticipant, claudeParticipant],
      },
      provider,
      (event) => {
        if (event.type === "failure") {
          failures.push(JSON.stringify(event.failure));
        }
      },
    );

    expect(result.hasPartialFailures).toBe(true);
    expect(failures).toHaveLength(1);
    expect(failures[0]).not.toContain("secret-openai-key");
    expect(failures[0]).not.toContain("Authorization");
    expect(failures[0]).not.toContain("Bearer");
    expect(result.phases[0].turns[0].speakerName).toBe("Claude Mock");
  });
});
