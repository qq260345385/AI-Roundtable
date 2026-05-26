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
  SearchSourcePreference,
} from "./evidence-pack";
import {
  createSearchFailureProcess,
  classifyEvidenceTopic,
  isPublicOpinionEvidenceItem,
  isStrongOfficialSource,
  normalizeEvidencePack,
  scoreEvidence,
} from "./evidence-pack";
import {
  buildTavilySearchQueries,
  dedupeSearchResults,
  getTavilyFailureReason,
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
const CORE_EVIDENCE_TARGET = 3;
const SOCIAL_CLUE_FINAL_LIMIT = 2;
const DEFAULT_EVIDENCE_OVERALL_TIMEOUT_MS = 90000;
const DEFAULT_EVIDENCE_PASS_TIMEOUT_MS = 30000;
const MODEL_DRIVEN_SEARCH_PASS_LIMIT = 3;
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
  searchProvider = getSearchProvider(),
  searcher,
  signal,
  topic,
}: BuildModelDrivenWebEvidencePackOptions): Promise<EvidencePack> {
  const modeConfig = getSearchModeConfig(searchMode);
  const searchPlan = await buildParticipantSearchQueries(
    topic,
    participants,
    provider,
    signal,
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

  try {
    const allSearchPasses = buildSearchPasses(topic, searchPlan.queries);
    const searchPasses = allSearchPasses.slice(0, MODEL_DRIVEN_SEARCH_PASS_LIMIT);
    skippedPasses.push(
      ...allSearchPasses
        .slice(MODEL_DRIVEN_SEARCH_PASS_LIMIT)
        .map((pass) => pass.name),
    );
    keyPassCount = searchPasses.filter((pass) =>
      isKeySearchPass(pass.name),
    ).length;
    const maxResultsPerQuery = getMaxResultsPerQuery(
      modeConfig.candidateLimit,
      searchPasses.length,
    );
    const rawWebDrafts: TavilyEvidenceDraft[] = [];

    for (const searchPass of searchPasses) {
      const currentCoreEvidenceCount = countCoreEvidenceDrafts(
        dedupeSearchResults(rawWebDrafts).items,
        topic,
      );

      if (
        searchPass.name === "social_clue" &&
        currentCoreEvidenceCount >= CORE_EVIDENCE_TARGET
      ) {
        skippedPasses.push(searchPass.name);
        continue;
      }

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
            { durationMs: Date.now() - passStartedAt },
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

    rawCandidateCount = rawWebDrafts.length;
    const deduped = dedupeSearchResults(rawWebDrafts);

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
    ...getEvidenceWarnings(evidenceStatus),
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
        passStats,
        skippedPasses,
        targetedSearchRetryTriggered,
        targetedSearchRetryReason,
        searchMode,
        searchIntents: searchPlan.searchIntents,
        queryPlans: searchPlan.queryPlans,
        intentDecisions: searchPlan.intentDecisions,
        provider: searchProvider.id,
        providerDiagnostics,
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
    searchTopic: input.searchTopic,
    signal: input.signal,
    timeRange: input.timeRange,
    topic: input.topic,
  });
}

function buildSearchPasses(
  topic: string,
  plannedQueries: string[],
): SearchPassSpec[] {
  if (classifyEvidenceTopic(topic) === "entity_competition") {
    return buildEntityCompetitionSearchPasses(topic);
  }

  const baseQuery = plannedQueries.find(Boolean) ?? topic;
  const localizedPasses = buildLocalizedMediaPasses(topic);

  return [
    {
      name: "official",
      query: trimQueryToLength(
        `${baseQuery} official statement official blog official docs announcement report`,
      ),
      freshness: "latest",
      includeDomains: buildOfficialDomainCandidates(topic),
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("latest"),
    },
    ...localizedPasses,
    {
      name: "reputable_media",
      query: trimQueryToLength(
        `Reuters Bloomberg FT WSJ NYTimes The Information TechCrunch ${baseQuery}`,
      ),
      freshness: "latest",
      includeDomains: TRUSTED_MEDIA_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "news",
      timeRange: getTavilyTimeRange("latest"),
    },
    {
      name: "industry_report",
      query: trimQueryToLength(
        `SemiAnalysis Epoch AI Stanford arxiv MLCommons industry report ${baseQuery}`,
      ),
      freshness: "recent",
      includeDomains: INDUSTRY_REPORT_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("recent"),
    },
    {
      name: "social_clue",
      query: trimQueryToLength(
        `Reddit LinkedIn YouTube X discussion ${baseQuery}`,
      ),
      freshness: "recent",
      includeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "fast",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("recent"),
    },
  ];
}

function buildEntityCompetitionSearchPasses(topic: string): SearchPassSpec[] {
  const localizedPasses = buildLocalizedMediaPasses(topic);

  return [
    {
      name: "official",
      query: trimQueryToLength(
        `${topic} official statement funding revenue governance business model partnership customer contract`,
      ),
      freshness: "latest",
      includeDomains: buildOfficialDomainCandidates(topic),
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("latest"),
    },
    ...localizedPasses,
    {
      name: "reputable_media",
      query: trimQueryToLength(
        `${topic} enterprise customers market share funding revenue Reuters Bloomberg FT WSJ NYTimes The Information TechCrunch`,
      ),
      freshness: "latest",
      includeDomains: TRUSTED_MEDIA_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "news",
      timeRange: getTavilyTimeRange("latest"),
    },
    {
      name: "industry_report",
      query: trimQueryToLength(
        `${topic} strategic partnership regulation government contracts market analysis industry report`,
      ),
      freshness: "recent",
      includeDomains: INDUSTRY_REPORT_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("recent"),
    },
    {
      name: "social_clue",
      query: trimQueryToLength(
        `${topic} discussion sentiment Reddit LinkedIn YouTube X -instagram -tiktok`,
      ),
      freshness: "recent",
      includeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "fast",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("recent"),
    },
  ];
}

function buildLocalizedMediaPasses(topic: string): SearchPassSpec[] {
  if (!isPrimaryChineseTopic(topic)) {
    return [];
  }

  const variants = buildLocalizedQueryVariants(topic);
  const localMediaQuery = trimQueryToLength(
    [
      variants.originalLanguageQuery,
      variants.normalizedOriginalQuery,
      variants.aliasQuery,
      "本地媒体 人民网 证券时报 环球时报 行业媒体 财经",
      "-linkedin -instagram -reddit -youtube -tiktok -twitter -x.com",
    ].filter(Boolean).join(" "),
  );

  return [
    {
      name: "localized_media",
      query: localMediaQuery,
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
  };
}

function createFailedPassStats(
  passName: SearchPassName,
  query: string,
  durationMs: number,
  errorType: string,
  timedOut: boolean,
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

function countCoreEvidenceDrafts(
  drafts: TavilyEvidenceDraft[],
  topic: string,
): number {
  return createPassStats("official", "preflight", drafts, topic).coreEvidenceCount;
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
    candidateLimit: 60,
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
    return WEB_SEARCH_RESULTS_PER_QUERY;
  }

  void candidateLimit;

  return WEB_SEARCH_RESULTS_PER_QUERY;
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
  const plan = buildTavilySearchPlanFromIntents(topic, searchIntents);

  if (plan.queries.length > 0) {
    return {
      queries: plan.queries.slice(0, MAX_MODEL_DRIVEN_QUERIES),
      searchIntents,
      queryPlans: plan.queryPlans.slice(0, MAX_MODEL_DRIVEN_QUERIES),
      intentDecisions: plan.intentDecisions,
    };
  }

  const fallbackQueries = buildTavilySearchQueries(topic).slice(
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
  options: { currentYear?: number } = {},
): {
  queries: string[];
  queryPlans: SearchQueryPlan[];
  intentDecisions: SearchIntentDecision[];
} {
  const currentYear = options.currentYear ?? new Date().getFullYear();
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

      const query = buildQueryFromIntent(topic, normalizedIntent, currentYear);

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
      const existingQuery = seenQueries.get(dedupeKey);

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
  currentYear: number,
): string {
  const terms = [
    intent.question,
    ...intent.mustInclude,
    ...intent.shouldInclude,
    ...getSourcePreferenceTerms(intent.sourcePreference),
    ...getFreshnessTerms(topic, intent, currentYear),
    ...getDefaultSourceExclusionTerms(intent.sourcePreference),
    ...intent.exclude.map((term) => `-${term}`),
  ].flatMap(splitSearchPhrases);
  const compactTerms = Array.from(new Set(terms)).filter(
    (term) => !isLowValueSearchTerm(term),
  );
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
    return ["Reuters", "Bloomberg"];
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
  currentYear: number,
): string[] {
  if (intent.freshness === "latest") {
    return [`${currentYear}`, "latest"];
  }

  if (intent.freshness === "recent") {
    return [`${currentYear}`, "recent"];
  }

  if (isRealtimeTopic(topic)) {
    return [`${currentYear}`, "latest", "official"];
  }

  return [];
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
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function getEvidenceWarnings(status: string): string[] {
  if (status === "low") {
    return [
      "未找到高质量联网资料，已切换为低证据会议模式。本次会议仍会继续，但涉及实时事实的结论请人工核验。",
    ];
  }

  if (status === "none") {
    return [
      "未找到可用联网资料，本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。",
    ];
  }

  return [];
}
