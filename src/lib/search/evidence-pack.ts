export type SearchEvidence = {
  id: string;
  title: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  snippet: string;
  quality?: EvidenceQuality;
};

export type DocumentInputStrategy = "text_pack" | "native_file" | "auto";

export type EvidenceDeliveryMode = "text_pack" | "native_file";

export type EvidenceDeliveryInfo = {
  requestedStrategy: DocumentInputStrategy;
  effectiveMode: EvidenceDeliveryMode;
  reason: string;
  nativeAttachmentProviderCount: number;
  textPackProviderCount: number;
  unsupportedProviderNames: string[];
};

export type CapabilitySupportStatus = "supported" | "unsupported" | "unknown";

export type CapabilitySource = "env" | "adapter" | "default" | "verified";

export type EvidenceAttachmentCapabilities = {
  nativeEvidenceAttachments: boolean;
  nativeEvidenceAttachmentsStatus?: CapabilitySupportStatus;
  documentRecognition: boolean;
  documentRecognitionStatus?: CapabilitySupportStatus;
  imageRecognition: boolean;
  imageRecognitionStatus?: CapabilitySupportStatus;
  source?: CapabilitySource;
};

export type EvidenceQuality = {
  warnings: string[];
  textLength: number;
  wasTruncated: boolean;
  sourceType: EvidenceSourceType;
  reliability: EvidenceReliability;
  score: number;
};

export type EvidencePack = {
  enabled: boolean;
  strategy?: DocumentInputStrategy;
  delivery?: EvidenceDeliveryInfo;
  items: SearchEvidence[];
};

export type EvidenceSourceType =
  | "official"
  | "benchmark"
  | "media"
  | "blog"
  | "community"
  | "social"
  | "video"
  | "unknown";

export type EvidenceReliability = "high" | "medium" | "low" | "very_low";

export type EvidenceQualityOverview = {
  officialCount: number;
  benchmarkCount: number;
  mediaCount: number;
  communitySocialVideoCount: number;
  shortContentCount: number;
  clickbaitRiskCount: number;
  overallReliability: "高" | "中" | "低";
};

export const MAX_EVIDENCE_ITEMS = 10;
const MAX_TITLE_LENGTH = 120;
const MAX_SOURCE_LENGTH = 80;
const MAX_PUBLISHED_AT_LENGTH = 40;
const MAX_SNIPPET_LENGTH = 40000;
const SHORT_SNIPPET_WARNING_LENGTH = 20;

type NormalizeEvidencePackOptions = {
  allowLowReliabilityFallback?: boolean;
};

export function normalizeEvidencePack(
  input: unknown,
  options: NormalizeEvidencePackOptions = {},
): EvidencePack {
  if (!isObject(input) || input.enabled !== true) {
    return createDisabledEvidencePack();
  }

  if (!Array.isArray(input.items)) {
    return createDisabledEvidencePack();
  }

  const normalizedItems = input.items
    .map(normalizeEvidenceItem)
    .filter((item): item is Omit<SearchEvidence, "id"> => item !== null)
    .sort(compareEvidenceQuality);
  const usableItems = normalizedItems.filter(isUsableEvidenceItem);
  const selectedItems =
    usableItems.length > 0 || options.allowLowReliabilityFallback === false
      ? usableItems
      : normalizedItems;
  const items = selectedItems
    .slice(0, MAX_EVIDENCE_ITEMS)
    .map((item, index) => ({
      ...item,
      id: `S${index + 1}`,
    }));

  if (items.length === 0) {
    return createDisabledEvidencePack();
  }

  return {
    enabled: true,
    strategy: normalizeDocumentInputStrategy(input.strategy),
    items,
  };
}

export function formatEvidencePackForPrompt(
  evidencePack: EvidencePack | undefined,
): string {
  if (!evidencePack?.enabled || evidencePack.items.length === 0) {
    return [
      "本轮会议未启用外部资料包。",
      "涉及当前、最新、排名、价格、政策、版本、新闻等实时信息时，不要给出未经验证的确定结论，应标注为待核验。",
    ].join("\n");
  }

  return [
    "本轮会议提供了统一的外部资料候选。",
    "这些资料是检索资料候选，不代表已经完成事实核验。",
    formatDocumentInputStrategyForPrompt(evidencePack.strategy),
    formatEvidenceDeliveryForPrompt(evidencePack.delivery),
    "你在引用资料包中的事实时，必须使用资料编号，例如 [S1]、[S2]。",
    "如果资料包没有覆盖某个事实，请明确说明：“资料包未覆盖，无法确认。”",
    "不要把资料包之外的最新事实说成确定结论。",
    "不要编造资料编号。",
    "不要引用不存在的资料。",
    "",
    "引用约束规则：",
    "- high 可信度资料可以支撑事实性结论。",
    "- medium 可信度资料可以支撑谨慎结论，但必须注明条件。",
    "- low / very_low 可信度资料只能作为社区观点、传闻、舆论反馈，不能作为事实依据。",
    "- 如果一个结论只被 low / very_low 资料支持，必须使用“有资料声称”“社区讨论认为”“尚未核验”“不能据此确认”等措辞。",
    "- 禁止基于 low / very_low 资料使用“证明”“显示”“已经超越”“确定领先”“吊打”“追平”“实锤”等强断言。",
    "- 如果资料质量整体较低，必须主动提醒“当前资料不足以支持强结论”。",
    "",
    "## 外部资料包",
    "",
    ...evidencePack.items.map(formatEvidenceItemForPrompt),
  ].join("\n");
}

export function resolveEvidencePackDelivery(
  evidencePack: EvidencePack,
  participants: {
    provider: string;
    capabilities?: Partial<EvidenceAttachmentCapabilities>;
  }[],
): EvidencePack {
  if (!evidencePack.enabled || evidencePack.items.length === 0) {
    return evidencePack;
  }

  const requestedStrategy = evidencePack.strategy ?? "text_pack";

  if (requestedStrategy === "text_pack") {
    return {
      ...evidencePack,
      delivery: {
        requestedStrategy,
        effectiveMode: "text_pack",
        reason: "用户选择了长文本资料包，系统会把解析后的资料文本随 prompt 发送给模型。",
        nativeAttachmentProviderCount: 0,
        textPackProviderCount: participants.length,
        unsupportedProviderNames: [],
      },
    };
  }

  const unsupportedParticipants = participants.filter(
    (participant) =>
      participant.capabilities?.nativeEvidenceAttachments !== true,
  );
  const unsupportedProviderNames = Array.from(
    new Set(
      unsupportedParticipants.map((participant) => participant.provider),
    ),
  );
  const nativeAttachmentProviderCount =
    participants.length - unsupportedParticipants.length;

  if (unsupportedProviderNames.length === 0 && participants.length > 0) {
    return {
      ...evidencePack,
      delivery: {
        requestedStrategy,
        effectiveMode: "native_file",
        reason: "所有参会 provider 都声明支持原生文件附件。",
        nativeAttachmentProviderCount: participants.length,
        textPackProviderCount: 0,
        unsupportedProviderNames: [],
      },
    };
  }

  return {
    ...evidencePack,
    delivery: {
      requestedStrategy,
      effectiveMode: "text_pack",
      reason:
        "当前参会 provider 未全部声明支持原生文件附件，系统已回退为长文本资料包。",
      nativeAttachmentProviderCount,
      textPackProviderCount: unsupportedParticipants.length,
      unsupportedProviderNames,
    },
  };
}

export function scoreEvidence(input: {
  title?: string;
  url?: string;
  source?: string;
  snippet: string;
  wasTruncated?: boolean;
}): EvidenceQuality {
  const warnings: string[] = [];
  const title = input.title?.trim() ?? "";
  const snippet = input.snippet.trim();
  const sourceType = detectEvidenceSourceType(input.url, input.source);
  let score = 50;

  if (sourceType === "official") {
    score += 40;
  } else if (sourceType === "benchmark") {
    score += 30;
  } else if (sourceType === "media") {
    score += 10;
  } else if (sourceType === "blog") {
    score -= 10;
  } else if (sourceType === "community") {
    score -= 20;
  } else if (sourceType === "social") {
    score -= 30;
  } else if (sourceType === "video") {
    score -= 25;
  } else {
    score -= 10;
  }

  if (snippet.length < 300) {
    score -= 25;
    warnings.push("内容过短，可能不足以支撑可靠结论");
  }

  if (snippet.length < 120) {
    score -= 20;
    warnings.push("仅有标题或极短摘要，不能作为事实依据");
  }

  if (!title) {
    score -= 15;
    warnings.push("资料标题为空");
  }

  if (hasClickbaitRisk(title)) {
    score -= 20;
    warnings.push("标题存在夸张或标题党风险");
  }

  const clampedScore = Math.min(Math.max(score, 0), 100);

  return {
    warnings,
    textLength: snippet.length,
    wasTruncated: input.wasTruncated === true,
    sourceType,
    reliability: getReliability(clampedScore),
    score: clampedScore,
  };
}

export function summarizeEvidenceQuality(
  evidencePack: EvidencePack | undefined,
): EvidenceQualityOverview {
  const items = evidencePack?.enabled ? evidencePack.items : [];
  const officialCount = items.filter(
    (item) => item.quality?.sourceType === "official",
  ).length;
  const benchmarkCount = items.filter(
    (item) => item.quality?.sourceType === "benchmark",
  ).length;
  const mediaCount = items.filter(
    (item) => item.quality?.sourceType === "media",
  ).length;
  const communitySocialVideoCount = items.filter((item) =>
    ["community", "social", "video"].includes(
      item.quality?.sourceType ?? "unknown",
    ),
  ).length;
  const shortContentCount = items.filter((item) =>
    (item.quality?.warnings ?? []).some((warning) =>
      warning.includes("内容过短") || warning.includes("极短摘要"),
    ),
  ).length;
  const clickbaitRiskCount = items.filter((item) =>
    (item.quality?.warnings ?? []).some((warning) =>
      warning.includes("标题党"),
    ),
  ).length;
  const hasOfficialOrBenchmark = items.some((item) =>
    item.quality?.sourceType === "official" ||
    item.quality?.sourceType === "benchmark",
  );
  const highOrMediumCount = items.filter((item) =>
    item.quality?.reliability === "high" ||
    item.quality?.reliability === "medium",
  ).length;
  const hasMedium = items.some((item) => item.quality?.reliability === "medium");

  return {
    officialCount,
    benchmarkCount,
    mediaCount,
    communitySocialVideoCount,
    shortContentCount,
    clickbaitRiskCount,
    overallReliability:
      highOrMediumCount >= 2 && hasOfficialOrBenchmark
        ? "高"
        : hasMedium
          ? "中"
          : "低",
  };
}

export function normalizeDocumentInputStrategy(
  value: unknown,
): DocumentInputStrategy {
  if (value === "native_file" || value === "auto" || value === "text_pack") {
    return value;
  }

  return "text_pack";
}

function formatDocumentInputStrategyForPrompt(
  strategy: DocumentInputStrategy | undefined,
): string {
  if (strategy === "native_file") {
    return "文档输入策略：优先使用原生文件附件；当前通用 OpenAI-compatible provider 未声明附件能力时，会回退为长文本资料包。";
  }

  if (strategy === "auto") {
    return "文档输入策略：自动选择；provider 支持原生附件时优先使用原生文件附件，否则回退为长文本资料包。";
  }

  return "文档输入策略：长文本资料包；系统会把本地解析后的文档文本随 prompt 发给模型，不直接上传原文件。";
}

function formatEvidenceDeliveryForPrompt(
  delivery: EvidenceDeliveryInfo | undefined,
): string {
  if (!delivery) {
    return "";
  }

  if (delivery.effectiveMode === "native_file") {
    return `实际投递方式：原生文件附件。${delivery.reason}`;
  }

  return `实际投递方式：长文本资料包。${delivery.reason}`;
}

function normalizeEvidenceItem(
  input: unknown,
): Omit<SearchEvidence, "id"> | null {
  if (!isObject(input)) {
    return null;
  }

  const rawSnippet = normalizeRawText(input.snippet);

  if (!rawSnippet) {
    return null;
  }

  const snippet = sanitizeEvidenceText(rawSnippet).slice(0, MAX_SNIPPET_LENGTH);
  const rawTitle = normalizeRawText(input.title);
  const title = sanitizeEvidenceText(rawTitle).slice(0, MAX_TITLE_LENGTH) || "未命名资料";
  const source = normalizeOptionalText(input.source, MAX_SOURCE_LENGTH);
  const publishedAt = normalizeOptionalText(
    input.publishedAt,
    MAX_PUBLISHED_AT_LENGTH,
  );
  const url = normalizeOptionalUrl(input.url);
  const quality = createEvidenceQuality({
    rawSnippet,
    snippet,
    title,
    source,
    url,
    titleWasEmpty: !rawTitle,
  });

  return {
    title,
    snippet,
    quality,
    ...(url ? { url } : {}),
    ...(source ? { source } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
}

function formatEvidenceItemForPrompt(item: SearchEvidence): string {
  return [
    `[${item.id}]`,
    `标题：${item.title}`,
    item.source ? `来源：${item.source}` : "",
    item.publishedAt ? `时间：${item.publishedAt}` : "",
    item.url ? `URL：${item.url}` : "",
    item.quality
      ? `资料质量：${item.quality.reliability} / ${item.quality.sourceType} / ${item.quality.score}`
      : "",
    item.quality?.warnings.length
      ? `质量提示：${item.quality.warnings.join("；")}`
      : "",
    `摘要：${item.snippet}`,
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function createDisabledEvidencePack(): EvidencePack {
  return {
    enabled: false,
    items: [],
  };
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const text = normalizeText(value, maxLength);

  return text || undefined;
}

function normalizeText(value: unknown, maxLength: number): string {
  const text = normalizeRawText(value);

  return text ? sanitizeEvidenceText(text).slice(0, maxLength) : "";
}

function normalizeRawText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeOptionalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedUrl = sanitizeEvidenceText(value.trim()).slice(0, 300);

  if (!/^https?:\/\/\S+$/i.test(trimmedUrl)) {
    return undefined;
  }

  return trimmedUrl;
}

function sanitizeEvidenceText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]");
}

function createEvidenceQuality(options: {
  rawSnippet: string;
  snippet: string;
  title: string;
  source?: string;
  url?: string;
  titleWasEmpty: boolean;
}): EvidenceQuality {
  const sanitizedRawSnippet = sanitizeEvidenceText(options.rawSnippet);
  const wasTruncated = sanitizedRawSnippet.length > options.snippet.length;
  const quality = scoreEvidence({
    title: options.titleWasEmpty ? "" : options.title,
    source: options.source,
    url: options.url,
    snippet: options.snippet,
    wasTruncated,
  });

  if (wasTruncated) {
    quality.warnings.unshift("内容已截断");
  }

  if (options.titleWasEmpty) {
    quality.warnings = Array.from(new Set(quality.warnings));
  }

  if (options.snippet.length < SHORT_SNIPPET_WARNING_LENGTH) {
    quality.warnings.push("资料摘要较短，可能不足以支撑可靠讨论");
  }

  return quality;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detectEvidenceSourceType(
  url: string | undefined,
  source: string | undefined,
): EvidenceSourceType {
  const sourceText = `${url ?? ""} ${source ?? ""}`.toLowerCase();
  const hostname = getHostname(url);

  if (
    [
      "googleblog.com",
      "blog.google",
      "openai.com",
      "anthropic.com",
      "deepmind.google",
      "ai.google.dev",
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    return "official";
  }

  if (
    ["lmarena.ai", "artificialanalysis.ai", "swebench.com", "paperswithcode.com", "arxiv.org"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "benchmark";
  }

  if (
    ["reddit.com", "zhihu.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "community";
  }

  if (
    ["instagram.com", "x.com", "twitter.com", "tiktok.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "social";
  }

  if (
    ["youtube.com", "youtu.be", "bilibili.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "video";
  }

  if (
    ["reuters.com", "bloomberg.com", "bbc.com", "cnn.com", "theverge.com", "techcrunch.com", "36kr.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "media";
  }

  if (
    ["csdn.net", "medium.com", "substack.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ) ||
    sourceText.includes("blog")
  ) {
    return "blog";
  }

  return "unknown";
}

function getHostname(url: string | undefined): string {
  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hasClickbaitRisk(title: string): boolean {
  return /吊打|碾压|封神|炸裂|全网首曝|遥遥领先|奥特曼承认|最强|震撼发布/u.test(
    title,
  );
}

function getReliability(score: number): EvidenceReliability {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "medium";
  }

  if (score >= 35) {
    return "low";
  }

  return "very_low";
}

function compareEvidenceQuality(
  left: Omit<SearchEvidence, "id">,
  right: Omit<SearchEvidence, "id">,
): number {
  const leftTypeRank = getSourceTypeRank(left.quality?.sourceType ?? "unknown");
  const rightTypeRank = getSourceTypeRank(right.quality?.sourceType ?? "unknown");

  if (leftTypeRank !== rightTypeRank) {
    return leftTypeRank - rightTypeRank;
  }

  return (right.quality?.score ?? 0) - (left.quality?.score ?? 0);
}

function isUsableEvidenceItem(item: Omit<SearchEvidence, "id">): boolean {
  return (
    item.quality?.reliability === "high" ||
    item.quality?.reliability === "medium"
  );
}

function getSourceTypeRank(sourceType: EvidenceSourceType): number {
  return {
    official: 0,
    benchmark: 1,
    media: 2,
    blog: 3,
    community: 4,
    video: 5,
    social: 6,
    unknown: 7,
  }[sourceType];
}
