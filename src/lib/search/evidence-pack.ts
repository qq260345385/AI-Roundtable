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
  evidenceJudgment?: EvidenceJudgment;
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
  queryLevel?: SearchQueryLevel;
  derivedFrom?: string;
  queryQuality?: SearchQueryQuality;
  skippedReason?: string;
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
  evidenceJudgment?: EvidenceJudgment;
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
  retrieval?: {
    rawCandidateTarget: number;
    rawCandidateCount: number;
    uniqueCandidateCount: number;
    selectedEvidenceTarget: number;
    selectedEvidenceCount: number;
    candidateShortfall: number;
    retrievalPassCount: number;
    fallbackTriggeredReason?: string;
  };
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
    missingTopicRelevanceScore: number;
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
  topRawCandidates?: SearchProcessCandidatePreview[];
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
  queryLevel?: SearchQueryLevel;
  derivedFrom?: string;
  queryQuality?: SearchQueryQuality;
  searchParameters?: EvidenceSearchPassParameters;
  skippedReason?: string;
};

export type EvidenceSearchPassParameters = {
  maxResults?: number;
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  searchTopic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";
  country?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeRawContent?: boolean | "markdown" | "text";
};

export type SearchProcessCandidatePreview = {
  title: string;
  query?: string;
  url?: string;
  source?: string;
  providerScore?: number;
  snippetLength: number;
  reliability: EvidenceReliability;
  score: number;
  seenInPasses?: string[];
  evidenceRole?: EvidenceJudgment["role"];
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
  rawCandidateTarget?: number;
  rawCandidateCount?: number;
  uniqueCandidateCount?: number;
  dedupedCandidateCount?: number;
  selectedEvidenceTarget?: number;
  selectedEvidenceCount?: number;
  candidateShortfall?: number;
  retrievalPassCount?: number;
  fallbackTriggeredReason?: string;
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
  skippedPassReasons?: Record<string, string>;
  topRawCandidates?: SearchProcessCandidatePreview[];
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
  zeroResultFallbackTriggered?: boolean;
  fallbackQueries?: string[];
  providerReturnedZeroCount?: number;
  relaxedQueryCount?: number;
  effectiveSearchRegion?: string;
  effectiveCountry?: string;
  searchRegionSource?: "user_preference" | "auto_detected" | "default_global" | "region_unsupported_fallback";
  regionFallbackReason?: string;
  requestedSearchRegion?: string;
  topicAnalysis?: TopicAnalysis;
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

export type EvidenceNeed = {
  dimension: EvidenceCoverageDimension;
  reason: string;
};

export type SearchQueryLevel =
  | "precise"
  | "broad"
  | "evidence_type"
  | "scenario"
  | "cross_language"
  | "fallback_broad"
  | "fallback_entity"
  | "fallback_keyword";

export type SearchQueryQuality = {
  ok: boolean;
  reason?: string;
  hasEntity: boolean;
  hasScenarioOrEvidenceNeed: boolean;
  tokenCount: number;
  duplicateRatio: number;
};

export type TopicAnalysis = {
  topicType: EvidenceTopicType;
  cleanedTopic: string;
  targetEntities: string[];
  targetScenarios: string[];
  comparisonAxes: string[];
  evidenceNeeds: EvidenceNeed[];
  timeSensitivity: "high" | "medium" | "low";
  freshnessRequirement?: SearchFreshness;
  searchQueries: string[];
};

export type EvidenceJudgment = {
  evidenceId?: string;
  relevance: number;
  role: "core" | "supporting" | "background" | "discard";
  confidence: "high" | "medium" | "low";
  reason: string;
  supports: string[];
  limitations: string[];
  suggestedUse: string;
};

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
  comparisonAxes: EvidenceCoverageDimension[];
  coverageCompleteness: number;
  overallReliability: "高" | "中" | "低";
  reliabilityLimitReason?: string;
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
    topic: options.topic,
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
  rawCandidateTarget?: number;
  rawCandidateCount?: number;
  uniqueCandidateCount?: number;
  selectedEvidenceTarget?: number;
  selectedEvidenceCount?: number;
  candidateShortfall?: number;
  retrievalPassCount?: number;
  fallbackTriggeredReason?: string;
  skippedPasses?: string[];
  topicAnalysis?: TopicAnalysis;
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
    ...(typeof input.rawCandidateTarget === "number"
      ? { rawCandidateTarget: Math.max(0, Math.trunc(input.rawCandidateTarget)) }
      : {}),
    ...(typeof input.rawCandidateCount === "number"
      ? { rawCandidateCount: Math.max(0, Math.trunc(input.rawCandidateCount)) }
      : {}),
    ...(typeof input.uniqueCandidateCount === "number"
      ? { uniqueCandidateCount: Math.max(0, Math.trunc(input.uniqueCandidateCount)) }
      : {}),
    ...(typeof input.selectedEvidenceTarget === "number"
      ? { selectedEvidenceTarget: Math.max(0, Math.trunc(input.selectedEvidenceTarget)) }
      : {}),
    ...(typeof input.selectedEvidenceCount === "number"
      ? { selectedEvidenceCount: Math.max(0, Math.trunc(input.selectedEvidenceCount)) }
      : {}),
    ...(typeof input.candidateShortfall === "number"
      ? { candidateShortfall: Math.max(0, Math.trunc(input.candidateShortfall)) }
      : {}),
    ...(typeof input.retrievalPassCount === "number"
      ? { retrievalPassCount: Math.max(0, Math.trunc(input.retrievalPassCount)) }
      : {}),
    ...(input.fallbackTriggeredReason
      ? { fallbackTriggeredReason: normalizeText(input.fallbackTriggeredReason, 80) }
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
    ...(input.topicAnalysis ? { topicAnalysis: input.topicAnalysis } : {}),
    qualityOverview: createEmptySearchQualityOverview(),
    debugSummary: createEvidenceDebugSummary({
      evidenceMode: "search_failed",
      failureReason: input.failureReason,
      results: [],
      rawCandidateTarget: input.rawCandidateTarget,
      rawCandidateCount: input.rawCandidateCount,
      uniqueCandidateCount: input.uniqueCandidateCount,
      selectedEvidenceTarget: input.selectedEvidenceTarget,
      selectedEvidenceCount: input.selectedEvidenceCount,
      candidateShortfall: input.candidateShortfall,
      retrievalPassCount: input.retrievalPassCount,
      fallbackTriggeredReason: input.fallbackTriggeredReason,
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

  const citableEvidenceItems = evidencePack.items.filter(
    isCitableEvidenceForPrompt,
  );
  const backgroundEvidenceItems = evidencePack.items.filter(
    (item) =>
      !isCitableEvidenceForPrompt(item) &&
      item.quality?.evidenceJudgment?.role === "background",
  );
  const promptEvidenceItems = [
    ...citableEvidenceItems,
    ...backgroundEvidenceItems,
  ];

  if (promptEvidenceItems.length === 0) {
    return [
      "本轮没有可引用的有效证据。",
      "No citable evidence is available in this round.",
      ...formatEvidenceStatusForPrompt(evidencePack),
      formatDocumentInputStrategyForPrompt(evidencePack.strategy),
      formatEvidenceDeliveryForPrompt(evidencePack.delivery),
      "只有可引用事实时才必须使用资料编号；本轮没有可引用证据。",
      "low / very_low 可信度资料只能作为社区观点、传闻、舆论反馈，不能作为事实依据。",
      "不要编造资料编号。",
      "Do not use source-style citation IDs as support.",
      "You may discuss from reasoning, but mark time-sensitive or current factual claims as uncertain and needing verification.",
    ].join("\n");
  }

  if (citableEvidenceItems.length === 0) {
    return [
      "本轮没有可引用的有效证据。",
      "No citable evidence is available in this round.",
      ...formatEvidenceStatusForPrompt(evidencePack),
      formatDocumentInputStrategyForPrompt(evidencePack.strategy),
      formatEvidenceDeliveryForPrompt(evidencePack.delivery),
      "只有可引用事实时才必须使用资料编号；本轮没有可引用证据。",
      "low / very_low 可信度资料只能作为社区观点、传闻、舆论反馈，不能作为事实依据。",
      "不要编造资料编号。",
      "Background evidence cannot support core conclusions.",
      "Do not cite background evidence as proof; use it only for context or leads.",
      "You may discuss from reasoning, but mark time-sensitive or current factual claims as uncertain and needing verification.",
      "",
      "## 外部资料包",
      "## Background evidence only",
      "",
      ...backgroundEvidenceItems.map(formatEvidenceItemForPrompt),
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
    ...promptEvidenceItems.map(formatEvidenceItemForPrompt),
  ].join("\n");
}

function isCitableEvidenceForPrompt(item: SearchEvidence): boolean {
  const role = item.quality?.evidenceJudgment?.role;

  if (role === "core" || role === "supporting") {
    return true;
  }

  if (role === "background" || role === "discard") {
    return false;
  }

  if (
    item.quality?.citationLevel === "context_only" ||
    item.quality?.citationLevel === "not_citable"
  ) {
    return false;
  }

  return (
    item.quality?.citationLevel === "fact" ||
    item.quality?.citationLevel === "qualified_fact" ||
    item.quality?.reliability === "high" ||
    item.quality?.reliability === "medium"
  );
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
  const evidenceJudgment = judgeEvidenceForTopic({
    coverageDimension: topicCoverage.coverageDimension,
    matchedQuestionAspects: topicCoverage.matchedQuestionAspects,
    reliability,
    score: clampedScore,
    sourceType,
    textLength: snippet.length,
    topicType: topicCoverage.topicType,
    topicRelevanceScore,
    snippetOnly,
  });

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
    evidenceJudgment,
    authorityScore,
    freshnessScore,
    contentScore,
    diversityScore,
  };
}

export function summarizeEvidenceQuality(
  evidencePack: EvidencePack | undefined,
  options?: { evidenceStatus?: EvidenceStatus },
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
  const coverage = summarizeCoverage(
    items,
    evidencePack?.searchProcess?.topicAnalysis,
  );
  const isLowEvidenceMode = options?.evidenceStatus === "low" ||
    (!options?.evidenceStatus && (coreEvidenceCount < 3 || highOrMediumCount < 3 || items.length === 0));
  let baseReliability: EvidenceQualityOverview["overallReliability"] =
    highOrMediumCount >= 2 && hasCoreEvidence
      ? "高"
      : hasMedium
        ? "中"
        : "低";

  if (isLowEvidenceMode && baseReliability === "高") {
    baseReliability = "中";
  }

  const reliabilityLimitReason = isLowEvidenceMode
    ? "核心证据不足 3 条，结论可靠性已限制。"
    : coreEvidenceCount === 0 && coverage.weakCoveredDimensions.length > 0
      ? "当前仅有低质量或低相关资料覆盖了部分维度，但缺少核心证据，不能确认覆盖。"
      : undefined;

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
    comparisonAxes: coverage.comparisonAxes,
    coverageCompleteness: coverage.coverageCompleteness,
    overallReliability: capReliabilityByCoverage(baseReliability, coverage),
    reliabilityLimitReason,
  };
}

function getDominantTopicType(items: SearchEvidence[]): EvidenceTopicType {
  const counts = new Map<EvidenceTopicType, number>();

  for (const item of items) {
    const topicType = item.quality?.topicType;

    if (topicType) {
      counts.set(topicType, (counts.get(topicType) ?? 0) + 1);
    }
  }

  let maxCount = 0;
  let dominant: EvidenceTopicType = "general_discussion";

  for (const [type, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      dominant = type;
    }
  }

  return dominant;
}

function getRequiredCoverageGroups(
  topicType: EvidenceTopicType,
): { label: string; dimensions: readonly EvidenceCoverageDimension[] }[] {
  switch (topicType) {
    case "entity_competition":
      return [
        {
          label: "technical_capability_or_product_release",
          dimensions: ["technical_capability", "product_release"],
        },
        {
          label: "business_revenue_or_enterprise_adoption",
          dimensions: ["business_revenue", "enterprise_adoption"],
        },
        {
          label: "funding_capital_or_market_analysis",
          dimensions: ["funding_capital", "market_analysis"],
        },
        {
          label: "regulation_governance_or_legal_lawsuit",
          dimensions: ["regulation_governance", "legal_lawsuit"],
        },
      ];

    case "product_release_analysis":
    case "technical_research_analysis":
    case "capability_comparison":
      return [
        {
          label: "technical_capability_or_product_release",
          dimensions: ["technical_capability", "product_release", "benchmark_evaluation", "safety_alignment"],
        },
        {
          label: "official_or_independent_confirmation",
          dimensions: ["official_position", "expert_opinion"],
        },
      ];

    case "policy_regulation":
      return [
        {
          label: "governance_and_compliance",
          dimensions: ["regulation_governance", "legal_lawsuit"],
        },
        {
          label: "official_or_expert_position",
          dimensions: ["official_position", "expert_opinion"],
        },
      ];

    case "market_outlook":
    case "investment_business_analysis":
      return [
        {
          label: "business_and_market",
          dimensions: ["business_revenue", "enterprise_adoption", "funding_capital", "market_analysis"],
        },
        {
          label: "technical_background",
          dimensions: ["technical_capability", "product_release"],
        },
      ];

    default:
      return [
        {
          label: "technical_and_product",
          dimensions: ["technical_capability", "product_release", "benchmark_evaluation", "safety_alignment"],
        },
        {
          label: "business_and_market",
          dimensions: ["business_revenue", "enterprise_adoption", "funding_capital", "market_analysis"],
        },
        {
          label: "governance_and_ecosystem",
          dimensions: ["regulation_governance", "legal_lawsuit", "ecosystem_developer"],
        },
      ];
  }
}

function summarizeCoverage(
  items: SearchEvidence[],
  topicAnalysis?: TopicAnalysis,
): {
  coveredDimensions: EvidenceCoverageDimension[];
  strongCoveredDimensions: EvidenceCoverageDimension[];
  weakCoveredDimensions: EvidenceCoverageDimension[];
  missingDimensions: string[];
  comparisonAxes: EvidenceCoverageDimension[];
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
  const analyzerNeeds = (topicAnalysis?.evidenceNeeds ?? [])
    .map((need) => need.dimension)
    .filter(
      (dimension): dimension is EvidenceCoverageDimension =>
        isEvidenceCoverageDimension(dimension) && dimension !== "unknown",
    );
  const analyzerAxes = (topicAnalysis?.comparisonAxes ?? [])
    .filter(
      (dimension): dimension is EvidenceCoverageDimension =>
        isEvidenceCoverageDimension(dimension) && dimension !== "unknown",
    );
  const comparisonAxes = Array.from(
    new Set(analyzerAxes.length > 0 ? analyzerAxes : analyzerNeeds),
  );
  const dynamicRequiredGroups =
    analyzerNeeds.length > 0
      ? Array.from(new Set(analyzerNeeds)).map((dimension) => ({
          label: dimension,
          dimensions: [dimension] as readonly EvidenceCoverageDimension[],
        }))
      : undefined;
  const dominantTopicType = topicAnalysis?.topicType ?? getDominantTopicType(items);
  const isEntityCompetitionCoverage = dominantTopicType === "entity_competition";
  const requiredGroups =
    dynamicRequiredGroups ?? getRequiredCoverageGroups(dominantTopicType);
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
    comparisonAxes,
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

  if (
    quality.evidenceJudgment &&
    quality.evidenceJudgment.role !== "core"
  ) {
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
  if (typeof quality.topicRelevanceScore === "number") {
    return quality.topicRelevanceScore >= 60;
  }

  return false;
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
    item.quality?.evidenceJudgment
      ? `证据裁判：${item.quality.evidenceJudgment.role} / ${item.quality.evidenceJudgment.confidence} / ${item.quality.evidenceJudgment.suggestedUse}`
      : "",
    item.quality?.evidenceJudgment?.limitations.length
      ? `使用限制：${item.quality.evidenceJudgment.limitations.join("；")}`
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
    `- 强覆盖维度（可支撑结论）：${formatListForPrompt(overview.strongCoveredDimensions)}`,
    `- 弱覆盖维度（仅作背景）：${formatListForPrompt(overview.weakCoveredDimensions)}`,
    `- 缺失维度：${formatListForPrompt(overview.missingDimensions)}`,
    `- 覆盖度评分：${overview.coverageCompleteness}`,
    "- 只能用强覆盖维度的资料支撑对应结论；弱覆盖维度的资料只能作为背景参考，不能单独支撑事实性判断。",
    "- 维度缺失时不要把局部技术事实升级为综合胜负判断。",
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
  topic?: string;
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
  const rawCandidateTarget =
    input.input.rawCandidateTarget !== undefined
      ? normalizeNonNegativeInteger(input.input.rawCandidateTarget)
      : undefined;
  const rawCandidateCount =
    input.input.rawCandidateCount !== undefined
      ? normalizeNonNegativeInteger(input.input.rawCandidateCount)
      : undefined;
  const uniqueCandidateCount =
    input.input.uniqueCandidateCount !== undefined
      ? normalizeNonNegativeInteger(input.input.uniqueCandidateCount)
      : undefined;
  const selectedEvidenceTarget =
    input.input.selectedEvidenceTarget !== undefined
      ? normalizeNonNegativeInteger(input.input.selectedEvidenceTarget)
      : undefined;
  const selectedEvidenceCount =
    input.input.selectedEvidenceCount !== undefined
      ? normalizeNonNegativeInteger(input.input.selectedEvidenceCount)
      : undefined;
  const candidateShortfall =
    input.input.candidateShortfall !== undefined
      ? normalizeNonNegativeInteger(input.input.candidateShortfall)
      : undefined;
  const retrievalPassCount =
    input.input.retrievalPassCount !== undefined
      ? normalizeNonNegativeInteger(input.input.retrievalPassCount)
      : undefined;
  const fallbackTriggeredReason = normalizeOptionalText(
    input.input.fallbackTriggeredReason,
    80,
  );
  const searchStrategy =
    input.input.searchStrategy === "multi_pass" ? "multi_pass" : undefined;
  const provider = normalizeOptionalText(input.input.provider, 80);
  const providerDiagnostics = normalizeSearchProviderDiagnostics(
    input.input.providerDiagnostics,
  );
  const selectedKeys = new Set(input.selectedItems.map(getEvidenceKey));
  const processItems = Array.isArray(input.input.candidateItems)
    ? input.input.candidateItems
        .map((item) => normalizeEvidenceItem(item, input.topic))
        .filter((item): item is Omit<SearchEvidence, "id"> => item !== null)
    : input.normalizedItems;
  const results = processItems.map((item) => {
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
      ...(quality?.evidenceJudgment
        ? { evidenceJudgment: quality.evidenceJudgment }
        : {}),
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
  const topRawCandidates = normalizeSearchCandidatePreviews(
    input.input.topRawCandidates,
  );
  const topicAnalysis = normalizeTopicAnalysis(input.input.topicAnalysis);
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
    ...(rawCandidateTarget !== undefined ? { rawCandidateTarget } : {}),
    ...(rawCandidateCount !== undefined ? { rawCandidateCount } : {}),
    ...(uniqueCandidateCount !== undefined ? { uniqueCandidateCount } : {}),
    ...(selectedEvidenceTarget !== undefined ? { selectedEvidenceTarget } : {}),
    ...(selectedEvidenceCount !== undefined ? { selectedEvidenceCount } : {}),
    ...(candidateShortfall !== undefined ? { candidateShortfall } : {}),
    ...(retrievalPassCount !== undefined ? { retrievalPassCount } : {}),
    ...(fallbackTriggeredReason ? { fallbackTriggeredReason } : {}),
    ...rescueStats,
    ...(extractAttempts.length > 0 ? { extractAttempts } : {}),
    ...(passStats.length > 0 ? { passStats } : {}),
    ...(skippedPasses.length > 0 ? { skippedPasses } : {}),
    ...(topRawCandidates.length > 0 ? { topRawCandidates } : {}),
    ...(topicAnalysis ? { topicAnalysis } : {}),
    qualityOverview,
    debugSummary: createEvidenceDebugSummary({
      evidenceMode,
      failureReason: normalizeSearchFailureReason(input.input.failureReason),
      results,
      rawCandidateTarget,
      rawCandidateCount,
      uniqueCandidateCount,
      selectedEvidenceTarget,
      selectedEvidenceCount,
      candidateShortfall,
      retrievalPassCount,
      fallbackTriggeredReason,
      extractAttempted: rescueStats.extractAttempted,
      extractSucceededCount: rescueStats.extractSucceededCount,
      officialExtractFailed: rescueStats.officialExtractFailed,
      targetedSearchRetryTriggered: rescueStats.targetedSearchRetryTriggered,
      targetedSearchRetryReason: rescueStats.targetedSearchRetryReason,
      passStats,
      selectedItems: input.selectedItems,
      skippedPasses,
      topRawCandidates,
    }),
    filteredReasons: summarizeFilteredReasons(results),
    results,
    warnings: normalizeStringArray(input.input.warnings),
    ...(typeof input.input.zeroResultFallbackTriggered === "boolean"
      ? { zeroResultFallbackTriggered: input.input.zeroResultFallbackTriggered }
      : {}),
    ...(Array.isArray(input.input.fallbackQueries)
      ? { fallbackQueries: input.input.fallbackQueries as string[] }
      : {}),
    ...(typeof input.input.providerReturnedZeroCount === "number"
      ? { providerReturnedZeroCount: input.input.providerReturnedZeroCount }
      : {}),
    ...(typeof input.input.relaxedQueryCount === "number"
      ? { relaxedQueryCount: input.input.relaxedQueryCount }
      : {}),
    ...(isObject(input.input.skippedPassReasons)
      ? { skippedPassReasons: input.input.skippedPassReasons as Record<string, string> }
      : {}),
    ...(typeof input.input.effectiveSearchRegion === "string"
      ? { effectiveSearchRegion: input.input.effectiveSearchRegion }
      : {}),
    ...(typeof input.input.effectiveCountry === "string"
      ? { effectiveCountry: input.input.effectiveCountry }
      : {}),
    ...(typeof input.input.searchRegionSource === "string"
      ? { searchRegionSource: input.input.searchRegionSource as "user_preference" | "auto_detected" | "default_global" | "region_unsupported_fallback" }
      : {}),
    ...(typeof input.input.regionFallbackReason === "string"
      ? { regionFallbackReason: input.input.regionFallbackReason }
      : {}),
    ...(typeof input.input.requestedSearchRegion === "string"
      ? { requestedSearchRegion: input.input.requestedSearchRegion }
      : {}),
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
    .map((item) => {
      const queryLevel = normalizeSearchQueryLevel(item.queryLevel);
      const queryQuality = normalizeSearchQueryQuality(item.queryQuality);

      return {
        query: normalizeText(item.query, 240),
        reason: normalizeText(item.reason, 240),
        participantIds: normalizeStringArray(item.participantIds),
        sourcePreference: normalizeSearchSourcePreference(item.sourcePreference),
        freshness: normalizeSearchFreshness(item.freshness),
        ...(queryLevel ? { queryLevel } : {}),
        ...(normalizeText(item.derivedFrom, 80)
          ? { derivedFrom: normalizeText(item.derivedFrom, 80) }
          : {}),
        ...(queryQuality ? { queryQuality } : {}),
        ...(normalizeText(item.skippedReason, 120)
          ? { skippedReason: normalizeText(item.skippedReason, 120) }
          : {}),
      };
    })
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

function normalizeSearchQueryLevel(value: unknown): SearchQueryLevel | undefined {
  return value === "precise" ||
    value === "broad" ||
    value === "evidence_type" ||
    value === "scenario" ||
    value === "cross_language" ||
    value === "fallback_broad" ||
    value === "fallback_entity" ||
    value === "fallback_keyword"
    ? value
    : undefined;
}

function normalizeSearchQueryQuality(
  value: unknown,
): SearchQueryQuality | undefined {
  if (!isObject(value) || typeof value.ok !== "boolean") {
    return undefined;
  }

  return {
    ok: value.ok,
    ...(normalizeText(value.reason, 120)
      ? { reason: normalizeText(value.reason, 120) }
      : {}),
    hasEntity: Boolean(value.hasEntity),
    hasScenarioOrEvidenceNeed: Boolean(value.hasScenarioOrEvidenceNeed),
    tokenCount: normalizeNonNegativeInteger(value.tokenCount),
    duplicateRatio: Math.max(
      0,
      Math.min(
        1,
        typeof value.duplicateRatio === "number" &&
          Number.isFinite(value.duplicateRatio)
          ? value.duplicateRatio
          : 0,
      ),
    ),
  };
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

      const queryLevel = normalizeSearchQueryLevel(item.queryLevel);
      const queryQuality = normalizeSearchQueryQuality(item.queryQuality);
      const searchParameters = normalizeSearchPassParameters(
        item.searchParameters,
      );

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
        ...(queryLevel ? { queryLevel } : {}),
        ...(normalizeText(item.derivedFrom, 80)
          ? { derivedFrom: normalizeText(item.derivedFrom, 80) }
          : {}),
        ...(queryQuality ? { queryQuality } : {}),
        ...(searchParameters ? { searchParameters } : {}),
        ...(normalizeText(item.skippedReason, 120)
          ? { skippedReason: normalizeText(item.skippedReason, 120) }
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

function normalizeSearchPassParameters(
  value: unknown,
): EvidenceSearchPassParameters | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const parameters: EvidenceSearchPassParameters = {};
  const maxResults =
    value.maxResults !== undefined
      ? normalizeNonNegativeInteger(value.maxResults)
      : undefined;
  const searchDepth = normalizeSearchDepth(value.searchDepth);
  const searchTopic = normalizeSearchTopic(value.searchTopic);
  const timeRange = normalizeSearchTimeRange(value.timeRange);
  const country = normalizeText(value.country, 80);
  const includeDomains = normalizeStringArray(value.includeDomains).slice(0, 24);
  const excludeDomains = normalizeStringArray(value.excludeDomains).slice(0, 24);
  const includeRawContent = normalizeIncludeRawContent(value.includeRawContent);

  if (maxResults !== undefined) parameters.maxResults = maxResults;
  if (searchDepth) parameters.searchDepth = searchDepth;
  if (searchTopic) parameters.searchTopic = searchTopic;
  if (timeRange) parameters.timeRange = timeRange;
  if (country) parameters.country = country;
  if (includeDomains.length > 0) parameters.includeDomains = includeDomains;
  if (excludeDomains.length > 0) parameters.excludeDomains = excludeDomains;
  if (includeRawContent !== undefined) {
    parameters.includeRawContent = includeRawContent;
  }

  return Object.keys(parameters).length > 0 ? parameters : undefined;
}

function normalizeSearchCandidatePreviews(
  value: unknown,
): SearchProcessCandidatePreview[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .map((item) => {
      const title = normalizeText(item.title, 160);

      if (!title) {
        return null;
      }

      const url = normalizeOptionalUrl(item.url);
      const query = normalizeText(item.query, 160);
      const source = normalizeText(item.source, 120);
      const seenInPasses = normalizeStringArray(item.seenInPasses).slice(0, 8);
      const reliability = normalizeEvidenceReliability(item.reliability);
      const evidenceRole = normalizeEvidenceJudgmentRole(item.evidenceRole);

      return {
        title,
        ...(query ? { query } : {}),
        ...(url ? { url } : {}),
        ...(source ? { source } : {}),
        ...(typeof item.providerScore === "number" && Number.isFinite(item.providerScore)
          ? { providerScore: item.providerScore }
          : {}),
        snippetLength: normalizeNonNegativeInteger(item.snippetLength),
        reliability: reliability ?? "very_low",
        score: normalizeNonNegativeInteger(item.score),
        ...(seenInPasses.length > 0 ? { seenInPasses } : {}),
        ...(evidenceRole ? { evidenceRole } : {}),
      };
    })
    .filter((item): item is SearchProcessCandidatePreview => item !== null)
    .slice(0, 12);
}

function normalizeSearchDepth(
  value: unknown,
): EvidenceSearchPassParameters["searchDepth"] | undefined {
  return value === "basic" ||
    value === "advanced" ||
    value === "fast" ||
    value === "ultra-fast"
    ? value
    : undefined;
}

function normalizeSearchTopic(
  value: unknown,
): EvidenceSearchPassParameters["searchTopic"] | undefined {
  return value === "general" || value === "news" || value === "finance"
    ? value
    : undefined;
}

function normalizeSearchTimeRange(
  value: unknown,
): EvidenceSearchPassParameters["timeRange"] | undefined {
  return value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "year" ||
    value === "d" ||
    value === "w" ||
    value === "m" ||
    value === "y"
    ? value
    : undefined;
}

function normalizeIncludeRawContent(
  value: unknown,
): EvidenceSearchPassParameters["includeRawContent"] | undefined {
  return value === true ||
    value === false ||
    value === "markdown" ||
    value === "text"
    ? value
    : undefined;
}

function normalizeEvidenceReliability(
  value: unknown,
): EvidenceReliability | undefined {
  return value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "very_low"
    ? value
    : undefined;
}

function normalizeEvidenceJudgmentRole(
  value: unknown,
): EvidenceJudgment["role"] | undefined {
  return value === "core" ||
    value === "supporting" ||
    value === "background" ||
    value === "discard"
    ? value
    : undefined;
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
  rawCandidateTarget?: number;
  rawCandidateCount?: number;
  uniqueCandidateCount?: number;
  selectedEvidenceTarget?: number;
  selectedEvidenceCount?: number;
  candidateShortfall?: number;
  retrievalPassCount?: number;
  fallbackTriggeredReason?: string;
  extractAttempted?: number;
  extractSucceededCount?: number;
  officialExtractFailed?: boolean;
  passStats?: EvidenceSearchPassStats[];
  selectedItems?: SearchEvidence[];
  skippedPasses?: string[];
  targetedSearchRetryTriggered?: boolean;
  targetedSearchRetryReason?: string;
  topRawCandidates?: SearchProcessCandidatePreview[];
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
    retrieval: {
      rawCandidateTarget: input.rawCandidateTarget ?? candidateCount,
      rawCandidateCount: input.rawCandidateCount ?? candidateCount,
      uniqueCandidateCount: input.uniqueCandidateCount ?? candidateCount,
      selectedEvidenceTarget:
        input.selectedEvidenceTarget ?? (input.selectedItems?.length ?? 0),
      selectedEvidenceCount:
        input.selectedEvidenceCount ?? (input.selectedItems?.length ?? 0),
      candidateShortfall: input.candidateShortfall ?? 0,
      retrievalPassCount: input.retrievalPassCount ?? 0,
      ...(input.fallbackTriggeredReason
        ? { fallbackTriggeredReason: input.fallbackTriggeredReason }
        : {}),
    },
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
      missingTopicRelevanceScore: input.results.filter(
        (result) => typeof result.topicRelevanceScore !== "number",
      ).length,
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
    ...(input.topRawCandidates && input.topRawCandidates.length > 0
      ? { topRawCandidates: input.topRawCandidates }
      : {}),
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
  if (typeof result.topicRelevanceScore === "number") {
    return result.topicRelevanceScore >= 60;
  }

  return false;
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

function normalizeTopicAnalysis(value: unknown): TopicAnalysis | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const topicType = normalizeEvidenceTopicType(value.topicType);

  if (!topicType) {
    return undefined;
  }

  const evidenceNeeds = Array.isArray(value.evidenceNeeds)
    ? value.evidenceNeeds
        .filter(isObject)
        .map((item) => {
          const dimension = normalizeCoverageDimension(item.dimension);

          return dimension
            ? {
                dimension,
                reason: normalizeText(item.reason, 160),
              }
            : undefined;
        })
        .filter((item): item is EvidenceNeed => item !== undefined)
    : [];
  const freshnessRequirement = normalizeFreshnessRequirement(
    value.freshnessRequirement,
  );

  return {
    topicType,
    cleanedTopic: normalizeText(value.cleanedTopic, 240),
    targetEntities: normalizeStringArray(value.targetEntities).slice(0, 12),
    targetScenarios: normalizeStringArray(value.targetScenarios).slice(0, 12),
    comparisonAxes: normalizeStringArray(value.comparisonAxes).slice(0, 12),
    evidenceNeeds,
    timeSensitivity:
      value.timeSensitivity === "high" ||
      value.timeSensitivity === "medium" ||
      value.timeSensitivity === "low"
        ? value.timeSensitivity
        : freshnessRequirement === "latest"
          ? "high"
          : freshnessRequirement === "recent"
            ? "medium"
            : "low",
    ...(freshnessRequirement ? { freshnessRequirement } : {}),
    searchQueries: normalizeStringArray(value.searchQueries).slice(0, 8),
  };
}

function normalizeFreshnessRequirement(
  value: unknown,
): SearchFreshness | undefined {
  return value === "latest" || value === "recent" || value === "any"
    ? value
    : undefined;
}

function normalizeEvidenceTopicType(
  value: unknown,
): EvidenceTopicType | undefined {
  return value === "entity_competition" ||
    value === "capability_comparison" ||
    value === "market_outlook" ||
    value === "policy_regulation" ||
    value === "product_release_analysis" ||
    value === "investment_business_analysis" ||
    value === "technical_research_analysis" ||
    value === "general_discussion"
    ? value
    : undefined;
}

function normalizeCoverageDimension(
  value: unknown,
): EvidenceCoverageDimension | undefined {
  return value === "technical_capability" ||
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
    ? value
    : undefined;
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
  const topicEntities = topic ? extractTopicEntities(topic) : [];
  const disassociationPenalty = getDisassociationPenalty(topicEntities, title, snippet);

  if (topicType !== "entity_competition") {
    const adjustedScore = Math.max(0, keywordRelevanceScore + disassociationPenalty);

    return {
      topicType,
      topicRelevanceScore: adjustedScore,
      relevanceReason: disassociationPenalty < 0
        ? "资料包含与议题实体的澄清或无关声明，相关性已降低。"
        : "资料与议题关键词存在一般相关性。",
      matchedQuestionAspects:
        coverageDimension === "unknown" ? [] : [coverageDimension],
      coverageDimension,
    };
  }

  const matchedQuestionAspects =
    getEntityCompetitionMatchedAspects(coverageDimension);
  const dimensionRelevanceScore =
    getEntityCompetitionRelevanceScore(coverageDimension);
  const baseScore = Math.max(dimensionRelevanceScore, keywordRelevanceScore);
  const topicRelevanceScore = Math.max(
    0,
    capEntityCompetitionKeywordRelevance(coverageDimension, baseScore) + disassociationPenalty,
  );

  return {
    topicType,
    topicRelevanceScore,
    relevanceReason: disassociationPenalty < 0
      ? "资料包含与议题实体的澄清或无关声明，相关性已降低。"
      : getEntityCompetitionRelevanceReason(
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
  const hasCapabilityScenario = matchesAny(normalized, [
    "model",
    "llm",
    "assistant",
    "office",
    "coding",
    "code",
    "automation",
    "capability",
    "benchmark",
    "evaluation",
    "developer",
    "workflow",
    "办公",
    "代码",
    "模型",
    "能力",
    "评测",
  ]);

  if (hasMultipleEntities && hasCapabilityScenario) {
    return "capability_comparison";
  }

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

export function analyzeTopicForEvidence(topic: string | undefined): TopicAnalysis {
  const normalizedTopic = topic?.trim() ?? "";
  const cleanedTopic = cleanTopicForEvidenceSearchSafe(normalizedTopic);
  const evidenceTopic = cleanedTopic;
  const analysisTopic = cleanedTopic || normalizedTopic;
  const topicType = classifyEvidenceTopic(analysisTopic);
  const evidenceNeeds = getEvidenceNeedsForTopicType(topicType);
  const comparisonAxes = evidenceNeeds
    .map((need) => need.dimension)
    .filter((dimension) => dimension !== "unknown");
  const freshnessRequirement = getFreshnessRequirementForTopic(
    normalizedTopic,
    topicType,
  );
  const targetEntities = extractTopicEntitiesForAnalysis(evidenceTopic).slice(0, 8);
  const targetScenarios = extractTargetScenarios(evidenceTopic);

  return {
    topicType,
    cleanedTopic,
    targetEntities,
    targetScenarios,
    comparisonAxes,
    evidenceNeeds,
    timeSensitivity:
      freshnessRequirement === "latest"
        ? "high"
        : freshnessRequirement === "recent"
          ? "medium"
          : "low",
    freshnessRequirement,
    searchQueries: buildTopicAnalysisQueries({
      cleanedTopic: evidenceTopic,
      evidenceNeeds,
      targetEntities,
      targetScenarios,
      topicType,
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy cleaner kept while replacing mojibake-sensitive logic.
function stripDiscussionShellFromTopic(topic: string): string {
  return topic
    .normalize("NFKC")
    .replace(/你们认为|你认为|您认为|大家认为|怎么看待|如何看待|怎么看|怎么样|是否应该|应不应该|请讨论|讨论一下|哪个更好|哪一个更好|哪种更好/gu, " ")
    .replace(/[?？!！。；;：“”"']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy cleaner kept while replacing mojibake-sensitive logic.
function cleanTopicForEvidenceSearch(topic: string): string {
  const discussionShells = [
    /你们认为|你认为|您认为|大家认为|我想问一下|想问一下/gu,
    /怎么看待|如何看待|怎么评价|如何评价|怎么分析|请分析/gu,
    /怎么样|怎样|如何|是什么|为什么/gu,
    /是否应该|应不应该|要不要|有没有必要|值不值得/gu,
    /请讨论|讨论一下|讨论|哪个更好|哪一个更好|哪种更好|谁更强/gu,
    /目前|当前|这类|这类工具/gu,
    /\b(?:what|why|how|should|discuss|compare|which is better)\b/giu,
  ];
  let cleaned = topic.normalize("NFKC");

  cleaned = cleaned
    .replace(/\bhow\s+(?:strong|competitive|good|capable)\s+(?:is|are)\b/giu, " ")
    .replace(/\bwhat\s+do\s+you\s+think\s+(?:about|of)\b/giu, " ")
    .replace(/\bplease\s+(?:discuss|compare|analyze)\b/giu, " ")
    .replace(/\b(?:is|are)\s+(.+?)\s+(?:any\s+good|competitive|strong)\b/giu, "$1");

  for (const shell of discussionShells) {
    cleaned = cleaned.replace(shell, " ");
  }

  return cleaned
    .replace(/[？?！!。；;："“”'‘’]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTopicForEvidenceSearchSafe(topic: string): string {
  const discussionShells = [
    "\\u4f60\\u4eec\\u8ba4\\u4e3a|\\u4f60\\u8ba4\\u4e3a|\\u60a8\\u8ba4\\u4e3a|\\u5927\\u5bb6\\u8ba4\\u4e3a|\\u6211\\u60f3\\u95ee\\u4e00\\u4e0b|\\u60f3\\u95ee\\u4e00\\u4e0b",
    "\\u600e\\u4e48\\u770b\\u5f85|\\u5982\\u4f55\\u770b\\u5f85|\\u600e\\u4e48\\u770b|\\u600e\\u4e48\\u8bc4\\u4ef7|\\u5982\\u4f55\\u8bc4\\u4ef7|\\u600e\\u4e48\\u5206\\u6790|\\u8bf7\\u5206\\u6790",
    "\\u600e\\u4e48\\u6837|\\u600e\\u6837|\\u5982\\u4f55|\\u662f\\u4ec0\\u4e48|\\u4e3a\\u4ec0\\u4e48",
    "\\u662f\\u5426\\u5e94\\u8be5|\\u5e94\\u4e0d\\u5e94\\u8be5|\\u8981\\u4e0d\\u8981|\\u6709\\u6ca1\\u6709\\u5fc5\\u8981|\\u503c\\u4e0d\\u503c\\u5f97",
    "\\u8bf7\\u8ba8\\u8bba|\\u8ba8\\u8bba\\u4e00\\u4e0b|\\u8ba8\\u8bba|\\u54ea\\u4e2a\\u66f4\\u597d|\\u54ea\\u4e00\\u4e2a\\u66f4\\u597d|\\u54ea\\u79cd\\u66f4\\u597d|\\u8c01\\u66f4\\u5f3a",
    "\\u76ee\\u524d|\\u5f53\\u524d|\\u8fd9\\u7c7b|\\u8fd9\\u7c7b\\u5de5\\u5177",
    "\\b(?:what|why|how|should|discuss|compare|which is better)\\b",
  ].map((pattern) => new RegExp(pattern, "giu"));
  let cleaned = topic.normalize("NFKC");

  cleaned = cleaned
    .replace(/\bhow\s+(?:strong|competitive|good|capable)\s+(?:is|are)\b/giu, " ")
    .replace(/\bwhat\s+do\s+you\s+think\s+(?:about|of)\b/giu, " ")
    .replace(/\bplease\s+(?:discuss|compare|analyze)\b/giu, " ")
    .replace(/\b(?:is|are)\s+(.+?)\s+(?:any\s+good|competitive|strong)\b/giu, "$1");

  for (const shell of discussionShells) {
    cleaned = cleaned.replace(shell, " ");
  }

  return cleaned
    .replace(/[\uFF1F?！!\u3002\uff1b;:\uff1a"\u201c\u201d'\u2018\u2019]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTopicEntitiesForAnalysis(topic: string): string[] {
  const exactAsciiEntities =
    topic.match(/\b[A-Z][A-Za-z0-9.-]{1,}(?:\s+[A-Z][A-Za-z0-9.-]{1,}){0,3}\b/g) ??
    [];
  const cjkSeparatedEntities =
    topic.match(/[\p{Script=Han}A-Za-z0-9.-]{2,}\s*(?:、|和|与|及|vs\.?|versus)\s*[\p{Script=Han}A-Za-z0-9.-]{2,}/giu) ??
    [];
  const cjkParts = cjkSeparatedEntities.flatMap((item) =>
    item
      .split(/(?:、|和|与|及|vs\.?|versus)/iu)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2 && part.length <= 24),
  );
  const legacyEntities = extractTopicEntities(topic);
  const seen = new Set<string>();
  const entities: string[] = [];

  for (const entity of [...exactAsciiEntities, ...cjkParts, ...legacyEntities]) {
    const cleaned = entity.replace(/[，,。；;：:]/g, "").trim();
    const key = cleaned.toLowerCase();

    if (!cleaned || seen.has(key) || isLowInformationTopicEntity(cleaned)) {
      continue;
    }

    seen.add(key);
    entities.push(cleaned);
  }

  return entities;
}

function isLowInformationTopicEntity(entity: string): boolean {
  const normalized = entity.toLowerCase();

  return [
    "目前",
    "当前",
    "这类",
    "工具",
    "产品",
    "场景",
    "竞争力",
    "讨论",
    "应用前景",
    "should",
    "discuss",
  ].includes(normalized);
}

function getEvidenceNeedsForTopicType(
  topicType: EvidenceTopicType,
): EvidenceNeed[] {
  const need = (
    dimension: EvidenceCoverageDimension,
    reason: string,
  ): EvidenceNeed => ({ dimension, reason });

  if (topicType === "entity_competition") {
    return [
      need("technical_capability", "比较对象的能力、产品或技术事实。"),
      need("business_revenue", "商业闭环、收入质量或成本结构。"),
      need("enterprise_adoption", "客户采用、部署和迁移成本。"),
      need("funding_capital", "资本、融资或持续投入能力。"),
      need("regulation_governance", "治理、监管和法律约束。"),
      need("market_analysis", "市场格局和长期竞争位置。"),
    ];
  }

  if (topicType === "capability_comparison") {
    return [
      need("benchmark_evaluation", "可比较的评测或实验结果。"),
      need("technical_capability", "能力边界和工程表现。"),
      need("product_release", "产品化状态和版本边界。"),
    ];
  }

  if (topicType === "investment_business_analysis") {
    return [
      need("business_revenue", "收入、成本和商业模式。"),
      need("funding_capital", "融资、估值和资本约束。"),
      need("market_analysis", "市场空间和竞争位置。"),
      need("enterprise_adoption", "客户结构和采用情况。"),
    ];
  }

  if (topicType === "policy_regulation") {
    return [
      need("regulation_governance", "政策、监管和治理要求。"),
      need("legal_lawsuit", "法律争议和执行风险。"),
      need("official_position", "官方立场或正式声明。"),
    ];
  }

  if (topicType === "product_release_analysis") {
    return [
      need("product_release", "发布内容、版本和功能边界。"),
      need("technical_capability", "能力变化和技术约束。"),
      need("user_feedback", "用户反馈和采用场景。"),
    ];
  }

  if (topicType === "technical_research_analysis") {
    return [
      need("technical_capability", "技术路线和能力边界。"),
      need("benchmark_evaluation", "实验评估和复现结果。"),
      need("safety_alignment", "安全、对齐和限制条件。"),
    ];
  }

  if (topicType === "market_outlook") {
    return [
      need("market_analysis", "市场趋势和竞争格局。"),
      need("business_revenue", "需求、收入和商业化信号。"),
      need("regulation_governance", "外部政策和监管变量。"),
    ];
  }

  return [
    need("expert_opinion", "观点讨论中可参考的论点和判断框架。"),
    need("user_feedback", "用户体验、偏好或使用场景。"),
  ];
}

function getFreshnessRequirementForTopic(
  topic: string,
  topicType: EvidenceTopicType,
): SearchFreshness {
  const normalized = topic.toLowerCase();

  if (
    matchesAny(normalized, [
      "latest",
      "today",
      "now",
      "recently",
      "price",
      "ranking",
      "发布",
      "最新",
      "今天",
      "最近",
      "价格",
      "排名",
    ])
  ) {
    return "latest";
  }

  if (
    topicType === "market_outlook" ||
    topicType === "policy_regulation" ||
    topicType === "product_release_analysis"
  ) {
    return "recent";
  }

  return "any";
}

function extractTargetScenarios(topic: string): string[] {
  const scenarios = new Set<string>();

  for (const keyword of [
    "企业",
    "消费者",
    "开发者",
    "教育",
    "医疗",
    "金融",
    "enterprise",
    "consumer",
    "developer",
    "education",
    "healthcare",
    "finance",
  ]) {
    if (matchesAny(topic.toLowerCase(), [keyword])) {
      scenarios.add(keyword);
    }
  }

  for (const scenario of extractScenarioPhrases(topic)) {
    scenarios.add(scenario);
  }

  return Array.from(scenarios).slice(0, 6);
}

function extractScenarioPhrases(topic: string): string[] {
  const phrases = new Set<string>();
  const normalized = topic.normalize("NFKC");

  for (const match of normalized.matchAll(/([\p{Script=Han}A-Za-z0-9\s、，,和与及+/-]{2,24})场景/gu)) {
    const raw = match[1] ?? "";
    for (const part of raw.split(/[、，,和与及+/-]/u)) {
      const phrase = part
        .replace(/.*(?:在|用于|面向|针对)/u, "")
        .replace(/(?:目前|当前|这类|工具|产品)$/u, "")
        .trim();

      if (phrase.length >= 2 && phrase.length <= 12) {
        phrases.add(phrase);
      }
    }
  }

  for (const keyword of ["企业", "消费者", "开发者", "教育", "医疗", "金融", "办公", "代码辅助", "客服", "知识库", "风控"]) {
    if (normalized.includes(keyword)) {
      phrases.add(keyword);
    }
  }

  return Array.from(phrases).slice(0, 6);
}

function buildTopicAnalysisQueries(input: {
  cleanedTopic: string;
  evidenceNeeds: EvidenceNeed[];
  targetEntities: string[];
  targetScenarios: string[];
  topicType: EvidenceTopicType;
}): string[] {
  const base = input.cleanedTopic || "general discussion";
  const entities = input.targetEntities.slice(0, 4);
  const scenarios = input.targetScenarios.slice(0, 3);
  const dimensions = input.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .filter(Boolean);
  const entityPart = entities.join(" ");
  const scenarioPart = scenarios.join(" ");
  const primaryDimension = dimensions.slice(0, 2).join(" ");
  const secondaryDimension = dimensions.slice(2, 5).join(" ");
  const preciseDimension =
    input.topicType === "entity_competition"
      ? "funding revenue market adoption capability"
      : primaryDimension;
  const queries = [
    [entityPart, scenarioPart, preciseDimension].filter(Boolean).join(" "),
    [entityPart, primaryDimension, secondaryDimension].filter(Boolean).join(" "),
    [entityPart, scenarioPart].filter(Boolean).join(" "),
    [base, primaryDimension].filter(Boolean).join(" "),
    [entityPart, getTopicTypeSearchTerm(input.topicType)].filter(Boolean).join(" "),
    base,
  ];

  return dedupeTopicAnalysisQueries(queries).slice(0, 8);
}

function getTopicTypeSearchTerm(topicType: EvidenceTopicType): string {
  if (topicType === "policy_regulation") return "regulation governance official";
  if (topicType === "product_release_analysis") return "product release user feedback";
  if (topicType === "capability_comparison") return "capability benchmark evaluation";
  if (topicType === "investment_business_analysis") return "revenue funding market analysis";
  if (topicType === "market_outlook") return "market analysis adoption";
  if (topicType === "technical_research_analysis") return "technical capability benchmark";
  if (topicType === "entity_competition") return "funding revenue market adoption capability";
  return "expert opinion user feedback";
}

function dedupeTopicAnalysisQueries(queries: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const compact = query.replace(/\s+/g, " ").trim();
    const key = compact.toLowerCase();

    if (!compact || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(compact);
  }

  return result;
}

export function formatDimensionSearchTerm(
  dimension: EvidenceCoverageDimension,
): string {
  switch (dimension) {
    case "technical_capability":
      return "capability product";
    case "benchmark_evaluation":
      return "benchmark evaluation";
    case "business_revenue":
      return "revenue business model";
    case "enterprise_adoption":
      return "enterprise customers adoption";
    case "funding_capital":
      return "funding capital valuation";
    case "regulation_governance":
      return "regulation governance";
    case "legal_lawsuit":
      return "lawsuit legal";
    case "market_analysis":
      return "market analysis";
    case "product_release":
      return "product release";
    case "ecosystem_developer":
      return "developer ecosystem";
    case "safety_alignment":
      return "safety alignment";
    case "user_feedback":
      return "user feedback";
    case "expert_opinion":
      return "expert opinion";
    case "official_position":
      return "official statement";
    default:
      return "";
  }
}

function hasCoreCoverageForTopic(input: {
  coverageDimension: EvidenceCoverageDimension;
  matchedQuestionAspects: string[];
  topicType: EvidenceTopicType;
}): boolean {
  const dimension = input.coverageDimension;

  if (dimension === "unknown") {
    return false;
  }

  if (input.topicType === "capability_comparison") {
    return (
      dimension === "technical_capability" ||
      dimension === "benchmark_evaluation" ||
      dimension === "product_release" ||
      dimension === "enterprise_adoption" ||
      dimension === "user_feedback" ||
      input.matchedQuestionAspects.includes("technical_capability")
    );
  }

  if (input.topicType === "technical_research_analysis") {
    return (
      dimension === "technical_capability" ||
      dimension === "benchmark_evaluation" ||
      dimension === "safety_alignment" ||
      dimension === "ecosystem_developer"
    );
  }

  if (input.topicType === "product_release_analysis") {
    return (
      dimension === "product_release" ||
      dimension === "technical_capability" ||
      dimension === "user_feedback" ||
      dimension === "enterprise_adoption" ||
      dimension === "official_position"
    );
  }

  if (input.topicType === "policy_regulation") {
    return (
      dimension === "regulation_governance" ||
      dimension === "legal_lawsuit" ||
      dimension === "official_position"
    );
  }

  if (input.topicType === "investment_business_analysis") {
    return (
      dimension === "business_revenue" ||
      dimension === "enterprise_adoption" ||
      dimension === "funding_capital" ||
      dimension === "market_analysis"
    );
  }

  if (input.topicType === "market_outlook") {
    return (
      dimension === "market_analysis" ||
      dimension === "enterprise_adoption" ||
      dimension === "business_revenue" ||
      dimension === "expert_opinion"
    );
  }

  if (input.topicType === "entity_competition") {
    return (
      dimension === "business_revenue" ||
      dimension === "enterprise_adoption" ||
      dimension === "funding_capital" ||
      dimension === "market_analysis" ||
      dimension === "regulation_governance" ||
      dimension === "legal_lawsuit" ||
      dimension === "technical_capability" ||
      dimension === "benchmark_evaluation" ||
      dimension === "ecosystem_developer"
    );
  }

  return (
    dimension === "technical_capability" ||
    dimension === "benchmark_evaluation" ||
    dimension === "product_release" ||
    dimension === "business_revenue" ||
    dimension === "funding_capital" ||
    dimension === "market_analysis" ||
    dimension === "enterprise_adoption" ||
    dimension === "user_feedback" ||
    dimension === "expert_opinion" ||
    dimension === "official_position"
  );
}

function canBeSupportingCoverageForTopic(
  input: {
    coverageDimension: EvidenceCoverageDimension;
    topicType: EvidenceTopicType;
  },
  hasCoreCoverage: boolean,
): boolean {
  if (hasCoreCoverage) {
    return true;
  }

  if (
    input.topicType === "capability_comparison" ||
    input.topicType === "technical_research_analysis" ||
    input.topicType === "product_release_analysis"
  ) {
    return false;
  }

  return input.coverageDimension !== "unknown";
}

function judgeEvidenceForTopic(input: {
  coverageDimension: EvidenceCoverageDimension;
  matchedQuestionAspects: string[];
  reliability: EvidenceReliability;
  score: number;
  sourceType: EvidenceSourceType;
  textLength: number;
  topicType: EvidenceTopicType;
  topicRelevanceScore: number;
  snippetOnly: boolean;
}): EvidenceJudgment {
  const limitations: string[] = [];
  const hasCoreCoverage = hasCoreCoverageForTopic(input);

  if (input.snippetOnly || input.textLength < 800) {
    limitations.push("正文不足，不能单独支撑结论。");
  }

  if (input.topicRelevanceScore < 60) {
    limitations.push("议题相关度不足，最多作为背景线索。");
  }

  if (
    input.sourceType === "social_forum" ||
    input.sourceType === "video_platform" ||
    input.sourceType === "official_community"
  ) {
    limitations.push("社区、论坛或视频来源不能作为核心事实证据。");
  }

  if (!hasCoreCoverage && input.coverageDimension !== "unknown") {
    limitations.push("Evidence does not directly cover the topic's core scenario or comparison axis.");
  }

  const canBeCore =
    (isStrongOfficialSource(input.sourceType) ||
      input.sourceType === "reputable_media" ||
      input.sourceType === "industry_report") &&
    input.textLength >= 800 &&
    input.snippetOnly !== true &&
    input.topicRelevanceScore >= 60 &&
    input.coverageDimension !== "unknown" &&
    hasCoreCoverage &&
    (input.reliability === "high" || input.reliability === "medium");
  const role: EvidenceJudgment["role"] = canBeCore
    ? "core"
    : input.topicRelevanceScore >= 50 &&
        input.coverageDimension !== "unknown" &&
        canBeSupportingCoverageForTopic(input, hasCoreCoverage)
      ? "supporting"
      : input.topicRelevanceScore > 0
        ? "background"
        : "discard";
  const confidence: EvidenceJudgment["confidence"] =
    role === "core" && input.score >= 75
      ? "high"
      : role === "discard" || input.score < 45
        ? "low"
        : "medium";

  return {
    relevance: input.topicRelevanceScore,
    role,
    confidence,
    reason: canBeCore
      ? "来源、正文长度和议题相关度足以作为核心证据。"
      : "该资料只能有限支持议题，需受使用边界约束。",
    supports:
      input.coverageDimension === "unknown" ? [] : [input.coverageDimension],
    limitations,
    suggestedUse:
      role === "core"
        ? "可用于支撑对应维度的结论。"
        : role === "supporting"
          ? "可作为辅助资料，不能单独支撑关键结论。"
          : role === "background"
            ? "仅适合提供背景或线索。"
            : "不建议进入 Evidence Pack 正文论据。",
  };
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

  if (matchesAny(text, ["official statement", "official position", "official announcement", "官方声明", "官方立场", "官方公告", "公司声明", "企业声明"])) {
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
  const normalizedValue = normalizeTextForMatching(value);
  const chunks = normalizedValue.match(/[一-鿿]{2,}/g) ?? [];
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

    const segments = compact.split(/\s+/).filter((item) => item.length >= 2);

    for (const segment of segments) {
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

const TRADITIONAL_TO_SIMPLIFIED: Record<string, string> = {
  "華": "华", "國": "国", "韜": "韬", "論": "论",
  "療": "疗", "產": "产", "業": "业", "發": "发",
  "訊": "讯", "資": "资", "報": "报",
  "開": "开", "關": "关", "問": "问", "題": "题",
  "議": "议", "點": "点", "結": "结", "網": "网",
  "絡": "络", "體": "体", "驗": "验", "證": "证",
  "據": "据", "實": "实", "認": "认", "識": "识",
  "導": "导", "師": "师", "術": "术", "標": "标",
  "準": "准", "規": "规", "則": "则", "計": "计",
  "劃": "划", "設": "设", "討": "讨", "評": "评",
  "價": "价", "質": "质", "機": "机", "構": "构",
  "營": "营", "銷": "销", "競": "竞", "爭": "争",
  "勢": "势", "範": "范", "圍": "围", "內": "内",
  "區": "区", "塊": "块", "鏈": "链", "環": "环",
  "險": "险", "戰": "战", "進": "进", "態": "态",
  "變": "变", "現": "现", "測": "测", "試": "试",
  "確": "确", "張": "张", "後": "后",
  "領": "领", "層": "层", "統": "统",
  "備": "备", "懷": "怀", "轉": "转",
};

function normalizeTextForMatching(value: string): string {
  let result = value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[αΑ]/g, "alpha")
    .replace(/[βΒ]/g, "beta")
    .replace(/[γΓ]/g, "gamma")
    .replace(/[·•・]/g, "");

  for (const [traditional, simplified] of Object.entries(TRADITIONAL_TO_SIMPLIFIED)) {
    result = result.replaceAll(traditional, simplified);
  }

  return result
    .replace(/[^\p{L}\p{N}一-鿿]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DISASSOCIATION_SIGNALS = [
  "澄清", "无关", "否认", "不涉及", "无合作", "无关系",
  "撇清", "没有关系", "不相关", "已澄清", "紧急澄清",
  "并非", "实为", "误读", "被误认", "易混淆",
  "名称相似", "名称相近", "名字相似", "名字相近",
  "被误传", "误传", "谣传", "系误读", "系谣传",
];

function extractTopicEntities(topic: string): string[] {
  const normalized = normalizeTextForMatching(topic);
  const cjkEntities = normalized.match(/[一-鿿]{2,}/g) ?? [];
  const englishEntities = normalized.match(/[a-z][a-z0-9-]{1,}/g) ?? [];
  const stopWords = new Set([
    "怎么看", "如何看", "最近", "发布", "哪个", "哪家",
    "公司", "企业", "长期", "竞争", "优势", "更有",
    "谁更", "以及", "相关", "资料", "认为", "觉得",
    "评价", "分析", "怎么样", "如何看待", "比较",
    "什么", "如何", "怎样", "为啥", "为什么",
  ]);

  return [...cjkEntities, ...englishEntities]
    .filter((entity) => !stopWords.has(entity) && entity.length >= 2);
}

function getDisassociationPenalty(
  topicEntities: string[],
  title: string,
  snippet: string,
): number {
  if (topicEntities.length === 0) return 0;

  const text = normalizeTextForMatching(`${title} ${snippet}`);

  const hasEntityOverlap = topicEntities.some(
    (entity) => entity.length >= 2 && text.includes(entity),
  );
  if (!hasEntityOverlap) return 0;

  const normalizedSignals = DISASSOCIATION_SIGNALS.map(normalizeTextForMatching);
  const signalCount = normalizedSignals.filter((signal) => text.includes(signal)).length;

  if (signalCount === 0) return 0;
  if (signalCount >= 2) return -50;
  return -30;
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
