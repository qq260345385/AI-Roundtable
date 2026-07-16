import type {
  MeetingSummary,
  MeetingTurn,
  MeetingPromptOptions,
  ModelParticipant,
  ModelProvider,
} from "../types";

// MockProvider 只模拟模型个体差异，不给模型分配固定任务。
export const mockProvider: ModelProvider = {
  name: "MockProvider",

  async generateSearchIntents(
    _participant: ModelParticipant,
    topic: string,
  ) {
    return [
      {
        question: `${topic} official release or report`,
        mustInclude: [topic],
        shouldInclude: ["official", "release"],
        exclude: [],
        freshness: "latest" as const,
        sourcePreference: "official" as const,
        rationale: "Official material helps verify release details and claims.",
      },
      {
        question: `${topic} benchmark leaderboard evaluation`,
        mustInclude: [topic],
        shouldInclude: ["benchmark", "leaderboard"],
        exclude: [],
        freshness: "recent" as const,
        sourcePreference: "benchmark" as const,
        rationale: "Benchmark sources reduce vague model-strength comparisons.",
      },
      {
        question: `${topic} latest independent coverage`,
        mustInclude: [topic],
        shouldInclude: ["latest"],
        exclude: ["ads"],
        freshness: "latest" as const,
        sourcePreference: "media" as const,
        rationale: "Independent coverage can surface current context.",
      },
    ];
  },

  async generateIndependentView(
    participant: ModelParticipant,
    topic: string,
    _evidencePack?: unknown,
    options?: MeetingPromptOptions,
  ): Promise<string> {
    if (options?.isBriefMode) {
      return `${participant.name}：围绕“${topic}”，我建议先抓核心问题、保留关键分歧，再输出一版可执行结论。简要模式下不展开长篇论证，只给最值得讨论的判断。`;
    }

    if (participant.id === "gpt-mock") {
      return `${participant.name}：我会先把“${topic}”拆成目标、可选方案和约束三个层面。结构上先明确什么结果算成功，再比较各方案的收益、代价与可逆性，最后选择一个能尽快验证关键假设的行动。`;
    }

    if (participant.id === "claude-mock") {
      return `${participant.name}：我会先提醒“${topic}”的边界问题：推荐成立需要哪些前提，哪些人会承担风险，以及哪些信息一旦变化就应推翻当前判断。没有这些条件，再明确的结论也可能只是过度自信。`;
    }

    if (participant.id === "gemini-mock") {
      return `${participant.name}：我更想从使用场景看“${topic}”。不同用户、时间窗口和资源条件可能得到不同答案，因此应先找出最常见场景，再检查推荐是否足够清楚、是否容易执行，以及失败后能否恢复。`;
    }

    if (participant.id === "deepseek-mock") {
      return `${participant.name}：我会先看“${topic}”的落地路径。优先选择成本可控、两周内能看到信号、失败时可以回滚的方案，并提前约定负责人、成功指标和停止条件，避免讨论结束后无人执行。`;
    }

    return `${participant.name}：我会以平等参会者身份讨论“${topic}”，提出自己的观察，并等待其他模型补充或质疑。`;
  },

  async generateResponse(
    participant: ModelParticipant,
    topic: string,
    previousTurns: MeetingTurn[],
    _evidencePack?: unknown,
    options?: MeetingPromptOptions,
  ): Promise<string> {
    const otherSeatLabels = previousTurns
      .map((turn, index) => ({
        label: `${index + 1}号`,
        speakerName: turn.speakerName,
      }))
      .filter((item) => item.speakerName !== participant.name)
      .map((item) => item.label);
    const seatsText = otherSeatLabels.join("、");

    if (options?.isBriefMode) {
      return `${participant.name}：我补充 ${seatsText || "其他席位"} 的观点：当前最重要的是把“${topic}”压缩成清晰结论，同时保留必要分歧，避免会议结果变成长篇回答合集。`;
    }

    if (participant.id === "gpt-mock") {
      return `${participant.name}：我部分同意 ${seatsText || "其他席位"} 的观点。围绕“${topic}”，可以把分歧转成一个可验证方案：先写清共同目标，再用同一组指标比较不同选择，避免只在措辞上争论。`;
    }

    if (participant.id === "claude-mock") {
      return `${participant.name}：我同意 ${seatsText || "其他席位"} 提出的行动方向，但“${topic}”仍需补充成立条件和受影响人群。若关键前提无法验证，就应把结论标为暂定，而不是用多数意见掩盖不确定性。`;
    }

    if (participant.id === "gemini-mock") {
      return `${participant.name}：我赞成 ${seatsText || "其他席位"} 的结构化处理，也想补充“${topic}”在不同场景下的体验差异。推荐最好让执行者一眼知道先做什么，并能在结果不佳时迅速调整。`;
    }

    if (participant.id === "deepseek-mock") {
      return `${participant.name}：我基本同意 ${seatsText || "其他席位"} 的方向，但会把“${topic}”进一步压缩成最小落地动作。先做一个时间和预算都封顶的试点，用预先约定的指标决定继续、调整还是停止。`;
    }

    return `${participant.name}：我阅读了 ${seatsText} 的观点后，补充一个平等参会者视角：讨论可以有分歧，但不需要被固定角色驱动。`;
  },

  async generateSummary(
    topic: string,
    turns: MeetingTurn[],
    _evidencePack?: unknown,
    options?: MeetingPromptOptions,
  ): Promise<MeetingSummary> {
    if (options?.isBriefMode) {
      return {
        consensus: [`围绕“${topic}”，先保留关键共识和可执行结论。`],
        differences: ["仍需区分不同模型的判断依据和侧重点。"],
        minorityViews: ["少数观点可保留，但不展开长篇论证。"],
        risks: [`${turns.length} 条发言可验证流程，不能代表真实模型能力。`],
        nextSteps: ["今天确认一个试点负责人和成功指标。"],
        decisionBrief: {
          recommendation: `围绕“${topic}”先执行一个范围明确、可回滚的小规模方案。`,
          status: "firm",
          rationale: ["先验证关键假设可以降低一次性投入风险。"],
          conditions: ["提前定义成功指标、负责人和停止条件。"],
          risks: ["Mock 模式不包含外部事实核验。"],
          confidence: "medium",
          evidenceGaps: ["如议题依赖实时事实，需要启用联网资料后复核。"],
          reversalConditions: ["若试点指标明显低于基线，则停止并重新评估。"],
          nextAction: "今天确认一个试点负责人和成功指标。",
        },
      };
    }

    return {
      consensus: [
        `围绕“${topic}”，应先验证关键假设，再决定是否扩大投入。`,
        "可回滚的小规模试点能同时控制风险并提供真实反馈。",
      ],
      differences: [
        "不同观点对成功指标、预算上限和可接受风险的定义仍不完全一致。",
        "有人倾向尽快行动，也有人主张先补充更多资料。",
      ],
      minorityViews: [
        "少数观点认为，如果关键前提无法在试点前确认，应暂缓行动。",
      ],
      risks: [
        "Mock 模式不包含外部事实核验，涉及实时信息时仍需补充可靠资料。",
        `${turns.length} 条 Mock 发言只能演示决策结构，不能代表真实模型能力。`,
      ],
      nextSteps: [
        "今天确认一个试点负责人和成功指标。",
      ],
      decisionBrief: {
        recommendation: `围绕“${topic}”先执行一个范围明确、可回滚的两周试点，再决定是否扩大投入。`,
        status: "firm",
        rationale: [
          "先验证关键假设可以降低一次性投入风险。",
          "明确的试点指标能把当前分歧转成可观察结果。",
        ],
        conditions: [
          "提前定义成功指标、负责人、预算上限和停止条件。",
        ],
        risks: [
          "Mock 模式不包含外部事实核验。",
          "试点样本可能不足以代表长期效果。",
        ],
        confidence: "medium",
        evidenceGaps: [
          "如议题依赖实时事实，需要启用联网资料后复核。",
        ],
        reversalConditions: [
          "若试点核心指标明显低于基线，则停止并重新评估。",
        ],
        nextAction: "今天确认一个试点负责人和成功指标。",
      },
    };
  },
};
