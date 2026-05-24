export type SearchEvidence = {
  id: string;
  title: string;
  query?: string;
  sourceQueries?: string[];
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
  score?: number;
  citationLevel?: EvidenceCitationLevel;
  citationGuidance?: string;
  relevanceScore?: number;
  authorityScore?: number;
  freshnessScore?: number;
  contentScore?: number;
  diversityScore?: number;
};

export type EvidencePack = {
  enabled: boolean;
  strategy?: DocumentInputStrategy;
  delivery?: EvidenceDeliveryInfo;
  evidenceStatus?: EvidenceStatus;
  evidenceWarnings?: string[];
  searchProcess?: SearchProcess;
  searchQueries?: string[];
  items: SearchEvidence[];
};

export type EvidenceMode =
  | "normal"
  | "low_evidence"
  | "search_failed"
  | "no_reliable_sources"
  | "realtime_unverified"
  | "rescued_evidence";

export type SearchMode = "standard" | "deep";

export type SearchFreshness = "latest" | "recent" | "any";

export type SearchSourcePreference =
  | "official"
  | "benchmark"
  | "media"
  | "community"
  | "mixed";

export type SearchIntent = {
  question: string;
  mustInclude: string[];
  shouldInclude: string[];
  exclude: string[];
  freshness: SearchFreshness;
  sourcePreference: SearchSourcePreference;
  rationale: string;
};

export type SearchIntentRecord = {
  participantId: string;
  participantName: string;
  provider: string;
  model: string;
  intents: SearchIntent[];
};

export type SearchQueryPlan = {
  query: string;
  reason: string;
  participantIds: string[];
  sourcePreference: SearchSourcePreference;
  freshness: SearchFreshness;
};

export type SearchIntentDecision = {
  participantId?: string;
  participantName?: string;
  question: string;
  action: "used" | "merged" | "discarded";
  reason: string;
  query?: string;
  mergedInto?: string;
};

export type SearchFailureReason =
  | "missing_api_key"
  | "invalid_request"
  | "unauthorized"
  | "rate_limited"
  | "network_error"
  | "invalid_response"
  | "unknown_error";

export type SearchProcessResult = {
  title: string;
  query?: string;
  url?: string;
  source?: string;
  sourceQueries?: string[];
  sourceType: EvidenceSourceType;
  reliability: EvidenceReliability;
  score: number;
  citationLevel: EvidenceCitationLevel;
  citationGuidance: string;
  qualityWarnings: string[];
  includedInEvidencePack: boolean;
  filtered: boolean;
  filteredReason?: string;
};

export type SearchQualityOverview = {
  totalResults: number;
  includedCount: number;
  filteredCount: number;
  lowEvidenceCount: number;
  byReliability: Record<EvidenceReliability, number>;
  bySourceType: Record<EvidenceSourceType, number>;
};

export type SearchProcess = {
  evidenceMode: EvidenceMode;
  failureReason?: SearchFailureReason;
  provider?: string;
  providerDiagnostics?: SearchProviderDiagnostic[];
  cacheEvents?: SearchCacheEvent[];
  searchMode?: SearchMode;
  rawCandidateCount?: number;
  dedupedCandidateCount?: number;
  extractAttempted?: number;
  extractedCandidateCount?: number;
  extractSucceededCount?: number;
  finalEvidenceCount?: number;
  rescueTriggered?: boolean;
  rescueReason?: string;
  qualityDistribution?: Record<EvidenceReliability, number>;
  searchIntents: SearchIntentRecord[];
  executedQueries: string[];
  queryPlans: SearchQueryPlan[];
  intentDecisions: SearchIntentDecision[];
  dedupeStats?: SearchDedupeStats;
  qualityOverview: SearchQualityOverview;
  filteredReasons: { reason: string; count: number }[];
  results: SearchProcessResult[];
  warnings: string[];
};

export type SearchSummaryStatus =
  | "completed"
  | "failed"
  | "low_evidence"
  | "not_used";

export type SearchSummary = {
  enabled: boolean;
  status: SearchSummaryStatus;
  evidenceMode: string;
  totalReferences: number;
  strongCount: number;
  mediumCount: number;
  weakCount: number;
  hasRealtimeWarning: boolean;
  userMessage: string;
};

export type SearchCacheEvent = {
  provider: "tavily";
  query: string;
  cacheKey: string;
  cacheStatus: "hit" | "miss";
  ttlMs: number;
  expiresAt?: string;
};

export type SearchDedupeRemoval = {
  title: string;
  url?: string;
  source?: string;
  reason: "duplicate_url" | "same_domain_limit";
  keptUrl?: string;
  domain?: string;
  sourceQueries?: string[];
};

export type SearchDedupeStats = {
  originalResultCount: number;
  dedupedResultCount: number;
  removedDuplicateCount: number;
  removedSameDomainCount: number;
  removals: SearchDedupeRemoval[];
  domainLimitRelaxedReason?: string;
};

export type SearchProviderDiagnostic = {
  provider: string;
  displayName?: string;
  requestedProviderId?: string;
  fallbackReason?: string;
  diagnostics?: Record<string, unknown>;
  rawStats?: Record<string, unknown>;
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
export type EvidenceCitationLevel =
  | "fact"
  | "qualified_fact"
  | "context_only"
  | "not_citable";
export type EvidenceStatus = "high" | "medium" | "low" | "none";

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
  maxItems?: number;
  topic?: string;
};

export function normalizeEvidencePack(
  input: unknown,
  options: NormalizeEvidencePackOptions = {},
): EvidencePack {
  if (!isObject(input) || input.enabled !== true) {
    return createDisabledEvidencePack(input);
  }

  if (!Array.isArray(input.items)) {
    return createDisabledEvidencePack(input);
  }

  const normalizedItems = input.items
    .map((item) => normalizeEvidenceItem(item, options.topic))
    .filter((item): item is Omit<SearchEvidence, "id"> => item !== null)
    .sort(compareEvidenceQuality);
  const usableItems = normalizedItems.filter(isUsableEvidenceItem);
  const hasSearchProcess = isObject(input.searchProcess);
  const selectedItems =
    hasSearchProcess || usableItems.length > 0 || options.allowLowReliabilityFallback === false
      ? usableItems
      : normalizedItems;
  const maxItems = normalizeMaxEvidenceItems(options.maxItems);
  const items = selectedItems
    .slice(0, maxItems)
    .map((item, index) => ({
      ...item,
      id: `S${index + 1}`,
    }));
  const evidenceStatus =
    normalizeEvidenceStatus(input.evidenceStatus) ?? getEvidenceStatus(items);
  const evidenceWarnings = normalizeStringArray(input.evidenceWarnings);
  const searchQueries = normalizeStringArray(input.searchQueries);
  const searchProcess = createSearchProcess({
    evidenceStatus,
    input: input.searchProcess,
    normalizedItems,
    selectedItems: items,
  });

  if (items.length === 0) {
    return createDisabledEvidencePack({
      evidenceStatus,
      evidenceWarnings,
      searchProcess,
      searchQueries,
    });
  }

  return {
    enabled: true,
    strategy: normalizeDocumentInputStrategy(input.strategy),
    evidenceStatus,
    ...(evidenceWarnings.length > 0 ? { evidenceWarnings } : {}),
    ...(searchProcess ? { searchProcess } : {}),
    ...(searchQueries.length > 0 ? { searchQueries } : {}),
    items,
  };
}

export function createSearchFailureProcess(input: {
  cacheEvents?: SearchCacheEvent[];
  dedupeStats?: SearchDedupeStats;
  executedQueries?: string[];
  failureReason?: SearchFailureReason;
  provider?: string;
  providerDiagnostics?: SearchProviderDiagnostic[];
  searchIntents?: SearchIntentRecord[];
  queryPlans?: SearchQueryPlan[];
  intentDecisions?: SearchIntentDecision[];
  warnings?: string[];
}): SearchProcess {
  return {
    evidenceMode: "search_failed",
    ...(normalizeSearchFailureReason(input.failureReason)
      ? { failureReason: normalizeSearchFailureReason(input.failureReason) }
      : {}),
    ...(normalizeOptionalText(input.provider, 80)
      ? { provider: normalizeOptionalText(input.provider, 80) }
      : {}),
    ...(input.providerDiagnostics && input.providerDiagnostics.length > 0
      ? { providerDiagnostics: input.providerDiagnostics }
      : {}),
    ...(input.cacheEvents && input.cacheEvents.length > 0
      ? { cacheEvents: input.cacheEvents }
      : {}),
    searchIntents: input.searchIntents ?? [],
    executedQueries: normalizeStringArray(input.executedQueries),
    queryPlans: normalizeSearchQueryPlans(input.queryPlans),
    intentDecisions: normalizeSearchIntentDecisions(input.intentDecisions),
    ...(input.dedupeStats ? { dedupeStats: input.dedupeStats } : {}),
    qualityOverview: createEmptySearchQualityOverview(),
    filteredReasons: [],
    results: [],
    warnings: normalizeStringArray(input.warnings),
  };
}

export function formatEvidencePackForPrompt(
  evidencePack: EvidencePack | undefined,
): string {
  if (!evidencePack?.enabled || evidencePack.items.length === 0) {
    const statusLines = formatEvidenceStatusForPrompt(evidencePack);

    return [
      "本轮会议未启用外部资料包。",
      ...statusLines,
      "涉及当前、最新、排名、价格、政策、版本、新闻等实时信息时，不要给出未经验证的确定结论，应标注为待核验。",
    ].join("\n");
  }

  return [
    "本轮会议提供了统一的外部资料候选。",
    "这些资料是检索资料候选，不代表已经完成事实核验。",
    ...formatEvidenceStatusForPrompt(evidencePack),
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
  publishedAt?: string;
  snippet: string;
  topic?: string;
  wasTruncated?: boolean;
}): EvidenceQuality {
  const warnings: string[] = [];
  const title = input.title?.trim() ?? "";
  const snippet = input.snippet.trim();
  const sourceType = detectEvidenceSourceType(input.url, input.source);
  const relevanceScore = getRelevanceScore(input.topic, title, snippet);
  const authorityScore = getAuthorityScore(sourceType);
  const freshnessScore = getFreshnessScore(input.publishedAt);
  const contentScore = getContentScore(snippet);
  const diversityScore = 60;
  let score = Math.round(
    authorityScore * 0.35 +
      relevanceScore * 0.25 +
      freshnessScore * 0.15 +
      contentScore * 0.15 +
      diversityScore * 0.1,
  );

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

  score += getSourceRiskAdjustment(sourceType);

  let clampedScore = Math.min(Math.max(score, 0), 100);

  if (
    (sourceType === "community" || sourceType === "video") &&
    snippet.length >= SHORT_SNIPPET_WARNING_LENGTH
  ) {
    clampedScore = Math.max(clampedScore, 25);
  }

  if (
    sourceType === "unknown" &&
    snippet.length >= SHORT_SNIPPET_WARNING_LENGTH &&
    relevanceScore >= 50 &&
    !isClearlyUnusableEvidence(title, snippet)
  ) {
    clampedScore = Math.max(clampedScore, 25);
  }

  const reliability = getReliability(clampedScore);
  const citationPolicy = getCitationPolicy(reliability);

  return {
    warnings,
    textLength: snippet.length,
    wasTruncated: input.wasTruncated === true,
    sourceType,
    reliability,
    score: clampedScore,
    citationLevel: citationPolicy.level,
    citationGuidance: citationPolicy.guidance,
    relevanceScore,
    authorityScore,
    freshnessScore,
    contentScore,
    diversityScore,
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
  topic?: string,
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
  const query = normalizeOptionalText(input.query, 240);
  const sourceQueries = normalizeStringArray(input.sourceQueries);
  const url = normalizeOptionalUrl(input.url);
  const quality = createEvidenceQuality({
    rawSnippet,
    snippet,
    title,
    source,
    url,
    publishedAt,
    topic,
    titleWasEmpty: !rawTitle,
  });

  return {
    title,
    snippet,
    quality,
    ...(query ? { query } : {}),
    ...(sourceQueries.length > 0 ? { sourceQueries } : {}),
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

function createDisabledEvidencePack(input?: unknown): EvidencePack {
  const evidenceStatus =
    isObject(input) && normalizeEvidenceStatus(input.evidenceStatus)
      ? normalizeEvidenceStatus(input.evidenceStatus)
      : "none";
  const evidenceWarnings =
    isObject(input) ? normalizeStringArray(input.evidenceWarnings) : [];
  const searchQueries =
    isObject(input) ? normalizeStringArray(input.searchQueries) : [];
  const searchProcess =
    isObject(input) && isSearchProcess(input.searchProcess)
      ? input.searchProcess
      : undefined;

  return {
    enabled: false,
    evidenceStatus,
    ...(evidenceWarnings.length > 0 ? { evidenceWarnings } : {}),
    ...(searchProcess ? { searchProcess } : {}),
    ...(searchQueries.length > 0 ? { searchQueries } : {}),
    items: [],
  };
}

function createSearchProcess(input: {
  evidenceStatus: EvidenceStatus;
  input: unknown;
  normalizedItems: Omit<SearchEvidence, "id">[];
  selectedItems: SearchEvidence[];
}): SearchProcess | undefined {
  if (!isObject(input.input)) {
    return undefined;
  }

  const executedQueries = normalizeStringArray(input.input.executedQueries);
  const searchIntents = normalizeSearchIntents(input.input.searchIntents);
  const queryPlans = normalizeSearchQueryPlans(input.input.queryPlans);
  const intentDecisions = normalizeSearchIntentDecisions(
    input.input.intentDecisions,
  );
  const cacheEvents = normalizeSearchCacheEvents(input.input.cacheEvents);
  const dedupeStats = normalizeSearchDedupeStats(input.input.dedupeStats);
  const searchMode = normalizeSearchMode(input.input.searchMode);
  const provider = normalizeOptionalText(input.input.provider, 80);
  const providerDiagnostics = normalizeSearchProviderDiagnostics(
    input.input.providerDiagnostics,
  );
  const selectedKeys = new Set(input.selectedItems.map(getEvidenceKey));
  const results = input.normalizedItems.map((item) => {
    const filteredReason = getFilteredReason(item, selectedKeys);
    const quality = item.quality;

    return {
      title: item.title,
      ...(item.query ? { query: item.query } : {}),
      ...(item.url ? { url: item.url } : {}),
      ...(item.source ? { source: item.source } : {}),
      ...(item.sourceQueries ? { sourceQueries: item.sourceQueries } : {}),
      sourceType: quality?.sourceType ?? "unknown",
      reliability: quality?.reliability ?? "very_low",
      score: quality?.score ?? 0,
      citationLevel: quality?.citationLevel ?? "not_citable",
      citationGuidance:
        quality?.citationGuidance ??
        "Do not cite this result as evidence for factual claims.",
      qualityWarnings: quality?.warnings ?? [],
      includedInEvidencePack: !filteredReason,
      filtered: Boolean(filteredReason),
      ...(filteredReason ? { filteredReason } : {}),
    };
  });
  const qualityOverview = summarizeSearchProcessResults(results);

  return {
    evidenceMode:
      normalizeEvidenceMode(input.input.evidenceMode) ??
      getEvidenceMode(input.evidenceStatus, qualityOverview),
    ...(normalizeSearchFailureReason(input.input.failureReason)
      ? {
          failureReason: normalizeSearchFailureReason(
            input.input.failureReason,
          ),
        }
      : {}),
    ...(provider ? { provider } : {}),
    ...(providerDiagnostics.length > 0 ? { providerDiagnostics } : {}),
    searchIntents,
    executedQueries,
    queryPlans,
    intentDecisions,
    ...(cacheEvents.length > 0 ? { cacheEvents } : {}),
    ...(dedupeStats ? { dedupeStats } : {}),
    ...(searchMode ? { searchMode } : {}),
    ...normalizeRescueStats(input.input),
    qualityOverview,
    filteredReasons: summarizeFilteredReasons(results),
    results,
    warnings: normalizeStringArray(input.input.warnings),
  };
}

function normalizeSearchIntents(value: unknown): SearchIntentRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => ({
      participantId: normalizeText(item.participantId, 80),
      participantName: normalizeText(item.participantName, 120),
      provider: normalizeText(item.provider, 80),
      model: normalizeText(item.model, 120),
      intents: normalizeSearchIntentArray(item.intents),
    }))
    .filter(
      (item) =>
        item.participantId &&
        item.participantName &&
        item.provider &&
        item.model,
    )
    .slice(0, 12);
}

function normalizeSearchIntentArray(value: unknown): SearchIntent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeSearchIntent(item))
    .filter((item): item is SearchIntent => item !== null)
    .slice(0, 8);
}

function normalizeSearchIntent(value: unknown): SearchIntent | null {
  if (typeof value === "string") {
    const question = normalizeText(value, 180);

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

  if (!isObject(value)) {
    return null;
  }

  const question = normalizeText(value.question, 180);

  if (!question) {
    return null;
  }

  return {
    question,
    mustInclude: normalizeStringArray(value.mustInclude),
    shouldInclude: normalizeStringArray(value.shouldInclude),
    exclude: normalizeStringArray(value.exclude),
    freshness: normalizeSearchFreshness(value.freshness),
    sourcePreference: normalizeSearchSourcePreference(value.sourcePreference),
    rationale: normalizeText(value.rationale, 240),
  };
}

function normalizeSearchQueryPlans(value: unknown): SearchQueryPlan[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => ({
      query: normalizeText(item.query, 240),
      reason: normalizeText(item.reason, 240),
      participantIds: normalizeStringArray(item.participantIds),
      sourcePreference: normalizeSearchSourcePreference(item.sourcePreference),
      freshness: normalizeSearchFreshness(item.freshness),
    }))
    .filter((item) => item.query)
    .slice(0, 12);
}

function normalizeSearchIntentDecisions(value: unknown): SearchIntentDecision[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => {
      const question = normalizeText(item.question, 180);
      const action = normalizeSearchIntentAction(item.action);

      if (!question || !action) {
        return null;
      }

      return {
        ...(normalizeText(item.participantId, 80)
          ? { participantId: normalizeText(item.participantId, 80) }
          : {}),
        ...(normalizeText(item.participantName, 120)
          ? { participantName: normalizeText(item.participantName, 120) }
          : {}),
        question,
        action,
        reason: normalizeText(item.reason, 160),
        ...(normalizeText(item.query, 240)
          ? { query: normalizeText(item.query, 240) }
          : {}),
        ...(normalizeText(item.mergedInto, 240)
          ? { mergedInto: normalizeText(item.mergedInto, 240) }
          : {}),
      };
    })
    .filter((item): item is SearchIntentDecision => item !== null)
    .slice(0, 24);
}

function normalizeSearchCacheEvents(value: unknown): SearchCacheEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => {
      const provider = item.provider === "tavily" ? "tavily" : undefined;
      const cacheStatus =
        item.cacheStatus === "hit" || item.cacheStatus === "miss"
          ? item.cacheStatus
          : undefined;
      const ttlMs = typeof item.ttlMs === "number" ? item.ttlMs : 0;

      if (!provider || !cacheStatus || ttlMs <= 0) {
        return null;
      }

      return {
        provider,
        query: normalizeText(item.query, 240),
        cacheKey: normalizeText(item.cacheKey, 500),
        cacheStatus,
        ttlMs,
        ...(normalizeText(item.expiresAt, 80)
          ? { expiresAt: normalizeText(item.expiresAt, 80) }
          : {}),
      };
    })
    .filter((item): item is SearchCacheEvent => item !== null)
    .slice(0, 24);
}

function normalizeSearchProviderDiagnostics(
  value: unknown,
): SearchProviderDiagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => {
      const provider = normalizeText(item.provider, 80);

      if (!provider) {
        return null;
      }

      return {
        provider,
        ...(normalizeText(item.displayName, 120)
          ? { displayName: normalizeText(item.displayName, 120) }
          : {}),
        ...(normalizeText(item.requestedProviderId, 80)
          ? { requestedProviderId: normalizeText(item.requestedProviderId, 80) }
          : {}),
        ...(normalizeText(item.fallbackReason, 120)
          ? { fallbackReason: normalizeText(item.fallbackReason, 120) }
          : {}),
        ...(isObject(item.diagnostics)
          ? { diagnostics: sanitizeDiagnosticObject(item.diagnostics) }
          : {}),
        ...(isObject(item.rawStats)
          ? { rawStats: sanitizeDiagnosticObject(item.rawStats) }
          : {}),
      };
    })
    .filter((item): item is SearchProviderDiagnostic => item !== null)
    .slice(0, 12);
}

function sanitizeDiagnosticObject(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) =>
        typeof entryValue === "string" ||
        typeof entryValue === "number" ||
        typeof entryValue === "boolean",
      )
      .map(([key, entryValue]) => [
        sanitizeEvidenceText(key).slice(0, 80),
        typeof entryValue === "string"
          ? sanitizeEvidenceText(entryValue).slice(0, 240)
          : entryValue,
      ]),
  );
}

function normalizeSearchDedupeStats(value: unknown): SearchDedupeStats | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const originalResultCount = normalizeNonNegativeInteger(value.originalResultCount);
  const dedupedResultCount = normalizeNonNegativeInteger(value.dedupedResultCount);
  const removedDuplicateCount = normalizeNonNegativeInteger(
    value.removedDuplicateCount,
  );
  const removedSameDomainCount = normalizeNonNegativeInteger(
    value.removedSameDomainCount,
  );

  return {
    originalResultCount,
    dedupedResultCount,
    removedDuplicateCount,
    removedSameDomainCount,
    removals: normalizeSearchDedupeRemovals(value.removals),
    ...(normalizeText(value.domainLimitRelaxedReason, 160)
      ? {
          domainLimitRelaxedReason: normalizeText(
            value.domainLimitRelaxedReason,
            160,
          ),
        }
      : {}),
  };
}

function normalizeSearchDedupeRemovals(value: unknown): SearchDedupeRemoval[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => {
      const reason =
        item.reason === "duplicate_url" || item.reason === "same_domain_limit"
          ? item.reason
          : undefined;
      const title = normalizeText(item.title, 120);

      if (!reason || !title) {
        return null;
      }

      return {
        title,
        reason,
        ...(normalizeOptionalUrl(item.url) ? { url: normalizeOptionalUrl(item.url) } : {}),
        ...(normalizeText(item.source, 80)
          ? { source: normalizeText(item.source, 80) }
          : {}),
        ...(normalizeOptionalUrl(item.keptUrl)
          ? { keptUrl: normalizeOptionalUrl(item.keptUrl) }
          : {}),
        ...(normalizeText(item.domain, 120)
          ? { domain: normalizeText(item.domain, 120) }
          : {}),
        ...(normalizeStringArray(item.sourceQueries).length > 0
          ? { sourceQueries: normalizeStringArray(item.sourceQueries) }
          : {}),
      };
    })
    .filter((item): item is SearchDedupeRemoval => item !== null)
    .slice(0, 40);
}

function normalizeNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function normalizeSearchFreshness(value: unknown): SearchFreshness {
  return value === "latest" || value === "recent" || value === "any"
    ? value
    : "any";
}

function normalizeSearchSourcePreference(
  value: unknown,
): SearchSourcePreference {
  return value === "official" ||
    value === "benchmark" ||
    value === "media" ||
    value === "community" ||
    value === "mixed"
    ? value
    : "mixed";
}

function normalizeSearchIntentAction(
  value: unknown,
): SearchIntentDecision["action"] | undefined {
  return value === "used" || value === "merged" || value === "discarded"
    ? value
    : undefined;
}

function normalizeSearchFailureReason(
  value: unknown,
): SearchFailureReason | undefined {
  return value === "missing_api_key" ||
    value === "invalid_request" ||
    value === "unauthorized" ||
    value === "rate_limited" ||
    value === "network_error" ||
    value === "invalid_response" ||
    value === "unknown_error"
    ? value
    : undefined;
}

function getFilteredReason(
  item: Omit<SearchEvidence, "id">,
  selectedKeys: Set<string>,
): string | undefined {
  if (selectedKeys.has(getEvidenceKey(item))) {
    return undefined;
  }

  if (item.quality?.reliability === "very_low") {
    return "very_low_quality";
  }

  return "exceeds_evidence_pack_limit";
}

function summarizeSearchProcessResults(
  results: SearchProcessResult[],
): SearchQualityOverview {
  const overview = createEmptySearchQualityOverview();

  overview.totalResults = results.length;
  overview.includedCount = results.filter(
    (result) => result.includedInEvidencePack,
  ).length;
  overview.filteredCount = results.length - overview.includedCount;
  overview.lowEvidenceCount = results.filter(
    (result) => result.reliability === "low" && result.includedInEvidencePack,
  ).length;

  for (const result of results) {
    overview.byReliability[result.reliability] += 1;
    overview.bySourceType[result.sourceType] += 1;
  }

  return overview;
}

function summarizeFilteredReasons(results: SearchProcessResult[]) {
  const counts = new Map<string, number>();

  for (const result of results) {
    if (result.filteredReason) {
      counts.set(result.filteredReason, (counts.get(result.filteredReason) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([reason, count]) => ({ reason, count }));
}

function createEmptySearchQualityOverview(): SearchQualityOverview {
  return {
    totalResults: 0,
    includedCount: 0,
    filteredCount: 0,
    lowEvidenceCount: 0,
    byReliability: {
      high: 0,
      medium: 0,
      low: 0,
      very_low: 0,
    },
    bySourceType: {
      official: 0,
      benchmark: 0,
      media: 0,
      blog: 0,
      community: 0,
      social: 0,
      video: 0,
      unknown: 0,
    },
  };
}

function getEvidenceMode(
  evidenceStatus: EvidenceStatus,
  overview: SearchQualityOverview,
): EvidenceMode {
  if (overview.totalResults === 0 || evidenceStatus === "none") {
    return "no_reliable_sources";
  }

  if (evidenceStatus === "low" || overview.lowEvidenceCount > 0) {
    return "low_evidence";
  }

  return "normal";
}

function normalizeEvidenceMode(value: unknown): EvidenceMode | undefined {
  if (
    value === "normal" ||
    value === "low_evidence" ||
    value === "search_failed" ||
    value === "no_reliable_sources" ||
    value === "realtime_unverified" ||
    value === "rescued_evidence"
  ) {
    return value;
  }

  return undefined;
}

function normalizeSearchMode(value: unknown): SearchMode | undefined {
  return value === "standard" || value === "deep" ? value : undefined;
}

function normalizeRescueStats(value: Record<string, unknown>) {
  const rescueTriggered =
    typeof value.rescueTriggered === "boolean"
      ? value.rescueTriggered
      : undefined;
  const qualityDistribution = normalizeQualityDistribution(
    value.qualityDistribution,
  );

  return {
    ...(value.rawCandidateCount !== undefined
      ? { rawCandidateCount: normalizeNonNegativeInteger(value.rawCandidateCount) }
      : {}),
    ...(value.dedupedCandidateCount !== undefined
      ? {
          dedupedCandidateCount: normalizeNonNegativeInteger(
            value.dedupedCandidateCount,
          ),
        }
      : {}),
    ...(value.extractAttempted !== undefined
      ? { extractAttempted: normalizeNonNegativeInteger(value.extractAttempted) }
      : {}),
    ...(value.extractedCandidateCount !== undefined
      ? {
          extractedCandidateCount: normalizeNonNegativeInteger(
            value.extractedCandidateCount,
          ),
        }
      : {}),
    ...(value.extractSucceededCount !== undefined
      ? {
          extractSucceededCount: normalizeNonNegativeInteger(
            value.extractSucceededCount,
          ),
        }
      : {}),
    ...(value.finalEvidenceCount !== undefined
      ? { finalEvidenceCount: normalizeNonNegativeInteger(value.finalEvidenceCount) }
      : {}),
    ...(rescueTriggered !== undefined ? { rescueTriggered } : {}),
    ...(normalizeText(value.rescueReason, 160)
      ? { rescueReason: normalizeText(value.rescueReason, 160) }
      : {}),
    ...(qualityDistribution ? { qualityDistribution } : {}),
  };
}

function normalizeQualityDistribution(
  value: unknown,
): Record<EvidenceReliability, number> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  return {
    high: normalizeNonNegativeInteger(value.high),
    medium: normalizeNonNegativeInteger(value.medium),
    low: normalizeNonNegativeInteger(value.low),
    very_low: normalizeNonNegativeInteger(value.very_low),
  };
}

function isSearchProcess(value: unknown): value is SearchProcess {
  return isObject(value) && normalizeEvidenceMode(value.evidenceMode) !== undefined;
}

function getEvidenceKey(item: Pick<SearchEvidence, "title" | "url">): string {
  return (item.url || item.title).toLowerCase();
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
  publishedAt?: string;
  topic?: string;
  titleWasEmpty: boolean;
}): EvidenceQuality {
  const sanitizedRawSnippet = sanitizeEvidenceText(options.rawSnippet);
  const wasTruncated = sanitizedRawSnippet.length > options.snippet.length;
  const quality = scoreEvidence({
    title: options.titleWasEmpty ? "" : options.title,
    source: options.source,
    url: options.url,
    publishedAt: options.publishedAt,
    topic: options.topic,
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

  if (quality.reliability === "low") {
    quality.warnings.push("低证据资料：只能作为观点线索，不能单独支撑事实结论");
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
    [
      "lmarena.ai",
      "artificialanalysis.ai",
      "swebench.com",
      "paperswithcode.com",
      "arxiv.org",
      "huggingface.co",
      "github.com",
    ].some(
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

function formatEvidenceStatusForPrompt(
  evidencePack: EvidencePack | undefined,
): string[] {
  const status = evidencePack?.evidenceStatus;

  if (!status) {
    return [];
  }

  const warnings = evidencePack?.evidenceWarnings ?? [];
  const lines = [
    `证据状态：${status}`,
    ...warnings.map((warning) => `证据提示：${warning}`),
  ];

  if (status === "low" || status === "none") {
    lines.push(
      "低证据模式规则：不得声称掌握最新事实；不得把低质量资料当作确定依据；涉及排名、价格、发布时间、跑分、最新发布等内容时必须提醒用户请人工核验；可以基于已有知识进行分析，但必须标注不确定性。",
    );
  }

  return lines;
}

function getEvidenceStatus(items: SearchEvidence[]): EvidenceStatus {
  if (items.length === 0) {
    return "none";
  }

  const highCount = items.filter(
    (item) => item.quality?.reliability === "high",
  ).length;
  const mediumCount = items.filter(
    (item) => item.quality?.reliability === "medium",
  ).length;

  if (highCount >= 2 || (highCount >= 1 && mediumCount >= 1)) {
    return "high";
  }

  if (highCount > 0 || mediumCount > 0) {
    return "medium";
  }

  return "low";
}

function normalizeMaxEvidenceItems(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return MAX_EVIDENCE_ITEMS;
  }

  return Math.min(Math.max(Math.trunc(value ?? MAX_EVIDENCE_ITEMS), 1), 12);
}

function normalizeEvidenceStatus(value: unknown): EvidenceStatus | undefined {
  if (
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "none"
  ) {
    return value;
  }

  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => sanitizeEvidenceText(item.trim()).slice(0, 240))
    .filter(Boolean)
    .slice(0, 12);
}

function getAuthorityScore(sourceType: EvidenceSourceType): number {
  return {
    official: 100,
    benchmark: 95,
    media: 65,
    blog: 40,
    community: 25,
    video: 25,
    social: 15,
    unknown: 30,
  }[sourceType];
}

function getSourceRiskAdjustment(sourceType: EvidenceSourceType): number {
  return {
    official: 0,
    benchmark: 0,
    media: 0,
    blog: -10,
    community: -25,
    video: -25,
    social: -30,
    unknown: -10,
  }[sourceType];
}

function getContentScore(snippet: string): number {
  if (snippet.length >= 1000) {
    return 90;
  }

  if (snippet.length >= 300) {
    return 75;
  }

  if (snippet.length >= 120) {
    return 45;
  }

  return 20;
}

function getFreshnessScore(publishedAt: string | undefined): number {
  if (!publishedAt) {
    return 65;
  }

  const timestamp = Date.parse(publishedAt);

  if (!Number.isFinite(timestamp)) {
    return 50;
  }

  const ageDays = (Date.now() - timestamp) / 86_400_000;

  if (ageDays <= 365) {
    return 90;
  }

  if (ageDays <= 365 * 3) {
    return 70;
  }

  return 45;
}

function getRelevanceScore(
  topic: string | undefined,
  title: string,
  snippet: string,
): number {
  if (!topic?.trim()) {
    return 80;
  }

  const topicTokens = getSearchTokens(topic);
  const evidenceText = `${title} ${snippet}`.toLowerCase();

  if (topicTokens.length === 0) {
    return 60;
  }

  const hitCount = topicTokens.filter((token) =>
    evidenceText.includes(token.toLowerCase()),
  ).length;

  return Math.min(100, Math.round((hitCount / topicTokens.length) * 100));
}

function getSearchTokens(value: string): string[] {
  const englishTokens = value
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9.-]{1,}/g) ?? [];
  const cjkTokens = value.match(/[\u4e00-\u9fff]{2,}/g) ?? [];

  return Array.from(new Set([...englishTokens, ...cjkTokens])).slice(0, 12);
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

function isClearlyUnusableEvidence(title: string, snippet: string): boolean {
  const text = `${title} ${snippet}`.trim();

  if (!text) {
    return true;
  }

  if (text.length < 20) {
    return true;
  }

  const visibleChars = text.replace(/\s/g, "");
  const replacementCount = (visibleChars.match(/\uFFFD/g) ?? []).length;

  if (visibleChars.length > 0 && replacementCount / visibleChars.length > 0.2) {
    return true;
  }

  return /cookie policy|subscribe now|enable javascript|sign in to continue|advertisement|navigation menu/i.test(
    text,
  );
}

function getReliability(score: number): EvidenceReliability {
  if (score >= 80) {
    return "high";
  }

  if (score >= 60) {
    return "medium";
  }

  if (score >= 25) {
    return "low";
  }

  return "very_low";
}

function getCitationPolicy(reliability: EvidenceReliability): {
  level: EvidenceCitationLevel;
  guidance: string;
} {
  if (reliability === "high") {
    return {
      level: "fact",
      guidance: "Can support factual claims when the cited text is directly relevant.",
    };
  }

  if (reliability === "medium") {
    return {
      level: "qualified_fact",
      guidance:
        "Can support cautious factual claims with qualification and cross-checking.",
    };
  }

  if (reliability === "low") {
    return {
      level: "context_only",
      guidance:
        "Use only as context, community signal, or a lead; do not use as standalone factual proof.",
    };
  }

  return {
    level: "not_citable",
    guidance: "Do not cite this result as evidence for factual claims.",
  };
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
    item.quality?.reliability === "medium" ||
    item.quality?.reliability === "low"
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
