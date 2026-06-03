import type {
  EvidencePack,
  EvidenceSearchPassStats,
  ExtractAttemptRecord,
  SearchEvidence,
  SearchCacheEvent,
  SearchFreshness,
  SearchIntent,
  SearchIntentDecision,
  SearchIntentRecord,
  SearchMode,
  SearchProviderDiagnostic,
  SearchQueryPlan,
  SearchQueryLevel,
  SearchQueryQuality,
  SearchSourcePreference,
  TopicAnalysis,
} from "./evidence-pack";
import {
  analyzeTopicForEvidence,
  createSearchFailureProcess,
  formatDimensionSearchTerm,
  isPublicOpinionEvidenceItem,
  isStrongOfficialSource,
  normalizeEvidencePack,
  scoreEvidence,
} from "./evidence-pack";
import {
  buildTavilySearchQueries,
  dedupeSearchResults,
  getTavilyFailureReason,
  SEARCH_REGION_COUNTRY_MAP,
  TavilySearchError,
  type TavilyEvidenceDraft,
} from "./tavily-search";
import { getSearchProvider } from "./search-provider-registry";
import { getExtractProvider } from "./extract-provider-registry";
import type { ExtractProvider } from "./extract-provider";
import type {
  SearchProvider,
  SearchProviderResponse,
} from "./search-provider";
import type {
  ModelParticipant,
  ModelProvider,
} from "../types";

const MAX_MODEL_DRIVEN_QUERIES = 8;
const WEB_SEARCH_RESULTS_PER_QUERY = 20;
const RESCUE_TRIGGER_USABLE_THRESHOLD = 3;
const RESCUE_TRIGGER_RELIABLE_THRESHOLD = 3;
const MAX_TAVILY_QUERY_LENGTH = 160;
const VAGUE_TERMS = new Set([
  "impact",
  "future",
  "analysis",
  "overview",
  "trend",
  "trends",
  "news",
]);
const MARKETING_TERMS = new Set([
  "best",
  "ultimate",
  "game changer",
  "revolutionary",
  "amazing",
  "powerful",
  "leading",
]);
const SOURCE_NAME_QUERY_TERMS = new Set([
  "reuters",
  "bloomberg",
  "ft",
  "wsj",
  "nytimes",
  "semiAnalysis".toLowerCase(),
  "epoch",
  "arxiv",
  "mlcommons",
  "stanford",
  "techcrunch",
  "wired",
  "engadget",
  "theverge",
]);
const SOCIAL_CLUE_FINAL_LIMIT = 2;
const DEFAULT_EVIDENCE_OVERALL_TIMEOUT_MS = 90000;
const DEFAULT_EVIDENCE_PASS_TIMEOUT_MS = 30000;
const MODEL_DRIVEN_FINAL_EVIDENCE_LIMIT = 12;
const TRUSTED_MEDIA_DOMAINS = [
  "reuters.com",
  "bloomberg.com",
  "ft.com",
  "wsj.com",
  "nytimes.com",
  "theinformation.com",
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "engadget.com",
  "arstechnica.com",
];
const LOCALIZED_MEDIA_DOMAINS = [
  "people.com.cn",
  "people.cn",
  "stcn.com",
  "globaltimes.cn",
  "gasgoo.com",
  "finance.yahoo.com",
  "tw.stock.yahoo.com",
  "36kr.com",
];
const INDUSTRY_REPORT_DOMAINS = [
  "semianalysis.com",
  "epoch.ai",
  "stanford.edu",
  "arxiv.org",
  "mlcommons.org",
];
const SOCIAL_VIDEO_DOMAINS = [
  "reddit.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "instagram.com",
  "tiktok.com",
];

type SearchPassName =
  | "general_web"
  | "official"
  | "localized_media"
  | "reputable_media"
  | "industry_report"
  | "social_clue"
  | "targeted_retry";

type SearchPassSpec = {
  name: SearchPassName;
  query: string;
  freshness: SearchFreshness;
  queryLevel?: SearchQueryLevel;
  derivedFrom?: string;
  queryQuality?: SearchQueryQuality;
  chunksPerSource?: number;
  country?: string;
  excludeDomains?: string[];
  includeDomains?: string[];
  includeRawContent?: boolean | "markdown" | "text";
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  searchTopic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";
};

type SearchModeConfig = {
  candidateLimit: number;
  extractLimit: number;
  finalLimit: number;
  chunksPerSource: number;
};

type CandidatePoolItem = {
  draft: TavilyEvidenceDraft & { url: string };
  status: "usable" | "needs_extract" | "context_only" | "filtered";
  score: number;
};

type Searcher = (
  query: string,
  options?: {
    freshness?: SearchFreshness;
    maxResults?: number;
    onCacheEvent?: (event: SearchCacheEvent) => void;
    signal?: AbortSignal;
  },
) => Promise<TavilyEvidenceDraft[]>;

type BuildModelDrivenWebEvidencePackOptions = {
  baseEvidencePack?: EvidencePack;
  extractProvider?: ExtractProvider;
  participants: ModelParticipant[];
  provider: ModelProvider;
  searchMode?: SearchMode;
  searchPreferences?: import("../types").SearchPreferences;
  searchProvider?: SearchProvider;
  searcher?: Searcher;
  signal?: AbortSignal;
  topic: string;
};

export async function buildModelDrivenWebEvidencePack({
  baseEvidencePack,
  extractProvider = getExtractProvider(),
  participants,
  provider,
  searchMode = "deep",
  searchPreferences,
  searchProvider = getSearchProvider(),
  searcher,
  signal,
  topic,
}: BuildModelDrivenWebEvidencePackOptions): Promise<EvidencePack> {
  const regionResolution = resolveSearchRegionPreference({
    topic,
    searchRegion: searchPreferences?.searchRegion,
  });
  const searchRegion = regionResolution.resolvedRegion;
  const modeConfig = getSearchModeConfig(searchPreferences?.searchIntensity === "standard" ? "standard" : searchMode);
  const topicAnalysis = analyzeTopicForEvidence(topic);
  const searchPlan = await buildParticipantSearchQueries(
    topic,
    participants,
    provider,
    signal,
    topicAnalysis,
  );
  const searchQueries: string[] = [];
  const baseItems = baseEvidencePack?.enabled ? baseEvidencePack.items : [];
  const cacheEvents: SearchCacheEvent[] = [];
  const providerDiagnostics: SearchProviderDiagnostic[] = [];
  const passStats: EvidenceSearchPassStats[] = [];
  const skippedPasses: string[] = [];
  const shouldUseHtmlExtractFallback = !searcher && extractProvider.id === "tavily";
  let dedupeStats: ReturnType<typeof dedupeSearchResults>["stats"] | undefined;
  let webDrafts: TavilyEvidenceDraft[];
  let rawCandidateCount = 0;
  let rescueTriggered = false;
  let rescueReason: string | undefined;
  let extractAttempted = 0;
  let extractedCandidateCount = 0;
  let extractSucceededCount = 0;
  let officialExtractFailed = false;
  let extractErrorType: string | undefined;
  const extractAttempts: ExtractAttemptRecord[] = [];
  let targetedSearchRetryTriggered = false;
  let targetedSearchRetryReason: string | undefined;
  let activeSearchPassName: SearchPassName | undefined;
  const overallStartedAt = Date.now();
  const overallTimeoutMs = getEvidenceOverallTimeoutMs();
  const passTimeoutMs = getEvidencePassTimeoutMs();
  let keyPassCount = 0;
  let failedKeyPassCount = 0;
  let firstFailedPassName: SearchPassName | undefined;
  let firstFailureReason: ReturnType<typeof getTavilyFailureReason> | undefined;
  let zeroResultFallbackTriggered = false;
  let lowQualityFallbackTriggered = false;
  let fallbackTriggeredReason: string | undefined;
  const fallbackQueries: string[] = [];
  let providerReturnedZeroCount = 0;
  let relaxedQueryCount = 0;
  const skippedPassReasons: Record<string, string> = {};

  try {
    const allSearchPasses = buildSearchPasses(
      topic,
      searchPlan.queries,
      topicAnalysis,
    );
    const passSelection = selectSearchPassesForExecution(
      allSearchPasses,
      topicAnalysis,
    );
    const searchPasses = passSelection.selected;
    for (const skipped of passSelection.skipped) {
      skippedPasses.push(skipped.pass.name);
      skippedPassReasons[skipped.pass.name] = skipped.reason;
      if (skipped.reason === "query_quality_gate") {
        passStats.push(createSkippedPassStats(skipped.pass, skipped.reason));
      }
    }
    keyPassCount = searchPasses.filter((pass) =>
      isKeySearchPass(pass.name),
    ).length;
    const maxResultsPerQuery = getMaxResultsPerQuery(
      modeConfig.candidateLimit,
      searchPasses.length,
    );
    const rawWebDrafts: TavilyEvidenceDraft[] = [];

    for (const searchPass of searchPasses) {
      searchQueries.push(searchPass.query);
      activeSearchPassName = searchPass.name;
      const passStartedAt = Date.now();
      const remainingTimeoutMs = getRemainingTimeoutMs(
        overallStartedAt,
        overallTimeoutMs,
      );
      const effectivePassTimeoutMs = Math.min(
        passTimeoutMs,
        remainingTimeoutMs,
      );

      if (effectivePassTimeoutMs <= 0) {
        const errorType = "evidence_overall_timeout";

        passStats.push(
          createFailedPassStats(
            searchPass.name,
            searchPass.query,
            Date.now() - passStartedAt,
            errorType,
            true,
            getPassStatsMeta(searchPass),
          ),
        );
        if (isKeySearchPass(searchPass.name)) {
          failedKeyPassCount += 1;
          firstFailedPassName ??= searchPass.name;
          firstFailureReason ??= "network_error";
        }
        logSearchPassFailure({
          durationMs: Date.now() - passStartedAt,
          errorType,
          passName: searchPass.name,
          provider: searchProvider.id,
          query: searchPass.query,
          timeoutMs: overallTimeoutMs,
        });
        activeSearchPassName = undefined;
        break;
      }

      const passAbort = createTimedAbortSignal(signal, effectivePassTimeoutMs);

      try {
        const response = await searchWithConfiguredProvider({
          chunksPerSource: searchPass.chunksPerSource,
          country: searchPass.country,
          excludeDomains: searchPass.excludeDomains,
          freshness: searchPass.freshness,
          includeDomains: searchPass.includeDomains,
          includeRawContent: searchPass.includeRawContent,
          maxResults: maxResultsPerQuery,
          provider: searchProvider,
          query: searchPass.query,
          searchDepth: searchPass.searchDepth,
          searchRegion,
          searchTopic: searchPass.searchTopic,
          searcher,
          signal: passAbort.signal,
          timeRange: searchPass.timeRange,
          topic,
        });
        cacheEvents.push(...(response.cacheEvents ?? []));
        providerDiagnostics.push(createProviderDiagnostic(response));
        const passDrafts = response.results.map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.content ?? result.snippet ?? "",
          publishedAt: result.publishedDate,
          providerScore: result.providerScore,
          query: searchPass.query,
          seenInPasses: [searchPass.name],
        }));

        passStats.push(
          createPassStats(
            searchPass.name,
            searchPass.query,
            passDrafts,
            topic,
            getPassStatsMeta(searchPass, {
              durationMs: Date.now() - passStartedAt,
            }),
          ),
        );
        rawWebDrafts.push(...passDrafts);
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }

        const durationMs = Date.now() - passStartedAt;
        const errorType = getSearchPassErrorType(
          error,
          durationMs,
          effectivePassTimeoutMs,
        );
        const timedOut = isSearchPassTimeout(errorType);

        passStats.push(
          createFailedPassStats(
            searchPass.name,
            searchPass.query,
            durationMs,
            errorType,
            timedOut,
            getPassStatsMeta(searchPass),
          ),
        );
        providerDiagnostics.push(
          createFailedProviderDiagnostic(searchProvider, error, errorType),
        );

        if (isKeySearchPass(searchPass.name)) {
          failedKeyPassCount += 1;
          firstFailedPassName ??= searchPass.name;
          firstFailureReason ??= getTavilyFailureReason(error);
        }

        logSearchPassFailure({
          durationMs,
          errorType,
          passName: searchPass.name,
          provider: searchProvider.id,
          query: searchPass.query,
          timeoutMs: effectivePassTimeoutMs,
        });
      } finally {
        passAbort.clear();
        activeSearchPassName = undefined;
      }
    }

    if (
      rawWebDrafts.length === 0 &&
      keyPassCount > 0 &&
      failedKeyPassCount >= keyPassCount
    ) {
      return normalizeEvidencePack(
        {
          enabled: true,
          evidenceStatus: "none",
          evidenceWarnings: [
            ...(baseEvidencePack?.evidenceWarnings ?? []),
            "Tavily search failed; the meeting should treat real-time facts as manually unverified.",
          ],
          items: baseItems,
          searchProcess: createSearchFailureProcess({
            cacheEvents,
            dedupeStats,
            executedQueries: searchQueries,
            failureReason: firstFailureReason ?? "network_error",
            provider: searchProvider.id,
            providerDiagnostics,
            searchIntents: searchPlan.searchIntents,
            queryPlans: searchPlan.queryPlans,
            intentDecisions: searchPlan.intentDecisions,
            searchStrategy: "multi_pass",
            topicAnalysis,
            failedStage: "search_pass",
            failedPassName: firstFailedPassName,
            passStats,
            skippedPasses,
            retryCount: 0,
            warnings: ["all_key_passes_failed"],
          }),
          searchQueries,
          strategy: baseEvidencePack?.strategy ?? "text_pack",
        },
        {
          topic,
        },
      );
    }

    // Zero-result fallback: if all passes returned 0 results, try broader queries
    if (rawWebDrafts.length === 0) {
      zeroResultFallbackTriggered = true;
      fallbackTriggeredReason = "zero_results";
      const zeroFallbackQueries = buildTopicAnalysisZeroResultFallbackQueries(topicAnalysis);
      fallbackQueries.push(...zeroFallbackQueries);
      const fallbackPasses = buildTopicAnalysisFallbackSearchPasses(
        topicAnalysis,
        zeroFallbackQueries,
      );

      for (const fallbackPass of fallbackPasses) {
        const remainingTimeoutMs = getRemainingTimeoutMs(
          overallStartedAt,
          overallTimeoutMs,
        );
        const effectivePassTimeoutMs = Math.min(
          passTimeoutMs,
          remainingTimeoutMs,
        );

        if (effectivePassTimeoutMs <= 0) {
          passStats.push(
            createFailedPassStats(
              fallbackPass.name,
              fallbackPass.query,
              0,
              "evidence_overall_timeout",
              true,
              getPassStatsMeta(fallbackPass),
            ),
          );
          break;
        }

        searchQueries.push(fallbackPass.query);
        relaxedQueryCount += 1;
        const passStartedAt = Date.now();
        const passAbort = createTimedAbortSignal(signal, effectivePassTimeoutMs);

        try {
          const response = await searchWithConfiguredProvider({
            chunksPerSource: fallbackPass.chunksPerSource,
            country: fallbackPass.country,
            excludeDomains: fallbackPass.excludeDomains,
            freshness: fallbackPass.freshness,
            includeDomains: fallbackPass.includeDomains,
            includeRawContent: fallbackPass.includeRawContent,
            maxResults: maxResultsPerQuery,
            provider: searchProvider,
            query: fallbackPass.query,
            searchDepth: fallbackPass.searchDepth,
            searchRegion,
            searchTopic: fallbackPass.searchTopic,
            searcher,
            signal: passAbort.signal,
            timeRange: fallbackPass.timeRange,
            topic,
          });
          cacheEvents.push(...(response.cacheEvents ?? []));
          providerDiagnostics.push(createProviderDiagnostic(response));
          const passDrafts = response.results.map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content ?? result.snippet ?? "",
            publishedAt: result.publishedDate,
            providerScore: result.providerScore,
            query: fallbackPass.query,
            seenInPasses: [fallbackPass.name],
          }));

          if (passDrafts.length === 0) {
            providerReturnedZeroCount += 1;
          }

          passStats.push(
            createPassStats(
              fallbackPass.name,
              fallbackPass.query,
              passDrafts,
              topic,
              getPassStatsMeta(fallbackPass, {
                durationMs: Date.now() - passStartedAt,
              }),
            ),
          );
          rawWebDrafts.push(...passDrafts);
        } catch (error) {
          if (signal?.aborted) {
            throw error;
          }

          passStats.push(
            createFailedPassStats(
              fallbackPass.name,
              fallbackPass.query,
              Date.now() - passStartedAt,
              getSearchPassErrorType(error, Date.now() - passStartedAt, effectivePassTimeoutMs),
              isSearchPassTimeout(getSearchPassErrorType(error, Date.now() - passStartedAt, effectivePassTimeoutMs)),
              getPassStatsMeta(fallbackPass),
            ),
          );
        } finally {
          passAbort.clear();
        }
      }
    }

    rawCandidateCount = rawWebDrafts.length;
    const deduped = dedupeSearchResults(rawWebDrafts);
    let uniqueCandidateCount = deduped.items.length;

    webDrafts = deduped.items.slice(0, modeConfig.candidateLimit);
    dedupeStats = deduped.stats;

    let preflightPack = normalizeEvidencePack(
      {
        enabled: webDrafts.length > 0,
        items: webDrafts,
      },
      {
        maxItems: modeConfig.finalLimit,
        topic,
      },
    );

    const lowQualityFallbackReason = getLowQualityFallbackReason({
      pack: preflightPack,
      rawCandidateCount: rawWebDrafts.length,
      targetCandidateCount: modeConfig.candidateLimit,
      uniqueCandidateCount,
    });

    if (lowQualityFallbackReason) {
      lowQualityFallbackTriggered = true;
      fallbackTriggeredReason ??= lowQualityFallbackReason;
      const lowQualityFallbackQueries =
        buildTopicAnalysisZeroResultFallbackQueries(topicAnalysis);
      fallbackQueries.push(...lowQualityFallbackQueries);
      const fallbackPasses = buildTopicAnalysisFallbackSearchPasses(
        topicAnalysis,
        lowQualityFallbackQueries,
      );
      const fallbackDrafts: TavilyEvidenceDraft[] = [];

      for (const fallbackPass of fallbackPasses) {
        const prepared = prepareSearchPassForExecution(
          fallbackPass,
          topicAnalysis,
        );

        if (!prepared.pass) {
          skippedPasses.push(fallbackPass.name);
          skippedPassReasons[fallbackPass.name] = prepared.reason;
          passStats.push(createSkippedPassStats(prepared.originalPass, prepared.reason));
          continue;
        }

        const searchPass = prepared.pass;
        const remainingTimeoutMs = getRemainingTimeoutMs(
          overallStartedAt,
          overallTimeoutMs,
        );
        const effectivePassTimeoutMs = Math.min(
          passTimeoutMs,
          remainingTimeoutMs,
        );

        if (effectivePassTimeoutMs <= 0) {
          passStats.push(
            createFailedPassStats(
              searchPass.name,
              searchPass.query,
              0,
              "evidence_overall_timeout",
              true,
              getPassStatsMeta(searchPass),
            ),
          );
          break;
        }

        searchQueries.push(searchPass.query);
        relaxedQueryCount += 1;
        const passStartedAt = Date.now();
        const passAbort = createTimedAbortSignal(signal, effectivePassTimeoutMs);

        try {
          const response = await searchWithConfiguredProvider({
            chunksPerSource: searchPass.chunksPerSource,
            country: searchPass.country,
            excludeDomains: searchPass.excludeDomains,
            freshness: searchPass.freshness,
            includeDomains: searchPass.includeDomains,
            includeRawContent: searchPass.includeRawContent,
            maxResults: maxResultsPerQuery,
            provider: searchProvider,
            query: searchPass.query,
            searchDepth: searchPass.searchDepth,
            searchRegion,
            searchTopic: searchPass.searchTopic,
            searcher,
            signal: passAbort.signal,
            timeRange: searchPass.timeRange,
            topic,
          });
          cacheEvents.push(...(response.cacheEvents ?? []));
          providerDiagnostics.push(createProviderDiagnostic(response));
          const passDrafts = response.results.map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content ?? result.snippet ?? "",
            publishedAt: result.publishedDate,
            providerScore: result.providerScore,
            query: searchPass.query,
            seenInPasses: [searchPass.name],
          }));

          if (passDrafts.length === 0) {
            providerReturnedZeroCount += 1;
          }

          passStats.push(
            createPassStats(
              searchPass.name,
              searchPass.query,
              passDrafts,
              topic,
              getPassStatsMeta(searchPass, {
                durationMs: Date.now() - passStartedAt,
              }),
            ),
          );
          fallbackDrafts.push(...passDrafts);
        } catch (error) {
          if (signal?.aborted) {
            throw error;
          }

          const durationMs = Date.now() - passStartedAt;
          const errorType = getSearchPassErrorType(
            error,
            durationMs,
            effectivePassTimeoutMs,
          );

          passStats.push(
            createFailedPassStats(
              searchPass.name,
              searchPass.query,
              durationMs,
              errorType,
              isSearchPassTimeout(errorType),
              getPassStatsMeta(searchPass),
            ),
          );
          providerDiagnostics.push(
            createFailedProviderDiagnostic(searchProvider, error, errorType),
          );
        } finally {
          passAbort.clear();
        }
      }

      if (fallbackDrafts.length > 0) {
        const fallbackDeduped = dedupeSearchResults([
          ...webDrafts,
          ...fallbackDrafts,
        ]);

        webDrafts = fallbackDeduped.items.slice(0, modeConfig.candidateLimit);
        uniqueCandidateCount = fallbackDeduped.items.length;
        dedupeStats = mergeDedupeStats(dedupeStats, fallbackDeduped.stats);
        preflightPack = normalizeEvidencePack(
          {
            enabled: webDrafts.length > 0,
            items: webDrafts,
          },
          {
            maxItems: modeConfig.finalLimit,
            topic,
          },
        );
      }
    }

    if (shouldRunTargetedSearchRetry(preflightPack)) {
      targetedSearchRetryTriggered = true;
      targetedSearchRetryReason = "social_video_ratio_above_threshold";
      const targetedQueries = buildTargetedRetryQueries(topic);
      const targetedDrafts: TavilyEvidenceDraft[] = [];

      for (const query of targetedQueries) {
        activeSearchPassName = "targeted_retry";
        searchQueries.push(query);
        const passStartedAt = Date.now();
        const remainingTimeoutMs = getRemainingTimeoutMs(
          overallStartedAt,
          overallTimeoutMs,
        );
        const effectivePassTimeoutMs = Math.min(
          passTimeoutMs,
          remainingTimeoutMs,
        );

        if (effectivePassTimeoutMs <= 0) {
          passStats.push(
            createFailedPassStats(
              "targeted_retry",
              query,
              Date.now() - passStartedAt,
              "evidence_overall_timeout",
              true,
            ),
          );
          activeSearchPassName = undefined;
          break;
        }

        const passAbort = createTimedAbortSignal(signal, effectivePassTimeoutMs);

        try {
          const response = await searchWithConfiguredProvider({
            chunksPerSource: 3,
            excludeDomains: SOCIAL_VIDEO_DOMAINS,
            freshness: "latest",
            includeDomains: [
              ...TRUSTED_MEDIA_DOMAINS,
              ...INDUSTRY_REPORT_DOMAINS,
            ],
            includeRawContent: "text",
            maxResults: Math.max(2, Math.ceil(modeConfig.extractLimit / 3)),
            provider: searchProvider,
            query,
            searchDepth: "advanced",
            searchRegion,
            searchTopic: "news",
            searcher,
            signal: passAbort.signal,
            timeRange: "month",
            topic,
          });
          cacheEvents.push(...(response.cacheEvents ?? []));
          providerDiagnostics.push(createProviderDiagnostic(response));
          const queryDrafts = response.results.map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content ?? result.snippet ?? "",
            publishedAt: result.publishedDate,
            providerScore: result.providerScore,
            query,
            seenInPasses: ["targeted_retry"],
          }));

          targetedDrafts.push(...queryDrafts);
          passStats.push(
            createPassStats("targeted_retry", query, queryDrafts, topic, {
              durationMs: Date.now() - passStartedAt,
            }),
          );
        } catch (error) {
          if (signal?.aborted) {
            throw error;
          }

          const durationMs = Date.now() - passStartedAt;
          const errorType = getSearchPassErrorType(
            error,
            durationMs,
            effectivePassTimeoutMs,
          );

          passStats.push(
            createFailedPassStats(
              "targeted_retry",
              query,
              durationMs,
              errorType,
              isSearchPassTimeout(errorType),
            ),
          );
          providerDiagnostics.push(
            createFailedProviderDiagnostic(searchProvider, error, errorType),
          );
          logSearchPassFailure({
            durationMs,
            errorType,
            passName: "targeted_retry",
            provider: searchProvider.id,
            query,
            timeoutMs: effectivePassTimeoutMs,
          });
        } finally {
          passAbort.clear();
          activeSearchPassName = undefined;
        }
      }
      const targetedDeduped = dedupeSearchResults([
        ...webDrafts,
        ...targetedDrafts,
      ]);

      webDrafts = targetedDeduped.items.slice(0, modeConfig.candidateLimit);
      uniqueCandidateCount = targetedDeduped.items.length;
      dedupeStats = mergeDedupeStats(dedupeStats, targetedDeduped.stats);
      preflightPack = normalizeEvidencePack(
        {
          enabled: webDrafts.length > 0,
          items: webDrafts,
        },
        {
          maxItems: modeConfig.finalLimit,
          topic,
        },
      );
    }

    const rescueDecision = getExtractRescueDecision(preflightPack, searchMode);

    if (rescueDecision.triggered && webDrafts.some((draft) => draft.url)) {
      rescueTriggered = true;
      rescueReason = rescueDecision.reason;
      const rescueCandidates = selectRescueCandidates(
        webDrafts,
        topic,
        modeConfig.extractLimit,
      );
      const fallbackRescueCandidates =
        rescueCandidates.length > 0
          ? rescueCandidates
          : webDrafts
              .filter((draft): draft is TavilyEvidenceDraft & { url: string } =>
                Boolean(draft.url),
              )
              .slice(0, modeConfig.extractLimit);
      const officialRetryUrls = new Set(
        fallbackRescueCandidates
          .filter((candidate) => isOfficialSnippetOnlyDraft(candidate, topic))
          .map((candidate) => candidate.url),
      );

      extractAttempted = fallbackRescueCandidates.length;

      if (fallbackRescueCandidates.length > 0) {
        try {
          const extractResponse = await extractProvider.extract({
            urls: fallbackRescueCandidates.map((candidate) => candidate.url),
            query: getRescueQuery(topic, searchPlan.searchIntents),
            chunksPerSource: modeConfig.chunksPerSource,
            extractDepth: searchMode === "deep" ? "advanced" : "basic",
            signal,
          });
          let extractedDrafts: TavilyEvidenceDraft[] =
            extractResponse.results.map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content,
            query: result.sourceQuery,
            seenInPasses: getSeenInPassesForUrl(
              fallbackRescueCandidates,
              result.url,
            ),
          }));
          const extractedByUrl = new Map(
            extractedDrafts.map((draft) => [
              getCanonicalSearchUrl(draft.url),
              draft,
            ]),
          );

          for (const candidate of fallbackRescueCandidates) {
            const extracted = extractedByUrl.get(
              getCanonicalSearchUrl(candidate.url),
            );

            extractAttempts.push({
              url: candidate.url,
              provider: extractResponse.provider,
              passName: getPrimarySeenInPass(candidate),
              returnedTextLength: extracted?.snippet.trim().length ?? 0,
              success: (extracted?.snippet.trim().length ?? 0) >= 800,
              ...(!(extracted?.snippet.trim())
                ? { errorType: "empty_extract_result" }
                : {}),
            });
          }

          const fallbackExtractedDrafts =
            shouldUseHtmlExtractFallback
              ? await extractFallbackDraftsForCandidates({
                  candidates: fallbackRescueCandidates,
                  currentDrafts: extractedDrafts,
                  extractAttempts,
                  signal,
                })
              : [];

          extractedDrafts = [...extractedDrafts, ...fallbackExtractedDrafts];

          extractedCandidateCount = extractedDrafts.length;
          extractSucceededCount = Math.min(
            fallbackRescueCandidates.length,
            extractedDrafts.filter((draft) => draft.snippet.trim().length >= 800)
              .length,
          );
          officialExtractFailed =
            officialRetryUrls.size > 0 &&
            !extractedDrafts.some(
              (draft) =>
                officialRetryUrls.has(draft.url ?? "") &&
                draft.snippet.trim().length >= 800,
            );
          if (officialExtractFailed) {
            extractErrorType = "empty_official_extract";
          }

          const rescuedDeduped = dedupeSearchResults([
            ...webDrafts,
            ...extractedDrafts,
          ]);

          webDrafts = rescuedDeduped.items.slice(0, modeConfig.candidateLimit);
          uniqueCandidateCount = rescuedDeduped.items.length;
          dedupeStats = mergeDedupeStats(dedupeStats, rescuedDeduped.stats);
          providerDiagnostics.push({
            provider: extractResponse.provider,
            displayName: extractProvider.displayName,
            ...(extractResponse.diagnostics
              ? { diagnostics: extractResponse.diagnostics }
              : {}),
            ...(extractResponse.rawStats ? { rawStats: extractResponse.rawStats } : {}),
          });
          recordExtractedCountsByPass(passStats, extractedDrafts);
        } catch (error) {
          extractErrorType = getExtractErrorType(error);
          rescueReason = `extract_failed:${extractErrorType}`;
          extractAttempts.push(
            ...fallbackRescueCandidates.map((candidate) => ({
              url: candidate.url,
              provider: extractProvider.id,
              passName: getPrimarySeenInPass(candidate),
              returnedTextLength: 0,
              success: false,
              errorType: extractErrorType,
              errorMessageSafe: getSafeExtractErrorMessage(error),
            })),
          );
          const fallbackExtractedDrafts =
            shouldUseHtmlExtractFallback
              ? await extractFallbackDraftsForCandidates({
                  candidates: fallbackRescueCandidates,
                  currentDrafts: [],
                  extractAttempts,
                  signal,
                })
              : [];

          extractedCandidateCount = fallbackExtractedDrafts.length;
          extractSucceededCount = Math.min(
            fallbackRescueCandidates.length,
            fallbackExtractedDrafts.filter(
              (draft) => draft.snippet.trim().length >= 800,
            ).length,
          );
          officialExtractFailed =
            officialRetryUrls.size > 0 &&
            !fallbackExtractedDrafts.some(
              (draft) =>
                officialRetryUrls.has(draft.url ?? "") &&
                draft.snippet.trim().length >= 800,
            );

          if (fallbackExtractedDrafts.length > 0) {
            const rescuedDeduped = dedupeSearchResults([
              ...webDrafts,
              ...fallbackExtractedDrafts,
            ]);

            webDrafts = rescuedDeduped.items.slice(0, modeConfig.candidateLimit);
            uniqueCandidateCount = rescuedDeduped.items.length;
            dedupeStats = mergeDedupeStats(dedupeStats, rescuedDeduped.stats);
            providerDiagnostics.push({
              provider: "html_fetch",
              displayName: "HTML fetch fallback",
              diagnostics: {
                requestedUrlCount: fallbackRescueCandidates.length,
                resultCount: fallbackExtractedDrafts.length,
              },
            });
            recordExtractedCountsByPass(passStats, fallbackExtractedDrafts);
          }
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    const failureReason = getTavilyFailureReason(error);
    const failureDiagnostics =
      error instanceof TavilySearchError && error.diagnostics
        ? [
            ...providerDiagnostics,
            {
              provider: "tavily",
              diagnostics: error.diagnostics as unknown as Record<string, unknown>,
            },
          ]
        : providerDiagnostics;

    return normalizeEvidencePack(
      {
        enabled: true,
        evidenceStatus: "none",
        evidenceWarnings: [
          ...(baseEvidencePack?.evidenceWarnings ?? []),
          "Tavily search failed; the meeting should treat real-time facts as manually unverified.",
        ],
        items: baseItems,
        searchProcess: createSearchFailureProcess({
          cacheEvents,
          dedupeStats,
          executedQueries: searchQueries,
          failureReason,
          provider: searchProvider.id,
          providerDiagnostics: failureDiagnostics,
          searchIntents: searchPlan.searchIntents,
          queryPlans: searchPlan.queryPlans,
          intentDecisions: searchPlan.intentDecisions,
          searchStrategy: "multi_pass",
          topicAnalysis,
          failedStage: "search_pass",
          failedPassName: activeSearchPassName,
          passStats,
          skippedPasses,
          retryCount: 0,
          warnings: [failureReason],
        }),
        searchQueries,
        strategy: baseEvidencePack?.strategy ?? "text_pack",
      },
      {
        topic,
      },
    );
  }
  const finalWebDrafts = limitPublicOpinionDrafts(webDrafts, topic);
  const preflightPack = normalizeEvidencePack(
    {
      enabled: baseItems.length > 0 || finalWebDrafts.length > 0,
      items: [...baseItems, ...finalWebDrafts],
    },
    {
      maxItems: modeConfig.finalLimit,
      topic,
    },
  );
  const evidenceStatus =
    preflightPack.evidenceStatus ??
    (preflightPack.items.length > 0 ? "low" : "none");
  const evidenceWarnings = [
    ...(baseEvidencePack?.evidenceWarnings ?? []),
    ...getEvidenceWarnings(evidenceStatus, webDrafts.length),
  ];
  const searchProcessWarnings = [
    ...(zeroResultFallbackTriggered ? ["searchNoResults"] : []),
    ...(lowQualityFallbackTriggered ? ["searchLowQuality"] : []),
    ...(passStats.some((stat) => stat.queryQuality?.ok === false)
      ? ["searchQueryPoor"]
      : []),
  ];

  return normalizeEvidencePack(
    {
      enabled: true,
      evidenceStatus,
      evidenceWarnings,
      items: [...baseItems, ...finalWebDrafts],
      searchProcess: {
        cacheEvents,
        dedupeStats,
        dedupedCandidateCount: webDrafts.length,
        rawCandidateTarget: modeConfig.candidateLimit,
        uniqueCandidateCount: webDrafts.length,
        selectedEvidenceTarget: modeConfig.finalLimit,
        selectedEvidenceCount: preflightPack.items.length,
        candidateShortfall: Math.max(0, modeConfig.candidateLimit - webDrafts.length),
        retrievalPassCount: countRetrievalPasses(passStats),
        ...(fallbackTriggeredReason ? { fallbackTriggeredReason } : {}),
        evidenceMode:
          rescueTriggered && extractSucceededCount > 0
            ? "rescued_evidence"
            : undefined,
        executedQueries: searchQueries,
        extractAttempted,
        extractErrorType,
        extractAttempts,
        extractedCandidateCount,
        extractSucceededCount,
        finalEvidenceCount: preflightPack.items.length,
        qualityDistribution: getQualityDistribution(preflightPack.items),
        rawCandidateCount,
        rescueReason,
        rescueTriggered,
        officialExtractFailed,
        searchStrategy: "multi_pass",
        topicAnalysis,
        passStats,
        skippedPasses,
        skippedPassReasons,
        targetedSearchRetryTriggered,
        targetedSearchRetryReason,
        searchMode,
        searchIntents: searchPlan.searchIntents,
        queryPlans: searchPlan.queryPlans,
        intentDecisions: searchPlan.intentDecisions,
        provider: searchProvider.id,
        providerDiagnostics,
        zeroResultFallbackTriggered,
        fallbackQueries,
        providerReturnedZeroCount,
        relaxedQueryCount,
        effectiveSearchRegion: regionResolution.resolvedRegion,
        effectiveCountry: getEffectiveCountryForRegion(regionResolution.resolvedRegion),
        searchRegionSource: regionResolution.regionSource,
        regionFallbackReason: regionResolution.regionFallbackReason,
        requestedSearchRegion: searchPreferences?.searchRegion ?? "auto",
        warnings: searchProcessWarnings,
      },
      searchQueries,
      strategy: baseEvidencePack?.strategy ?? "text_pack",
    },
    {
      maxItems: modeConfig.finalLimit,
      topic,
    },
  );
}

async function searchWithConfiguredProvider(input: {
  chunksPerSource?: number;
  country?: string;
  excludeDomains?: string[];
  freshness: SearchFreshness;
  includeDomains?: string[];
  includeRawContent?: boolean | "markdown" | "text";
  maxResults: number;
  provider: SearchProvider;
  query: string;
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  searchRegion?: import("../types").SearchRegion;
  searchTopic?: "general" | "news" | "finance";
  searcher?: Searcher;
  signal?: AbortSignal;
  timeRange?: "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";
  topic: string;
}): Promise<SearchProviderResponse> {
  if (input.searcher) {
    const cacheEvents: SearchCacheEvent[] = [];
    const drafts = await input.searcher(input.query, {
      freshness: input.freshness,
      maxResults: input.maxResults,
      onCacheEvent: (event) => cacheEvents.push(event),
      signal: input.signal,
    });

    return {
      provider: input.provider.id,
      results: drafts.map((draft) => ({
        title: draft.title,
        ...(draft.url ? { url: draft.url } : {}),
        content: draft.snippet,
        snippet: draft.snippet,
        ...(draft.publishedAt ? { publishedDate: draft.publishedAt } : {}),
        ...(typeof draft.providerScore === "number"
          ? { providerScore: draft.providerScore }
          : {}),
        sourceQuery: input.query,
        provider: input.provider.id,
      })),
      ...(cacheEvents.length > 0 ? { cacheEvents } : {}),
      diagnostics: {
        adapter: "legacy_searcher",
        resultCount: drafts.length,
      },
    };
  }

  return input.provider.search({
    chunksPerSource: input.chunksPerSource,
    country: input.country,
    excludeDomains: input.excludeDomains,
    freshness: input.freshness,
    includeDomains: input.includeDomains,
    includeRawContent: input.includeRawContent,
    includeUsage: true,
    maxResults: input.maxResults,
    query: input.query,
    searchDepth: input.searchDepth ?? "basic",
    searchRegion: input.searchRegion,
    searchTopic: input.searchTopic,
    signal: input.signal,
    timeRange: input.timeRange,
    topic: input.topic,
  });
}

function buildGeneralWebPass(
  topicAnalysis: TopicAnalysis,
  fallbackQuery: string,
  queryLevel: SearchQueryLevel,
): SearchPassSpec {
  const query =
    selectBestTopicAnalysisQuery(topicAnalysis, fallbackQuery) ??
    buildQueryFromTopicAnalysisParts(topicAnalysis, fallbackQuery);
  const pass: SearchPassSpec = {
    name: "general_web",
    query,
    freshness: topicAnalysis.freshnessRequirement ?? "recent",
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange(topicAnalysis.freshnessRequirement ?? "recent"),
  };

  annotateSearchPass(pass, queryLevel, "topic_analysis", topicAnalysis);

  return pass;
}

function selectBestTopicAnalysisQuery(
  topicAnalysis: TopicAnalysis,
  fallbackQuery: string,
): string | undefined {
  const candidates = [
    ...topicAnalysis.searchQueries,
    buildQueryFromTopicAnalysisParts(topicAnalysis, fallbackQuery),
    fallbackQuery,
  ]
    .map((query) => normalizeSearchQueryTerms(query, topicAnalysis))
    .filter(Boolean);
  const ranked = candidates
    .map((query) => ({
      query,
      quality: evaluateSearchQueryQuality(query, topicAnalysis),
    }))
    .filter((candidate) => candidate.quality.ok)
    .sort((left, right) => {
      const leftScore =
        scoreSearchQueryCandidate(left.query, left.quality) +
        scoreTopicAnalysisQueryCoverage(left.query, topicAnalysis);
      const rightScore =
        scoreSearchQueryCandidate(right.query, right.quality) +
        scoreTopicAnalysisQueryCoverage(right.query, topicAnalysis);

      return rightScore - leftScore;
    });

  return ranked[0]?.query;
}

function scoreTopicAnalysisQueryCoverage(
  query: string,
  topicAnalysis: TopicAnalysis,
): number {
  const normalized = query.toLowerCase();

  return topicAnalysis.evidenceNeeds.reduce((score, need) => {
    const terms = splitSearchPhrases(formatDimensionSearchTerm(need.dimension))
      .map((term) => term.toLowerCase())
      .filter((term) => term.length >= 3);
    const hasTerm = terms.some((term) => normalized.includes(term));

    return score + (hasTerm ? 12 : 0);
  }, 0);
}

function scoreSearchQueryCandidate(
  query: string,
  quality: SearchQueryQuality,
): number {
  const lengthPenalty = Math.max(0, query.length - 120) * 0.2;

  return (
    (quality.hasEntity ? 40 : 0) +
    (quality.hasScenarioOrEvidenceNeed ? 35 : 0) +
    Math.min(quality.tokenCount, 10) * 3 -
    quality.duplicateRatio * 40 -
    lengthPenalty
  );
}

function buildQueryFromTopicAnalysisParts(
  topicAnalysis: TopicAnalysis,
  fallbackQuery: string,
): string {
  const dimensions = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .filter(Boolean)
    .slice(0, topicAnalysis.topicType === "entity_competition" ? 5 : 3);
  const parts = [
    ...topicAnalysis.targetEntities.slice(0, 5),
    ...topicAnalysis.targetScenarios.slice(0, 3),
    ...dimensions,
  ];
  const query = normalizeSearchQueryTerms(parts.join(" "), topicAnalysis);

  if (getMeaningfulTokenCount(query) >= 2) {
    return query;
  }

  return normalizeSearchQueryTerms(fallbackQuery, topicAnalysis);
}

function normalizeSearchQueryTerms(
  query: string,
  topicAnalysis: TopicAnalysis,
): string {
  const terms = splitSearchPhrases(query)
    .map((term) => stripSearchTermPunctuation(term))
    .filter(Boolean)
    .filter((term) => !isLowValueSearchTerm(term))
    .filter((term) => !isResidualEntityFragment(term, topicAnalysis));

  return trimQueryToLength(dedupeQueryParts(terms).join(" "));
}

function annotateSearchPass(
  pass: SearchPassSpec,
  queryLevel: SearchQueryLevel,
  derivedFrom: string,
  topicAnalysis: TopicAnalysis,
) {
  pass.queryLevel = queryLevel;
  pass.derivedFrom = derivedFrom;
  pass.queryQuality = evaluateSearchQueryQuality(pass.query, topicAnalysis);
}

function evaluateSearchQueryQuality(
  query: string,
  topicAnalysis: TopicAnalysis,
): SearchQueryQuality {
  const tokens = splitSearchPhrases(query)
    .map(stripSearchTermPunctuation)
    .filter(Boolean);
  const normalizedQuery = query.toLowerCase();
  const uniqueTokens = new Set(tokens.map((token) => token.toLowerCase()));
  const duplicateRatio =
    tokens.length === 0 ? 1 : 1 - uniqueTokens.size / tokens.length;
  const hasResidualFragment = tokens.some((token) =>
    isResidualEntityFragment(token, topicAnalysis),
  );
  const sourceNameTokenCount = tokens.filter((token) =>
    SOURCE_NAME_QUERY_TERMS.has(token.toLowerCase()),
  ).length;
  const onlySourceNames =
    tokens.length > 0 && sourceNameTokenCount === tokens.length;
  const hasEntity = topicAnalysis.targetEntities.some((entity) =>
    normalizedQuery.includes(entity.toLowerCase()),
  );
  const scenarioTerms = topicAnalysis.targetScenarios.map((scenario) =>
    scenario.toLowerCase(),
  );
  const evidenceTerms = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .flatMap(splitSearchPhrases)
    .map((term) => term.toLowerCase());
  const hasScenarioOrEvidenceNeed = [...scenarioTerms, ...evidenceTerms].some(
    (term) => term.length >= 2 && normalizedQuery.includes(term),
  );
  const topicAnchorTokens = splitSearchPhrases(topicAnalysis.cleanedTopic)
    .filter((token) => !isLowValueSearchTerm(token))
    .map((token) => token.toLowerCase());
  const hasTopicAnchor = topicAnchorTokens.some((token) =>
    normalizedQuery.includes(token),
  );
  const lacksAnalyzerAnchor =
    !topicAnalysis.cleanedTopic &&
    topicAnalysis.targetEntities.length === 0 &&
    topicAnalysis.targetScenarios.length === 0;
  const ok =
    !lacksAnalyzerAnchor &&
    tokens.length >= 2 &&
    query.length <= MAX_TAVILY_QUERY_LENGTH &&
    duplicateRatio <= 0.55 &&
    !hasResidualFragment &&
    !onlySourceNames &&
    (hasEntity || hasScenarioOrEvidenceNeed || hasTopicAnchor);
  const reason = ok
    ? undefined
    : lacksAnalyzerAnchor
      ? "missing_topic_anchor"
      : tokens.length < 2
        ? "too_few_meaningful_tokens"
        : query.length > MAX_TAVILY_QUERY_LENGTH
          ? "query_too_long"
        : duplicateRatio > 0.55
          ? "duplicate_terms"
          : hasResidualFragment
            ? "residual_entity_fragment"
            : onlySourceNames
              ? "source_names_only"
              : "missing_entity_or_scenario_anchor";

  return {
    ok,
    ...(reason ? { reason } : {}),
    hasEntity,
    hasScenarioOrEvidenceNeed,
    tokenCount: tokens.length,
    duplicateRatio: Number(duplicateRatio.toFixed(3)),
  };
}

function buildSearchPasses(
  topic: string,
  plannedQueries: string[],
  topicAnalysis: TopicAnalysis = analyzeTopicForEvidence(topic),
): SearchPassSpec[] {
  if (topicAnalysis.topicType === "entity_competition") {
    return buildEntityCompetitionSearchPasses(
      topic,
      topicAnalysis,
      plannedQueries,
    );
  }

  const rawBaseQuery =
    plannedQueries.find(Boolean) ?? topicAnalysis.searchQueries.find(Boolean) ?? topic;
  const baseQuery =
    selectBestTopicAnalysisQuery(topicAnalysis, rawBaseQuery) ??
    buildQueryFromTopicAnalysisParts(topicAnalysis, rawBaseQuery);
  const plannedQueryContext = normalizeSearchQueryTerms(
    plannedQueries.slice(0, 2).join(" "),
    topicAnalysis,
  );
  const isChinese = isPrimaryChineseTopic(topic);
  const localizedPasses = buildLocalizedMediaPasses(topic, topicAnalysis);
  const generalWebPass = buildGeneralWebPass(topicAnalysis, baseQuery, "precise");

  const officialPass: SearchPassSpec = {
    name: "official",
    query: isChinese
      ? trimQueryToLength(`${plannedQueryContext} ${baseQuery} 官方 发布 公告`)
      : trimQueryToLength(
          `${baseQuery} official statement official blog official docs announcement report ${plannedQueryContext}`,
        ),
    freshness: "latest",
    includeDomains: buildOfficialDomainCandidates(topic),
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("latest"),
  };
  if (isChinese) {
    officialPass.query = trimQueryToLength(
      `${plannedQueryContext} ${baseQuery} 官方 发布 公告`,
    );
  }

  if (isChinese) {
    officialPass.query = trimQueryToLength(
      `\u5b98\u65b9 \u53d1\u5e03 \u516c\u544a ${baseQuery} ${plannedQueryContext}`,
    );
  }

  const reputableMediaPass: SearchPassSpec = {
    name: "reputable_media",
    query: trimQueryToLength(
      `${baseQuery} independent analysis market report user feedback ${plannedQueryContext}`,
    ),
    freshness: "latest",
    includeDomains: TRUSTED_MEDIA_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "news",
    timeRange: getTavilyTimeRange("latest"),
  };

  const industryReportPass: SearchPassSpec = {
    name: "industry_report",
    query: trimQueryToLength(
      `${baseQuery} benchmark evaluation industry report technical analysis`,
    ),
    freshness: "recent",
    includeDomains: INDUSTRY_REPORT_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };

  const socialCluePass: SearchPassSpec = {
    name: "social_clue",
    query: trimQueryToLength(
      `${baseQuery} user feedback discussion community sentiment`,
    ),
    freshness: "recent",
    includeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "fast",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };
  annotateSearchPass(officialPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(reputableMediaPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(industryReportPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(socialCluePass, "scenario", "topic_analysis", topicAnalysis);
  for (const localizedPass of localizedPasses) {
    annotateSearchPass(localizedPass, "scenario", "topic_analysis", topicAnalysis);
  }

  if (isChinese) {
    return [
      generalWebPass,
      ...localizedPasses,
      officialPass,
      reputableMediaPass,
      industryReportPass,
      socialCluePass,
    ];
  }

  return [
    generalWebPass,
    officialPass,
    ...localizedPasses,
    reputableMediaPass,
    industryReportPass,
    socialCluePass,
  ];
}

function selectSearchPassesForExecution(
  passes: SearchPassSpec[],
  topicAnalysis: TopicAnalysis,
): {
  selected: SearchPassSpec[];
  skipped: { pass: SearchPassSpec; reason: string }[];
} {
  const skipped: { pass: SearchPassSpec; reason: string }[] = [];
  const executable: SearchPassSpec[] = [];

  for (const pass of passes) {
    const prepared = prepareSearchPassForExecution(pass, topicAnalysis);

    if (prepared.pass) {
      executable.push(prepared.pass);
    } else {
      skipped.push({ pass: prepared.originalPass, reason: prepared.reason });
    }
  }

  const general = executable.find((pass) => pass.name === "general_web");
  const orderedOthers = executable
    .filter((pass) => pass !== general)
    .sort((left, right) => {
      const priorityDelta =
        getSearchPassExecutionPriority(left, topicAnalysis) -
        getSearchPassExecutionPriority(right, topicAnalysis);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return (
        scoreSearchQueryCandidate(right.query, right.queryQuality ?? evaluateSearchQueryQuality(right.query, topicAnalysis)) -
        scoreSearchQueryCandidate(left.query, left.queryQuality ?? evaluateSearchQueryQuality(left.query, topicAnalysis))
      );
    });
  const selected = [...(general ? [general] : []), ...orderedOthers];
  const selectedKeys = new Set(selected.map((pass) => getSearchPassInstanceKey(pass)));

  for (const pass of executable) {
    if (!selectedKeys.has(getSearchPassInstanceKey(pass))) {
      skipped.push({
        pass,
        reason: "dynamic_pass_limit",
      });
    }
  }

  return { selected, skipped };
}

function prepareSearchPassForExecution(
  pass: SearchPassSpec,
  topicAnalysis: TopicAnalysis,
): { originalPass: SearchPassSpec; pass?: SearchPassSpec; reason: string } {
  const quality = pass.queryQuality ?? evaluateSearchQueryQuality(pass.query, topicAnalysis);

  if (quality.ok) {
    return {
      originalPass: pass,
      pass: {
        ...pass,
        queryQuality: quality,
      },
      reason: "ready",
    };
  }

  const rebuiltQuery = rebuildSearchPassQuery(pass, topicAnalysis);
  const rebuiltQuality = evaluateSearchQueryQuality(rebuiltQuery, topicAnalysis);

  if (rebuiltQuery && rebuiltQuality.ok) {
    return {
      originalPass: pass,
      pass: {
        ...pass,
        query: rebuiltQuery,
        queryQuality: rebuiltQuality,
        derivedFrom: `${pass.derivedFrom ?? "topic_analysis"}:rebuilt`,
      },
      reason: "rebuilt",
    };
  }

  return {
    originalPass: {
      ...pass,
      queryQuality: quality,
    },
    reason: "query_quality_gate",
  };
}

function rebuildSearchPassQuery(
  pass: SearchPassSpec,
  topicAnalysis: TopicAnalysis,
): string {
  const base = buildQueryFromTopicAnalysisParts(topicAnalysis, pass.query);

  if (pass.name === "official") {
    if (/[\p{Script=Han}]/u.test(topicAnalysis.cleanedTopic)) {
      return normalizeSearchQueryTerms(`${base} 官方 发布 公告`, topicAnalysis);
    }

    return normalizeSearchQueryTerms(`${base} official statement announcement`, topicAnalysis);
  }

  if (pass.name === "reputable_media") {
    return normalizeSearchQueryTerms(`${base} independent analysis report`, topicAnalysis);
  }

  if (pass.name === "industry_report") {
    return normalizeSearchQueryTerms(`${base} benchmark evaluation industry report`, topicAnalysis);
  }

  if (pass.name === "social_clue") {
    return normalizeSearchQueryTerms(`${base} user feedback discussion`, topicAnalysis);
  }

  return base;
}

function getSearchPassExecutionPriority(
  pass: SearchPassSpec,
  topicAnalysis: TopicAnalysis,
): number {
  if (pass.name === "general_web") return 0;
  if (pass.name === "localized_media") return 10;

  const dimensions = new Set(topicAnalysis.evidenceNeeds.map((need) => need.dimension));

  if (pass.name === "official") {
    if (
      topicAnalysis.topicType === "policy_regulation" ||
      topicAnalysis.topicType === "product_release_analysis" ||
      dimensions.has("official_position") ||
      dimensions.has("business_revenue") ||
      dimensions.has("enterprise_adoption") ||
      dimensions.has("funding_capital") ||
      dimensions.has("market_analysis")
    ) {
      return 12;
    }

    return 25;
  }

  if (pass.name === "industry_report") {
    if (
      dimensions.has("technical_capability") ||
      dimensions.has("benchmark_evaluation") ||
      topicAnalysis.topicType === "capability_comparison" ||
      topicAnalysis.topicType === "technical_research_analysis"
    ) {
      return 15;
    }

    return 35;
  }

  if (pass.name === "reputable_media") {
    if (
      dimensions.has("business_revenue") ||
      dimensions.has("enterprise_adoption") ||
      dimensions.has("funding_capital") ||
      dimensions.has("market_analysis") ||
      topicAnalysis.timeSensitivity !== "low"
    ) {
      return 18;
    }

    return 30;
  }

  if (pass.name === "social_clue") {
    return dimensions.has("user_feedback") ? 22 : 50;
  }

  return 40;
}

function getSearchPassInstanceKey(pass: SearchPassSpec): string {
  return `${pass.name}:${pass.query}`;
}

function buildEntityCompetitionSearchPasses(
  topic: string,
  topicAnalysis: TopicAnalysis = analyzeTopicForEvidence(topic),
  plannedQueries: string[] = [],
): SearchPassSpec[] {
  const isChinese = isPrimaryChineseTopic(topic);
  const localizedPasses = buildLocalizedMediaPasses(topic, topicAnalysis);
  const rawBaseQuery =
    topicAnalysis.searchQueries.find(Boolean) ?? plannedQueries.find(Boolean) ?? topic;
  const baseQuery =
    selectBestTopicAnalysisQuery(topicAnalysis, rawBaseQuery) ??
    buildQueryFromTopicAnalysisParts(topicAnalysis, rawBaseQuery);
  const generalWebPass = buildGeneralWebPass(topicAnalysis, baseQuery, "precise");
  const needsQuery = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");

  const officialPass: SearchPassSpec = {
    name: "official",
    query: isChinese
      ? trimQueryToLength(`${baseQuery} 官方 ${needsQuery}`)
      : trimQueryToLength(
          `${baseQuery} official statement ${needsQuery}`,
        ),
    freshness: "latest",
    includeDomains: buildOfficialDomainCandidates(topic),
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("latest"),
  };
  if (isChinese) {
    officialPass.query = trimQueryToLength(`${baseQuery} 官方 ${needsQuery}`);
  }

  if (isChinese) {
    officialPass.query = trimQueryToLength(
      `\u5b98\u65b9 ${baseQuery} ${needsQuery}`,
    );
  }

  const reputableMediaPass: SearchPassSpec = {
    name: "reputable_media",
    query: trimQueryToLength(
      `${baseQuery} independent analysis market report ${needsQuery}`,
    ),
    freshness: "latest",
    includeDomains: TRUSTED_MEDIA_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "news",
    timeRange: getTavilyTimeRange("latest"),
  };

  const industryReportPass: SearchPassSpec = {
    name: "industry_report",
    query: trimQueryToLength(
      `${baseQuery} industry report benchmark evaluation ${needsQuery}`,
    ),
    freshness: "recent",
    includeDomains: INDUSTRY_REPORT_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };

  const socialCluePass: SearchPassSpec = {
    name: "social_clue",
    query: trimQueryToLength(
      `${baseQuery} user feedback discussion community sentiment`,
    ),
    freshness: "recent",
    includeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "fast",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };
  annotateSearchPass(officialPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(reputableMediaPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(industryReportPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(socialCluePass, "scenario", "topic_analysis", topicAnalysis);
  for (const localizedPass of localizedPasses) {
    annotateSearchPass(localizedPass, "scenario", "topic_analysis", topicAnalysis);
  }

  if (isChinese) {
    return [
      generalWebPass,
      ...localizedPasses,
      officialPass,
      reputableMediaPass,
      industryReportPass,
      socialCluePass,
    ];
  }

  return [
    generalWebPass,
    officialPass,
    ...localizedPasses,
    reputableMediaPass,
    industryReportPass,
    socialCluePass,
  ];
}

function buildLocalizedMediaPasses(
  topic: string,
  topicAnalysis: TopicAnalysis = analyzeTopicForEvidence(topic),
): SearchPassSpec[] {
  if (!isPrimaryChineseTopic(topic)) {
    return [];
  }

  const evidenceQuery = topicAnalysis.searchQueries.find(Boolean) ?? topic;
  const variants = buildLocalizedQueryVariants(evidenceQuery);
  const queryParts = dedupeQueryParts([
    variants.originalLanguageQuery,
    variants.normalizedOriginalQuery,
    variants.aliasQuery,
    "本地媒体 行业媒体 财经",
  ]);
  const localMediaQuery = trimQueryToLength(queryParts.join(" "));
  const safeLocalizedQuery = localMediaQuery.includes("\u672c\u5730\u5a92\u4f53")
    ? localMediaQuery
    : trimQueryToLength(
        `${localMediaQuery} \u672c\u5730\u5a92\u4f53 \u884c\u4e1a\u5a92\u4f53 \u8d22\u7ecf`,
      );
  const finalLocalizedQuery = trimQueryToLength(
    Array.from(
      new Map(
        safeLocalizedQuery
          .split(/\s+/)
          .filter(Boolean)
          .map((segment) => [segment.toLowerCase(), segment] as const),
      ).values(),
    ).join(" "),
  );

  return [
    {
      name: "localized_media",
      query: finalLocalizedQuery,
      freshness: "latest",
      country: "china",
      includeDomains: LOCALIZED_MEDIA_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("latest"),
    },
  ];
}

function dedupeQueryParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");

    if (seen.has(normalized)) {
      continue;
    }

    const isDuplicate = Array.from(seen).some(
      (existing) =>
        (existing.length >= 4 && normalized.includes(existing)) ||
        (normalized.length >= 4 && existing.includes(normalized)),
    );

    if (isDuplicate) {
      continue;
    }

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

function buildLocalizedQueryVariants(topic: string): {
  originalLanguageQuery: string;
  normalizedOriginalQuery: string;
  translatedQuery: string;
  aliasQuery: string;
  officialSourceQuery: string;
  localMediaQuery: string;
} {
  const normalizedOriginalQuery = normalizeLocalizedQueryText(topic);
  const aliasQuery = buildSymbolAliasQuery(topic);

  return {
    originalLanguageQuery: topic.trim(),
    normalizedOriginalQuery,
    translatedQuery: "",
    aliasQuery,
    officialSourceQuery: trimQueryToLength(`${topic} 官网 官方 公告 声明`),
    localMediaQuery: trimQueryToLength(`${topic} 本地媒体 财经 行业 报道`),
  };
}

function normalizeLocalizedQueryText(topic: string): string {
  return topic
    .normalize("NFKC")
    .replace(/[()（）［］【】「」『』"'“”‘’]/g, " ")
    .replace(/[·•・]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSymbolAliasQuery(topic: string): string {
  const aliases = new Set<string>();
  const normalized = normalizeLocalizedQueryText(topic);

  aliases.add(normalized);
  aliases.add(normalized.replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ""));
  aliases.add(
    normalized
      .replace(/[αΑ]/g, "alpha")
      .replace(/[βΒ]/g, "beta")
      .replace(/[γΓ]/g, "gamma"),
  );

  return Array.from(aliases)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

function isPrimaryChineseTopic(topic: string): boolean {
  const cjkCount = (topic.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinCount = (topic.match(/[a-z]/gi) ?? []).length;

  return cjkCount >= 2 && cjkCount >= latinCount;
}

function buildOfficialDomainCandidates(topic: string): string[] | undefined {
  const matches =
    topic.match(/\b[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,3}\b/g) ?? [];
  const candidates = new Set<string>();

  for (const match of matches) {
    if (/^(AI|API|LLM|GDP|IPO)$/i.test(match.trim())) {
      continue;
    }

    const words = match
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z0-9-]/g, ""))
      .filter((word) => word.length >= 2);

    if (words.length === 0) {
      continue;
    }

    candidates.add(`${words.join("-")}.com`);
    candidates.add(`${words.join("")}.com`);

    if (words.length > 1) {
      candidates.add(`${words[0]}.com`);
    }
  }

  const values = Array.from(candidates).filter(
    (domain) => !SOCIAL_VIDEO_DOMAINS.includes(domain),
  );

  return values.length > 0 ? values.slice(0, 12) : undefined;
}

function getTavilyTimeRange(
  freshness: SearchFreshness,
): SearchPassSpec["timeRange"] | undefined {
  if (freshness === "latest") {
    return "month";
  }

  if (freshness === "recent") {
    return "year";
  }

  return undefined;
}

function createPassStats(
  passName: SearchPassName,
  query: string,
  drafts: TavilyEvidenceDraft[],
  topic: string,
  meta: {
    durationMs?: number;
    queryLevel?: SearchQueryLevel;
    derivedFrom?: string;
    queryQuality?: SearchQueryQuality;
    skippedReason?: string;
  } = {},
): EvidenceSearchPassStats {
  const pack = normalizeEvidencePack(
    {
      enabled: drafts.length > 0,
      items: drafts,
    },
    {
      allowLowReliabilityFallback: true,
      maxItems: drafts.length || 1,
      topic,
    },
  );

  return {
    passName,
    query,
    resultCount: drafts.length,
    extractedCount: 0,
    coreEvidenceCount: pack.enabled
      ? pack.items.filter(isCoreEvidenceCandidate).length
      : 0,
    socialVideoCount: pack.enabled
      ? pack.items.filter(isPublicOpinionEvidenceItem).length
      : 0,
    unknownCount: pack.enabled
      ? pack.items.filter((item) => item.quality?.sourceType === "unknown").length
      : 0,
    ...(meta.durationMs !== undefined
      ? { durationMs: Math.max(0, Math.trunc(meta.durationMs)) }
      : {}),
    ...(meta.queryLevel ? { queryLevel: meta.queryLevel } : {}),
    ...(meta.derivedFrom ? { derivedFrom: meta.derivedFrom } : {}),
    ...(meta.queryQuality ? { queryQuality: meta.queryQuality } : {}),
    ...(meta.skippedReason ? { skippedReason: meta.skippedReason } : {}),
  };
}

function getPassStatsMeta(
  pass: Pick<SearchPassSpec, "queryLevel" | "derivedFrom" | "queryQuality">,
  meta: { durationMs?: number; skippedReason?: string } = {},
) {
  return {
    ...meta,
    ...(pass.queryLevel ? { queryLevel: pass.queryLevel } : {}),
    ...(pass.derivedFrom ? { derivedFrom: pass.derivedFrom } : {}),
    ...(pass.queryQuality ? { queryQuality: pass.queryQuality } : {}),
  };
}

function createFailedPassStats(
  passName: SearchPassName,
  query: string,
  durationMs: number,
  errorType: string,
  timedOut: boolean,
  meta: {
    queryLevel?: SearchQueryLevel;
    derivedFrom?: string;
    queryQuality?: SearchQueryQuality;
    skippedReason?: string;
  } = {},
): EvidenceSearchPassStats {
  return {
    passName,
    query,
    resultCount: 0,
    extractedCount: 0,
    coreEvidenceCount: 0,
    socialVideoCount: 0,
    unknownCount: 0,
    durationMs: Math.max(0, Math.trunc(durationMs)),
    timedOut,
    errorType,
    ...(meta.queryLevel ? { queryLevel: meta.queryLevel } : {}),
    ...(meta.derivedFrom ? { derivedFrom: meta.derivedFrom } : {}),
    ...(meta.queryQuality ? { queryQuality: meta.queryQuality } : {}),
    ...(meta.skippedReason ? { skippedReason: meta.skippedReason } : {}),
  };
}

function createSkippedPassStats(
  pass: SearchPassSpec,
  skippedReason: string,
): EvidenceSearchPassStats {
  return {
    passName: pass.name,
    query: pass.query,
    resultCount: 0,
    extractedCount: 0,
    coreEvidenceCount: 0,
    socialVideoCount: 0,
    unknownCount: 0,
    ...(pass.queryLevel ? { queryLevel: pass.queryLevel } : {}),
    ...(pass.derivedFrom ? { derivedFrom: pass.derivedFrom } : {}),
    ...(pass.queryQuality ? { queryQuality: pass.queryQuality } : {}),
    skippedReason,
  };
}

function isKeySearchPass(passName: SearchPassName) {
  return passName !== "social_clue" && passName !== "targeted_retry";
}

function getSearchPassErrorType(
  error: unknown,
  durationMs: number,
  timeoutMs: number,
) {
  if (
    error instanceof TavilySearchError &&
    (error.status === 504 || error.diagnostics?.isAbortError === true)
  ) {
    return "pass_timeout";
  }

  if (durationMs >= timeoutMs) {
    return "pass_timeout";
  }

  return getTavilyFailureReason(error);
}

function isSearchPassTimeout(errorType: string) {
  return (
    errorType === "pass_timeout" ||
    errorType === "tavily_search_timeout" ||
    errorType === "evidence_overall_timeout"
  );
}

function getExtractErrorType(error: unknown) {
  if (
    error instanceof TavilySearchError &&
    error.diagnostics?.endpoint === "/extract" &&
    (error.status === 504 || error.diagnostics.isAbortError === true)
  ) {
    return "tavily_extract_timeout";
  }

  return getTavilyFailureReason(error);
}

function createFailedProviderDiagnostic(
  provider: SearchProvider,
  error: unknown,
  errorType: string,
): SearchProviderDiagnostic {
  const diagnostics =
    error instanceof TavilySearchError && error.diagnostics
      ? (error.diagnostics as unknown as Record<string, unknown>)
      : {};

  return {
    provider: provider.id,
    displayName: provider.displayName,
    diagnostics: {
      ...diagnostics,
      errorType,
    },
  };
}

function logSearchPassFailure(input: {
  durationMs: number;
  errorType: string;
  passName: string;
  provider: string;
  query: string;
  timeoutMs: number;
}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.error("[evidence-search] search pass failed", {
    passName: input.passName,
    query: input.query,
    durationMs: Math.max(0, Math.trunc(input.durationMs)),
    timeoutMs: Math.max(0, Math.trunc(input.timeoutMs)),
    provider: input.provider,
    errorType: input.errorType,
  });
}

function getEvidenceOverallTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
) {
  return normalizeTimeoutMs(
    env.EVIDENCE_OVERALL_TIMEOUT_MS,
    DEFAULT_EVIDENCE_OVERALL_TIMEOUT_MS,
    300000,
  );
}

function getEvidencePassTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  return normalizeTimeoutMs(
    env.EVIDENCE_PASS_TIMEOUT_MS,
    DEFAULT_EVIDENCE_PASS_TIMEOUT_MS,
    120000,
  );
}

function normalizeTimeoutMs(
  value: string | undefined,
  fallback: number,
  max: number,
) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1000), max);
}

function getRemainingTimeoutMs(startedAt: number, timeoutMs: number) {
  return timeoutMs - (Date.now() - startedAt);
}

function createTimedAbortSignal(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Search pass timed out.", "AbortError"));
  }, timeoutMs);

  return {
    signal: combineAbortSignals(externalSignal, controller.signal),
    clear: () => clearTimeout(timeout),
  };
}

function combineAbortSignals(
  externalSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
) {
  if (!externalSignal) {
    return timeoutSignal;
  }

  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([externalSignal, timeoutSignal]);
  }

  const controller = new AbortController();
  const abort = (signal: AbortSignal) => {
    if (!controller.signal.aborted) {
      controller.abort(signal.reason);
    }
  };

  if (externalSignal.aborted) {
    abort(externalSignal);
  } else if (timeoutSignal.aborted) {
    abort(timeoutSignal);
  } else {
    externalSignal.addEventListener("abort", () => abort(externalSignal), {
      once: true,
    });
    timeoutSignal.addEventListener("abort", () => abort(timeoutSignal), {
      once: true,
    });
  }

  return controller.signal;
}

function isCoreEvidenceCandidate(item: SearchEvidence): boolean {
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

function getSeenInPassesForUrl(
  drafts: TavilyEvidenceDraft[],
  url: string,
): string[] {
  const canonicalUrl = getCanonicalSearchUrl(url);
  const passes = drafts
    .filter((draft) => getCanonicalSearchUrl(draft.url) === canonicalUrl)
    .flatMap((draft) => draft.seenInPasses ?? []);

  return Array.from(new Set(passes));
}

function getPrimarySeenInPass(draft: TavilyEvidenceDraft): string | undefined {
  return draft.seenInPasses?.[0];
}

async function extractFallbackDraftsForCandidates(input: {
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

function getSafeExtractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 180);
  }

  return "unknown extract error";
}

function recordExtractedCountsByPass(
  passStats: EvidenceSearchPassStats[],
  extractedDrafts: TavilyEvidenceDraft[],
) {
  const counts = new Map<string, number>();

  for (const draft of extractedDrafts) {
    for (const passName of draft.seenInPasses ?? []) {
      counts.set(passName, (counts.get(passName) ?? 0) + 1);
    }
  }

  for (const stat of passStats) {
    stat.extractedCount += counts.get(stat.passName) ?? 0;
  }
}

function limitPublicOpinionDrafts(
  drafts: TavilyEvidenceDraft[],
  topic: string,
): TavilyEvidenceDraft[] {
  let publicOpinionCount = 0;

  return drafts.filter((draft) => {
    const quality = scoreEvidence({
      title: draft.title,
      url: draft.url,
      source: draft.source,
      publishedAt: draft.publishedAt,
      snippet: draft.snippet,
      topic,
    });

    if (
      quality.sourceType !== "official_community" &&
      quality.sourceType !== "social_forum" &&
      quality.sourceType !== "video_platform"
    ) {
      return true;
    }

    publicOpinionCount += 1;

    return publicOpinionCount <= SOCIAL_CLUE_FINAL_LIMIT;
  });
}

function getCanonicalSearchUrl(url: string | undefined): string {
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

function getSearchModeConfig(searchMode: SearchMode): SearchModeConfig {
  if (searchMode === "deep") {
    return {
      candidateLimit: 60,
      extractLimit: 18,
      finalLimit: MODEL_DRIVEN_FINAL_EVIDENCE_LIMIT,
      chunksPerSource: 5,
    };
  }

  return {
    candidateLimit: 30,
    extractLimit: 8,
    finalLimit: MODEL_DRIVEN_FINAL_EVIDENCE_LIMIT,
    chunksPerSource: 5,
  };
}

function getExtractRescueDecision(
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

function shouldRunTargetedSearchRetry(pack: EvidencePack): boolean {
  if (pack.items.length === 0) {
    return false;
  }

  const socialVideoCount = pack.items.filter(isPublicOpinionEvidenceItem).length;

  return socialVideoCount / pack.items.length > 0.5;
}

function getLowQualityFallbackReason(input: {
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

function buildTargetedRetryQueries(topic: string): string[] {
  return [
    `${topic} official reputable media industry report -linkedin -instagram -reddit -youtube -tiktok -twitter -x.com`,
    `${topic} Reuters Bloomberg NYTimes WSJ FT The Information TechCrunch`,
    `${topic} official announcement report source primary`,
  ].map((query) => trimQueryToLength(query));
}

function isOfficialSnippetOnlyEvidence(item: SearchEvidence): boolean {
  return (
    isStrongOfficialSource(item.quality?.sourceType) &&
    ((item.quality?.textLength ?? item.snippet.length) < 800 ||
      item.quality?.snippetOnly === true)
  );
}

function isOfficialSnippetOnlyDraft(
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

function getMaxResultsPerQuery(candidateLimit: number, queryCount: number) {
  if (queryCount <= 0) {
    return Math.min(10, WEB_SEARCH_RESULTS_PER_QUERY);
  }

  return Math.max(5, Math.min(10, Math.ceil(candidateLimit / queryCount)));
}

function countRetrievalPasses(passStats: EvidenceSearchPassStats[]): number {
  return passStats.filter((stat) => !stat.skippedReason).length;
}

function selectRescueCandidates(
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

function getRescueQuery(topic: string, records: SearchIntentRecord[]) {
  return (
    records
      .flatMap((record) => record.intents.map((intent) => intent.question))
      .find(Boolean) ?? topic
  );
}

function getQualityDistribution(items: SearchEvidence[]) {
  return {
    high: items.filter((item) => item.quality?.reliability === "high").length,
    medium: items.filter((item) => item.quality?.reliability === "medium").length,
    low: items.filter((item) => item.quality?.reliability === "low").length,
    very_low: items.filter(
      (item) => item.quality?.reliability === "very_low",
    ).length,
  };
}

function mergeDedupeStats(
  original: ReturnType<typeof dedupeSearchResults>["stats"] | undefined,
  rescued: ReturnType<typeof dedupeSearchResults>["stats"],
) {
  if (!original) {
    return rescued;
  }

  return {
    originalResultCount: original.originalResultCount,
    dedupedResultCount: rescued.dedupedResultCount,
    removedDuplicateCount:
      original.removedDuplicateCount + rescued.removedDuplicateCount,
    removedSameDomainCount:
      original.removedSameDomainCount + rescued.removedSameDomainCount,
    removals: [...original.removals, ...rescued.removals],
    ...(original.domainLimitRelaxedReason || rescued.domainLimitRelaxedReason
      ? {
          domainLimitRelaxedReason:
            rescued.domainLimitRelaxedReason ?? original.domainLimitRelaxedReason,
        }
      : {}),
  };
}

function createProviderDiagnostic(
  response: SearchProviderResponse,
): SearchProviderDiagnostic {
  return {
    provider: response.provider,
    ...(response.diagnostics ? { diagnostics: response.diagnostics } : {}),
    ...(response.rawStats ? { rawStats: response.rawStats } : {}),
  };
}

async function buildParticipantSearchQueries(
  topic: string,
  participants: ModelParticipant[],
  provider: ModelProvider,
  signal?: AbortSignal,
  topicAnalysis: TopicAnalysis = analyzeTopicForEvidence(topic),
): Promise<{
  queries: string[];
  searchIntents: SearchIntentRecord[];
  queryPlans: SearchQueryPlan[];
  intentDecisions: SearchIntentDecision[];
}> {
  const participantPlans = await Promise.all(
    participants.map(async (participant) => {
      try {
        if (provider.generateSearchIntents) {
          return {
            participant,
            intents: await provider.generateSearchIntents(participant, topic, {
              signal,
            }),
          };
        }

        if (provider.generateSearchQueries) {
          const queries = await provider.generateSearchQueries(
            participant,
            topic,
            { signal },
          );

          return {
            participant,
            intents: queries.map(createLegacySearchIntent),
          };
        }

        return {
          participant,
          intents: [] as SearchIntent[],
        };
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }

        return {
          participant,
          intents: [] as SearchIntent[],
        };
      }
    }),
  );
  const searchIntents = participantPlans.map(({ participant, intents }) => ({
    participantId: participant.id,
    participantName: participant.name,
    provider: participant.provider,
    model: participant.model,
    intents: intents.map(normalizeSearchIntent).filter((intent) => intent.question),
  }));
  const plan = buildTavilySearchPlanFromIntents(
    topic,
    searchIntents,
    { topicAnalysis },
  );

  if (plan.queries.length > 0) {
    return {
      queries: plan.queries.slice(0, MAX_MODEL_DRIVEN_QUERIES),
      searchIntents,
      queryPlans: plan.queryPlans.slice(0, MAX_MODEL_DRIVEN_QUERIES),
      intentDecisions: plan.intentDecisions,
    };
  }

  const fallbackQueries =
    topicAnalysis.searchQueries.length > 0
      ? topicAnalysis.searchQueries.slice(0, MAX_MODEL_DRIVEN_QUERIES)
      : buildTavilySearchQueries(topic).slice(
          0,
          MAX_MODEL_DRIVEN_QUERIES,
        );

  return {
    queries: fallbackQueries,
    searchIntents: searchIntents.map((intent) => ({
      ...intent,
      intents:
        intent.intents.length > 0
          ? intent.intents
          : fallbackQueries.map(createLegacySearchIntent),
    })),
    queryPlans: fallbackQueries.map((query) => ({
      query,
      reason: "Fallback query generated from the meeting topic.",
      participantIds: participants.map((participant) => participant.id),
      sourcePreference: "mixed" as const,
      freshness: "any" as const,
      queryLevel: "precise" as const,
      derivedFrom: "topic_analysis",
      queryQuality: evaluateSearchQueryQuality(query, topicAnalysis),
    })),
    intentDecisions: [
      ...plan.intentDecisions,
      ...fallbackQueries.map((query) => ({
        question: query,
        action: "used" as const,
        reason: "fallback_topic_query",
        query,
      })),
    ],
  };
}

export function buildTavilySearchPlanFromIntents(
  topic: string,
  searchIntents: SearchIntentRecord[],
  options: { currentYear?: number; topicAnalysis?: TopicAnalysis } = {},
): {
  queries: string[];
  queryPlans: SearchQueryPlan[];
  intentDecisions: SearchIntentDecision[];
} {
  const seenQueries = new Map<string, string>();
  const queries: string[] = [];
  const queryPlans: SearchQueryPlan[] = [];
  const intentDecisions: SearchIntentDecision[] = [];

  for (const record of searchIntents) {
    for (const intent of record.intents) {
      const normalizedIntent = normalizeSearchIntent(intent);
      const question = normalizedIntent.question;

      if (isVagueIntent(normalizedIntent)) {
        intentDecisions.push({
          participantId: record.participantId,
          participantName: record.participantName,
          question,
          action: "discarded",
          reason: "vague_intent",
        });
        continue;
      }

      const query = buildQueryFromIntent(
        topic,
        normalizedIntent,
        options.topicAnalysis,
      );

      if (!query) {
        intentDecisions.push({
          participantId: record.participantId,
          participantName: record.participantName,
          question,
          action: "discarded",
          reason: "empty_query",
        });
        continue;
      }

      const dedupeKey = getQueryDedupeKey(query);
      const existingQuery = seenQueries.get(dedupeKey) ?? findOverlappingQuery(query, seenQueries);

      if (existingQuery) {
        intentDecisions.push({
          participantId: record.participantId,
          participantName: record.participantName,
          question,
          action: "merged",
          reason: "duplicate_query",
          mergedInto: existingQuery,
        });
        continue;
      }

      seenQueries.set(dedupeKey, query);
      queries.push(query);
      queryPlans.push({
        query,
        reason: getQueryGenerationReason(topic, normalizedIntent),
        participantIds: [record.participantId],
        sourcePreference: normalizedIntent.sourcePreference,
        freshness: normalizedIntent.freshness,
        queryLevel: "precise",
        derivedFrom: options.topicAnalysis ? "intent_plus_topic_analysis" : "model_intent",
        ...(options.topicAnalysis
          ? { queryQuality: evaluateSearchQueryQuality(query, options.topicAnalysis) }
          : {}),
      });
      intentDecisions.push({
        participantId: record.participantId,
        participantName: record.participantName,
        question,
        action: "used",
        reason: "usable_query",
        query,
      });

      if (queries.length >= MAX_MODEL_DRIVEN_QUERIES) {
        return { queries, queryPlans, intentDecisions };
      }
    }
  }

  return { queries, queryPlans, intentDecisions };
}

function buildQueryFromIntent(
  topic: string,
  intent: SearchIntent,
  topicAnalysis?: TopicAnalysis,
): string {
  const terms = [
    intent.question,
    topicAnalysis ? buildQueryFromTopicAnalysisParts(topicAnalysis, intent.question) : "",
    ...intent.mustInclude,
    ...intent.shouldInclude,
    ...getSourcePreferenceTerms(intent.sourcePreference),
    ...getFreshnessTerms(topic, intent),
    ...getDefaultSourceExclusionTerms(intent.sourcePreference),
    ...intent.exclude.map((term) => `-${term}`),
  ].flatMap(splitSearchPhrases);
  const compactTerms = topicAnalysis
    ? normalizeSearchQueryTerms(terms.join(" "), topicAnalysis).split(/\s+/)
    : Array.from(new Set(terms)).filter((term) => !isLowValueSearchTerm(term));
  const query = trimQueryToLength(compactTerms.join(" "));

  return getMeaningfulTokenCount(query) >= 2 ? query : "";
}

function normalizeSearchIntent(intent: SearchIntent): SearchIntent {
  return {
    question: normalizeSearchText(intent.question, 180),
    mustInclude: intent.mustInclude
      .map((item) => normalizeSearchText(item, 80))
      .filter(Boolean),
    shouldInclude: intent.shouldInclude
      .map((item) => normalizeSearchText(item, 80))
      .filter(Boolean),
    exclude: intent.exclude
      .map((item) => normalizeSearchText(item, 80))
      .filter(Boolean),
    freshness: normalizeFreshness(intent.freshness),
    sourcePreference: normalizeSourcePreference(intent.sourcePreference),
    rationale: normalizeSearchText(intent.rationale, 240),
  };
}

function createLegacySearchIntent(query: string): SearchIntent {
  return {
    question: query,
    mustInclude: [],
    shouldInclude: [],
    exclude: [],
    freshness: "any",
    sourcePreference: "mixed",
    rationale: "Legacy plain-text search query.",
  };
}

function isVagueIntent(intent: SearchIntent): boolean {
  const searchableTerms = [
    intent.question,
    ...intent.mustInclude,
    ...intent.shouldInclude,
  ].flatMap(splitSearchPhrases);
  const meaningfulTerms = searchableTerms.filter(
    (term) => !isLowValueSearchTerm(term),
  );

  return (
    meaningfulTerms.length === 0 ||
    getMeaningfulTokenCount(meaningfulTerms.join(" ")) < 2
  );
}

function splitSearchPhrases(value: string): string[] {
  return value
    .split(/\s+/)
    .map((term) => normalizeSearchText(term, 80))
    .filter(Boolean);
}

function stripSearchTermPunctuation(term: string): string {
  return term
    .replace(/^[^\p{L}\p{N}+-]+/gu, "")
    .replace(/[^\p{L}\p{N}+-]+$/gu, "")
    .trim();
}

function isResidualEntityFragment(
  term: string,
  topicAnalysis: TopicAnalysis,
): boolean {
  const normalizedTerm = term.toLowerCase();

  if (normalizedTerm.length < 2 || normalizedTerm.length > 4) {
    return false;
  }

  return topicAnalysis.targetEntities.some((entity) => {
    const normalizedEntity = entity.toLowerCase();

    return (
      normalizedEntity.length > normalizedTerm.length &&
      normalizedEntity.includes(normalizedTerm) &&
      !normalizedEntity.split(/[\s.-]+/).includes(normalizedTerm)
    );
  });
}

function isLowValueSearchTerm(term: string): boolean {
  const normalized = term.toLowerCase();

  return VAGUE_TERMS.has(normalized) || MARKETING_TERMS.has(normalized);
}

function getSourcePreferenceTerms(
  sourcePreference: SearchSourcePreference,
): string[] {
  if (sourcePreference === "official") {
    return ["official", "release"];
  }

  if (sourcePreference === "benchmark") {
    return ["benchmark", "leaderboard", "eval", "official"];
  }

  if (sourcePreference === "media") {
    return ["analysis", "report"];
  }

  if (sourcePreference === "community") {
    return ["community", "discussion"];
  }

  return [];
}

function getDefaultSourceExclusionTerms(
  sourcePreference: SearchSourcePreference,
): string[] {
  if (sourcePreference === "community") {
    return [];
  }

  return [
    "-linkedin",
    "-instagram",
    "-reddit",
    "-youtube",
    "-tiktok",
    "-twitter",
    "-x.com",
  ];
}

function getFreshnessTerms(
  topic: string,
  intent: SearchIntent,
): string[] {
  const explicitYear = extractExplicitYear(topic) ?? extractExplicitYear(intent.question);

  if (intent.freshness === "latest") {
    return explicitYear ? [`${explicitYear}`, "latest"] : ["latest"];
  }

  if (intent.freshness === "recent") {
    return explicitYear ? [`${explicitYear}`, "recent"] : ["recent"];
  }

  if (isRealtimeTopic(topic)) {
    return explicitYear ? [`${explicitYear}`, "latest", "official"] : ["latest", "official"];
  }

  return [];
}

function extractExplicitYear(text: string): number | undefined {
  const match = text.match(/\b(20\d{2})\b/);

  if (match) {
    const year = Number(match[1]);

    if (year >= 2020 && year <= 2030) {
      return year;
    }
  }

  return undefined;
}

function getQueryGenerationReason(topic: string, intent: SearchIntent): string {
  const reasons = [
    `sourcePreference=${intent.sourcePreference}`,
    `freshness=${intent.freshness}`,
  ];

  if (isRealtimeTopic(topic)) {
    reasons.push("topic appears time-sensitive");
  }

  if (isBenchmarkTopic(topic) || intent.sourcePreference === "benchmark") {
    reasons.push("benchmark terms added");
  }

  return reasons.join("; ");
}

function isRealtimeTopic(topic: string): boolean {
  return /latest|current|today|now|ranking|release|price|policy|news|最新|现在|目前|排名|发布|价格|政策/.test(
    topic.toLowerCase(),
  );
}

function isBenchmarkTopic(topic: string): boolean {
  return /benchmark|leaderboard|eval|ranking|model|llm|ai|评测|榜单|排名|模型/.test(
    topic.toLowerCase(),
  );
}

function trimQueryToLength(query: string): string {
  const compact = query.replace(/\s+/g, " ").trim();

  if (compact.length <= MAX_TAVILY_QUERY_LENGTH) {
    return compact;
  }

  const words = compact.split(" ");
  const kept: string[] = [];
  let length = 0;

  for (const word of words) {
    const nextLength = length + word.length + (kept.length > 0 ? 1 : 0);

    if (nextLength > MAX_TAVILY_QUERY_LENGTH) {
      break;
    }

    kept.push(word);
    length = nextLength;
  }

  return kept.join(" ");
}

function getMeaningfulTokenCount(query: string): number {
  return query.match(/[\p{L}\p{N}][\p{L}\p{N}.-]*/gu)?.length ?? 0;
}

function getQueryDedupeKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[“”‘’\x22\x27]/g, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findOverlappingQuery(
  query: string,
  seenQueries: Map<string, string>,
): string | undefined {
  const normalized = getQueryDedupeKey(query);

  if (!normalized) {
    return undefined;
  }

  for (const [existingKey, existingQuery] of seenQueries) {
    if (existingKey === normalized) {
      continue;
    }

    if (existingKey.length >= 8 && normalized.includes(existingKey)) {
      return existingQuery;
    }

    if (normalized.length >= 8 && existingKey.includes(normalized)) {
      return existingQuery;
    }
  }

  return undefined;
}

function normalizeSearchText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return compact.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
}

function normalizeFreshness(value: SearchFreshness): SearchFreshness {
  return value === "latest" || value === "recent" || value === "any"
    ? value
    : "any";
}

function normalizeSourcePreference(
  value: SearchSourcePreference,
): SearchSourcePreference {
  return value === "official" ||
    value === "benchmark" ||
    value === "media" ||
    value === "community" ||
    value === "mixed"
    ? value
    : "mixed";
}

export function resolveSearchRegionPreference(input: {
  topic: string;
  searchRegion?: import("../types").SearchRegion;
}): {
  resolvedRegion: import("../types").SearchRegion;
  regionSource: "user_preference" | "auto_detected" | "default_global";
  regionFallbackReason: string;
} {
  const { topic, searchRegion } = input;

  if (searchRegion && searchRegion !== "auto") {
    return {
      resolvedRegion: searchRegion,
      regionSource: "user_preference",
      regionFallbackReason: "none",
    };
  }

  const detected = detectRegionFromTopic(topic);

  if (detected) {
    return {
      resolvedRegion: detected,
      regionSource: "auto_detected",
      regionFallbackReason: "none",
    };
  }

  return {
    resolvedRegion: "global",
    regionSource: "default_global",
    regionFallbackReason: "uncertain_auto_region",
  };
}

function detectRegionFromTopic(
  topic: string,
): import("../types").SearchRegion | undefined {
  const normalized = topic.toLowerCase();

  if (hasChinaSignals(normalized)) {
    return "china";
  }

  if (hasJapanSignals(normalized)) {
    return "japan";
  }

  if (hasKoreaSignals(normalized)) {
    return "korea";
  }

  if (hasUsSignals(normalized)) {
    return "us";
  }

  return undefined;
}

function hasChinaSignals(text: string): boolean {
  const cjkCount = (text.match(/[一-鿿]/g) ?? []).length;
  const latinCount = (text.match(/[a-z]/g) ?? []).length;

  if (cjkCount >= 4 && cjkCount > latinCount * 2) {
    const chinaKeywords = [
      "中国", "国内", "中国市场", "中国政策", "中国监管",
      "中国政府", "中国公司", "中国企业", "中国城市",
      "北京", "上海", "深圳", "广州", "杭州", "成都",
      "中国人民银行", "工信部", "国务院", "发改委",
      "a股", "港股", "科创板", "创业板",
      "人民币", "rmb",
    ];

    if (chinaKeywords.some((keyword) => text.includes(keyword))) {
      return true;
    }
  }

  return false;
}

function hasJapanSignals(text: string): boolean {
  const japanKeywords = [
    "日本", "japan", "japanese",
    "东京", "tokyo",
    "日经", "nikkei",
    "日元", "yen",
    "日本政策", "日本监管", "日本市场",
    "日本公司", "日本企业",
  ];

  return japanKeywords.some((keyword) => text.includes(keyword));
}

function hasKoreaSignals(text: string): boolean {
  const koreaKeywords = [
    "韩国", "korea", "korean",
    "首尔", "seoul",
    "韩元", "won",
    "韩国政策", "韩国监管", "韩国市场",
    "韩国公司", "韩国企业",
    "三星", "samsung",
    "现代", "hyundai",
    "lg",
    "sk",
  ];

  return koreaKeywords.some((keyword) => text.includes(keyword));
}

function hasUsSignals(text: string): boolean {
  const usKeywords = [
    "美国", "us market", "us policy", "us regulation",
    "美国政策", "美国监管", "美国市场",
    "美国公司", "美国企业",
    "华尔街", "wall street",
    "美联储", "fed ", "federal reserve",
    "sec", "美国证监会",
    "纳斯达克", "nasdaq",
    "纽约", "new york",
    "硅谷", "silicon valley",
  ];

  return usKeywords.some((keyword) => text.includes(keyword));
}

function getEffectiveCountryForRegion(
  searchRegion: import("../types").SearchRegion | undefined,
): string | undefined {
  if (!searchRegion || searchRegion === "auto") {
    return undefined;
  }

  return SEARCH_REGION_COUNTRY_MAP[searchRegion];
}

function getEvidenceWarnings(status: string, searchedCandidateCount = 0): string[] {
  if (status === "low") {
    return [
      searchedCandidateCount > 0
        ? `已广搜 ${searchedCandidateCount} 条候选资料，但直接证据不足；已切换为低证据会议模式，涉及实时事实的结论请人工核验。`
        : undefined,
      "未找到高质量联网资料，已切换为低证据会议模式。本次会议仍会继续，但涉及实时事实的结论请人工核验。",
    ].filter((warning): warning is string => Boolean(warning));
  }

  if (status === "none") {
    return [
      searchedCandidateCount > 0
        ? `已广搜 ${searchedCandidateCount} 条候选资料，但没有足够可引用资料；本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。`
        : undefined,
      "未找到可用联网资料，本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。",
    ].filter((warning): warning is string => Boolean(warning));
  }

  return [];
}

const ACTION_TOKENS = [
  "发布", "公告", "宣布", "推出", "上线", "更新",
  "release", "launch", "announced", "update", "introduce",
];

function extractTopicTokens(topic: string): {
  entityTokens: string[];
  conceptTokens: string[];
  actionTokens: string[];
} {
  const normalized = topic.toLowerCase();
  const englishWords = normalized.match(/[a-z][a-z0-9-]{1,}/g) ?? [];
  const cjkSegments = splitCjkText(normalized);
  const allTokens = [...cjkSegments, ...englishWords];

  const actionTokens = allTokens.filter((token) =>
    ACTION_TOKENS.some((action) => token.includes(action)),
  );

  const stopWords = new Set([
    "怎么", "如何看待", "如何看", "怎么看", "认为", "觉得",
    "评价", "分析", "怎么样", "什么", "如何", "怎样",
    "为什么", "为啥", "最近", "最新", "对", "的", "了",
    "影响", "意义", "看法", "观点", "how", "what", "why",
    "the", "a", "an", "is", "are", "was", "were", "be",
    "impact", "significance", "opinion", "view",
  ]);

  const entityTokens = allTokens.filter(
    (token) => !stopWords.has(token) && token.length >= 2 && !actionTokens.includes(token),
  );

  const conceptTokens = allTokens.filter(
    (token) =>
      !stopWords.has(token) &&
      !actionTokens.includes(token) &&
      token.length >= 2 &&
      !/^[a-z]$/.test(token),
  );

  return {
    entityTokens: [...new Set(entityTokens)].slice(0, 6),
    conceptTokens: [...new Set(conceptTokens)].slice(0, 6),
    actionTokens: [...new Set(actionTokens)].slice(0, 3),
  };
}

function splitCjkText(text: string): string[] {
  const segments: string[] = [];
  const cjkPattern = /[一-鿿]+/g;
  let match;

  while ((match = cjkPattern.exec(text)) !== null) {
    const chunk = match[0];

    // Split on common particles and measure words
    const parts = chunk.split(/(?:的|了|在|是|有|和|与|对|从|到|把|被|让|给|向|往|以|因|但|而|就|都|也|还|才|又|再|已|正|将|会|能|可以|应该|必须|需要|想要|打算|某|这个|那个|这些|那些)/);

    for (const part of parts) {
      if (part.length >= 2) {
        segments.push(part);
      }
    }
  }

  return [...new Set(segments)];
}

function buildTopicAnalysisZeroResultFallbackQueries(
  topicAnalysis: TopicAnalysis,
): string[] {
  const queries: string[] = [];
  const seenKeys = new Set<string>();
  const entities = topicAnalysis.targetEntities.slice(0, 4);
  const scenarios = topicAnalysis.targetScenarios.slice(0, 3);
  const dimensionTerms = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .filter(Boolean);
  const cleanedTokens = splitSearchPhrases(topicAnalysis.cleanedTopic)
    .filter((token) => !isLowValueSearchTerm(token))
    .slice(0, 6);
  const addQuery = (parts: string[]) => {
    const query = trimQueryToLength(parts.filter(Boolean).join(" "));

    if (query && getMeaningfulTokenCount(query) >= 2) {
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

function buildTopicAnalysisFallbackSearchPasses(
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy fallback kept for compatibility with older debug paths.
function buildZeroResultFallbackQueries(topic: string): string[] {
  const { entityTokens, conceptTokens, actionTokens } = extractTopicTokens(topic);
  const queries: string[] = [];
  const seenKeys = new Set<string>();

  const addQuery = (parts: string[]) => {
    const query = trimQueryToLength(parts.filter(Boolean).join(" "));
    if (query && getMeaningfulTokenCount(query) >= 2) {
      const key = getQueryDedupeKey(query);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        queries.push(query);
      }
    }
  };

  // entity + version/concept
  if (entityTokens.length > 0) {
    addQuery(entityTokens.slice(0, 3));
    addQuery([...entityTokens.slice(0, 2), ...conceptTokens.slice(0, 2)]);

    // entity + action
    if (actionTokens.length > 0) {
      addQuery([...entityTokens.slice(0, 2), actionTokens[0]]);
    }

    // entity + 发布/release
    addQuery([...entityTokens.slice(0, 2), "发布"]);
    addQuery([...entityTokens.slice(0, 2), "release"]);

    // entity + 官方/announcement
    addQuery([...entityTokens.slice(0, 2), "官方"]);
    addQuery([...entityTokens.slice(0, 2), "announcement"]);
  }

  // concept-only queries
  if (conceptTokens.length >= 2) {
    addQuery(conceptTokens.slice(0, 3));
  }

  // bare topic as last resort
  addQuery([topic]);

  return queries.slice(0, 5);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- legacy fallback kept for compatibility with older debug paths.
function buildFallbackSearchPasses(
  topic: string,
  fallbackQueries: string[],
): SearchPassSpec[] {
  const passes: SearchPassSpec[] = [];

  if (fallbackQueries.length > 0) {
    const broadQuery = fallbackQueries[0];

    passes.push({
      name: "industry_report",
      query: broadQuery,
      freshness: "recent",
      includeDomains: INDUSTRY_REPORT_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("recent"),
    });

    passes.push({
      name: "reputable_media",
      query: broadQuery,
      freshness: "recent",
      includeDomains: TRUSTED_MEDIA_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "news",
      timeRange: getTavilyTimeRange("recent"),
    });

    if (fallbackQueries.length > 1) {
      passes.push({
        name: "social_clue",
        query: fallbackQueries[1],
        freshness: "recent",
        includeDomains: SOCIAL_VIDEO_DOMAINS,
        searchDepth: "fast",
        searchTopic: "general",
        timeRange: getTavilyTimeRange("recent"),
      });
    }
  }

  return passes;
}
