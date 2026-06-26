import type {
  EvidencePack,
  EvidenceSearchPassStats,
  ExtractAttemptRecord,
  SearchCacheEvent,
  SearchMode,
  SearchProviderDiagnostic,
} from "./evidence-pack";
import {
  analyzeTopicForEvidence,
  createSearchFailureProcess,
  normalizeEvidencePack,
} from "./evidence-pack";
import {
  dedupeSearchResults,
  getTavilyFailureReason,
  TavilySearchError,
  type TavilyEvidenceDraft,
} from "./tavily-search";
import { getSearchProvider } from "./search-provider-registry";
import { getExtractProvider } from "./extract-provider-registry";
import type { ExtractProvider } from "./extract-provider";
import type { SearchProvider } from "./search-provider";
import type {
  ModelParticipant,
  ModelProvider,
} from "../types";
import { buildTopRawCandidatePreviews } from "./candidate-retrieval";
import {
  buildParticipantSearchQueries,
  buildSearchPasses,
  getEffectiveCountryForRegion,
  prepareSearchPassForExecution,
  resolveSearchRegionPreference,
  selectSearchPassesForExecution,
  type SearchPassName,
} from "./search-query-planning";
import {
  countRetrievalPasses,
  createFailedPassStats,
  createFailedProviderDiagnostic,
  createPassStats,
  createProviderDiagnostic,
  createSkippedPassStats,
  createTimedAbortSignal,
  getEvidenceOverallTimeoutMs,
  getEvidencePassTimeoutMs,
  getExtractErrorType,
  getMaxResultsPerQuery,
  getPassStatsMeta,
  getRemainingTimeoutMs,
  getSearchPassErrorType,
  isKeySearchPass,
  isSearchPassTimeout,
  logSearchPassFailure,
  recordExtractedCountsByPass,
  searchWithConfiguredProvider,
  type Searcher,
} from "./search-pass-runner";
import {
  buildTargetedRetrySearchPasses,
  buildTopicAnalysisFallbackSearchPasses,
  buildTopicAnalysisZeroResultFallbackQueries,
  extractFallbackDraftsForCandidates,
  getCanonicalSearchUrl,
  getExtractRescueDecision,
  getLowQualityFallbackReason,
  getPrimarySeenInPass,
  getRescueQuery,
  getSafeExtractErrorMessage,
  getSeenInPassesForUrl,
  isOfficialSnippetOnlyDraft,
  selectRescueCandidates,
  shouldRunTargetedSearchRetry,
} from "./search-fallbacks";
import {
  getEvidenceWarnings,
  getQualityDistribution,
  getSearchModeConfig,
  limitPublicOpinionEvidenceItems,
  mergeDedupeStats,
} from "./search-debug-summary";

export {
  buildTavilySearchPlanFromIntents,
  resolveSearchRegionPreference,
} from "./search-query-planning";

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
            getPassStatsMeta(searchPass, { maxResults: maxResultsPerQuery }),
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
              maxResults: maxResultsPerQuery,
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
            getPassStatsMeta(searchPass, { maxResults: maxResultsPerQuery }),
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
              getPassStatsMeta(fallbackPass, {
                maxResults: maxResultsPerQuery,
              }),
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
                maxResults: maxResultsPerQuery,
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
              getPassStatsMeta(fallbackPass, {
                maxResults: maxResultsPerQuery,
              }),
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
              getPassStatsMeta(searchPass, { maxResults: maxResultsPerQuery }),
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
                maxResults: maxResultsPerQuery,
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
              getPassStatsMeta(searchPass, { maxResults: maxResultsPerQuery }),
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
        rawWebDrafts.push(...fallbackDrafts);
        rawCandidateCount = rawWebDrafts.length;
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
      const targetedPasses = buildTargetedRetrySearchPasses(topicAnalysis);
      const targetedDrafts: TavilyEvidenceDraft[] = [];

      for (const searchPass of targetedPasses) {
        activeSearchPassName = searchPass.name;
        searchQueries.push(searchPass.query);
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
              searchPass.name,
              searchPass.query,
              Date.now() - passStartedAt,
              "evidence_overall_timeout",
              true,
              getPassStatsMeta(searchPass, {
                maxResults: Math.max(2, Math.ceil(modeConfig.extractLimit / 3)),
              }),
            ),
          );
          activeSearchPassName = undefined;
          break;
        }

        const passAbort = createTimedAbortSignal(signal, effectivePassTimeoutMs);

        try {
          const targetedMaxResults = Math.max(
            2,
            Math.ceil(modeConfig.extractLimit / targetedPasses.length),
          );
          const response = await searchWithConfiguredProvider({
            chunksPerSource: searchPass.chunksPerSource,
            country: searchPass.country,
            excludeDomains: searchPass.excludeDomains,
            freshness: "latest",
            includeDomains: searchPass.includeDomains,
            includeRawContent: searchPass.includeRawContent,
            maxResults: targetedMaxResults,
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
          const queryDrafts = response.results.map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content ?? result.snippet ?? "",
            publishedAt: result.publishedDate,
            providerScore: result.providerScore,
            query: searchPass.query,
            seenInPasses: [searchPass.name],
          }));

          targetedDrafts.push(...queryDrafts);
          passStats.push(
            createPassStats(
              searchPass.name,
              searchPass.query,
              queryDrafts,
              topic,
              getPassStatsMeta(searchPass, {
                durationMs: Date.now() - passStartedAt,
                maxResults: targetedMaxResults,
              }),
            ),
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
              searchPass.name,
              searchPass.query,
              durationMs,
              errorType,
              isSearchPassTimeout(errorType),
              getPassStatsMeta(searchPass, {
                maxResults: Math.max(
                  2,
                  Math.ceil(modeConfig.extractLimit / targetedPasses.length),
                ),
              }),
            ),
          );
          providerDiagnostics.push(
            createFailedProviderDiagnostic(searchProvider, error, errorType),
          );
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
      const targetedDeduped = dedupeSearchResults([
        ...webDrafts,
        ...targetedDrafts,
      ]);

      rawWebDrafts.push(...targetedDrafts);
      rawCandidateCount = rawWebDrafts.length;
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
  const preflightPack = normalizeEvidencePack(
    {
      enabled: baseItems.length > 0 || webDrafts.length > 0,
      items: [...baseItems, ...webDrafts],
    },
    {
      maxItems: modeConfig.finalLimit,
      topic,
    },
  );
  const selectedWebItems = preflightPack.items.filter(
    (item) => !baseItems.some((baseItem) => baseItem.url === item.url),
  );
  const finalWebItems = limitPublicOpinionEvidenceItems(selectedWebItems);
  const finalItems = [...baseItems, ...finalWebItems].slice(
    0,
    modeConfig.finalLimit,
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
      items: finalItems,
      searchProcess: {
        cacheEvents,
        candidateItems: webDrafts,
        dedupeStats,
        dedupedCandidateCount: webDrafts.length,
        rawCandidateTarget: modeConfig.candidateLimit,
        uniqueCandidateCount: webDrafts.length,
        selectedEvidenceTarget: modeConfig.finalLimit,
        selectedEvidenceCount: finalItems.length,
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
        finalEvidenceCount: finalItems.length,
        qualityDistribution: getQualityDistribution(finalItems),
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
        topRawCandidates: buildTopRawCandidatePreviews(webDrafts, topic),
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
