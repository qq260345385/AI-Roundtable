import type { SearchEvidence } from "./evidence-pack";

type FetchLike = typeof fetch;

type TavilySearchOptions = {
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  maxResults?: number;
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
export type TavilyFailureReason =
  | "missing_api_key"
  | "unauthorized"
  | "rate_limited"
  | "network_error"
  | "invalid_response"
  | "unknown_error";

const DEFAULT_TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_TIMEOUT_MS = 10000;

export class TavilySearchError extends Error {
  constructor(
    messageOrReason: string,
    options: number | { reason: TavilyFailureReason; status?: number } = 502,
  ) {
    const reason =
      typeof options === "number"
        ? getReasonFromLegacyMessage(messageOrReason)
        : options.reason;

    super(`Tavily search failed: ${reason}`);
    this.reason = reason;
    this.status = typeof options === "number" ? options : options.status ?? 502;
  }

  reason: TavilyFailureReason;
  status: number;
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
          max_results: options.maxResults ?? getEnvMaxResults(),
          query,
          search_depth: options.searchDepth ?? getEnvSearchDepth(),
          topic: options.topic ?? getEnvTopic(),
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new TavilySearchError(getHttpFailureReason(response.status), {
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

    return normalizeTavilySearchResponse(data);
  } catch (error) {
    if (error instanceof TavilySearchError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new TavilySearchError("network_error", {
        reason: "network_error",
        status: 504,
      });
    }

    throw new TavilySearchError("network_error", {
      reason: "network_error",
      status: 502,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getHttpFailureReason(status: number): TavilyFailureReason {
  if (status === 401 || status === 403) {
    return "unauthorized";
  }

  if (status === 429) {
    return "rate_limited";
  }

  return "unknown_error";
}

export function normalizeTavilySearchResponse(
  response: TavilySearchResponse,
): TavilyEvidenceDraft[] {
  if (!Array.isArray(response.results)) {
    return [];
  }

  return response.results
    .map(normalizeTavilyResult)
    .filter((result): result is TavilyEvidenceDraft => result !== null)
    .slice(0, DEFAULT_MAX_RESULTS);
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

  if (!snippet) {
    return null;
  }

  const url = normalizeUrl(tavilyResult.url);
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

function normalizeUrl(value: unknown) {
  const rawUrl = sanitizeSearchText(stringFrom(value)).trim();

  if (!/^https?:\/\/\S+$/i.test(rawUrl)) {
    return undefined;
  }

  return rawUrl;
}

function getSourceFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
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
