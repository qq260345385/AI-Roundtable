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
import type { SearchRegion } from "../types";

type FetchLike = typeof fetch;

type TavilySearchOptions = {
  apiKey?: string;
  autoParameters?: boolean;
  chunksPerSource?: number;
  country?: string;
  endpoint?: string;
  exactMatch?: boolean;
  excludeDomains?: string[];
  fetchImpl?: FetchLike;
  freshness?: SearchFreshness;
  includeDomains?: string[];
  includeRawContent?: boolean | "markdown" | "text";
  includeUsage?: boolean;
  maxResults?: number;
  onCacheEvent?: (event: TavilySearchCacheEvent) => void;
  onResponseMetadata?: (metadata: TavilySearchResponseMetadata) => void;
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  searchRegion?: SearchRegion;
  signal?: AbortSignal;
  timeRange?: "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";
  timeoutMs?: number;
  topic?: "general" | "news" | "finance";
};

type TavilySearchResult = {
  content?: unknown;
  published_date?: unknown;
  raw_content?: unknown;
  score?: unknown;
  title?: unknown;
  url?: unknown;
};

type TavilySearchResponse = {
  auto_parameters?: unknown;
  request_id?: unknown;
  response_time?: unknown;
  results?: unknown;
  usage?: unknown;
};

export type TavilyEvidenceDraft = Omit<SearchEvidence, "id" | "quality">;
export type TavilySearchCacheEvent = SearchCacheEvent;
export type TavilySearchResponseMetadata = {
  autoParameters?: unknown;
  requestId?: string;
  responseTime?: number;
  usage?: unknown;
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
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_TIMEOUT_MS = 30000;

export const SEARCH_REGION_COUNTRY_MAP: Record<SearchRegion, string | undefined> = {
  auto: undefined,
  global: undefined,
  china: "china",
  us: "united states",
  europe: undefined,
  japan: "japan",
  korea: "south korea",
};
const DEFAULT_CHUNKS_PER_SOURCE = 5;
const DEFAULT_INCLUDE_RAW_CONTENT = "text";
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
  "people.com.cn",
  "people.cn",
  "stcn.com",
  "globaltimes.cn",
  "yahoo.com",
  "finance.yahoo.com",
  "tw.stock.yahoo.com",
  "gasgoo.com",
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
    let metadata: TavilySearchResponseMetadata | undefined;
    const results = await searchTavilyEvidence(request.query, {
      chunksPerSource: request.chunksPerSource,
      country: request.country,
      exactMatch: request.exactMatch,
      excludeDomains: request.excludeDomains,
      freshness: request.freshness,
      includeDomains: request.includeDomains,
      includeRawContent: request.includeRawContent,
      includeUsage: request.includeUsage,
      maxResults: request.maxResults,
      onCacheEvent: (event) => cacheEvents.push(event),
      onResponseMetadata: (event) => {
        metadata = event;
      },
      searchDepth: request.searchDepth,
      searchRegion: request.searchRegion,
      signal: request.signal,
      timeRange: request.timeRange,
      topic: request.searchTopic,
    });

    return {
      provider: this.id,
      results: results.map((result) => ({
        title: result.title,
        ...(result.url ? { url: result.url } : {}),
        content: result.snippet,
        snippet: result.snippet,
        ...(result.publishedAt ? { publishedDate: result.publishedAt } : {}),
        ...(typeof result.providerScore === "number"
          ? { providerScore: result.providerScore }
          : {}),
        sourceQuery: request.query,
        provider: this.id,
      })),
      ...(cacheEvents.length > 0 ? { cacheEvents } : {}),
      diagnostics: {
        resultCount: results.length,
        searchDepth: request.searchDepth,
        maxResults: request.maxResults,
        freshness: request.freshness,
        ...(request.searchTopic ? { topic: request.searchTopic } : {}),
        ...(request.timeRange ? { timeRange: request.timeRange } : {}),
        ...(request.country ? { country: request.country } : {}),
        ...(request.includeDomains
          ? { includeDomains: request.includeDomains }
          : {}),
        ...(request.excludeDomains
          ? { excludeDomains: request.excludeDomains }
          : {}),
        ...(request.includeRawContent
          ? { includeRawContent: request.includeRawContent }
          : {}),
        ...(request.chunksPerSource
          ? { chunksPerSource: request.chunksPerSource }
          : {}),
        ...(metadata ? { tavily: metadata } : {}),
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
    autoParameters: options.autoParameters,
    chunksPerSource:
      normalizeChunksPerSource(options.chunksPerSource) ??
      DEFAULT_CHUNKS_PER_SOURCE,
    exactMatch: options.exactMatch,
    excludeDomains: normalizeDomains(options.excludeDomains),
    includeDomains: normalizeDomains(options.includeDomains),
    includeRawContent: normalizeIncludeRawContent(
      options.includeRawContent ?? DEFAULT_INCLUDE_RAW_CONTENT,
    ),
    includeUsage: options.includeUsage,
    maxResults: options.maxResults ?? getEnvMaxResults(),
    searchDepth: options.searchDepth ?? getEnvSearchDepth(),
    timeRange: options.timeRange,
    topic: options.topic ?? getEnvTopic(),
  };
  const country = getEffectiveCountry(options.country, options.searchRegion);
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
  const timeoutMs = options.timeoutMs ?? getTavilySearchTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestSignal = createCombinedAbortSignal(
    options.signal,
    controller.signal,
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
        body: JSON.stringify(
          buildTavilySearchRequestBody(query, {
            ...effectiveOptions,
            searchTopic: effectiveOptions.topic,
            country,
          }),
        ),
        signal: requestSignal,
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
    let responseText = "";

    try {
      responseText = await response.text();
      data = JSON.parse(responseText);
    } catch {
      throw new TavilySearchError("invalid_response", {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/search",
          errorKind: "invalid_response",
          responseTextSnippet: responseText,
          safeMessage: "Search response was not valid JSON.",
        }),
        reason: "invalid_response",
      });
    }

    const providerError = extractTavilyProviderError(data);

    if (providerError) {
      throw new TavilySearchError("invalid_request", {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/search",
          errorKind: "invalid_request",
          responseTextSnippet: providerError,
          safeMessage: providerError,
        }),
        reason: "invalid_request",
      });
    }

    if (!isObject(data) || !Array.isArray(data.results)) {
      throw new TavilySearchError("invalid_response", {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/search",
          errorKind: "invalid_response",
          responseTextSnippet: safeJsonSnippet(data),
          safeMessage: "Search response did not include a results array.",
        }),
        reason: "invalid_response",
      });
    }

    options.onResponseMetadata?.(extractTavilyResponseMetadata(data));
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

export function getTavilySearchTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
) {
  return normalizeTimeoutMs(env.TAVILY_SEARCH_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
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

const MAX_INCLUDE_DOMAINS = 300;
const MAX_EXCLUDE_DOMAINS = 150;

function buildTavilySearchRequestBody(
  query: string,
  options: {
    autoParameters?: boolean;
    chunksPerSource?: number;
    country?: string;
    exactMatch?: boolean;
    excludeDomains: string[];
    includeDomains: string[];
    includeRawContent: false | true | "markdown" | "text";
    includeUsage?: boolean;
    maxResults: number;
    searchDepth: NonNullable<TavilySearchOptions["searchDepth"]>;
    searchTopic?: "general" | "news" | "finance";
    timeRange?: TavilySearchOptions["timeRange"];
  },
) {
  const includeDomains = options.includeDomains.slice(0, MAX_INCLUDE_DOMAINS);
  const excludeDomains = options.excludeDomains.slice(0, MAX_EXCLUDE_DOMAINS);

  return {
    include_answer: false,
    include_images: false,
    include_raw_content: options.includeRawContent,
    max_results: options.maxResults,
    query,
    search_depth: options.searchDepth,
    ...(options.autoParameters !== undefined
      ? { auto_parameters: options.autoParameters }
      : {}),
    ...(options.searchDepth === "advanced" && options.chunksPerSource !== undefined
      ? { chunks_per_source: options.chunksPerSource }
      : {}),
    ...(options.timeRange ? { time_range: options.timeRange } : {}),
    ...(options.country && (options.searchTopic === undefined || options.searchTopic === "general")
      ? { country: options.country }
      : {}),
    ...(includeDomains.length > 0
      ? { include_domains: includeDomains }
      : {}),
    ...(excludeDomains.length > 0
      ? { exclude_domains: excludeDomains }
      : {}),
    ...(options.exactMatch !== undefined ? { exact_match: options.exactMatch } : {}),
    ...(options.includeUsage !== undefined
      ? { include_usage: options.includeUsage }
      : {}),
  };
}

function extractTavilyResponseMetadata(
  data: TavilySearchResponse,
): TavilySearchResponseMetadata {
  const responseTime =
    typeof data.response_time === "number"
      ? data.response_time
      : typeof data.response_time === "string"
        ? Number(data.response_time)
        : undefined;
  const requestId = stringFrom(data.request_id).trim();

  return {
    ...(Number.isFinite(responseTime)
      ? { responseTime: Number(responseTime) }
      : {}),
    ...(requestId ? { requestId } : {}),
    ...(data.usage !== undefined ? { usage: data.usage } : {}),
    ...(data.auto_parameters !== undefined
      ? { autoParameters: data.auto_parameters }
      : {}),
  };
}

function extractTavilyProviderError(data: unknown): string | undefined {
  if (!isObject(data)) {
    return undefined;
  }

  const detail = data.detail;

  if (typeof detail === "string") {
    return sanitizeSearchText(detail).slice(0, 300);
  }

  if (isObject(detail) && typeof detail.error === "string") {
    return sanitizeSearchText(detail.error).slice(0, 300);
  }

  if (typeof data.error === "string") {
    return sanitizeSearchText(data.error).slice(0, 300);
  }

  return undefined;
}

function createCombinedAbortSignal(
  externalSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
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

function safeJsonSnippet(value: unknown): string {
  try {
    return sanitizeSearchText(JSON.stringify(value)).slice(0, 300);
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

function normalizeTimeoutMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1000), 120000);
}

function normalizeChunksPerSource(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(Math.max(Math.trunc(value), 1), 5);
}

function normalizeDomains(values: string[] | undefined) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) =>
          normalizeOptionalSearchText(value)
            .toLowerCase()
            .replace(/^https?:\/\//, "")
            .replace(/^www\./, "")
            .replace(/\/+$/, ""),
        )
        .filter(Boolean),
    ),
  ).slice(0, 300);
}

function normalizeIncludeRawContent(
  value: TavilySearchOptions["includeRawContent"],
) {
  return value === "markdown" || value === "text" || value === true
    ? value
    : false;
}

function getEffectiveCountry(
  explicitCountry: string | undefined,
  searchRegion?: SearchRegion,
) {
  if (searchRegion) {
    return SEARCH_REGION_COUNTRY_MAP[searchRegion];
  }

  return normalizeOptionalSearchText(explicitCountry) || undefined;
}

function normalizeOptionalSearchText(value: string | undefined) {
  return typeof value === "string"
    ? sanitizeSearchText(value).replace(/\s+/g, " ").trim()
    : "";
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

  return "advanced";
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
  const snippet = sanitizeSearchText(
    stringFrom(tavilyResult.raw_content) || stringFrom(tavilyResult.content),
  ).trim();

  const url = normalizeUrl(tavilyResult.url);
  if (!snippet && !url) {
    return null;
  }

  const source = url ? getSourceFromUrl(url) : undefined;
  const title = sanitizeSearchText(stringFrom(tavilyResult.title)).trim();
  const publishedAt = sanitizeSearchText(
    stringFrom(tavilyResult.published_date),
  ).trim();
  const providerScore =
    typeof tavilyResult.score === "number" && Number.isFinite(tavilyResult.score)
      ? tavilyResult.score
      : undefined;

  return {
    title: title || source || "Web search result",
    snippet,
    ...(providerScore !== undefined ? { providerScore } : {}),
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
    const mergedPasses = mergeSeenInPasses(existing, normalized);

    byCanonicalUrl.set(key, {
      ...better,
      sourceQueries: mergedQueries,
      ...(mergedPasses.length > 0 ? { seenInPasses: mergedPasses } : {}),
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
    autoParameters?: boolean;
    chunksPerSource?: number;
    country?: string;
    exactMatch?: boolean;
    excludeDomains: string[];
    includeDomains: string[];
    includeRawContent: false | true | "markdown" | "text";
    includeUsage?: boolean;
    maxResults: number;
    searchDepth: NonNullable<TavilySearchOptions["searchDepth"]>;
    timeRange?: TavilySearchOptions["timeRange"];
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
    autoParameters: options.autoParameters ?? false,
    chunksPerSource: options.chunksPerSource ?? 0,
    country: options.country ?? "",
    exactMatch: options.exactMatch ?? false,
    excludeDomains: options.excludeDomains,
    includeDomains: options.includeDomains,
    includeRawContent: options.includeRawContent,
    includeUsage: options.includeUsage ?? false,
    timeRange: options.timeRange ?? "",
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

function mergeSeenInPasses(
  left: TavilyEvidenceDraft,
  right: TavilyEvidenceDraft,
) {
  return mergeUniqueStrings([
    ...(left.seenInPasses ?? []),
    ...(right.seenInPasses ?? []),
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
