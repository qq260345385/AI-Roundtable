import type {
  MeetingSummary,
  MeetingTurn,
  MeetingPromptOptions,
  ModelParticipant,
  ModelProvider,
} from "../types";
import { getFactHygienePrompt } from "../meeting/fact-hygiene";
import {
  formatEvidencePackForPrompt,
  type EvidencePack,
  type SearchIntent,
} from "../search/evidence-pack";

type OpenAICompatibleProviderOptions = {
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  fetcher?: typeof fetch;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
};

export class OpenAICompatibleProvider implements ModelProvider {
  name: string;

  private baseUrl: string;
  private apiKey: string;
  private modelName: string;
  private fetcher: typeof fetch;

  constructor(options: OpenAICompatibleProviderOptions) {
    if (!options.apiKey.trim()) {
      throw new Error(`${options.providerName} API key is missing`);
    }

    if (!options.modelName.trim()) {
      throw new Error(`${options.providerName} model is missing`);
    }

    this.name = options.providerName;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this.modelName = options.modelName;
    this.fetcher = options.fetcher ?? fetch;
  }

  async generateSearchIntents(
    participant: ModelParticipant,
    topic: string,
    options?: MeetingPromptOptions,
  ): Promise<SearchIntent[]> {
    const content = await this.callChat([
      {
        role: "system",
        content: [
          "You are a web search planner for AI Roundtable.",
          "Return JSON only: an array of 3 to 5 structured SearchIntent objects.",
          "Each object must include question, mustInclude, shouldInclude, exclude, freshness, sourcePreference, and rationale.",
          "freshness must be latest, recent, or any.",
          "sourcePreference must be official, benchmark, media, community, or mixed.",
          "Prefer official and benchmark sources for current facts, rankings, releases, benchmarks, prices, and policies.",
          "Do not include explanations, markdown, or citations.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Participant: ${participant.provider} / ${participant.model}`,
          `Meeting topic: ${topic}`,
          "Create search queries that would help this participant verify current facts before speaking.",
        ].join("\n"),
      },
    ], options);

    return parseSearchIntents(content, topic);
  }

  async generateSearchQueries(
    participant: ModelParticipant,
    topic: string,
    options?: MeetingPromptOptions,
  ): Promise<string[]> {
    const intents = await this.generateSearchIntents(participant, topic, options);

    return intents.map((intent) =>
      [
        intent.question,
        ...intent.mustInclude,
        ...intent.shouldInclude,
      ].join(" "),
    );
  }

  async generateIndependentView(
    participant: ModelParticipant,
    topic: string,
    evidencePack?: EvidencePack,
    options?: MeetingPromptOptions,
  ): Promise<string> {
    const factHygienePrompt = getFactHygienePrompt(topic);
    const evidencePackPrompt = formatEvidencePackForPrompt(evidencePack);
    const briefModePrompt = getBriefModePrompt(options);
    const discussionFocusPrompt = getDiscussionFocusPrompt(options);
    const discussionFocusGuardrails = getDiscussionFocusGuardrails(
      options,
      evidencePack,
    );

    return this.callChat([
      getSystemMessage(participant),
      {
        role: "user",
        content: [
          `会议议题：${topic}`,
          "这是第一阶段：独立观点。",
          discussionFocusPrompt,
          "请给出你的独立观点。系统给你的关注点只是为了减少重复，不是固定身份。你不需要自称角色，也可以超出该关注点自由表达。",
          "不要自称固定角色，也不要使用身份式开头；可以用“我更关注的是……”“这里可能被低估的是……”“这个判断要加一个条件……”等自然圆桌语气。",
          "发言控制在 500～800 字；只保留与结论有关的证据、判断和不确定性。",
          discussionFocusGuardrails,
          briefModePrompt,
          factHygienePrompt,
          evidencePackPrompt,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ], options);
  }

  async generateResponse(
    participant: ModelParticipant,
    topic: string,
    previousTurns: MeetingTurn[],
    evidencePack?: EvidencePack,
    options?: MeetingPromptOptions,
  ): Promise<string> {
    const currentSeatNumber = getSeatNumber(previousTurns, participant.name);
    const factHygienePrompt = getFactHygienePrompt(topic);
    const evidencePackPrompt = formatEvidencePackForPrompt(evidencePack);
    const briefModePrompt = getBriefModePrompt(options);
    const discussionFocusPrompt = getDiscussionFocusPrompt(options);
    const discussionFocusGuardrails = getDiscussionFocusGuardrails(
      options,
      evidencePack,
    );

    return this.callChat([
      getSystemMessage(participant),
      {
        role: "user",
        content: [
          `会议议题：${topic}`,
          "这是第二阶段：自由回应。",
          `你当前是 ${currentSeatNumber}号。`,
          "下面是其他参会者在第一阶段的独立观点，已按圆桌席位编号列出：",
          formatTurnsWithSeatNumbers(previousTurns, participant.name),
          discussionFocusPrompt,
          "请回应其他模型中你最想补充、质疑或修正的一点。避免重复上一阶段已有观点，除非你是在反驳、加条件或指出证据不足。",
          "关注点只是为了减少重复，不是固定身份；不要自称固定角色，也可以超出该关注点自由表达。",
          "回应其他参会者时，请使用席位编号称呼对方，例如“1号的观点”或“我想补充 2号”。",
          "不要直接称呼对方的模型名或显示名，例如不要写“感谢 Pro”或“Flash 提到”。",
          "语气自然一点，避免部门报告式结构。",
          discussionFocusGuardrails,
          briefModePrompt,
          factHygienePrompt,
          evidencePackPrompt,
        ].join("\n"),
      },
    ], options);
  }

  async generateSummary(
    topic: string,
    turns: MeetingTurn[],
    evidencePack?: EvidencePack,
    options?: MeetingPromptOptions,
  ): Promise<MeetingSummary> {
    const factHygienePrompt = getFactHygienePrompt(topic);
    const evidencePackPrompt = formatEvidencePackForPrompt(evidencePack);
    const briefModePrompt = getBriefModePrompt(options);
    const content = await this.callChat([
      {
        role: "system",
        content: [
          "你是 AI Roundtable 的会议主持人。请整理会议纪要，不要泄露任何 API key。",
          factHygienePrompt,
          evidencePackPrompt,
          briefModePrompt,
          "第三阶段由你压缩和归类观点，不按身份归因，只按观点归类。",
          "共识整理阶段不能把未经验证的说法升级为事实，只能标记为参会模型倾向或需要外部核验。",
          "整理共识时，请使用资料质量门控：可确认事实只能放入 high / medium 资料支持的事实性结论，且必须带资料编号，例如 [S1]。",
          "low / very_low 可信度资料只能作为社区观点、传闻、舆论反馈，不能作为事实依据。",
          "禁止基于 low / very_low 资料使用“证明”“显示”“已经超越”“确定领先”“吊打”“追平”“实锤”等强断言。",
          "如果结论只被 low / very_low 资料支持，请放入“社区观点”或“不足以确认”，并使用“有资料声称”“社区讨论认为”“尚未核验”“不能据此确认”等措辞。",
          "low-evidence mode 下，低质量资料里的融资额、估值、营收、收入、IPO 时间表等具体数字只能放入低置信推测或不能确认的关键问题，不能作为正文论据或可确认事实。",
          "引用低质量资料时必须写成“资料[Sx]提供了一个待核验线索，但因来源质量低/正文不足，不能确认。”或“有低可信资料声称xxx，但本轮无法确认，不能作为结论依据。”",
          "禁止写“根据[Sx]，OpenAI融资xxx”“资料显示Anthropic估值xxx”这类把低可信资料声称包装成事实的句式。",
          "第三阶段必须压缩重复观点，避免同一句同时出现在“低置信推测”和“不能确认的关键问题”。",
          "如果没有可确认事实，confirmableFacts 必须返回 [\"无。当前资料不足以确认关键事实。\"]。",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        role: "user",
        content: [
          `会议议题：${topic}`,
          "这是第三阶段：共识整理。",
          "会议发言：",
          formatTurns(turns),
          "请按以下结构整理：可确认事实、低置信推测、不能确认的关键问题、风险点、下一步核验建议。",
          options?.isBriefMode
            ? "简要会议模式下，每个字段最多 3 条，每条尽量不超过 60 字。"
            : "",
          "请严格返回 JSON，不要添加 Markdown。字段必须是 confirmableFacts、initialHypotheses、insufficientlyConfirmed、risks、nextSteps，每个字段都是字符串数组。communityViews 可用于舆论线索；为了兼容旧界面，也可以同时提供 consensus、differences、minorityViews。",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ], options);

    return parseSummary(content);
  }

  private async callChat(
    messages: ChatMessage[],
    options?: MeetingPromptOptions,
  ): Promise<string> {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.modelName,
        messages,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(
        `${this.name} API request failed: ${response.status}`,
      );
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error(`${this.name} API returned empty content`);
    }

    return content;
  }
}

function getBriefModePrompt(options?: MeetingPromptOptions): string {
  if (!options?.isBriefMode) {
    return "";
  }

  return [
    "本轮启用简要会议模式。",
    "你的发言请尽量控制在 200 字左右，只保留最关键观点。",
    "避免长篇列表、铺垫和重复解释；如果需要列点，最多 3 点。",
  ].join("\n");
}

function getSystemMessage(participant: ModelParticipant): ChatMessage {
  return {
    role: "system",
    content: [
      `你是 ${participant.name}。`,
      `provider: ${participant.provider}`,
      `model: ${participant.model}`,
      "你是圆桌会议中的平等参会者；系统给出的关注点只用于减少重复，不是身份或人设。",
      "面向普通用户输出，保持简洁、克制、低认知负担。",
    ].join("\n"),
  };
}

function getDiscussionFocusPrompt(options?: MeetingPromptOptions): string {
  if (!options?.discussionFocus) {
    return "";
  }

  return `本轮讨论关注点：${options.discussionFocus}。`;
}

function getDiscussionFocusGuardrails(
  options: MeetingPromptOptions | undefined,
  evidencePack: EvidencePack | undefined,
): string {
  const focus = options?.discussionFocus ?? "";
  const lines = [
    "所有关注点都只能作为讨论切入点；low-evidence mode 下只能做框架分析和低置信推测，不得用低质量资料包装成事实。",
  ];

  if (focus.includes("技术与产品能力")) {
    lines.push(
      "技术与产品能力关注点：禁止在无可靠资料时推断未公开底层架构，只能讨论可观察的产品能力、工程效率信号和需要核验的问题。",
    );
  }

  if (focus.includes("商业与资本效率")) {
    lines.push(
      "商业与资本效率关注点：禁止把低可信来源中的融资额、估值、营收、收入写成确定事实。",
    );
  }

  if (evidencePack?.evidenceStatus === "low" || evidencePack?.evidenceStatus === "none") {
    lines.push(
      "当前资料质量不足时，请主动降级表达，不要把具体数字、模型版本、融资、估值、营收或 IPO 时间表写成确定事实。",
    );
  }

  return lines.join("\n");
}

function formatTurns(turns: MeetingTurn[], currentSpeakerName?: string): string {
  const visibleTurns = turns.filter(
    (turn) => turn.speakerName !== currentSpeakerName,
  );

  if (visibleTurns.length === 0) {
    return "暂无其他模型观点。";
  }

  return visibleTurns
    .map((turn) => `${turn.speakerName}（${turn.provider}/${turn.model}）：${turn.content}`)
    .join("\n");
}

function formatTurnsWithSeatNumbers(
  turns: MeetingTurn[],
  currentSpeakerName?: string,
): string {
  const visibleTurns = turns
    .map((turn, index) => ({
      seatNumber: index + 1,
      turn,
    }))
    .filter((item) => item.turn.speakerName !== currentSpeakerName);

  if (visibleTurns.length === 0) {
    return "暂无其他模型观点。";
  }

  return visibleTurns
    .map(
      (item) =>
        `${item.seatNumber}号（${item.turn.provider}/${item.turn.model}）：${item.turn.content}`,
    )
    .join("\n");
}

function getSeatNumber(turns: MeetingTurn[], speakerName: string): number {
  const index = turns.findIndex((turn) => turn.speakerName === speakerName);

  return index >= 0 ? index + 1 : 0;
}

function parseSummary(content: string): MeetingSummary {
  try {
    const data = JSON.parse(content) as Partial<MeetingSummary>;

    return {
      consensus: readStringList(data.consensus),
      differences: readStringList(data.differences),
      minorityViews: readStringList(data.minorityViews),
      confirmableFacts: readStringList(data.confirmableFacts),
      initialHypotheses: readStringList(data.initialHypotheses),
      communityViews: readStringList(data.communityViews),
      insufficientlyConfirmed: readStringList(data.insufficientlyConfirmed),
      risks: readStringList(data.risks),
      nextSteps: readStringList(data.nextSteps),
    };
  } catch {
    return {
      consensus: [content],
      differences: ["模型没有返回可解析的结构化分歧。"],
      minorityViews: ["模型没有返回可解析的少数派观点。"],
      risks: ["会议小结不是标准 JSON，后续需要加强提示词或解析逻辑。"],
      nextSteps: ["检查真实模型的 summary 输出格式。"],
    };
  }
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function parseSearchIntents(content: string, topic: string): SearchIntent[] {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (Array.isArray(parsed)) {
      const intents = parsed
        .map((item) => normalizeSearchIntent(item))
        .filter((item): item is SearchIntent => item !== null);

      if (intents.length > 0) {
        return intents.slice(0, 5);
      }
    }
  } catch {
    // Fall through to a safe structured fallback.
  }

  return [
    {
      question: `${topic} official report`,
      mustInclude: [topic],
      shouldInclude: ["official report"],
      exclude: [],
      freshness: "latest",
      sourcePreference: "official",
      rationale: "Fallback official-source search intent.",
    },
    {
      question: `${topic} benchmark`,
      mustInclude: [topic],
      shouldInclude: ["benchmark"],
      exclude: [],
      freshness: "recent",
      sourcePreference: "benchmark",
      rationale: "Fallback benchmark-source search intent.",
    },
    {
      question: `${topic} latest analysis`,
      mustInclude: [topic],
      shouldInclude: ["latest"],
      exclude: [],
      freshness: "latest",
      sourcePreference: "mixed",
      rationale: "Fallback current-context search intent.",
    },
  ];
}

function normalizeSearchIntent(value: unknown): SearchIntent | null {
  if (typeof value === "string") {
    const question = value.trim();

    return question
      ? {
          question,
          mustInclude: [],
          shouldInclude: [],
          exclude: [],
          freshness: "any",
          sourcePreference: "mixed",
          rationale: "Legacy plain-text search direction.",
        }
      : null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const item = value as Partial<SearchIntent>;
  const question = typeof item.question === "string" ? item.question.trim() : "";

  if (!question) {
    return null;
  }

  return {
    question,
    mustInclude: readSearchStringList(item.mustInclude),
    shouldInclude: readSearchStringList(item.shouldInclude),
    exclude: readSearchStringList(item.exclude),
    freshness:
      item.freshness === "latest" ||
      item.freshness === "recent" ||
      item.freshness === "any"
        ? item.freshness
        : "any",
    sourcePreference:
      item.sourcePreference === "official" ||
      item.sourcePreference === "benchmark" ||
      item.sourcePreference === "media" ||
      item.sourcePreference === "community" ||
      item.sourcePreference === "mixed"
        ? item.sourcePreference
        : "mixed",
    rationale:
      typeof item.rationale === "string" ? item.rationale.trim() : "",
  };
}

function readSearchStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}
