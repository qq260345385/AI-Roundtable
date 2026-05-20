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
      return `${participant.name}：我会先把“${topic}”拆成三个层面：会议流程、观点记录、最终纪要。比较稳的做法是先保证每个模型都有独立发言，再允许它们互相回应，最后把共识和分歧分开整理。这样既有结构，也不会把模型硬塞进固定角色。`;
    }

    if (participant.id === "claude-mock") {
      return `${participant.name}：我会先提醒一个边界问题：AI Roundtable 的价值不只是“多几个回答”，而是让不同模型之间的推理倾向被看见。需要避免把表达倾向误写成职责分工，否则产品又会滑回传统 multi-agent。`;
    }

    if (participant.id === "gemini-mock") {
      return `${participant.name}：我更想从场景看这个产品。用户可能不是只想看最终答案，而是想观察不同模型如何互相启发。界面可以突出会议感，比如席位、阶段、发言流和小结，让讨论过程本身变得可读。`;
    }

    if (participant.id === "deepseek-mock") {
      return `${participant.name}：我会先看落地路径。第一版应该保持简单：MockProvider 先写死差异化文本，会议引擎只处理阶段顺序，UI 只展示结果。等流程稳定后，再接真实 Provider、错误状态和调用耗时。`;
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
      return `${participant.name}：我部分同意 ${seatsText} 的观点。可以把“${topic}”继续整理成一个折中方案：既保留自由讨论的开放性，也用固定阶段保证结果可读。我的补充是，小结最好明确区分共识、分歧和下一步。`;
    }

    if (participant.id === "claude-mock") {
      return `${participant.name}：我同意要有阶段，但也想补充一个潜在问题：如果 Mock 文案过度模板化，用户会误以为模型差异只是 UI 装饰。关于“${topic}”，更重要的是让差异来自表达方式和推理侧重点，而不是来自人为指定的任务。`;
    }

    if (participant.id === "gemini-mock") {
      return `${participant.name}：我赞成前面的结构化处理，也想延展到使用体验。用户阅读 ${seatsText} 的发言时，应该能快速看出谁在补充、谁在保留意见、谁提出新的场景。这样圆桌会议才不只是答案列表。`;
    }

    if (participant.id === "deepseek-mock") {
      return `${participant.name}：我基本同意这个方向，但会提醒实现复杂度。自由回应阶段先用上一阶段发言作为输入就够了，不需要马上做复杂记忆或状态管理。围绕“${topic}”，先把数据结构和测试稳定下来更重要。`;
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
        nextSteps: ["继续用简短议题测试多人讨论质量。"],
      };
    }

    return {
      consensus: [
        `AI Roundtable 讨论“${topic}”时，应让不同模型作为平等参会者发言，而不是让它们扮演固定角色。`,
        "会议流程需要保留独立观点、自由回应和共识整理三个阶段，方便用户看到观点如何形成。",
      ],
      differences: [
        "模型差异应该更多来自表达倾向和推理侧重点，而不是来自人为分配的职责。",
        "产品可以强调会议感，但需要控制第一版复杂度，避免过早引入真实 API、数据库或复杂状态管理。",
      ],
      minorityViews: [
        "少数派观点认为，Mock 阶段也要谨慎设计文本，否则用户可能误判真实模型差异。",
        "另一个有价值的提醒是：自由回应不必总是反驳，同意、部分同意和补充同样能体现圆桌讨论。",
      ],
      risks: [
        "当前发言由 MockProvider 生成，仍然只是模拟差异，不能代表真实模型能力。",
        "如果后续接入真实模型时没有记录 provider、model、状态和错误信息，排查会变困难。",
        `${turns.length} 条 Mock 发言可以验证展示结构，但还不能验证真实模型之间的互动质量。`,
      ],
      nextSteps: [
        "继续保留 MockProvider，先完善页面交互和会议数据结构。",
        "增加用户输入议题的表单，让会议主题不再写死。",
        "接入真实 Provider 时，从一个模型开始，小步验证调用、错误处理和展示效果。",
      ],
    };
  },
};
