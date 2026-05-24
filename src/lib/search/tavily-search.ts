import type {
  SearchCacheEvent,
  SearchEvidence,
  SearchFreshness,
} from "./evidence-pack";
import type {
  SearchProvider,
  SearchProviderRequest,
  SearchProviderResponse,
} from "./search-provider";

type FetchLike = typeof fetch;

type TavilySearchOptions = {
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  freshness?: SearchFreshness;
  maxResults?: number;
  onCacheEvent?: (event: TavilySearchCacheEvent) => void;
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  timeoutMs?: number;
  topic?: "general" | "news" | "finance";
};

type TavilySearchResult = {
  content?: unknown;
  published_date?: unknown;
  title?: unknown;
  url?: unknown;
};

type TavilySearchResponse = {
  results?: unknown;
};

export type TavilyEvidenceDraft = Omit<SearchEvidence, "id" | "quality">;
export type TavilySearchCacheEvent = SearchCacheEvent;
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
export type SearchDedupeResult<T extends TavilyEvidenceDraft = TavilyEvidenceDraft> = {
  items: T[];
  stats: SearchDedupeStats;
};
export type TavilyFailureReason =
  | "missing_api_key"
  | "invalid_request"
  | "unauthorized"
  | "rate_limited"
  | "network_error"
  | "invalid_response"
  | "unknown_error";

export type SafeTavilyDiagnostics = {
  provider: "tavily";
  endpoint: "/search" | "/extract";
  errorKind: TavilyFailureReason;
  httpStatus?: number;
  safeMessage?: string;
  errorName?: string;
  isAbortError: boolean;
  isTypeError: boolean;
  responseTextSnippet?: string;
  requestHasApiKey: boolean;
  apiKeyLength: number;
  nodeVersion: string;
  fetchAvailable: boolean;
};

const DEFAULT_TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_TIMEOUT_MS = 10000;
const REALTIME_CACHE_TTL_MS = 30 * 60 * 1000;
const STANDARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const STABLE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TRACKING_QUERY_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
  "igshid",
]);
const AUTHORITY_DOMAINS = new Set([
  "openai.com",
  "anthropic.com",
  "deepmind.google",
  "ai.google.dev",
  "googleblog.com",
  "blog.google",
  "lmarena.ai",
  "artificialanalysis.ai",
  "swebench.com",
  "paperswithcode.com",
  "arxiv.org",
  "huggingface.co",
  "github.com",
]);
const MEDIA_DOMAINS = new Set([
  "reuters.com",
  "bloomberg.com",
  "bbc.com",
  "cnn.com",
  "theverge.com",
  "techcrunch.com",
  "36kr.com",
]);
const tavilySearchCache = new Map<
  string,
  { expiresAt: number; items: TavilyEvidenceDraft[] }
>();

export class TavilySearchError extends Error {
  constructor(
    messageOrReason: string,
    options:
      | number
      | {
          diagnostics?: SafeTavilyDiagnostics;
          reason: TavilyFailureReason;
          status?: number;
        } = 502,
  ) {
    const reason =
      typeof options === "number"
        ? getReasonFromLegacyMessage(messageOrReason)
        : options.reason;

    super(`Tavily search failed: ${reason}`);
    this.reason = reason;
    this.status = typeof options === "number" ? options : options.status ?? 502;
    this.diagnostics =
      typeof options === "number" ? undefined : options.diagnostics;
  }

  reason: TavilyFailureReason;
  status: number;
  diagnostics?: SafeTavilyDiagnostics;
}

export class TavilySearchProvider implements SearchProvider {
  id = "tavily";
  displayName = "Tavily";

  async search(
    request: SearchProviderRequest,
  ): Promise<SearchProviderResponse> {
    const cacheEvents: SearchCacheEvent[] = [];
    const results = await searchTavilyEvidence(request.query, {
      freshness: request.freshness,
      maxResults: request.maxResults,
      onCacheEvent: (event) => cacheEvents.push(event),
      searchDepth: request.searchDepth,
    });

    return {
      provider: this.id,
      results: results.map((result) => ({
        title: result.title,
        ...(result.url ? { url: result.url } : {}),
        content: result.snippet,
        snippet: result.snippet,
        ...(result.publishedAt ? { publishedDate: result.publishedAt } : {}),
        sourceQuery: request.query,
        provider: this.id,
      })),
      ...(cacheEvents.length > 0 ? { cacheEvents } : {}),
      diagnostics: {
        resultCount: results.length,
        searchDepth: request.searchDepth,
        maxResults: request.maxResults,
        freshness: request.freshness,
      },
    };
  }
}

export function getTavilyFailureReason(error: unknown): TavilyFailureReason {
  if (error instanceof TavilySearchError) {
    return error.reason;
  }

  return "unknown_error";
}

export function getSafeTavilyErrorMessage(error: unknown): string {
  return `Tavily search failed: ${getTavilyFailureReason(error)}`;
}

function getReasonFromLegacyMessage(message: string): TavilyFailureReason {
  if (message.includes("not configured")) {
    return "missing_api_key";
  }

  if (message.includes("timed out") || message.includes("failed")) {
    return "network_error";
  }

  return "unknown_error";
}

export async function searchTavilyEvidence(
  query: string,
  options: TavilySearchOptions = {},
): Promise<TavilyEvidenceDraft[]> {
  const apiKey = options.apiKey ?? process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new TavilySearchError("missing_api_key", {
      reason: "missing_api_key",
      status: 503,
    });
  }

  const effectiveOptions = {
    maxResults: options.maxResults ?? getEnvMaxResults(),
    searchDepth: options.searchDepth ?? getEnvSearchDepth(),
    topic: options.topic ?? getEnvTopic(),
  };
  const cacheKey = getTavilyCacheKey(query, effectiveOptions, options.freshness);
  const ttlMs = getTavilyCacheTtlMs(query, options.freshness);
  const cached = tavilySearchCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    options.onCacheEvent?.({
      provider: "tavily",
      query,
      cacheKey,
      cacheStatus: "hit",
      ttlMs,
      expiresAt: new Date(cached.expiresAt).toISOString(),
    });

    return cloneEvidenceDrafts(cached.items);
  }

  if (cached) {
    tavilySearchCache.delete(cacheKey);
  }

  options.onCacheEvent?.({
    provider: "tavily",
    query,
    cacheKey,
    cacheStatus: "miss",
    ttlMs,
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await (options.fetchImpl ?? fetch)(
      options.endpoint ?? DEFAULT_TAVILY_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          include_answer: false,
          include_images: false,
          include_raw_content: false,
          max_results: effectiveOptions.maxResults,
          query,
          search_depth: effectiveOptions.searchDepth,
          topic: effectiveOptions.topic,
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const responseTextSnippet = await readSafeResponseTextSnippet(response);

      throw new TavilySearchError(getHttpFailureReason(response.status), {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/search",
          errorKind: getHttpFailureReason(response.status),
          httpStatus: response.status,
          responseTextSnippet,
          safeMessage: response.statusText,
        }),
        reason: getHttpFailureReason(response.status),
        status: 502,
      });
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new TavilySearchError("invalid_response", {
        reason: "invalid_response",
      });
    }

    if (!isObject(data) || !Array.isArray(data.results)) {
      throw new TavilySearchError("invalid_response", {
        reason: "invalid_response",
      });
    }

    const drafts = normalizeTavilySearchResponse(data, effectiveOptions.maxResults);

    tavilySearchCache.set(cacheKey, {
      expiresAt: Date.now() + ttlMs,
      items: cloneEvidenceDrafts(drafts),
    });

    return drafts;
  } catch (error) {
    if (error instanceof TavilySearchError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new TavilySearchError("network_error", {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/search",
          error,
          errorKind: "network_error",
        }),
        reason: "network_error",
        status: 504,
      });
    }

    throw new TavilySearchError("network_error", {
      diagnostics: createSafeTavilyDiagnostics({
        apiKey,
        endpoint: "/search",
        error,
        errorKind: "network_error",
      }),
      reason: "network_error",
      status: 502,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function clearTavilySearchCache() {
  tavilySearchCache.clear();
}

export function getTavilyCacheTtlMs(
  query: string,
  freshness: SearchFreshness | undefined,
) {
  if (
    freshness === "latest" ||
    freshness === "recent" ||
    /latest|current|today|now|breaking|release|ranking|price|news|202\d|最新|当前|目前|今天|现在|发布|排名|价格|新闻/i.test(
      query,
    )
  ) {
    return REALTIME_CACHE_TTL_MS;
  }

  if (
    /history|historical|concept|definition|overview|what is|explain|principle|background|历史|概念|定义|原理|背景/i.test(
      query,
    )
  ) {
    return STABLE_CACHE_TTL_MS;
  }

  return STANDARD_CACHE_TTL_MS;
}

function getHttpFailureReason(status: number): TavilyFailureReason {
  if (status === 400) {
    return "invalid_request";
  }

  if (status === 401 || status === 403) {
    return "unauthorized";
  }

  if (status === 429) {
    return "rate_limited";
  }

  return "unknown_error";
}

export function createSafeTavilyDiagnostics(input: {
  apiKey: string | undefined;
  endpoint: "/search" | "/extract";
  error?: unknown;
  errorKind: TavilyFailureReason;
  httpStatus?: number;
  responseTextSnippet?: string;
  safeMessage?: string;
}): SafeTavilyDiagnostics {
  const error = input.error instanceof Error ? input.error : undefined;

  return {
    provider: "tavily",
    endpoint: input.endpoint,
    errorKind: input.errorKind,
    ...(input.httpStatus ? { httpStatus: input.httpStatus } : {}),
    ...(input.safeMessage
      ? { safeMessage: sanitizeSearchText(input.safeMessage).slice(0, 120) }
      : {}),
    ...(error?.name ? { errorName: sanitizeSearchText(error.name).slice(0, 80) } : {}),
    isAbortError: error?.name === "AbortError",
    isTypeError: error instanceof TypeError,
    ...(input.responseTextSnippet
      ? {
          responseTextSnippet: sanitizeSearchText(
            input.responseTextSnippet,
          ).slice(0, 300),
        }
      : {}),
    requestHasApiKey: Boolean(input.apiKey),
    apiKeyLength: input.apiKey?.length ?? 0,
    nodeVersion: process.version,
    fetchAvailable: typeof fetch === "function",
  };
}

async function readSafeResponseTextSnippet(response: Response) {
  try {
    return sanitizeSearchText(await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}

export function normalizeTavilySearchResponse(
  response: TavilySearchResponse,
  maxResults = DEFAULT_MAX_RESULTS,
): TavilyEvidenceDraft[] {
  if (!Array.isArray(response.results)) {
    return [];
  }

  return response.results
    .map(normalizeTavilyResult)
    .filter((result): result is TavilyEvidenceDraft => result !== null)
    .slice(0, Math.max(1, maxResults));
}

export function buildTavilySearchQueries(topic: string): string[] {
  const normalizedTopic = topic.trim();

  if (!normalizedTopic) {
    return [];
  }

  const englishTopic = normalizedTopic.replace(/[^\p{L}\p{N}\s.-]/gu, " ");
  const queries = [
    `${englishTopic} official report`,
    `${englishTopic} benchmark`,
    `${englishTopic} latest analysis`,
    `${englishTopic} comparison`,
    normalizedTopic,
  ];

  return Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)))
    .slice(0, 6);
}

function getEnvMaxResults() {
  const value = Number(process.env.TAVILY_MAX_RESULTS);

  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_RESULTS;
  }

  return Math.min(Math.max(Math.trunc(value), 1), DEFAULT_MAX_RESULTS);
}

function getEnvSearchDepth(): NonNullable<TavilySearchOptions["searchDepth"]> {
  const value = process.env.TAVILY_SEARCH_DEPTH;

  if (
    value === "advanced" ||
    value === "fast" ||
    value === "ultra-fast" ||
    value === "basic"
  ) {
    return value;
  }

  return "basic";
}

function getEnvTopic(): NonNullable<TavilySearchOptions["topic"]> {
  const value = process.env.TAVILY_TOPIC;

  if (value === "news" || value === "finance" || value === "general") {
    return value;
  }

  return "general";
}

function normalizeTavilyResult(
  result: unknown,
): TavilyEvidenceDraft | null {
  if (!isObject(result)) {
    return null;
  }

  const tavilyResult = result as TavilySearchResult;
  const snippet = sanitizeSearchText(stringFrom(tavilyResult.content)).trim();

  const url = normalizeUrl(tavilyResult.url);
  if (!snippet && !url) {
    return null;
  }

  const source = url ? getSourceFromUrl(url) : undefined;
  const title = sanitizeSearchText(stringFrom(tavilyResult.title)).trim();
  const publishedAt = sanitizeSearchText(
    stringFrom(tavilyResult.published_date),
  ).trim();

  return {
    title: title || source || "Web search result",
    snippet,
    ...(source ? { source } : {}),
    ...(url ? { url } : {}),
    ...(publishedAt ? { publishedAt } : {}),
  };
}

export function normalizeUrl(value: unknown) {
  const rawUrl = sanitizeSearchText(stringFrom(value)).trim();

  if (!/^https?:\/\/\S+$/i.test(rawUrl)) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);

    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";

    for (const key of Array.from(url.searchParams.keys())) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.startsWith("utm_") ||
        TRACKING_QUERY_PARAMS.has(normalizedKey)
      ) {
        url.searchParams.delete(key);
      }
    }

    const sortedParams = Array.from(url.searchParams.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    url.search = "";

    for (const [key, value] of sortedParams) {
      url.searchParams.append(key, value);
    }

    const pathname = url.pathname.replace(/\/+$/, "");
    const path = pathname && pathname !== "/" ? pathname : "";
    const search = url.searchParams.size > 0 ? `?${url.searchParams}` : "";

    return `${url.protocol}//${url.hostname}${path}${search}`;
  } catch {
    return undefined;
  }
}

export function dedupeSearchResults<T extends TavilyEvidenceDraft>(
  drafts: T[],
  options: {
    defaultDomainLimit?: number;
    authorityDomainLimit?: number;
    minResultsBeforeRelaxingDomainLimit?: number;
  } = {},
): SearchDedupeResult<T> {
  const defaultDomainLimit = options.defaultDomainLimit ?? 2;
  const authorityDomainLimit = options.authorityDomainLimit ?? 3;
  const minResultsBeforeRelaxingDomainLimit =
    options.minResultsBeforeRelaxingDomainLimit ?? 4;
  const removals: SearchDedupeRemoval[] = [];
  const byCanonicalUrl = new Map<string, T>();

  for (const draft of drafts) {
    const normalized = normalizeDraftUrlAndQueries(draft);
    const key = getResultDedupeKey(normalized);
    const existing = byCanonicalUrl.get(key);

    if (!existing) {
      byCanonicalUrl.set(key, normalized);
      continue;
    }

    const better = pickBetterDraft(existing, normalized);
    const removed = better === existing ? normalized : existing;
    const mergedQueries = mergeSourceQueries(existing, normalized);

    byCanonicalUrl.set(key, {
      ...better,
      sourceQueries: mergedQueries,
    });
    removals.push({
      title: removed.title,
      ...(removed.url ? { url: removed.url } : {}),
      ...(removed.source ? { source: removed.source } : {}),
      reason: "duplicate_url",
      ...(better.url ? { keptUrl: better.url } : {}),
      sourceQueries: mergedQueries,
    });
  }

  const duplicateRemovedCount = removals.length;
  const candidates = Array.from(byCanonicalUrl.values()).sort(compareDraftQuality);
  const domainCounts = new Map<string, number>();
  const kept: T[] = [];
  const sameDomainRemoved: T[] = [];

  for (const candidate of candidates) {
    const domain = getDomain(candidate.url, candidate.source);
    const limit = isAuthorityDomain(domain)
      ? authorityDomainLimit
      : defaultDomainLimit;
    const count = domainCounts.get(domain) ?? 0;

    if (domain && count >= limit) {
      sameDomainRemoved.push(candidate);
      removals.push({
        title: candidate.title,
        ...(candidate.url ? { url: candidate.url } : {}),
        ...(candidate.source ? { source: candidate.source } : {}),
        reason: "same_domain_limit",
        domain,
        ...(candidate.sourceQueries ? { sourceQueries: candidate.sourceQueries } : {}),
      });
      continue;
    }

    kept.push(candidate);
    domainCounts.set(domain, count + 1);
  }

  let domainLimitRelaxedReason: string | undefined;

  if (
    kept.length < minResultsBeforeRelaxingDomainLimit &&
    sameDomainRemoved.length > 0
  ) {
    domainLimitRelaxedReason =
      "Too few deduped results remained, so same-domain filtering was relaxed.";
    const needed = minResultsBeforeRelaxingDomainLimit - kept.length;
    const restored = sameDomainRemoved.slice(0, needed);

    kept.push(...restored);
    for (const restoredItem of restored) {
      const index = removals.findIndex(
        (removal) =>
          removal.reason === "same_domain_limit" &&
          removal.title === restoredItem.title &&
          removal.url === restoredItem.url,
      );

      if (index >= 0) {
        removals.splice(index, 1);
      }
    }
  }

  const removedSameDomainCount = removals.filter(
    (removal) => removal.reason === "same_domain_limit",
  ).length;

  return {
    items: kept,
    stats: {
      originalResultCount: drafts.length,
      dedupedResultCount: kept.length,
      removedDuplicateCount: duplicateRemovedCount,
      removedSameDomainCount,
      removals,
      ...(domainLimitRelaxedReason ? { domainLimitRelaxedReason } : {}),
    },
  };
}

function getSourceFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function getTavilyCacheKey(
  query: string,
  options: {
    maxResults: number;
    searchDepth: NonNullable<TavilySearchOptions["searchDepth"]>;
    topic: NonNullable<TavilySearchOptions["topic"]>;
  },
  freshness: SearchFreshness | undefined,
) {
  return JSON.stringify({
    provider: "tavily",
    query: query.trim(),
    searchDepth: options.searchDepth,
    maxResults: options.maxResults,
    topic: options.topic,
    freshness: freshness ?? "any",
  });
}

function cloneEvidenceDrafts(items: TavilyEvidenceDraft[]) {
  return items.map((item) => ({
    ...item,
    ...(item.sourceQueries ? { sourceQueries: [...item.sourceQueries] } : {}),
  }));
}

function normalizeDraftUrlAndQueries<T extends TavilyEvidenceDraft>(draft: T): T {
  const url = normalizeUrl(draft.url);
  const source = url ? getSourceFromUrl(url) : draft.source;
  const sourceQueries = mergeUniqueStrings([
    ...(draft.sourceQueries ?? []),
    ...(draft.query ? [draft.query] : []),
  ]);

  return {
    ...draft,
    ...(url ? { url } : {}),
    ...(source ? { source } : {}),
    ...(sourceQueries.length > 0 ? { sourceQueries } : {}),
  };
}

function getResultDedupeKey(draft: TavilyEvidenceDraft) {
  return draft.url
    ? `url:${draft.url.toLowerCase()}`
    : `title:${draft.title.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function pickBetterDraft<T extends TavilyEvidenceDraft>(left: T, right: T): T {
  return compareDraftQuality(left, right) <= 0 ? left : right;
}

function mergeSourceQueries(
  left: TavilyEvidenceDraft,
  right: TavilyEvidenceDraft,
) {
  return mergeUniqueStrings([
    ...(left.sourceQueries ?? []),
    ...(left.query ? [left.query] : []),
    ...(right.sourceQueries ?? []),
    ...(right.query ? [right.query] : []),
  ]);
}

function mergeUniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of values) {
    const normalized = value.trim();

    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      merged.push(normalized);
    }
  }

  return merged;
}

function compareDraftQuality(
  left: TavilyEvidenceDraft,
  right: TavilyEvidenceDraft,
) {
  const authorityDelta =
    getDomainAuthorityScore(right) - getDomainAuthorityScore(left);

  if (authorityDelta !== 0) {
    return authorityDelta;
  }

  return right.snippet.length - left.snippet.length;
}

function getDomainAuthorityScore(draft: TavilyEvidenceDraft) {
  const domain = getDomain(draft.url, draft.source);

  if (isAuthorityDomain(domain)) {
    return 100;
  }

  if (MEDIA_DOMAINS.has(domain)) {
    return 70;
  }

  if (["reddit.com", "zhihu.com", "x.com", "twitter.com"].includes(domain)) {
    return 25;
  }

  return 40;
}

function getDomain(url: string | undefined, source: string | undefined) {
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      // Fall through to source.
    }
  }

  return (source ?? "").replace(/^www\./, "").toLowerCase();
}

function isAuthorityDomain(domain: string) {
  return (
    AUTHORITY_DOMAINS.has(domain) ||
    Array.from(AUTHORITY_DOMAINS).some((candidate) =>
      domain.endsWith(`.${candidate}`),
    )
  );
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sanitizeSearchText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
