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

    return this.callChat([
      getSystemMessage(participant),
      {
        role: "user",
        content: [
          `会议议题：${topic}`,
          "这是第一阶段：独立观点。",
          "请作为平等参会者发表你的看法。你不是固定角色 agent，也没有被分配固定任务。",
          "请尽量体现你这个模型自身的表达方式、推理倾向和关注重点。",
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
          "请自由回应：可以同意、部分同意、补充、质疑、反驳或延展。",
          "回应其他参会者时，请使用席位编号称呼对方，例如“1号的观点”或“我想补充 2号”。",
          "不要直接称呼对方的模型名或显示名，例如不要写“感谢 Pro”或“Flash 提到”。",
          "不要为了制造冲突而强行反驳，也不要把自己变成固定职责 agent。",
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
          "共识整理阶段不能把未经验证的说法升级为事实，只能标记为参会模型倾向或需要外部核验。",
          "整理共识时，请使用资料质量门控：可确认事实只能放入 high / medium 资料支持的事实性结论，且必须带资料编号，例如 [S1]。",
          "low / very_low 可信度资料只能作为社区观点、传闻、舆论反馈，不能作为事实依据。",
          "禁止基于 low / very_low 资料使用“证明”“显示”“已经超越”“确定领先”“吊打”“追平”“实锤”等强断言。",
          "如果结论只被 low / very_low 资料支持，请放入“社区观点”或“不足以确认”，并使用“有资料声称”“社区讨论认为”“尚未核验”“不能据此确认”等措辞。",
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
          "请按以下结构整理：可确认事实、初步推测、社区观点、不足以确认、风险点、下一步建议。",
          options?.isBriefMode
            ? "简要会议模式下，每个字段最多 3 条，每条尽量不超过 60 字。"
            : "",
          "请严格返回 JSON，不要添加 Markdown。字段必须是 confirmableFacts、initialHypotheses、communityViews、insufficientlyConfirmed、risks、nextSteps，每个字段都是字符串数组。为了兼容旧界面，也可以同时提供 consensus、differences、minorityViews。",
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
    "你的发言请尽量控制在 150 字左右，只保留最关键观点。",
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
      "你是圆桌会议中的平等参会者，不是固定角色 agent。",
      "你可以表达自己的模型倾向，但不要假装自己被分配了固定职责。",
    ].join("\n"),
  };
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
