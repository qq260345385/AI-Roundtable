import type {
  MeetingSummary,
  MeetingTurn,
  MeetingPromptOptions,
  ModelParticipant,
  ModelProvider,
  SummaryDebug,
} from "../types";
import { getFactHygienePrompt } from "../meeting/fact-hygiene";
import {
  classifyEvidenceTopic,
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
    const lengthPrompt = getParticipantLengthPrompt("independent", options);

    return this.callChat([
      getSystemMessage(participant),
      {
        role: "user",
        content: [
          `会议议题：${topic}`,
          "这是第一阶段：独立观点。",
          "请对本轮议题提出一个明确立场，并用你认为最有说服力的理由支持它。",
          "你的发言应围绕一个可被其他参会者回应的核心判断展开。不要同时提出多个并列主张；如果有多个角度，请选择你认为最关键的一个。",
          "不要只是列举多个可能性，也不要为了覆盖维度而套固定分析框架。你可以自由选择论证角度，但必须直接回答问题。",
          "允许承认不确定性，但不要用不确定性逃避判断。你的目标是说服其他参会模型理解并接受你的立场。",
          "不要自称固定角色，也不要使用身份式开头；可以用“我认为……”“我的判断是……”“这里被低估的是……”等自然圆桌语气。",
          lengthPrompt,
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
    const currentParticipantFirstTurn = getCurrentParticipantFirstTurn(
      previousTurns,
      participant.name,
    );
    const factHygienePrompt = getFactHygienePrompt(topic);
    const evidencePackPrompt = formatEvidencePackForPrompt(evidencePack);
    const lengthPrompt = getParticipantLengthPrompt("response", options);

    return this.callChat([
      getSystemMessage(participant),
      {
        role: "user",
        content: [
          `会议议题：${topic}`,
          "这是第二阶段：自由回应。",
          `你当前是 ${currentSeatNumber}号。`,
          "你在第一阶段的观点是：",
          currentParticipantFirstTurn,
          "下面是其他参会者在第一阶段的独立观点，已按圆桌席位编号列出：",
          formatTurnsWithSeatNumbers(previousTurns, participant.name),
          "请基于第一阶段其他模型的发言进行回应。你必须至少明确回应一个其他观点，说明你同意、反对或部分修正的理由。",
          "优先回应你认为最值得争论、最需要修正、或最能推进讨论的观点。不要只选择最容易赞同的观点；如果你同意某个观点，也要补充它的边界、代价或遗漏前提。",
          "不要只是继续展开自己的原始框架。你的目标是推进争论：指出对方论证中最强或最弱的地方，并尝试说服其他模型接受你的判断。",
          "可以坚持原立场，也可以调整立场，但要解释为什么。",
          "回应其他参会者时，请使用席位编号称呼对方，例如“1号的观点”或“我想补充 2号”。",
          "不要直接称呼对方的模型名或显示名，例如不要写“感谢 Pro”或“Flash 提到”。",
          "语气自然一点，避免部门报告式结构。",
          lengthPrompt,
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
    const topicType = classifyEvidenceTopic(topic);
    const isStanceOriented = topicType === "general_discussion";
    const summarySystemPrompt = isStanceOriented
      ? getStanceOrientedSummaryPrompt()
      : getEvidenceOrientedSummaryPrompt();
    const content = await this.callChat([
      {
        role: "system",
        content: [
          "你是 AI Roundtable 的会议主持人。请整理会议纪要，不要泄露任何 API key。",
          factHygienePrompt,
          evidencePackPrompt,
          briefModePrompt,
          summarySystemPrompt,
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
          "请统一按以下三个部分整理：共识、分歧、下一步。",
          isStanceOriented
            ? "本轮是观点讨论时，请正常总结共同判断、主要分歧和可继续讨论或行动的方向；不要套用事实核验话术。"
            : "本轮涉及事实资料时，Evidence Pack、事实核验状态和引用检查已有独立区域；第三阶段只归纳较可靠结论、分歧或未覆盖点，以及下一步核验或行动。",
          options?.isBriefMode
            ? "简要会议模式下，每个字段最多 3 条，每条尽量不超过 60 字。"
            : "",
          "请严格返回 JSON，不要添加 Markdown。字段必须包含 consensus、differences、nextSteps，每个字段都是字符串数组。",
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

function getParticipantLengthPrompt(
  phase: "independent" | "response",
  options?: MeetingPromptOptions,
): string {
  if (options?.isBriefMode) {
    return getBriefModePrompt(options);
  }

  return phase === "independent"
    ? "发言控制在 500～800 字；只保留与结论有关的证据、判断和不确定性。"
    : "回应控制在 400～700 字；只保留与推进讨论有关的回应、修正和不确定性。";
}

function getSystemMessage(participant: ModelParticipant): ChatMessage {
  return {
    role: "system",
    content: [
      `你是 ${participant.name}。`,
      `provider: ${participant.provider}`,
      `model: ${participant.model}`,
      "你是圆桌会议中的平等参会者；系统给出的关注点只用于减少重复，不是身份或人设。",
      "不要重复输出模型名、provider、model、阶段标题或席位信息，系统会统一添加。",
      "面向普通用户输出，保持简洁、克制、低认知负担。",
    ].join("\n"),
  };
}

function getEvidenceOrientedSummaryPrompt(): string {
  return [
    "第三阶段由你压缩和归类观点，不按身份归因，只按观点归类。",
    "第三阶段固定输出共识、分歧、下一步三部分，不要使用“可确认事实 / 低置信推测 / 不能确认的关键问题 / 风险点 / 下一步核验建议”作为小节标题。",
    "共识整理阶段不能把未经验证的说法升级为事实，只能标记为参会模型倾向、资料覆盖内的谨慎结论或需要外部核验的判断。",
    "整理共识时，请使用资料质量门控：较可靠结论只能由 high / medium 资料支持，且必须带资料编号，例如 [S1]。",
    "第三阶段需要区分：与议题直接相关的资料结论、背景信息、未覆盖的关键点；不要把局部技术 benchmark 或模型发布事实包装成综合竞争结论。",
    "如果关键维度缺失，请在分歧或下一步中说明该维度需要补充资料，不要把缺失维度写成已经确认的结论。",
    "维度引用纪律：GDPval、SimpleQA、model card、benchmark 只能支持模型能力、评估体系或技术背景判断，不能支持融资能力、收入质量、资本效率、企业合同等商业结论。",
    "商业结论必须由 business_revenue / enterprise_adoption / funding_capital / market_analysis 类资料支撑；如果缺少对应维度资料，必须说“当前资料未覆盖该维度，不能判断”。",
    "low / very_low 可信度资料只能作为社区观点、传闻、舆论反馈，不能作为事实依据。",
    "禁止基于 low / very_low 资料使用“证明”“显示”“已经超越”“确定领先”“吊打”“追平”“实锤”等强断言。",
    "如果结论只被 low / very_low 资料支持，请放入分歧或下一步，并使用“有资料声称”“社区讨论认为”“尚未核验”“不能据此确认”等措辞。",
    "low-evidence mode 下，低质量资料里的融资额、估值、营收、收入、IPO 时间表等具体数字只能作为待核验问题，不能作为共识或正文论据。",
    "引用低质量资料时必须写成“资料[Sx]提供了一个待核验线索，但因来源质量低/正文不足，不能确认。”或“有低可信资料声称xxx，但本轮无法确认，不能作为结论依据。”",
    "禁止写“根据[Sx]，某公司融资xxx”“资料显示某机构估值xxx”这类把低可信资料声称包装成事实的句式。",
    "第三阶段必须压缩重复观点，避免同一句同时出现在多个部分。",
    "如果本轮没有 Evidence Pack，不要写“资料不足以确认关键事实”；可以直接总结模型讨论形成的共识、分歧和下一步。",
  ].join("\n");
}

function getStanceOrientedSummaryPrompt(): string {
  return [
    "第三阶段由你整合讨论，不按发言身份归因，只按观点内容归类。",
    "本议题属于观点或选择讨论，不要把参会模型的判断包装成可确认事实。",
    "",
    "整理规则：",
    "",
    "【共识】只列入\"被质疑或反驳后仍然成立\"的判断。",
    "如果一个观点只是被多方重复提出但没有人挑战，不算共识，忽略或注明为无争议前提。",
    "",
    "【分歧】每条分歧需注明类型：",
    "- 价值取向分歧：两种判断各自自洽，用户需要自己选择立场，系统无法裁定",
    "- 经验判断分歧：可以通过证据或实验验证的，说明验证方向即可",
    "- 框架/定义分歧：双方划定问题边界不同，需先对齐定义才能推进",
    "",
    "【下一步】给出具体行动建议，不要给\"继续研究\"建议。",
    "格式：用户应该先决定什么、验证什么、暂缓什么。",
    "若讨论过程揭示了原始议题里隐含但未提出的更深层问题，在 nextSteps 里以「【新问题】」前缀单独列出。",
    "",
    "不要输出\"可确认事实\"\"低置信推测\"\"风险点\"\"下一步核验建议\"等事实核验式措辞。",
    "如果没有外部资料，不要提及联网失败或资料不足。",
  ].join("\n");
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

  return index >= 0 ? index + 1 : turns.length + 1;
}

function getCurrentParticipantFirstTurn(
  turns: MeetingTurn[],
  speakerName: string,
): string {
  return (
    turns.find((turn) => turn.speakerName === speakerName)?.content ??
    "未找到你的第一阶段发言；请以当前议题和其他参会者观点为准。"
  );
}

const FIELD_ALIASES: Record<string, string> = {
  facts: "confirmableFacts",
  confirmedFacts: "confirmableFacts",
  hypotheses: "initialHypotheses",
  lowConfidenceInferences: "initialHypotheses",
  unknowns: "insufficientlyConfirmed",
  openQuestions: "insufficientlyConfirmed",
  riskPoints: "risks",
  verificationSteps: "nextSteps",
  actionItems: "nextSteps",
};

const SAFE_FALLBACK: MeetingSummary = {
  consensus: [],
  differences: [],
  minorityViews: [],
  confirmableFacts: [],
  initialHypotheses: [],
  communityViews: [],
  insufficientlyConfirmed: [
    "第三阶段共识整理输出格式异常，无法可靠解析。",
  ],
  risks: ["会议小结不是标准 JSON，后续需要加强提示词或解析逻辑。"],
  nextSteps: ["检查真实模型的 summary 输出格式。"],
};

export function parseSummary(content: string): MeetingSummary {
  const { format, extracted } = detectAndExtractJson(content);
  const debug: SummaryDebug = {
    rawFormatDetected: format,
    parseSucceeded: false,
    repairAttempted: false,
    fallbackUsed: false,
    emptySectionsRepaired: [],
  };

  if (extracted) {
    const repaired = repairParsedData(extracted);
    const summary = buildSummaryFromParsed(repaired.data);
    debug.parseSucceeded = true;
    debug.repairAttempted = repaired.wasRepaired;
    debug.emptySectionsRepaired = repaired.emptySections;

    return applyQualityGate(summary, debug);
  }

  debug.fallbackUsed = true;
  debug.fallbackReason = "JSON extraction failed from model output";

  return applyQualityGate({ ...SAFE_FALLBACK }, debug);
}

export function generateFallbackSummaryFromTurns(
  topic: string,
  turns: MeetingTurn[],
  evidencePack?: EvidencePack,
): MeetingSummary {
  const debug: SummaryDebug = {
    rawFormatDetected: "unknown",
    parseSucceeded: false,
    repairAttempted: false,
    fallbackUsed: true,
    fallbackReason: "Model summary generation failed, using turn-based fallback",
    emptySectionsRepaired: [],
  };

  const turnTexts = turns.map((turn) => turn.content);
  const allText = turnTexts.join("\n");
  const hasCoreEvidence = (evidencePack?.items ?? []).some(
    (item) =>
      item.quality?.reliability === "high" ||
      item.quality?.reliability === "medium",
  );

  const confirmableFacts = hasCoreEvidence
    ? extractSentencesWithPattern(allText, [
        /资料\[S\d+\]/,
        /据.*?报道/,
        /官方.*?发布/,
        /已确认/,
      ]).slice(0, 5)
    : [];

  const initialHypotheses = extractConsensusPoints(allText).slice(0, 5);
  const risks = extractSentencesWithPattern(allText, [
    /风险/,
    /不确定/,
    /不足/,
    /无法确认/,
    /需要核验/,
    /risk/i,
    /uncertain/i,
  ]).slice(0, 5);

  const nextSteps = [
    `核验"${topic}"相关的最新官方信息。`,
    "补充缺失维度的权威资料。",
  ];

  const summary: MeetingSummary = {
    consensus: initialHypotheses,
    differences: [],
    minorityViews: [],
    confirmableFacts,
    initialHypotheses: [],
    communityViews: [],
    insufficientlyConfirmed: [
      "模型总结生成失败，以下内容基于发言自动提取，可能不完整。",
    ],
    risks: risks.length > 0 ? risks : ["总结生成失败，风险点无法自动提取。"],
    nextSteps,
    summaryDebug: debug,
  };

  return applyQualityGate(summary, debug);
}

function detectAndExtractJson(content: string): {
  format: SummaryDebug["rawFormatDetected"];
  extracted: Record<string, unknown> | undefined;
  wasFenced: boolean;
} {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);

  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    const parsed = tryParseJsonObject(inner) ?? extractFirstJsonObject(inner);

    return { format: "fenced_json", extracted: parsed, wasFenced: true };
  }

  const directParsed = tryParseJsonObject(trimmed);

  if (directParsed) {
    return { format: "json", extracted: directParsed, wasFenced: false };
  }

  const braceExtracted = extractFirstJsonObject(trimmed);

  if (braceExtracted) {
    return { format: "json", extracted: braceExtracted, wasFenced: false };
  }

  return { format: "markdown", extracted: undefined, wasFenced: false };
}

function tryParseJsonObject(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text);

    if (isObject(parsed)) {
      return parsed;
    }
  } catch {
    // Not valid JSON.
  }

  return undefined;
}

function extractFirstJsonObject(content: string): Record<string, unknown> | undefined {
  const startIndex = content.indexOf("{");

  if (startIndex < 0) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const char = content[index];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === "\\") {
      if (inString) {
        escape = true;
      }

      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        try {
          const candidate = content.slice(startIndex, index + 1);
          const parsed = JSON.parse(candidate);

          if (isObject(parsed)) {
            return parsed;
          }
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repairParsedData(data: Record<string, unknown>): {
  data: Record<string, unknown>;
  wasRepaired: boolean;
  emptySections: string[];
} {
  const repaired: Record<string, unknown> = {};
  let wasRepaired = false;
  const emptySections: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    const canonicalKey = FIELD_ALIASES[key] ?? key;
    const repairedValue = repairFieldValue(value);

    if (repairedValue.changed) {
      wasRepaired = true;
    }

    repaired[canonicalKey] = repairedValue.value;

    if (
      Array.isArray(repairedValue.value) &&
      repairedValue.value.length === 0 &&
      isSummaryListField(canonicalKey)
    ) {
      emptySections.push(canonicalKey);
    }
  }

  return { data: repaired, wasRepaired, emptySections };
}

function repairFieldValue(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "" || trimmed === "undefined" || trimmed === "null") {
      return { value: [], changed: true };
    }

    return { value: [trimmed], changed: true };
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0 && item !== "undefined" && item !== "[object Object]")
      .filter((item, index, arr) => arr.indexOf(item) === index);

    return { value: cleaned, changed: cleaned.length !== value.length };
  }

  if (isObject(value)) {
    const text =
      typeof value.text === "string"
        ? value.text
        : typeof value.content === "string"
          ? value.content
          : typeof value.value === "string"
            ? value.value
            : JSON.stringify(value);

    return { value: [text], changed: true };
  }

  if (value === undefined || value === null) {
    return { value: [], changed: true };
  }

  return { value: [String(value)], changed: true };
}

function isSummaryListField(key: string): boolean {
  return [
    "consensus",
    "differences",
    "minorityViews",
    "confirmableFacts",
    "initialHypotheses",
    "communityViews",
    "insufficientlyConfirmed",
    "risks",
    "nextSteps",
  ].includes(key);
}

function buildSummaryFromParsed(data: Record<string, unknown>): MeetingSummary {
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
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return [];
}

function applyQualityGate(summary: MeetingSummary, debug: SummaryDebug): MeetingSummary {
  const result = { ...summary };

  result.consensus = sanitizeList(result.consensus);
  result.differences = sanitizeList(result.differences);
  result.minorityViews = sanitizeList(result.minorityViews);
  result.risks = sanitizeList(result.risks);
  result.nextSteps = sanitizeList(result.nextSteps);

  if (result.confirmableFacts) {
    result.confirmableFacts = sanitizeList(result.confirmableFacts);
  }

  if (result.initialHypotheses) {
    result.initialHypotheses = sanitizeList(result.initialHypotheses);
  }

  if (result.communityViews) {
    result.communityViews = sanitizeList(result.communityViews);
  }

  if (result.insufficientlyConfirmed) {
    result.insufficientlyConfirmed = sanitizeList(result.insufficientlyConfirmed);
  }

  result.summaryDebug = debug;

  return result;
}

function sanitizeList(items: string[]): string[] {
  return items
    .map((item) =>
      item
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\bundefined\b/g, "")
        .replace(/\[object Object\]/g, "")
        .trim(),
    )
    .filter((item) => item.length > 0);
}

function extractSentencesWithPattern(
  text: string,
  patterns: RegExp[],
): string[] {
  const sentences = text
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);

  const matched: string[] = [];

  for (const sentence of sentences) {
    if (patterns.some((pattern) => pattern.test(sentence))) {
      matched.push(sentence);

      if (matched.length >= 5) {
        break;
      }
    }
  }

  return matched;
}

function extractConsensusPoints(text: string): string[] {
  const sentences = text
    .split(/[。！？\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15 && s.length <= 200);

  const points: string[] = [];
  const seen = new Set<string>();

  for (const sentence of sentences) {
    const normalized = sentence.replace(/\s+/g, "");

    if (!seen.has(normalized)) {
      seen.add(normalized);
      points.push(sentence);
    }

    if (points.length >= 5) {
      break;
    }
  }

  return points;
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
