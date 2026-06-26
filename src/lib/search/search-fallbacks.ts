import type {
  EvidencePack,
  ExtractAttemptRecord,
  SearchEvidence,
  SearchIntentRecord,
  SearchMode,
  TopicAnalysis,
} from "./evidence-pack";
import {
  formatDimensionSearchTerm,
  isPublicOpinionEvidenceItem,
  isStrongOfficialSource,
  scoreEvidence,
} from "./evidence-pack";
import type { TavilyEvidenceDraft } from "./tavily-search";
import {
  INDUSTRY_REPORT_DOMAINS,
  SOCIAL_VIDEO_DOMAINS,
  TRUSTED_MEDIA_DOMAINS,
  annotateSearchPass,
  buildGeneralWebPass,
  buildOfficialDomainCandidates,
  buildQueryFromTopicAnalysisParts,
  evaluateSearchQueryQuality,
  getMeaningfulTokenCount,
  getQueryDedupeKey,
  getSearchEntityTerms,
  getTavilyTimeRange,
  isLowValueSearchTerm,
  normalizeSearchQueryTerms,
  selectBestTopicAnalysisQuery,
  splitSearchPhrases,
  type SearchPassSpec,
} from "./search-query-planning";

const RESCUE_TRIGGER_USABLE_THRESHOLD = 3;
const RESCUE_TRIGGER_RELIABLE_THRESHOLD = 3;

type CandidatePoolItem = {
  draft: TavilyEvidenceDraft & { url: string };
  status: "usable" | "needs_extract" | "context_only" | "filtered";
  score: number;
};
export function isCoreEvidenceCandidate(item: SearchEvidence): boolean {
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
    (quality.topicType !== "entity_competition" ||
      (quality.topicRelevanceScore ?? quality.relevanceScore ?? 0) >= 60) &&
    (quality.reliability === "high" || quality.reliability === "medium")
  );
}

export function getSeenInPassesForUrl(
  drafts: TavilyEvidenceDraft[],
  url: string,
): string[] {
  const canonicalUrl = getCanonicalSearchUrl(url);
  const passes = drafts
    .filter((draft) => getCanonicalSearchUrl(draft.url) === canonicalUrl)
    .flatMap((draft) => draft.seenInPasses ?? []);

  return Array.from(new Set(passes));
}

export function getPrimarySeenInPass(draft: TavilyEvidenceDraft): string | undefined {
  return draft.seenInPasses?.[0];
}

export async function extractFallbackDraftsForCandidates(input: {
  candidates: (TavilyEvidenceDraft & { url: string })[];
  currentDrafts: TavilyEvidenceDraft[];
  extractAttempts: ExtractAttemptRecord[];
  signal?: AbortSignal;
}): Promise<TavilyEvidenceDraft[]> {
  const currentByUrl = new Map(
    input.currentDrafts.map((draft) => [
      getCanonicalSearchUrl(draft.url),
      draft.snippet.trim().length,
    ]),
  );
  const drafts: TavilyEvidenceDraft[] = [];

  for (const candidate of input.candidates) {
    const currentLength =
      currentByUrl.get(getCanonicalSearchUrl(candidate.url)) ?? 0;

    if (currentLength >= 800) {
      continue;
    }

    try {
      const fallbackText = await fetchReadableText(candidate.url, input.signal);

      input.extractAttempts.push({
        url: candidate.url,
        provider: "html_fetch",
        passName: getPrimarySeenInPass(candidate),
        returnedTextLength: fallbackText.length,
        success: fallbackText.length >= 800,
        ...(fallbackText.length < 800 ? { errorType: "text_too_short" } : {}),
      });

      if (fallbackText.length >= 800) {
        drafts.push({
          title: candidate.title,
          url: candidate.url,
          snippet: fallbackText,
          query: candidate.query,
          seenInPasses: candidate.seenInPasses,
        });
      }
    } catch (error) {
      input.extractAttempts.push({
        url: candidate.url,
        provider: "html_fetch",
        passName: getPrimarySeenInPass(candidate),
        returnedTextLength: 0,
        success: false,
        errorType: "html_fetch_failed",
        errorMessageSafe: getSafeExtractErrorMessage(error),
      });
    }
  }

  return drafts;
}

async function fetchReadableText(
  url: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "AI Roundtable Evidence Extractor",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();

  return extractReadableTextFromHtml(html);
}

function extractReadableTextFromHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(?:p|br|div|section|article|h[1-6]|li|tr)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

export function getSafeExtractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }

  return "unknown extract error";
}

export function getCanonicalSearchUrl(url: string | undefined): string {
  if (!url) {
    return "";
  }

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";

    return parsed.toString().toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function getExtractRescueDecision(
  pack: EvidencePack,
  searchMode: SearchMode,
): { triggered: boolean; reason?: string } {
  if (pack.items.some(isOfficialSnippetOnlyEvidence)) {
    return {
      triggered: true,
      reason: "official_snippet_only",
    };
  }

  if (pack.items.length < RESCUE_TRIGGER_USABLE_THRESHOLD) {
    return {
      triggered: true,
      reason: "usable_evidence_below_threshold",
    };
  }

  if (getReliableEvidenceCount(pack.items) < RESCUE_TRIGGER_RELIABLE_THRESHOLD) {
    return {
      triggered: true,
      reason: "reliable_evidence_below_threshold",
    };
  }

  if (getShortExtractedTextRatio(pack.items) > 0.7) {
    return {
      triggered: true,
      reason: "short_extracted_text_ratio_above_threshold",
    };
  }

  if (
    searchMode === "deep" &&
    getReliableEvidenceCount(pack.items) < RESCUE_TRIGGER_RELIABLE_THRESHOLD
  ) {
    return {
      triggered: true,
      reason: "reliable_evidence_below_threshold",
    };
  }

  return { triggered: false };
}

export function shouldRunTargetedSearchRetry(pack: EvidencePack): boolean {
  if (pack.items.length === 0) {
    return false;
  }

  const socialVideoCount = pack.items.filter(isPublicOpinionEvidenceItem).length;

  return socialVideoCount / pack.items.length > 0.5;
}

export function getLowQualityFallbackReason(input: {
  pack: EvidencePack;
  rawCandidateCount: number;
  targetCandidateCount: number;
  uniqueCandidateCount: number;
}): string | undefined {
  const { pack, rawCandidateCount, targetCandidateCount, uniqueCandidateCount } =
    input;

  if (rawCandidateCount <= 0) {
    return undefined;
  }

  if (uniqueCandidateCount < targetCandidateCount) {
    return "candidate_shortfall";
  }

  if (!pack.enabled || pack.items.length === 0) {
    return "direct_supporting_shortfall";
  }

  const citableCount = pack.items.filter((item) => {
    const role = item.quality?.evidenceJudgment?.role;

    return role === "core" || role === "supporting";
  }).length;
  const peripheralDowngradedCount = pack.items.filter((item) => {
    const role = item.quality?.evidenceJudgment?.role;
    const dimension = item.quality?.coverageDimension;

    return (
      (role === "background" || role === "discard") &&
      dimension !== undefined &&
      dimension !== "unknown" &&
      (item.quality?.topicRelevanceScore ?? 0) >= 30
    );
  }).length;

  const hasPeripheralButNoCitable =
    citableCount === 0 &&
    peripheralDowngradedCount > 0 &&
    peripheralDowngradedCount / pack.items.length >= 0.5;

  return hasPeripheralButNoCitable ? "direct_supporting_shortfall" : undefined;
}

export function buildTargetedRetrySearchPasses(
  topicAnalysis: TopicAnalysis,
): SearchPassSpec[] {
  const baseQuery =
    selectBestTopicAnalysisQuery(topicAnalysis, topicAnalysis.cleanedTopic) ??
    buildQueryFromTopicAnalysisParts(topicAnalysis, topicAnalysis.cleanedTopic);
  const reportQuery = normalizeSearchQueryTerms(
    `${baseQuery} independent analysis market report`,
    topicAnalysis,
  );
  const benchmarkQuery = normalizeSearchQueryTerms(
    `${baseQuery} benchmark evaluation technical analysis`,
    topicAnalysis,
  );
  const officialQuery = normalizeSearchQueryTerms(
    /[\p{Script=Han}]/u.test(topicAnalysis.cleanedTopic)
      ? `${baseQuery} 官方 发布 公告`
      : `${baseQuery} official announcement report`,
    topicAnalysis,
  );
  const passes: SearchPassSpec[] = [
    {
      name: "targeted_retry",
      query: reportQuery,
      freshness: "latest",
      includeDomains: TRUSTED_MEDIA_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      includeRawContent: "text",
      chunksPerSource: 3,
      searchDepth: "advanced",
      searchTopic: "news",
      timeRange: "month",
    },
    {
      name: "targeted_retry",
      query: benchmarkQuery,
      freshness: "recent",
      includeDomains: INDUSTRY_REPORT_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      includeRawContent: "text",
      chunksPerSource: 3,
      searchDepth: "advanced",
      searchTopic: "general",
      timeRange: "year",
    },
    {
      name: "targeted_retry",
      query: officialQuery,
      freshness: "latest",
      includeDomains: buildOfficialDomainCandidates(
        topicAnalysis.cleanedTopic,
        topicAnalysis,
      ),
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      includeRawContent: "text",
      chunksPerSource: 3,
      searchDepth: "advanced",
      searchTopic: "general",
      timeRange: "month",
    },
  ];

  for (const pass of passes) {
    annotateSearchPass(pass, "fallback_broad", "topic_analysis", topicAnalysis);
  }

  return passes.filter((pass) => pass.query);
}

function isOfficialSnippetOnlyEvidence(item: SearchEvidence): boolean {
  return (
    isStrongOfficialSource(item.quality?.sourceType) &&
    ((item.quality?.textLength ?? item.snippet.length) < 800 ||
      item.quality?.snippetOnly === true)
  );
}

export function isOfficialSnippetOnlyDraft(
  draft: TavilyEvidenceDraft,
  topic: string,
): boolean {
  const quality = scoreEvidence({
    title: draft.title,
    url: draft.url,
    source: draft.source,
    publishedAt: draft.publishedAt,
    snippet: draft.snippet,
    topic,
  });

  return (
    isStrongOfficialSource(quality.sourceType) &&
    (quality.textLength < 800 || quality.snippetOnly === true)
  );
}

function getReliableEvidenceCount(items: SearchEvidence[]): number {
  return items.filter((item) => {
    const reliability = item.quality?.reliability;

    return reliability === "high" || reliability === "medium";
  }).length;
}

function getShortExtractedTextRatio(items: SearchEvidence[]): number {
  if (items.length === 0) {
    return 0;
  }

  const shortCount = items.filter(
    (item) => (item.quality?.textLength ?? item.snippet.length) < 800,
  ).length;

  return shortCount / items.length;
}

export function selectRescueCandidates(
  drafts: TavilyEvidenceDraft[],
  topic: string,
  limit: number,
) {
  return drafts
    .flatMap((draft): CandidatePoolItem[] => {
      if (!draft.url) {
        return [];
      }

      const quality = scoreEvidence({
        title: draft.title,
        url: draft.url,
        source: draft.source,
        publishedAt: draft.publishedAt,
        snippet: draft.snippet,
        topic,
      });
      const status = getCandidateStatus(draft, quality);

      if (status === "filtered") {
        return [];
      }

      return [
        {
          draft: { ...draft, url: draft.url },
          status,
          score: quality.score ?? 0,
        },
      ];
    })
    .sort(compareCandidatePoolItems)
    .slice(0, limit)
    .map((candidate) => candidate.draft);
}

function getCandidateStatus(
  draft: TavilyEvidenceDraft,
  quality: ReturnType<typeof scoreEvidence>,
): CandidatePoolItem["status"] {
  if (!draft.url) {
    return "filtered";
  }

  if (
    isStrongOfficialSource(quality.sourceType) &&
    (quality.textLength < 800 || quality.snippetOnly === true)
  ) {
    return "needs_extract";
  }

  if (!draft.snippet.trim() || draft.snippet.length < 300) {
    return "needs_extract";
  }

  if (quality.reliability === "very_low") {
    return "needs_extract";
  }

  if (quality.reliability === "low") {
    return "context_only";
  }

  return "usable";
}

function compareCandidatePoolItems(
  left: CandidatePoolItem,
  right: CandidatePoolItem,
) {
  const sourceDelta =
    getCandidateSourceRank(left.draft) - getCandidateSourceRank(right.draft);

  if (sourceDelta !== 0) {
    return sourceDelta;
  }

  const statusDelta =
    getCandidateStatusRank(left.status) - getCandidateStatusRank(right.status);

  if (statusDelta !== 0) {
    return statusDelta;
  }

  return right.score - left.score;
}

function getCandidateSourceRank(draft: TavilyEvidenceDraft): number {
  const quality = scoreEvidence({
    title: draft.title,
    url: draft.url,
    source: draft.source,
    publishedAt: draft.publishedAt,
    snippet: draft.snippet,
  });

  if (isStrongOfficialSource(quality.sourceType)) {
    return 0;
  }

  if (
    quality.sourceType === "reputable_media" ||
    quality.sourceType === "industry_report"
  ) {
    return 1;
  }

  if (quality.sourceType === "unknown") {
    return 2;
  }

  return 3;
}

function getCandidateStatusRank(status: CandidatePoolItem["status"]) {
  return {
    usable: 0,
    context_only: 1,
    needs_extract: 2,
    filtered: 3,
  }[status];
}

export function getRescueQuery(topic: string, records: SearchIntentRecord[]) {
  return (
    records
      .flatMap((record) => record.intents.map((intent) => intent.question))
      .find(Boolean) ?? topic
  );
}

export function buildTopicAnalysisZeroResultFallbackQueries(
  topicAnalysis: TopicAnalysis,
): string[] {
  const queries: string[] = [];
  const seenKeys = new Set<string>();
  const entities = getSearchEntityTerms(topicAnalysis).slice(0, 4);
  const scenarios = topicAnalysis.targetScenarios
    .map((scenario) => normalizeSearchQueryTerms(scenario, topicAnalysis))
    .filter(Boolean)
    .slice(0, 3);
  const dimensionTerms = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .map((term) => normalizeSearchQueryTerms(term, topicAnalysis))
    .filter(Boolean);
  const cleanedTokens = splitSearchPhrases(topicAnalysis.cleanedTopic)
    .map((token) => normalizeSearchQueryTerms(token, topicAnalysis))
    .filter((token) => !isLowValueSearchTerm(token))
    .slice(0, 6);
  const addQuery = (parts: string[]) => {
    const query = normalizeSearchQueryTerms(parts.filter(Boolean).join(" "), topicAnalysis);
    const quality = evaluateSearchQueryQuality(query, topicAnalysis);

    if (query && quality.ok && getMeaningfulTokenCount(query) >= 2) {
      const key = getQueryDedupeKey(query);

      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        queries.push(query);
      }
    }
  };

  addQuery([entities.join(" "), scenarios.join(" "), dimensionTerms.slice(0, 2).join(" ")]);
  addQuery([entities.join(" "), dimensionTerms.slice(0, 3).join(" ")]);
  addQuery([entities.join(" "), scenarios.join(" ")]);
  addQuery([entities.join(" ")]);
  addQuery([...cleanedTokens, dimensionTerms[0] ?? ""]);

  return queries.slice(0, 5);
}

export function buildTopicAnalysisFallbackSearchPasses(
  topicAnalysis: TopicAnalysis,
  fallbackQueries: string[],
): SearchPassSpec[] {
  if (fallbackQueries.length === 0) {
    return [];
  }

  const broadQuery = fallbackQueries[0];
  const passes: SearchPassSpec[] = [
    buildGeneralWebPass(topicAnalysis, broadQuery, "fallback_broad"),
  ];
  const industryReportPass: SearchPassSpec = {
    name: "industry_report",
    query: broadQuery,
    freshness: "recent",
    includeDomains: INDUSTRY_REPORT_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };
  annotateSearchPass(
    industryReportPass,
    "fallback_broad",
    "topic_analysis",
    topicAnalysis,
  );
  passes.push(industryReportPass);

  const reputableMediaPass: SearchPassSpec = {
    name: "reputable_media",
    query: broadQuery,
    freshness: "recent",
    includeDomains: TRUSTED_MEDIA_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "news",
    timeRange: getTavilyTimeRange("recent"),
  };
  annotateSearchPass(
    reputableMediaPass,
    "fallback_broad",
    "topic_analysis",
    topicAnalysis,
  );
  passes.push(reputableMediaPass);

  if (fallbackQueries.length > 1) {
    const socialCluePass: SearchPassSpec = {
      name: "social_clue",
      query: fallbackQueries[1],
      freshness: "recent",
      includeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "fast",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("recent"),
    };
    annotateSearchPass(
      socialCluePass,
      "fallback_entity",
      "topic_analysis",
      topicAnalysis,
    );
    passes.push(socialCluePass);
  }

  return passes;
}
