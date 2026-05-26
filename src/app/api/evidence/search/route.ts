import { NextResponse } from "next/server";
import {
  createSearchFailureProcess,
  isPublicOpinionEvidenceItem,
  isStrongOfficialSource,
  normalizeEvidencePack,
  scoreEvidence,
  type SearchMode,
  type SearchCacheEvent,
  type SearchEvidence,
  type SearchProviderDiagnostic,
} from "../../../../lib/search/evidence-pack";
import {
  createSearchSummary,
  sanitizeEvidencePackForClient,
} from "../../../../lib/search/search-response";
import {
  TavilySearchError,
  buildTavilySearchQueries,
  dedupeSearchResults,
  getSafeTavilyErrorMessage,
  getTavilyFailureReason,
  type TavilyEvidenceDraft,
} from "../../../../lib/search/tavily-search";
import { createSearchProviderRegistry } from "../../../../lib/search/search-provider-registry";
import { getExtractProvider } from "../../../../lib/search/extract-provider-registry";
import type { SearchProviderResponse } from "../../../../lib/search/search-provider";

export const runtime = "nodejs";

type SearchRequestBody = {
  query?: unknown;
  searchMode?: unknown;
};

type SearchModeConfig = {
  candidateLimit: number;
  extractLimit: number;
  finalLimit: number;
  chunksPerSource: number;
};

const RESCUE_TRIGGER_USABLE_THRESHOLD = 3;
const RESCUE_TRIGGER_RELIABLE_THRESHOLD = 3;

export async function POST(request: Request) {
  const cacheEvents: SearchCacheEvent[] = [];
  const providerDiagnostics: SearchProviderDiagnostic[] = [];
  let selectedSearchProviderId = "tavily";
  let searchQueries: string[] = [];

  try {
    const body = await readRequestBody(request);
    const query = getQuery(body);
    const searchMode = getSearchMode(body.searchMode);
    const modeConfig = getSearchModeConfig(searchMode);

    if (!query) {
      throw new SearchRequestError("query cannot be empty", 400);
    }

    const providerRegistry = createSearchProviderRegistry();
    const searchProvider = providerRegistry.selectedProvider;
    selectedSearchProviderId = searchProvider.id;
    searchQueries = buildTavilySearchQueries(query);
    const maxResultsPerQuery = getMaxResultsPerQuery(
      modeConfig.candidateLimit,
      searchQueries.length,
    );
    const searchResults = (
      await Promise.all(
        searchQueries.map((searchQuery) =>
          searchProvider.search({
            freshness: "any",
            maxResults: maxResultsPerQuery,
            query: searchQuery,
            searchDepth: "basic",
            signal: request.signal,
            topic: query,
          }).then((response) => {
            cacheEvents.push(...(response.cacheEvents ?? []));
            providerDiagnostics.push(
              createProviderDiagnostic(response, providerRegistry),
            );

            return response.results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.content ?? result.snippet ?? "",
              publishedAt: result.publishedDate,
              query: searchQuery,
            }));
          }),
        ),
      )
    ).flat();
    const rawCandidateCount = searchResults.length;
    const deduped = dedupeSearchResults(searchResults);
    let drafts = deduped.items.slice(0, modeConfig.candidateLimit);
    let dedupeStats = deduped.stats;
    let rescueTriggered = false;
    let rescueReason: string | undefined;
    let extractAttempted = 0;
    let extractedCandidateCount = 0;
    let extractSucceededCount = 0;
    let officialExtractFailed = false;
    let targetedSearchRetryTriggered = false;
    let targetedSearchRetryReason: string | undefined;
    let preflightPack = normalizeEvidencePack(
      {
        enabled: true,
        items: drafts,
      },
      {
        maxItems: modeConfig.finalLimit,
        topic: query,
      },
    );

    if (shouldRunTargetedSearchRetry(preflightPack)) {
      targetedSearchRetryTriggered = true;
      targetedSearchRetryReason = "social_video_ratio_above_threshold";
      const targetedQueries = buildTargetedRetryQueries(query);
      const targetedResults = (
        await Promise.all(
          targetedQueries.map((searchQuery) =>
            searchProvider
              .search({
                freshness: "latest",
                maxResults: Math.max(2, Math.ceil(modeConfig.extractLimit / 3)),
                query: searchQuery,
                searchDepth: "basic",
                signal: request.signal,
                topic: query,
              })
              .then((response) => {
                cacheEvents.push(...(response.cacheEvents ?? []));
              providerDiagnostics.push(
                createProviderDiagnostic(response, providerRegistry),
              );

                return response.results.map((result) => ({
                  title: result.title,
                  url: result.url,
                  snippet: result.content ?? result.snippet ?? "",
                  publishedAt: result.publishedDate,
                  query: searchQuery,
                }));
              }),
          ),
        )
      ).flat();
      const targetedDeduped = dedupeSearchResults([
        ...drafts,
        ...targetedResults,
      ]);

      drafts = targetedDeduped.items.slice(0, modeConfig.candidateLimit);
      dedupeStats = mergeDedupeStats(dedupeStats, targetedDeduped.stats);
      searchQueries.push(...targetedQueries);
      preflightPack = normalizeEvidencePack(
        {
          enabled: true,
          items: drafts,
        },
        {
          maxItems: modeConfig.finalLimit,
          topic: query,
        },
      );
    }

    const rescueDecision = getExtractRescueDecision(preflightPack, searchMode);

    if (rescueDecision.triggered && drafts.some((draft) => draft.url)) {
      rescueTriggered = true;
      rescueReason = rescueDecision.reason;
      const rescueUrls = drafts
        .filter((draft) => Boolean(draft.url))
        .sort((left, right) =>
          getRescueDraftRank(left, query) - getRescueDraftRank(right, query),
        )
        .map((draft) => draft.url)
        .filter((url): url is string => Boolean(url))
        .slice(0, modeConfig.extractLimit);
      const officialRetryUrls = new Set(
        drafts
          .filter((draft) => draft.url && isOfficialSnippetOnlyDraft(draft, query))
          .map((draft) => draft.url as string),
      );

      extractAttempted = rescueUrls.length;

      if (rescueUrls.length > 0) {
        try {
          const extractProvider = getExtractProvider();
          const extractResponse = await extractProvider.extract({
            urls: rescueUrls,
            query,
            chunksPerSource: modeConfig.chunksPerSource,
            extractDepth: searchMode === "deep" ? "advanced" : "basic",
            signal: request.signal,
          });
          const extractedDrafts = extractResponse.results.map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content,
            publishedAt: undefined,
            query,
          }));
          const rescuedDeduped = dedupeSearchResults([
            ...drafts,
            ...extractedDrafts,
          ]);

          extractedCandidateCount = extractedDrafts.length;
          extractSucceededCount = Math.min(
            rescueUrls.length,
            extractedDrafts.filter((draft) => draft.snippet.trim()).length,
          );
          officialExtractFailed =
            officialRetryUrls.size > 0 &&
            !extractedDrafts.some(
              (draft) =>
                officialRetryUrls.has(draft.url) && draft.snippet.trim().length >= 800,
            );
          drafts = rescuedDeduped.items.slice(0, modeConfig.candidateLimit);
          dedupeStats = mergeDedupeStats(dedupeStats, rescuedDeduped.stats);
          providerDiagnostics.push({
            provider: extractResponse.provider,
            displayName: extractProvider.displayName,
            ...(extractResponse.diagnostics
              ? { diagnostics: extractResponse.diagnostics }
              : {}),
            ...(extractResponse.rawStats ? { rawStats: extractResponse.rawStats } : {}),
          });
          preflightPack = normalizeEvidencePack(
            {
              enabled: true,
              items: drafts,
            },
            {
              maxItems: modeConfig.finalLimit,
              topic: query,
            },
          );
        } catch (error) {
          rescueReason = `extract_failed:${getTavilyFailureReason(error)}`;
          officialExtractFailed = officialRetryUrls.size > 0;
        }
      }
    }

    const evidenceStatus =
      preflightPack.evidenceStatus ?? (preflightPack.items.length > 0 ? "low" : "none");
    const evidenceWarnings = getEvidenceWarnings(evidenceStatus);
    const evidencePack = normalizeEvidencePack(
      {
        enabled: true,
        evidenceStatus,
        evidenceWarnings,
        items: drafts,
        searchProcess: {
          cacheEvents,
          dedupeStats,
          dedupedCandidateCount: drafts.length,
          evidenceMode:
            rescueTriggered && extractSucceededCount > 0
              ? "rescued_evidence"
              : undefined,
          executedQueries: searchQueries,
          extractAttempted,
          extractedCandidateCount,
          extractSucceededCount,
          finalEvidenceCount: preflightPack.items.length,
          qualityDistribution: getQualityDistribution(preflightPack.items),
          rawCandidateCount,
          rescueReason,
          rescueTriggered,
          officialExtractFailed,
          targetedSearchRetryTriggered,
          targetedSearchRetryReason,
          searchMode,
          provider: searchProvider.id,
          providerDiagnostics,
          searchIntents: [
            {
              participantId: "user-query",
              participantName: "User query",
              provider: "server",
              model: searchProvider.id,
              intents: [
                {
                  question: query,
                  mustInclude: [query],
                  shouldInclude: [],
                  exclude: [],
                  freshness: "any",
                  sourcePreference: "mixed",
                  rationale: "User-triggered direct Tavily evidence search.",
                },
              ],
            },
          ],
        },
        searchQueries,
      },
      {
        maxItems: modeConfig.finalLimit,
        topic: query,
      },
    );

    const safeEvidencePack = sanitizeEvidencePackForClient(evidencePack);

    return NextResponse.json({
      drafts: safeEvidencePack?.items ?? [],
      evidencePack: safeEvidencePack,
      searchSummary: createSearchSummary(evidencePack),
      ...(isEvidenceSearchDebugResponseEnabled()
        ? { debugSearchProcess: evidencePack.searchProcess }
        : {}),
      warnings: [
        ...(evidencePack.evidenceWarnings ?? []),
        ...evidencePack.items.flatMap((item) => item.quality?.warnings ?? []),
      ],
    });
  } catch (error) {
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
    const failureProcess =
      error instanceof TavilySearchError
        ? createSearchFailureProcess({
            executedQueries: searchQueries,
            failureReason: getTavilyFailureReason(error),
            cacheEvents,
            provider: selectedSearchProviderId,
            providerDiagnostics: failureDiagnostics,
            warnings: [getTavilyFailureReason(error)],
          })
        : undefined;
    const failurePack = failureProcess
      ? normalizeEvidencePack({
          enabled: true,
          evidenceStatus: "none",
          items: [],
          searchProcess: failureProcess,
          searchQueries,
        })
      : undefined;

    return NextResponse.json(
      {
        error: getErrorMessage(error),
        ...(failurePack ? { searchSummary: createSearchSummary(failurePack) } : {}),
        ...(failureProcess && isEvidenceSearchDebugResponseEnabled()
          ? { debugSearchProcess: failureProcess }
          : {}),
      },
      {
        status: getErrorStatus(error),
      },
    );
  }
}

function isEvidenceSearchDebugResponseEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.NODE_ENV !== "production" && env.SEARCH_DEBUG_ENABLED === "true";
}

async function readRequestBody(request: Request): Promise<SearchRequestBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new SearchRequestError("invalid json body", 400);
  }

  if (!isRequestBodyObject(body)) {
    throw new SearchRequestError("request body must be an object", 400);
  }

  return body;
}

function isRequestBodyObject(body: unknown): body is SearchRequestBody {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function getQuery(body: SearchRequestBody) {
  if (typeof body.query !== "string") {
    return "";
  }

  return body.query.trim();
}

function getSearchMode(value: unknown): SearchMode {
  return value === "standard" ? "standard" : "deep";
}

function getSearchModeConfig(searchMode: SearchMode): SearchModeConfig {
  if (searchMode === "deep") {
    return {
      candidateLimit: 60,
      extractLimit: 18,
      finalLimit: 10,
      chunksPerSource: 3,
    };
  }

  return {
    candidateLimit: 20,
    extractLimit: 8,
    finalLimit: 8,
    chunksPerSource: 2,
  };
}

function getExtractRescueDecision(
  pack: { items: SearchEvidence[] },
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

function shouldRunTargetedSearchRetry(pack: { items: SearchEvidence[] }): boolean {
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
    `${topic} official announcement report site:openai.com OR site:anthropic.com`,
  ].map((query) => query.slice(0, 160));
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

function getRescueDraftRank(draft: TavilyEvidenceDraft, topic: string): number {
  const quality = scoreEvidence({
    title: draft.title,
    url: draft.url,
    source: draft.source,
    publishedAt: draft.publishedAt,
    snippet: draft.snippet,
    topic,
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
    return 5;
  }

  return Math.max(1, Math.ceil(candidateLimit / queryCount));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof TavilySearchError) {
    return getSafeTavilyErrorMessage(error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getErrorStatus(error: unknown): number {
  if (error instanceof SearchRequestError || error instanceof TavilySearchError) {
    return error.status;
  }

  return 500;
}

class SearchRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function createProviderDiagnostic(
  response: SearchProviderResponse,
  registry: ReturnType<typeof createSearchProviderRegistry>,
): SearchProviderDiagnostic {
  return {
    provider: response.provider,
    displayName: registry.selectedProvider.displayName,
    requestedProviderId: registry.requestedProviderId,
    ...(registry.fallbackReason ? { fallbackReason: registry.fallbackReason } : {}),
    ...(response.diagnostics ? { diagnostics: response.diagnostics } : {}),
    ...(response.rawStats ? { rawStats: response.rawStats } : {}),
  };
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
  original: ReturnType<typeof dedupeSearchResults>["stats"],
  rescued: ReturnType<typeof dedupeSearchResults>["stats"],
) {
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
