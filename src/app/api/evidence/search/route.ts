import { NextResponse } from "next/server";
import {
  createSearchFailureProcess,
  normalizeEvidencePack,
  type SearchMode,
  type SearchCacheEvent,
  type SearchEvidence,
  type SearchProviderDiagnostic,
} from "../../../../lib/search/evidence-pack";
import {
  createSearchSummary,
  isSearchDebugResponseEnabled,
  sanitizeEvidencePackForClient,
} from "../../../../lib/search/search-response";
import {
  TavilySearchError,
  buildTavilySearchQueries,
  dedupeSearchResults,
  getSafeTavilyErrorMessage,
  getTavilyFailureReason,
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

    if (
      preflightPack.items.length < 3 &&
      drafts.some((draft) => draft.url)
    ) {
      rescueTriggered = true;
      rescueReason = "usable_evidence_below_threshold";
      const rescueUrls = drafts
        .map((draft) => draft.url)
        .filter((url): url is string => Boolean(url))
        .slice(0, modeConfig.extractLimit);

      extractAttempted = rescueUrls.length;

      if (rescueUrls.length > 0) {
        try {
          const extractProvider = getExtractProvider();
          const extractResponse = await extractProvider.extract({
            urls: rescueUrls,
            query,
            chunksPerSource: modeConfig.chunksPerSource,
            extractDepth: searchMode === "deep" ? "advanced" : "basic",
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
          extractSucceededCount = extractedDrafts.filter((draft) =>
            draft.snippet.trim(),
          ).length;
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
      ...(isSearchDebugResponseEnabled()
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
        ...(failureProcess && isSearchDebugResponseEnabled()
          ? { debugSearchProcess: failureProcess }
          : {}),
      },
      {
        status: getErrorStatus(error),
      },
    );
  }
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
  return value === "deep" ? "deep" : "standard";
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
