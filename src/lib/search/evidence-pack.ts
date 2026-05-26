export type SearchEvidence = {
  id: string;
  title: string;
  query?: string;
  sourceQueries?: string[];
  seenInPasses?: string[];
  url?: string;
  source?: string;
  publishedAt?: string;
  providerScore?: number;
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
  snippetOnly?: boolean;
  citationLevel?: EvidenceCitationLevel;
  citationGuidance?: string;
  relevanceScore?: number;
  topicRelevanceScore?: number;
  relevanceReason?: string;
  matchedQuestionAspects?: string[];
  coverageDimension?: EvidenceCoverageDimension;
  topicType?: EvidenceTopicType;
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
  seenInPasses?: string[];
  providerScore?: number;
  sourceType: EvidenceSourceType;
  reliability: EvidenceReliability;
  score: number;
  textLength?: number;
  snippetOnly?: boolean;
  topicRelevanceScore?: number;
  relevanceReason?: string;
  matchedQuestionAspects?: string[];
  coverageDimension?: EvidenceCoverageDimension;
  topicType?: EvidenceTopicType;
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

export type EvidenceDebugSummary = {
  evidenceHitRate: {
    candidateCount: number;
    coreEvidenceCount: number;
    evidenceHitRate: number;
  };
  extractionSuccessRate: {
    extractAttemptCount: number;
    extractSuccessCount: number;
    extractionSuccessRate: number;
  };
  sourceMix: {
    officialCount: number;
    reputableMediaCount: number;
    industryReportCount: number;
    socialVideoCount: number;
    unknownCount: number;
  };
  degradeReasonsSummary: {
    snippetOnly: number;
    sourceTooWeak: number;
    textTooShort: number;
    scoreTooLow: number;
    extractionFailed: number;
    socialVideoSource: number;
  };
  lowEvidenceTriggerReasons: {
    coreEvidenceLessThan3: boolean;
    highMediumLessThan3: boolean;
    shortTextRatioTooHigh: boolean;
    socialVideoRatioTooHigh: boolean;
    searchFailed: boolean;
  };
  passStats: EvidenceSearchPassStats[];
  selectedEvidenceByPass: { passName: string; count: number }[];
  skippedPasses: string[];
};

export type ExtractAttemptRecord = {
  url: string;
  provider: string;
  passName?: string;
  returnedTextLength: number;
  success: boolean;
  errorType?: string;
  errorMessageSafe?: string;
};

export type EvidenceSearchPassStats = {
  passName: string;
  query: string;
  resultCount: number;
  extractedCount: number;
  coreEvidenceCount: number;
  socialVideoCount: number;
  unknownCount: number;
  durationMs?: number;
  timedOut?: boolean;
  errorType?: string;
};

export type SearchProcess = {
  evidenceMode: EvidenceMode;
  searchStrategy?: "multi_pass";
  failureReason?: SearchFailureReason;
  provider?: string;
  providerDiagnostics?: SearchProviderDiagnostic[];
  cacheEvents?: SearchCacheEvent[];
  searchMode?: SearchMode;
  failedStage?: string;
  failedPassName?: string;
  retryCount?: number;
  rawCandidateCount?: number;
  dedupedCandidateCount?: number;
  extractAttempted?: number;
  extractedCandidateCount?: number;
  extractSucceededCount?: number;
  finalEvidenceCount?: number;
  rescueTriggered?: boolean;
  rescueReason?: string;
  officialExtractFailed?: boolean;
  extractErrorType?: string;
  extractAttempts?: ExtractAttemptRecord[];
  targetedSearchRetryTriggered?: boolean;
  targetedSearchRetryReason?: string;
  passStats?: EvidenceSearchPassStats[];
  skippedPasses?: string[];
  qualityDistribution?: Record<EvidenceReliability, number>;
  searchIntents: SearchIntentRecord[];
  executedQueries: string[];
  queryPlans: SearchQueryPlan[];
  intentDecisions: SearchIntentDecision[];
  dedupeStats?: SearchDedupeStats;
  qualityOverview: SearchQualityOverview;
  debugSummary?: EvidenceDebugSummary;
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
  | "official_statement"
  | "official_blog"
  | "official_docs"
  | "official_community"
  | "reputable_media"
  | "industry_report"
  | "social_forum"
  | "video_platform"
  | "unknown";

export type EvidenceCoverageDimension =
  | "technical_capability"
  | "benchmark_evaluation"
  | "product_release"
  | "safety_alignment"
  | "business_revenue"
  | "enterprise_adoption"
  | "funding_capital"
  | "regulation_governance"
  | "ecosystem_developer"
  | "legal_lawsuit"
  | "market_analysis"
  | "user_feedback"
  | "expert_opinion"
  | "official_position"
  | "unknown";

export type EvidenceTopicType =
  | "entity_competition"
  | "capability_comparison"
  | "market_outlook"
  | "policy_regulation"
  | "product_release_analysis"
  | "investment_business_analysis"
  | "technical_research_analysis"
  | "general_discussion";

export type EvidenceReliability = "high" | "medium" | "low" | "very_low";
export type EvidenceCitationLevel =
  | "fact"
  | "qualified_fact"
  | "context_only"
  | "not_citable";
export type EvidenceStatus = "high" | "medium" | "low" | "none";

export type EvidenceQualityOverview = {
  strongOfficialCount: number;
  officialCommunityCount: number;
  reputableMediaCount: number;
  industryReportCount: number;
  socialForumVideoCount: number;
  shortContentCount: number;
  coreEvidenceCount: number;
  clickbaitRiskCount: number;
  coveredDimensions: EvidenceCoverageDimension[];
  strongCoveredDimensions: EvidenceCoverageDimension[];
  weakCoveredDimensions: EvidenceCoverageDimension[];
  missingDimensions: string[];
  coverageCompleteness: number;
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
  const items = limitPublicOpinionShare(selectedItems, maxItems)
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

function limitPublicOpinionShare(
  items: Omit<SearchEvidence, "id">[],
  maxItems: number,
): Omit<SearchEvidence, "id">[] {
  const publicOpinionItems = items.filter(isPublicOpinionEvidenceLike);
  const otherItems = items.filter((item) => !isPublicOpinionEvidenceLike(item));

  if (otherItems.length === 0 || publicOpinionItems.length === 0) {
    return items;
  }

  const publicOpinionLimit = Math.max(1, Math.floor(maxItems / 2));

  return [...otherItems, ...publicOpinionItems.slice(0, publicOpinionLimit)]
    .sort(compareEvidenceQuality);
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
  searchStrategy?: "multi_pass";
  failedStage?: string;
  failedPassName?: string;
  passStats?: EvidenceSearchPassStats[];
  retryCount?: number;
  skippedPasses?: string[];
  warnings?: string[];
}): SearchProcess {
  const passStats = normalizeEvidenceSearchPassStats(input.passStats);
  const skippedPasses = normalizeStringArray(input.skippedPasses);

  return {
    evidenceMode: "search_failed",
    ...(input.searchStrategy ? { searchStrategy: input.searchStrategy } : {}),
    ...(normalizeSearchFailureReason(input.failureReason)
      ? { failureReason: normalizeSearchFailureReason(input.failureReason) }
      : {}),
    ...(normalizeOptionalText(input.provider, 80)
      ? { provider: normalizeOptionalText(input.provider, 80) }
      : {}),
    ...(normalizeOptionalText(input.failedStage, 80)
      ? { failedStage: normalizeOptionalText(input.failedStage, 80) }
      : {}),
    ...(normalizeOptionalText(input.failedPassName, 80)
      ? { failedPassName: normalizeOptionalText(input.failedPassName, 80) }
      : {}),
    ...(typeof input.retryCount === "number"
      ? { retryCount: Math.max(0, Math.trunc(input.retryCount)) }
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
    ...(passStats.length > 0 ? { passStats } : {}),
    ...(skippedPasses.length > 0 ? { skippedPasses } : {}),
    qualityOverview: createEmptySearchQualityOverview(),
    debugSummary: createEvidenceDebugSummary({
      evidenceMode: "search_failed",
      failureReason: input.failureReason,
      results: [],
      extractAttempted: 0,
      extractSucceededCount: 0,
      passStats,
      selectedItems: [],
      skippedPasses,
    }),
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
    "- 不得用技术、产品、benchmark、model card 或安全评估资料支撑商业、融资、营收、资本效率、企业合同等结论。",
    "- 商业结论必须由 business_revenue / enterprise_adoption / funding_capital / market_analysis 维度资料支撑；如果资料未覆盖该维度，必须说“当前资料未覆盖该维度，不能判断”。",
    "",
    formatCoverageForPrompt(evidencePack),
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
  const sourceType = detectEvidenceSourceType(input.url, input.source, input.topic);
  // Evidence boundary:
  // domain -> sourceType/source credibility only;
  // content -> coverageDimension;
  // question/topic -> topicType and topicRelevanceScore;
  // coverage profile -> reliability ceiling for broad conclusions.
  const keywordRelevanceScore = getRelevanceScore(input.topic, title, snippet);
  const topicCoverage = analyzeEvidenceTopicCoverage(input.topic, title, snippet);
  const topicRelevanceScore = topicCoverage.topicRelevanceScore;
  const authorityScore = getAuthorityScore(sourceType);
  const freshnessScore = getFreshnessScore(input.publishedAt);
  const contentScore = getContentScore(snippet);
  const diversityScore = 60;
  const snippetOnly = snippet.length < 800;
  let score = Math.round(
    authorityScore * 0.35 +
      topicRelevanceScore * 0.25 +
      freshnessScore * 0.15 +
      contentScore * 0.15 +
      diversityScore * 0.1,
  );

  if (snippet.length < 300) {
    score -= 25;
    warnings.push("内容过短，可能不足以支撑可靠结论");
  }

  if (snippetOnly) {
    score -= 15;
    warnings.push("仅有搜索摘要或正文不足，不能作为核心证据");
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
    (sourceType === "official_community" ||
      sourceType === "social_forum" ||
      sourceType === "video_platform") &&
    snippet.length >= SHORT_SNIPPET_WARNING_LENGTH
  ) {
    clampedScore = Math.max(clampedScore, 25);
  }

  if (
    sourceType === "unknown" &&
    snippet.length >= SHORT_SNIPPET_WARNING_LENGTH &&
    keywordRelevanceScore >= 50 &&
    !isClearlyUnusableEvidence(title, snippet)
  ) {
    clampedScore = Math.max(clampedScore, 25);
  }

  const reliability = getReliability(clampedScore, snippetOnly, sourceType);
  const citationPolicy = getCitationPolicy(reliability);

  return {
    warnings,
    textLength: snippet.length,
    wasTruncated: input.wasTruncated === true,
    sourceType,
    reliability,
    score: clampedScore,
    ...(snippetOnly ? { snippetOnly: true } : {}),
    citationLevel: citationPolicy.level,
    citationGuidance: citationPolicy.guidance,
    relevanceScore: keywordRelevanceScore,
    topicRelevanceScore,
    relevanceReason: topicCoverage.relevanceReason,
    matchedQuestionAspects: topicCoverage.matchedQuestionAspects,
    coverageDimension: topicCoverage.coverageDimension,
    topicType: topicCoverage.topicType,
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
  const strongOfficialCount = items.filter(
    (item) => isStrongOfficialSource(item.quality?.sourceType),
  ).length;
  const officialCommunityCount = items.filter(
    (item) => item.quality?.sourceType === "official_community",
  ).length;
  const reputableMediaCount = items.filter(
    (item) => item.quality?.sourceType === "reputable_media",
  ).length;
  const industryReportCount = items.filter(
    (item) => item.quality?.sourceType === "industry_report",
  ).length;
  const socialForumVideoCount = items.filter((item) =>
    ["official_community", "social_forum", "video_platform"].includes(
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
  const coreEvidenceCount = items.filter(isCoreEvidenceItem).length;
  const hasCoreEvidence = items.some((item) =>
    isCoreEvidenceItem(item),
  );
  const highOrMediumCount = items.filter((item) =>
    item.quality?.reliability === "high" ||
    item.quality?.reliability === "medium",
  ).length;
  const hasMedium = items.some((item) => item.quality?.reliability === "medium");
  const coverage = summarizeCoverage(items);
  const baseReliability =
    highOrMediumCount >= 2 && hasCoreEvidence
      ? "高"
      : hasMedium
        ? "中"
        : "低";

  return {
    strongOfficialCount,
    officialCommunityCount,
    reputableMediaCount,
    industryReportCount,
    socialForumVideoCount,
    shortContentCount,
    coreEvidenceCount,
    clickbaitRiskCount,
    coveredDimensions: coverage.coveredDimensions,
    strongCoveredDimensions: coverage.strongCoveredDimensions,
    weakCoveredDimensions: coverage.weakCoveredDimensions,
    missingDimensions: coverage.missingDimensions,
    coverageCompleteness: coverage.coverageCompleteness,
    overallReliability: capReliabilityByCoverage(baseReliability, coverage),
  };
}

function summarizeCoverage(items: SearchEvidence[]): {
  coveredDimensions: EvidenceCoverageDimension[];
  strongCoveredDimensions: EvidenceCoverageDimension[];
  weakCoveredDimensions: EvidenceCoverageDimension[];
  missingDimensions: string[];
  coverageCompleteness: number;
  isEntityCompetitionCoverage: boolean;
} {
  const strongCoveredDimensions = getCoveredDimensionsForItems(
    items.filter(isCoreEvidenceItem),
  );
  const weakCoveredDimensions = getCoveredDimensionsForItems(
    items.filter((item) => !isCoreEvidenceItem(item)),
  ).filter((dimension) => !strongCoveredDimensions.includes(dimension));
  const coveredDimensions = Array.from(
    new Set([...strongCoveredDimensions, ...weakCoveredDimensions]),
  );
  const isEntityCompetitionCoverage = items.some(
    (item) => item.quality?.topicType === "entity_competition",
  );

  if (!isEntityCompetitionCoverage) {
    return {
      coveredDimensions,
      strongCoveredDimensions,
      weakCoveredDimensions,
      missingDimensions: [],
      coverageCompleteness: strongCoveredDimensions.length > 0 ? 1 : 0,
      isEntityCompetitionCoverage,
    };
  }

  const requiredGroups = [
    {
      label: "technical_capability_or_product_release",
      dimensions: ["technical_capability", "product_release"] as const,
    },
    {
      label: "business_revenue_or_enterprise_adoption",
      dimensions: ["business_revenue", "enterprise_adoption"] as const,
    },
    {
      label: "funding_capital_or_market_analysis",
      dimensions: ["funding_capital", "market_analysis"] as const,
    },
    {
      label: "regulation_governance_or_legal_lawsuit",
      dimensions: ["regulation_governance", "legal_lawsuit"] as const,
    },
  ];
  const coveredSet = new Set(strongCoveredDimensions);
  const missingDimensions = requiredGroups
    .filter(
      (group) =>
        !group.dimensions.some((dimension) => coveredSet.has(dimension)),
    )
    .map((group) => group.label);

  return {
    coveredDimensions,
    strongCoveredDimensions,
    weakCoveredDimensions,
    missingDimensions,
    coverageCompleteness: divideForDebug(
      requiredGroups.length - missingDimensions.length,
      requiredGroups.length,
    ),
    isEntityCompetitionCoverage,
  };
}

function getCoveredDimensionsForItems(
  items: SearchEvidence[],
): EvidenceCoverageDimension[] {
  return Array.from(
    new Set(
      items.flatMap((item) => [
        item.quality?.coverageDimension,
        ...(item.quality?.matchedQuestionAspects ?? []),
      ]).filter(
        (dimension): dimension is EvidenceCoverageDimension =>
          isEvidenceCoverageDimension(dimension) && dimension !== "unknown",
      ),
    ),
  );
}

function isEvidenceCoverageDimension(
  value: unknown,
): value is EvidenceCoverageDimension {
  return (
    value === "technical_capability" ||
    value === "benchmark_evaluation" ||
    value === "product_release" ||
    value === "safety_alignment" ||
    value === "business_revenue" ||
    value === "enterprise_adoption" ||
    value === "funding_capital" ||
    value === "regulation_governance" ||
    value === "ecosystem_developer" ||
    value === "legal_lawsuit" ||
    value === "market_analysis" ||
    value === "user_feedback" ||
    value === "expert_opinion" ||
    value === "official_position" ||
    value === "unknown"
  );
}

function capReliabilityByCoverage(
  reliability: EvidenceQualityOverview["overallReliability"],
  coverage: ReturnType<typeof summarizeCoverage>,
): EvidenceQualityOverview["overallReliability"] {
  if (!coverage.isEntityCompetitionCoverage) {
    return reliability;
  }

  const missingBusinessCapitalMarket =
    coverage.missingDimensions.includes("business_revenue_or_enterprise_adoption") &&
    coverage.missingDimensions.includes("funding_capital_or_market_analysis");

  if (missingBusinessCapitalMarket) {
    return reliability === "低" ? "低" : "中";
  }

  if (coverage.coverageCompleteness < 0.75 && reliability === "高") {
    return "中";
  }

  if (coverage.coverageCompleteness < 0.5) {
    return "低";
  }

  return reliability;
}

export function normalizeDocumentInputStrategy(
  value: unknown,
): DocumentInputStrategy {
  if (value === "native_file" || value === "auto" || value === "text_pack") {
    return value;
  }

  return "text_pack";
}

export function isStrongOfficialSource(
  sourceType: EvidenceSourceType | undefined,
): boolean {
  return (
    sourceType === "official_statement" ||
    sourceType === "official_blog" ||
    sourceType === "official_docs"
  );
}

export function isCoreEvidenceItem(item: SearchEvidence): boolean {
  const quality = item.quality;

  if (!quality) {
    return false;
  }

  return (
    (isStrongOfficialSource(quality.sourceType) ||
      quality.sourceType === "reputable_media" ||
      quality.sourceType === "industry_report") &&
    quality.textLength >= 800 &&
    quality.snippetOnly !== true &&
    isTopicRelevantEnoughForCoreEvidence(quality) &&
    (quality.reliability === "high" || quality.reliability === "medium")
  );
}

function isTopicRelevantEnoughForCoreEvidence(quality: EvidenceQuality): boolean {
  if (quality.topicType === undefined) {
    return typeof quality.topicRelevanceScore === "number"
      ? quality.topicRelevanceScore >= 60
      : true;
  }

  if (quality.topicType !== "entity_competition") {
    return true;
  }

  return (quality.topicRelevanceScore ?? quality.relevanceScore ?? 0) >= 60;
}

export function isPublicOpinionEvidenceItem(item: SearchEvidence): boolean {
  return isPublicOpinionEvidenceLike(item);
}

function isPublicOpinionEvidenceLike(
  item: Pick<SearchEvidence, "quality">,
): boolean {
  const sourceType = item.quality?.sourceType;

  return (
    sourceType === "official_community" ||
    sourceType === "social_forum" ||
    sourceType === "video_platform"
  );
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
  const seenInPasses = normalizeStringArray(input.seenInPasses);
  const providerScore = normalizeOptionalNumber(input.providerScore);
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
    ...(seenInPasses.length > 0 ? { seenInPasses } : {}),
    ...(providerScore !== undefined ? { providerScore } : {}),
    ...(url ? { url } : {}),
    ...(source ? { source } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
}

function formatEvidenceItemForPrompt(item: SearchEvidence): string {
  const isUnverifiedLowEvidence = shouldSuppressEvidenceDetailsForPrompt(item);
  const snippet = isUnverifiedLowEvidence
    ? "低可信资料中有相关线索，但由于正文不足，本轮不能确认。"
    : item.snippet;

  return [
    `[${item.id}]`,
    isUnverifiedLowEvidence
      ? "UNVERIFIED_LOW_EVIDENCE_DO_NOT_USE_AS_FACT"
      : "",
    `标题：${
      isUnverifiedLowEvidence
        ? sanitizeLowEvidenceTextForPrompt(item.title)
        : item.title
    }`,
    item.source ? `来源：${item.source}` : "",
    item.publishedAt ? `时间：${item.publishedAt}` : "",
    item.url ? `URL：${item.url}` : "",
    item.quality
      ? `资料质量：${item.quality.reliability} / ${item.quality.sourceType} / ${item.quality.score}`
      : "",
    item.quality?.coverageDimension
      ? `覆盖维度：${item.quality.coverageDimension}`
      : "",
    typeof item.quality?.topicRelevanceScore === "number"
      ? `议题相关度：${item.quality.topicRelevanceScore}/100`
      : "",
    item.quality?.relevanceReason
      ? `相关性说明：${item.quality.relevanceReason}`
      : "",
    item.quality?.matchedQuestionAspects?.length
      ? `匹配议题方面：${item.quality.matchedQuestionAspects.join("、")}`
      : "",
    item.quality?.warnings.length
      ? `质量提示：${item.quality.warnings.join("；")}`
      : "",
    `摘要：${snippet}`,
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function formatCoverageForPrompt(evidencePack: EvidencePack): string {
  const overview = summarizeEvidenceQuality(evidencePack);

  return [
    "议题覆盖纪律：",
    `- 已覆盖维度：${formatListForPrompt(overview.coveredDimensions)}`,
    `- 缺失维度：${formatListForPrompt(overview.missingDimensions)}`,
    `- 覆盖度评分：${overview.coverageCompleteness}`,
    "- 只能用相同覆盖维度的资料支撑对应结论；维度缺失时不要把局部技术事实升级为综合胜负判断。",
  ].join("\n");
}

function formatListForPrompt(items: readonly string[]): string {
  return items.length > 0 ? items.join("、") : "无";
}

function shouldSuppressEvidenceDetailsForPrompt(item: SearchEvidence): boolean {
  const quality = item.quality;

  return (
    quality !== undefined &&
    (quality.score < 60 ||
      quality.snippetOnly === true ||
      quality.reliability === "low" ||
      quality.reliability === "very_low")
  );
}

function sanitizeLowEvidenceTextForPrompt(value: string): string {
  return value
    .replace(/\$?\b\d+(?:\.\d+)?\s*(?:billion|million|bn|m)\b/gi, "[待核验数字]")
    .replace(/\b\d+(?:\.\d+)?\s*(?:亿美元|亿元|万亿|亿|万)\b/g, "[待核验数字]")
    .replace(/\b\d+(?:\.\d+)?\s*(?:points?|分|score)\b/gi, "[待核验数字]")
    .replace(
      /\b[A-Z][A-Za-z]{1,}(?:[-\s]?\d+(?:\.\d+)?[A-Za-z-]*)\b/g,
      "[待核验模型版本]",
    );
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
  const failedStage = normalizeOptionalText(input.input.failedStage, 80);
  const failedPassName = normalizeOptionalText(input.input.failedPassName, 80);
  const retryCount =
    input.input.retryCount !== undefined
      ? normalizeNonNegativeInteger(input.input.retryCount)
      : undefined;
  const searchStrategy =
    input.input.searchStrategy === "multi_pass" ? "multi_pass" : undefined;
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
      ...(item.seenInPasses ? { seenInPasses: item.seenInPasses } : {}),
      ...(typeof item.providerScore === "number"
        ? { providerScore: item.providerScore }
        : {}),
      sourceType: quality?.sourceType ?? "unknown",
      reliability: quality?.reliability ?? "very_low",
      score: quality?.score ?? 0,
      textLength: quality?.textLength ?? 0,
      ...(quality?.snippetOnly ? { snippetOnly: true } : {}),
      ...(typeof quality?.topicRelevanceScore === "number"
        ? { topicRelevanceScore: quality.topicRelevanceScore }
        : {}),
      ...(quality?.relevanceReason
        ? { relevanceReason: quality.relevanceReason }
        : {}),
      ...(quality?.matchedQuestionAspects
        ? { matchedQuestionAspects: quality.matchedQuestionAspects }
        : {}),
      ...(quality?.coverageDimension
        ? { coverageDimension: quality.coverageDimension }
        : {}),
      ...(quality?.topicType ? { topicType: quality.topicType } : {}),
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
  const rescueStats = normalizeRescueStats(input.input);
  const passStats = normalizeEvidenceSearchPassStats(input.input.passStats);
  const extractAttempts = normalizeExtractAttempts(input.input.extractAttempts);
  const skippedPasses = normalizeStringArray(input.input.skippedPasses);
  const evidenceMode =
    normalizeEvidenceMode(input.input.evidenceMode) ??
    getEvidenceMode(input.evidenceStatus, qualityOverview);

  return {
    evidenceMode,
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
    ...(searchStrategy ? { searchStrategy } : {}),
    ...(searchMode ? { searchMode } : {}),
    ...(failedStage ? { failedStage } : {}),
    ...(failedPassName ? { failedPassName } : {}),
    ...(retryCount !== undefined ? { retryCount } : {}),
    ...rescueStats,
    ...(extractAttempts.length > 0 ? { extractAttempts } : {}),
    ...(passStats.length > 0 ? { passStats } : {}),
    ...(skippedPasses.length > 0 ? { skippedPasses } : {}),
    qualityOverview,
    debugSummary: createEvidenceDebugSummary({
      evidenceMode,
      failureReason: normalizeSearchFailureReason(input.input.failureReason),
      results,
      extractAttempted: rescueStats.extractAttempted,
      extractSucceededCount: rescueStats.extractSucceededCount,
      officialExtractFailed: rescueStats.officialExtractFailed,
      targetedSearchRetryTriggered: rescueStats.targetedSearchRetryTriggered,
      targetedSearchRetryReason: rescueStats.targetedSearchRetryReason,
      passStats,
      selectedItems: input.selectedItems,
      skippedPasses,
    }),
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

function normalizeEvidenceSearchPassStats(value: unknown): EvidenceSearchPassStats[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => {
      const passName = normalizeText(item.passName, 80);
      const query = normalizeText(item.query, 240);

      if (!passName || !query) {
        return null;
      }

      return {
        passName,
        query,
        resultCount: normalizeNonNegativeInteger(item.resultCount),
        extractedCount: normalizeNonNegativeInteger(item.extractedCount),
        coreEvidenceCount: normalizeNonNegativeInteger(item.coreEvidenceCount),
        socialVideoCount: normalizeNonNegativeInteger(item.socialVideoCount),
        unknownCount: normalizeNonNegativeInteger(item.unknownCount),
        ...(item.durationMs !== undefined
          ? { durationMs: normalizeNonNegativeInteger(item.durationMs) }
          : {}),
        ...(typeof item.timedOut === "boolean" ? { timedOut: item.timedOut } : {}),
        ...(normalizeText(item.errorType, 120)
          ? { errorType: normalizeText(item.errorType, 120) }
          : {}),
      };
    })
    .filter((item): item is EvidenceSearchPassStats => item !== null)
    .slice(0, 24);
}

function normalizeExtractAttempts(value: unknown): ExtractAttemptRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => {
      const url = normalizeOptionalUrl(item.url);
      const provider = normalizeText(item.provider, 80);

      if (!url || !provider || typeof item.success !== "boolean") {
        return null;
      }

      return {
        url,
        provider,
        ...(normalizeText(item.passName, 80)
          ? { passName: normalizeText(item.passName, 80) }
          : {}),
        returnedTextLength: normalizeNonNegativeInteger(item.returnedTextLength),
        success: item.success,
        ...(normalizeText(item.errorType, 120)
          ? { errorType: normalizeText(item.errorType, 120) }
          : {}),
        ...(normalizeText(item.errorMessageSafe, 240)
          ? { errorMessageSafe: normalizeText(item.errorMessageSafe, 240) }
          : {}),
      };
    })
    .filter((item): item is ExtractAttemptRecord => item !== null)
    .slice(0, 80);
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

function normalizeOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
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

function createEvidenceDebugSummary(input: {
  evidenceMode: EvidenceMode;
  failureReason?: SearchFailureReason;
  results: SearchProcessResult[];
  extractAttempted?: number;
  extractSucceededCount?: number;
  officialExtractFailed?: boolean;
  passStats?: EvidenceSearchPassStats[];
  selectedItems?: SearchEvidence[];
  skippedPasses?: string[];
  targetedSearchRetryTriggered?: boolean;
  targetedSearchRetryReason?: string;
}): EvidenceDebugSummary {
  const candidateCount = input.results.length;
  const coreEvidenceCount = input.results.filter(isCoreEvidenceResult).length;
  const extractAttemptCount = input.extractAttempted ?? 0;
  const extractSuccessCount = input.extractSucceededCount ?? 0;
  const socialVideoCount = input.results.filter((result) =>
    isSocialVideoSource(result.sourceType),
  ).length;
  const shortTextCount = input.results.filter(
    (result) => (result.textLength ?? 0) < 800,
  ).length;
  const highMediumCount = input.results.filter(
    (result) => result.reliability === "high" || result.reliability === "medium",
  ).length;

  return {
    evidenceHitRate: {
      candidateCount,
      coreEvidenceCount,
      evidenceHitRate: divideForDebug(coreEvidenceCount, candidateCount),
    },
    extractionSuccessRate: {
      extractAttemptCount,
      extractSuccessCount,
      extractionSuccessRate: divideForDebug(
        extractSuccessCount,
        extractAttemptCount,
      ),
    },
    sourceMix: {
      officialCount: input.results.filter((result) =>
        isStrongOfficialSource(result.sourceType),
      ).length,
      reputableMediaCount: input.results.filter(
        (result) => result.sourceType === "reputable_media",
      ).length,
      industryReportCount: input.results.filter(
        (result) => result.sourceType === "industry_report",
      ).length,
      socialVideoCount,
      unknownCount: input.results.filter(
        (result) => result.sourceType === "unknown",
      ).length,
    },
    degradeReasonsSummary: {
      snippetOnly: input.results.filter((result) => result.snippetOnly === true)
        .length,
      sourceTooWeak: input.results.filter((result) =>
        isWeakEvidenceSource(result.sourceType),
      ).length,
      textTooShort: shortTextCount,
      scoreTooLow: input.results.filter((result) => result.score < 60).length,
      extractionFailed: getExtractionFailedCount(
        extractAttemptCount,
        extractSuccessCount,
        input.officialExtractFailed,
      ),
      socialVideoSource: socialVideoCount,
    },
    lowEvidenceTriggerReasons: {
      coreEvidenceLessThan3: coreEvidenceCount < 3,
      highMediumLessThan3: highMediumCount < 3,
      shortTextRatioTooHigh: divideForDebug(shortTextCount, candidateCount) > 0.7,
      socialVideoRatioTooHigh:
        input.targetedSearchRetryTriggered === true ||
        input.targetedSearchRetryReason === "social_video_ratio_above_threshold" ||
        divideForDebug(socialVideoCount, candidateCount) > 0.5,
      searchFailed:
        input.evidenceMode === "search_failed" || input.failureReason !== undefined,
    },
    passStats: input.passStats ?? [],
    selectedEvidenceByPass: summarizeSelectedEvidenceByPass(
      input.selectedItems ?? [],
    ),
    skippedPasses: input.skippedPasses ?? [],
  };
}

function summarizeSelectedEvidenceByPass(
  selectedItems: SearchEvidence[],
): { passName: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const item of selectedItems) {
    const passes =
      item.seenInPasses && item.seenInPasses.length > 0
        ? item.seenInPasses
        : ["unknown"];

    for (const passName of passes) {
      counts.set(passName, (counts.get(passName) ?? 0) + 1);
    }
  }

  return Array.from(counts, ([passName, count]) => ({ passName, count }));
}

function isCoreEvidenceResult(result: SearchProcessResult): boolean {
  return (
    (isStrongOfficialSource(result.sourceType) ||
      result.sourceType === "reputable_media" ||
      result.sourceType === "industry_report") &&
    (result.textLength ?? 0) >= 800 &&
    result.snippetOnly !== true &&
    isSearchResultTopicRelevantEnoughForCoreEvidence(result) &&
    (result.reliability === "high" || result.reliability === "medium")
  );
}

function isSearchResultTopicRelevantEnoughForCoreEvidence(
  result: SearchProcessResult,
): boolean {
  if (result.topicType === undefined) {
    return typeof result.topicRelevanceScore === "number"
      ? result.topicRelevanceScore >= 60
      : true;
  }

  if (result.topicType !== "entity_competition") {
    return true;
  }

  return (result.topicRelevanceScore ?? 0) >= 60;
}

function isWeakEvidenceSource(sourceType: EvidenceSourceType): boolean {
  return (
    sourceType === "official_community" ||
    sourceType === "social_forum" ||
    sourceType === "video_platform" ||
    sourceType === "unknown"
  );
}

function isSocialVideoSource(sourceType: EvidenceSourceType): boolean {
  return (
    sourceType === "official_community" ||
    sourceType === "social_forum" ||
    sourceType === "video_platform"
  );
}

function getExtractionFailedCount(
  extractAttemptCount: number,
  extractSuccessCount: number,
  officialExtractFailed: boolean | undefined,
): number {
  const failedCount = Math.max(0, extractAttemptCount - extractSuccessCount);

  if (failedCount > 0 || officialExtractFailed !== true) {
    return failedCount;
  }

  return 1;
}

function divideForDebug(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return Number((numerator / denominator).toFixed(4));
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
      official_statement: 0,
      official_blog: 0,
      official_docs: 0,
      official_community: 0,
      reputable_media: 0,
      industry_report: 0,
      social_forum: 0,
      video_platform: 0,
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
  const officialExtractFailed =
    typeof value.officialExtractFailed === "boolean"
      ? value.officialExtractFailed
      : undefined;
  const targetedSearchRetryTriggered =
    typeof value.targetedSearchRetryTriggered === "boolean"
      ? value.targetedSearchRetryTriggered
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
    ...(officialExtractFailed !== undefined ? { officialExtractFailed } : {}),
    ...(normalizeText(value.extractErrorType, 160)
      ? { extractErrorType: normalizeText(value.extractErrorType, 160) }
      : {}),
    ...(targetedSearchRetryTriggered !== undefined
      ? { targetedSearchRetryTriggered }
      : {}),
    ...(normalizeText(value.rescueReason, 160)
      ? { rescueReason: normalizeText(value.rescueReason, 160) }
      : {}),
    ...(normalizeText(value.targetedSearchRetryReason, 160)
      ? {
          targetedSearchRetryReason: normalizeText(
            value.targetedSearchRetryReason,
            160,
          ),
        }
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
  topic?: string,
): EvidenceSourceType {
  const sourceText = `${url ?? ""} ${source ?? ""}`.toLowerCase();
  const hostname = getHostname(url);

  if (
    ["community.openai.com", "forum.anthropic.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "official_community";
  }

  if (
    hostname === "platform.openai.com" ||
    hostname === "docs.anthropic.com" ||
    hostname === "ai.google.dev" ||
    (((hostname === "openai.com" || hostname.endsWith(".openai.com")) ||
      (hostname === "anthropic.com" || hostname.endsWith(".anthropic.com")) ||
      hostname.endsWith(".google")) &&
      (sourceText.includes("/docs") || sourceText.includes("documentation")))
  ) {
    return "official_docs";
  }

  if (
    [
      "googleblog.com",
      "blog.google",
      "deepmind.google",
    ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
  ) {
    return "official_blog";
  }

  if (isResolvedOfficialDomain(hostname, topic, sourceText)) {
    if (sourceText.includes("/docs") || sourceText.includes("documentation")) {
      return "official_docs";
    }

    if (sourceText.includes("/news") || sourceText.includes("/blog")) {
      return "official_blog";
    }

    return "official_statement";
  }

  if (
    (hostname === "openai.com" || hostname.endsWith(".openai.com")) ||
    (hostname === "anthropic.com" || hostname.endsWith(".anthropic.com"))
  ) {
    if (sourceText.includes("/news") || sourceText.includes("/blog")) {
      return "official_blog";
    }

    return "official_statement";
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
    return "industry_report";
  }

  if (
    ["reddit.com", "zhihu.com", "linkedin.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "social_forum";
  }

  if (
    ["instagram.com", "x.com", "twitter.com", "tiktok.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "social_forum";
  }

  if (
    ["youtube.com", "youtu.be", "bilibili.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "video_platform";
  }

  if (
    [
      "nytimes.com",
      "reuters.com",
      "bloomberg.com",
      "wsj.com",
      "ft.com",
      "theinformation.com",
      "techcrunch.com",
      "theverge.com",
      "wired.com",
      "engadget.com",
      "arstechnica.com",
      "bbc.com",
      "cnn.com",
      "36kr.com",
      "people.com.cn",
      "people.cn",
      "stcn.com",
      "globaltimes.cn",
      "yahoo.com",
      "finance.yahoo.com",
      "tw.stock.yahoo.com",
    ].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "reputable_media";
  }

  if (
    ["semianalysis.com", "gasgoo.com", "epoch.ai", "stanford.edu", "mlcommons.org"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    return "industry_report";
  }

  if (
    ["csdn.net", "medium.com", "substack.com"].some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    ) ||
    sourceText.includes("blog")
  ) {
    return "unknown";
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

  const coreEvidenceCount = items.filter(isCoreEvidenceItem).length;

  if (coreEvidenceCount < 3) {
    return "low";
  }

  const highCount = items.filter(
    (item) => item.quality?.reliability === "high",
  ).length;
  const mediumCount = items.filter(
    (item) => item.quality?.reliability === "medium",
  ).length;

  const coverage = summarizeCoverage(items);
  const coverageCapsHigh =
    coverage.isEntityCompetitionCoverage &&
    (coverage.coverageCompleteness < 0.75 ||
      (coverage.missingDimensions.includes("business_revenue_or_enterprise_adoption") &&
        coverage.missingDimensions.includes("funding_capital_or_market_analysis")));

  if (
    !coverageCapsHigh &&
    (highCount >= 2 || (highCount >= 1 && mediumCount >= 1))
  ) {
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
    official_statement: 100,
    official_blog: 95,
    official_docs: 95,
    official_community: 35,
    reputable_media: 75,
    industry_report: 85,
    social_forum: 20,
    video_platform: 20,
    unknown: 30,
  }[sourceType];
}

function getSourceRiskAdjustment(sourceType: EvidenceSourceType): number {
  return {
    official_statement: 0,
    official_blog: 0,
    official_docs: 0,
    official_community: -30,
    reputable_media: 0,
    industry_report: 0,
    social_forum: -30,
    video_platform: -30,
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
  const evidenceText = normalizeTextForMatching(`${title} ${snippet}`);
  const titleText = normalizeTextForMatching(title);

  if (topicTokens.length === 0) {
    return 60;
  }

  const normalizedTokens = topicTokens.map(normalizeTextForMatching);
  const hitCount = normalizedTokens.filter((token) =>
    token.length > 0 && evidenceText.includes(token),
  ).length;
  const titleHitCount = normalizedTokens.filter((token) =>
    token.length > 0 && titleText.includes(token),
  ).length;
  const baseScore = Math.round((hitCount / normalizedTokens.length) * 70);
  const titleBonus = Math.min(titleHitCount, 3) * 10;
  let score = Math.min(100, baseScore + titleBonus);

  if (titleHitCount > 0) {
    score = Math.max(score, 25);
  }

  if (titleHitCount > 0 && hitCount >= 3) {
    score = Math.max(score, 60);
  }

  if (titleHitCount >= 2 && hitCount >= 5) {
    score = Math.max(score, 70);
  }

  return score;
}

function analyzeEvidenceTopicCoverage(
  topic: string | undefined,
  title: string,
  snippet: string,
): {
  topicType: EvidenceTopicType;
  topicRelevanceScore: number;
  relevanceReason: string;
  matchedQuestionAspects: string[];
  coverageDimension: EvidenceCoverageDimension;
} {
  const text = `${title} ${snippet}`.toLowerCase();
  const coverageDimension = detectCoverageDimension(text);
  const topicType = classifyEvidenceTopic(topic);
  const keywordRelevanceScore = getRelevanceScore(topic, title, snippet);

  if (topicType !== "entity_competition") {
    return {
      topicType,
      topicRelevanceScore: keywordRelevanceScore,
      relevanceReason: "资料与议题关键词存在一般相关性。",
      matchedQuestionAspects:
        coverageDimension === "unknown" ? [] : [coverageDimension],
      coverageDimension,
    };
  }

  const matchedQuestionAspects =
    getEntityCompetitionMatchedAspects(coverageDimension);
  const dimensionRelevanceScore =
    getEntityCompetitionRelevanceScore(coverageDimension);
  const topicRelevanceScore = capEntityCompetitionKeywordRelevance(
    coverageDimension,
    Math.max(dimensionRelevanceScore, keywordRelevanceScore),
  );

  return {
    topicType,
    topicRelevanceScore,
    relevanceReason: getEntityCompetitionRelevanceReason(
      coverageDimension,
      topicRelevanceScore,
    ),
    matchedQuestionAspects,
    coverageDimension,
  };
}

export function classifyEvidenceTopic(topic: string | undefined): EvidenceTopicType {
  if (!topic) {
    return "general_discussion";
  }

  const normalized = topic.toLowerCase();
  const hasMultipleEntities = getLikelyEntityCount(topic) >= 2;

  if (
    hasMultipleEntities &&
    matchesAny(normalized, [
      "vs",
      "versus",
      "compare",
      "comparison",
      "competition",
      "competitive",
      "winner",
      "wins",
      "better",
      "stronger",
      "对比",
      "比较",
      "竞争",
      "胜负",
      "更强",
      "长期格局",
      "竞争格局",
      "公司",
      "企业",
    ])
  ) {
    return "entity_competition";
  }

  if (
    matchesAny(normalized, [
      "benchmark",
      "evaluation",
      "capability",
      "performance",
      "leaderboard",
      "评测",
      "跑分",
      "能力",
      "性能",
      "实力",
      "排行榜",
    ])
  ) {
    return "capability_comparison";
  }

  if (
    matchesAny(normalized, [
      "market",
      "outlook",
      "forecast",
      "trend",
      "市场",
      "趋势",
      "前景",
      "格局",
    ])
  ) {
    return "market_outlook";
  }

  if (
    matchesAny(normalized, [
      "policy",
      "regulation",
      "governance",
      "compliance",
      "监管",
      "政策",
      "治理",
      "合规",
    ])
  ) {
    return "policy_regulation";
  }

  if (
    matchesAny(normalized, [
      "release",
      "launch",
      "product",
      "feature",
      "发布",
      "上线",
      "产品",
      "功能",
    ])
  ) {
    return "product_release_analysis";
  }

  if (
    matchesAny(normalized, [
      "investment",
      "business",
      "funding",
      "revenue",
      "valuation",
      "商业",
      "投资",
      "融资",
      "营收",
      "收入",
      "估值",
    ])
  ) {
    return "investment_business_analysis";
  }

  return (
    matchesAny(normalized, ["research", "paper", "technical", "研究", "论文", "技术"])
      ? "technical_research_analysis"
      : "general_discussion"
  );
}

function getLikelyEntityCount(topic: string): number {
  const englishEntities =
    topic.match(/\b[A-Z][A-Za-z0-9-]{1,}(?:\s+[A-Z][A-Za-z0-9-]{1,}){0,3}\b/g) ??
    [];
  const separatedCjkEntities =
    topic.match(/[\u4e00-\u9fffA-Za-z0-9.-]{2,}\s*(?:和|与|跟|及|、|vs\.?|versus)\s*[\u4e00-\u9fffA-Za-z0-9.-]{2,}/gi) ??
    [];

  return Math.max(englishEntities.length, separatedCjkEntities.length > 0 ? 2 : 0);
}

function detectCoverageDimension(text: string): EvidenceCoverageDimension {
  if (matchesAny(text, ["lawsuit", "litigation", "copyright", "court", "legal", "诉讼", "版权", "法院", "法律"])) {
    return "legal_lawsuit";
  }

  if (matchesAny(text, ["regulation", "regulatory", "governance", "government", "policy", "compliance", "监管", "治理", "政府", "政策", "合规"])) {
    return "regulation_governance";
  }

  if (matchesAny(text, ["funding", "valuation", "investor", "capital", "financing", "raise", "融资", "估值", "投资人", "资本"])) {
    return "funding_capital";
  }

  if (matchesAny(text, ["revenue", "arr", "sales", "margin", "profit", "burn", "cost", "pricing", "monetization", "营收", "收入", "利润", "成本", "商业化"])) {
    return "business_revenue";
  }

  if (matchesAny(text, ["enterprise customer", "enterprise adoption", "customers", "contract", "deployment", "adoption", "usage", "paid subscriber", "企业客户", "企业采用", "合同", "客户", "部署", "付费用户"])) {
    return "enterprise_adoption";
  }

  if (matchesAny(text, ["market share", "market analysis", "competitive landscape", "competition", "strategy", "market", "竞争格局", "市场份额", "市场分析", "长期格局", "战略"])) {
    return "market_analysis";
  }

  if (matchesAny(text, ["developer", "ecosystem", "sdk", "api", "open source", "github", "开发者", "生态", "开源"])) {
    return "ecosystem_developer";
  }

  if (matchesAny(text, ["official statement", "official position", "announcement", "声明", "官方立场", "公告"])) {
    return "official_position";
  }

  if (matchesAny(text, ["expert", "analyst", "researcher view", "opinion", "专家", "分析师观点", "研究员观点"])) {
    return "expert_opinion";
  }

  if (matchesAny(text, ["user feedback", "sentiment", "review", "discussion", "forum", "用户反馈", "口碑", "讨论", "论坛"])) {
    return "user_feedback";
  }

  if (matchesAny(text, ["safety", "alignment", "red teaming", "model card", "constitutional", "risk evaluation", "安全", "对齐", "红队", "模型卡"])) {
    return "safety_alignment";
  }

  if (matchesAny(text, ["release", "launch", "product", "feature", "rollout", "app", "发布", "上线", "产品", "功能"])) {
    return "product_release";
  }

  if (matchesAny(text, ["benchmark", "eval", "evaluation", "leaderboard", "score", "gdpval", "simpleqa", "mmlu", "跑分", "评测", "排行榜", "分数"])) {
    return "benchmark_evaluation";
  }

  if (matchesAny(text, ["capability", "performance", "latency", "reasoning", "coding", "能力", "性能", "推理", "代码"])) {
    return "technical_capability";
  }

  return "unknown";
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => {
    if (/^[a-z0-9][a-z0-9\s.-]*$/i.test(keyword)) {
      return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text);
    }

    return text.includes(keyword);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getEntityCompetitionMatchedAspects(
  dimension: EvidenceCoverageDimension,
): string[] {
  if (
    dimension === "technical_capability" ||
    dimension === "benchmark_evaluation" ||
    dimension === "product_release" ||
    dimension === "safety_alignment"
  ) {
    return ["technical_capability"];
  }

  if (
    dimension === "business_revenue" ||
    dimension === "enterprise_adoption" ||
    dimension === "funding_capital" ||
    dimension === "market_analysis" ||
    dimension === "regulation_governance" ||
    dimension === "legal_lawsuit" ||
    dimension === "ecosystem_developer"
  ) {
    return [dimension];
  }

  return [];
}

function getEntityCompetitionRelevanceScore(
  dimension: EvidenceCoverageDimension,
): number {
  if (
    dimension === "business_revenue" ||
    dimension === "enterprise_adoption" ||
    dimension === "funding_capital" ||
    dimension === "market_analysis" ||
    dimension === "regulation_governance" ||
    dimension === "legal_lawsuit"
  ) {
    return 80;
  }

  if (dimension === "ecosystem_developer") {
    return 70;
  }

  if (dimension === "technical_capability" || dimension === "product_release") {
    return 55;
  }

  if (dimension === "benchmark_evaluation") {
    return 50;
  }

  if (dimension === "safety_alignment") {
    return 45;
  }

  return 30;
}

function getEntityCompetitionRelevanceReason(
  dimension: EvidenceCoverageDimension,
  score: number,
): string {
  if (score >= 60) {
    return "资料覆盖实体竞争判断所需的商业、资本、市场、监管或生态维度。";
  }

  if (
    dimension === "technical_capability" ||
    dimension === "benchmark_evaluation" ||
    dimension === "product_release" ||
    dimension === "safety_alignment"
  ) {
    return "资料主要覆盖技术、产品、评测或安全信息，只能作为实体竞争议题的局部背景。";
  }

  return "资料与实体竞争议题的关键判断维度关联不足。";
}

function getSearchTokens(value: string): string[] {
  const englishTokens = value
    .toLowerCase()
    .match(/[a-z0-9][a-z0-9.-]{1,}/g) ?? [];
  const cjkTokens = getCjkSearchTokens(value);

  return Array.from(new Set([...englishTokens, ...cjkTokens])).slice(0, 12);
}

function getCjkSearchTokens(value: string): string[] {
  const chunks = value.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const stopPhrases = [
    "怎么看",
    "如何看",
    "最近",
    "发布",
    "哪个",
    "哪家",
    "公司",
    "企业",
    "长期",
    "竞争",
    "优势",
    "更有",
    "谁更",
    "以及",
    "相关",
    "资料",
  ];
  const tokens: string[] = [];

  for (const chunk of chunks) {
    const compact = stopPhrases.reduce(
      (current, stopPhrase) => current.replaceAll(stopPhrase, " "),
      chunk,
    );

    for (const segment of compact.split(/\s+/).filter((item) => item.length >= 2)) {
      tokens.push(segment);

      if (segment.length > 2) {
        for (let index = 0; index <= segment.length - 2; index += 1) {
          tokens.push(segment.slice(index, index + 2));
        }
      }

      if (segment.length > 3) {
        for (let index = 0; index <= segment.length - 3; index += 1) {
          tokens.push(segment.slice(index, index + 3));
        }
      }
    }
  }

  return tokens.filter((token) => token.length >= 2);
}

function capEntityCompetitionKeywordRelevance(
  dimension: EvidenceCoverageDimension,
  score: number,
): number {
  if (
    dimension === "technical_capability" ||
    dimension === "benchmark_evaluation" ||
    dimension === "product_release" ||
    dimension === "safety_alignment"
  ) {
    return Math.min(score, 55);
  }

  return score;
}

function normalizeTextForMatching(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[αΑ]/g, "alpha")
    .replace(/[βΒ]/g, "beta")
    .replace(/[γΓ]/g, "gamma")
    .replace(/[·•・]/g, "")
    .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function isResolvedOfficialDomain(
  hostname: string,
  topic: string | undefined,
  sourceText: string,
): boolean {
  if (!hostname || isKnownNonOfficialHost(hostname)) {
    return false;
  }

  if (sourceText.includes("官网") || sourceText.includes("official site")) {
    return true;
  }

  const candidates = getOfficialDomainCandidates(topic);

  return candidates.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}

function getOfficialDomainCandidates(topic: string | undefined): string[] {
  if (!topic) {
    return [];
  }

  const entities = extractAsciiEntityNames(topic);
  const candidates = new Set<string>();

  for (const entity of entities) {
    const words = entity
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z0-9-]/g, ""))
      .filter((word) => word.length >= 2);

    if (words.length === 0) {
      continue;
    }

    const dashed = words.join("-");
    const compact = words.join("");

    candidates.add(`${dashed}.com`);
    candidates.add(`${compact}.com`);

    if (words.length > 1) {
      candidates.add(`${words[0]}.com`);
    }
  }

  return Array.from(candidates);
}

function extractAsciiEntityNames(topic: string): string[] {
  const matches =
    topic.match(/\b[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,3}\b/g) ?? [];

  return Array.from(
    new Set(
      matches
        .map((match) => match.trim())
        .filter((match) => !/^(AI|API|LLM|GDP|IPO)$/i.test(match)),
    ),
  ).slice(0, 8);
}

function isKnownNonOfficialHost(hostname: string): boolean {
  return [
    "reddit.com",
    "zhihu.com",
    "linkedin.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
    "youtube.com",
    "youtu.be",
    "bilibili.com",
    "nytimes.com",
    "reuters.com",
    "bloomberg.com",
    "wsj.com",
    "ft.com",
    "theinformation.com",
    "techcrunch.com",
    "theverge.com",
    "wired.com",
    "engadget.com",
    "arstechnica.com",
    "bbc.com",
    "cnn.com",
    "36kr.com",
    "people.com.cn",
    "people.cn",
    "stcn.com",
    "globaltimes.cn",
    "yahoo.com",
    "gasgoo.com",
  ].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
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

function getReliability(
  score: number,
  snippetOnly = false,
  sourceType: EvidenceSourceType = "unknown",
): EvidenceReliability {
  if (
    snippetOnly ||
    sourceType === "official_community" ||
    sourceType === "social_forum" ||
    sourceType === "video_platform"
  ) {
    if (score >= 25) {
      return "low";
    }

    return "very_low";
  }

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
    official_statement: 0,
    official_blog: 1,
    official_docs: 2,
    reputable_media: 3,
    industry_report: 4,
    official_community: 5,
    social_forum: 6,
    video_platform: 7,
    unknown: 8,
  }[sourceType];
}
