import type {
  EvidenceSearchPassParameters,
  EvidenceSearchPassStats,
  SearchCacheEvent,
  SearchFreshness,
  SearchProviderDiagnostic,
  SearchQueryLevel,
  SearchQueryQuality,
} from "./evidence-pack";
import {
  isPublicOpinionEvidenceItem,
  normalizeEvidencePack,
} from "./evidence-pack";
import {
  getTavilyFailureReason,
  TavilySearchError,
  type TavilyEvidenceDraft,
} from "./tavily-search";
import type { SearchProvider, SearchProviderResponse } from "./search-provider";
import { getRetrievalPassParameters } from "./candidate-retrieval";
import { isCoreEvidenceCandidate } from "./search-fallbacks";
import type { SearchPassName, SearchPassSpec } from "./search-query-planning";

export const DEFAULT_EVIDENCE_OVERALL_TIMEOUT_MS = 90000;
export const DEFAULT_EVIDENCE_PASS_TIMEOUT_MS = 30000;
export const WEB_SEARCH_RESULTS_PER_QUERY = 20;

export type Searcher = (
  query: string,
  options?: {
    freshness?: SearchFreshness;
    maxResults?: number;
    onCacheEvent?: (event: SearchCacheEvent) => void;
    signal?: AbortSignal;
  },
) => Promise<TavilyEvidenceDraft[]>;
export async function searchWithConfiguredProvider(input: {
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

export function createPassStats(
  passName: SearchPassName,
  query: string,
  drafts: TavilyEvidenceDraft[],
  topic: string,
  meta: {
    durationMs?: number;
    queryLevel?: SearchQueryLevel;
    derivedFrom?: string;
    queryQuality?: SearchQueryQuality;
    searchParameters?: EvidenceSearchPassParameters;
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
    ...(meta.searchParameters ? { searchParameters: meta.searchParameters } : {}),
    ...(meta.skippedReason ? { skippedReason: meta.skippedReason } : {}),
  };
}

export function getPassStatsMeta(
  pass: Pick<
    SearchPassSpec,
    | "queryLevel"
    | "derivedFrom"
    | "queryQuality"
    | "country"
    | "excludeDomains"
    | "includeDomains"
    | "includeRawContent"
    | "searchDepth"
    | "searchTopic"
    | "timeRange"
  >,
  meta: {
    durationMs?: number;
    maxResults?: number;
    skippedReason?: string;
  } = {},
) {
  return {
    ...(meta.durationMs !== undefined ? { durationMs: meta.durationMs } : {}),
    ...(meta.skippedReason ? { skippedReason: meta.skippedReason } : {}),
    ...(pass.queryLevel ? { queryLevel: pass.queryLevel } : {}),
    ...(pass.derivedFrom ? { derivedFrom: pass.derivedFrom } : {}),
    ...(pass.queryQuality ? { queryQuality: pass.queryQuality } : {}),
    searchParameters: getRetrievalPassParameters(pass, meta.maxResults),
  };
}

export function createFailedPassStats(
  passName: SearchPassName,
  query: string,
  durationMs: number,
  errorType: string,
  timedOut: boolean,
  meta: {
    queryLevel?: SearchQueryLevel;
    derivedFrom?: string;
    queryQuality?: SearchQueryQuality;
    searchParameters?: EvidenceSearchPassParameters;
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
    ...(meta.searchParameters ? { searchParameters: meta.searchParameters } : {}),
    ...(meta.skippedReason ? { skippedReason: meta.skippedReason } : {}),
  };
}

export function createSkippedPassStats(
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

export function isKeySearchPass(passName: SearchPassName) {
  return passName !== "social_clue" && passName !== "targeted_retry";
}

export function getSearchPassErrorType(
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

export function isSearchPassTimeout(errorType: string) {
  return (
    errorType === "pass_timeout" ||
    errorType === "tavily_search_timeout" ||
    errorType === "evidence_overall_timeout"
  );
}

export function getExtractErrorType(error: unknown) {
  if (
    error instanceof TavilySearchError &&
    error.diagnostics?.endpoint === "/extract" &&
    (error.status === 504 || error.diagnostics.isAbortError === true)
  ) {
    return "tavily_extract_timeout";
  }

  return getTavilyFailureReason(error);
}

export function createFailedProviderDiagnostic(
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

export function logSearchPassFailure(input: {
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

export function getEvidenceOverallTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
) {
  return normalizeTimeoutMs(
    env.EVIDENCE_OVERALL_TIMEOUT_MS,
    DEFAULT_EVIDENCE_OVERALL_TIMEOUT_MS,
    300000,
  );
}

export function getEvidencePassTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
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

export function getRemainingTimeoutMs(startedAt: number, timeoutMs: number) {
  return timeoutMs - (Date.now() - startedAt);
}

export function createTimedAbortSignal(
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

export function getMaxResultsPerQuery(candidateLimit: number, queryCount: number) {
  if (queryCount <= 0) {
    return Math.min(10, WEB_SEARCH_RESULTS_PER_QUERY);
  }

  return Math.max(5, Math.min(10, Math.ceil(candidateLimit / queryCount)));
}

export function countRetrievalPasses(passStats: EvidenceSearchPassStats[]): number {
  return passStats.filter((stat) => !stat.skippedReason).length;
}

export function recordExtractedCountsByPass(
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

export function createProviderDiagnostic(
  response: SearchProviderResponse,
): SearchProviderDiagnostic {
  return {
    provider: response.provider,
    ...(response.diagnostics ? { diagnostics: response.diagnostics } : {}),
    ...(response.rawStats ? { rawStats: response.rawStats } : {}),
  };
}