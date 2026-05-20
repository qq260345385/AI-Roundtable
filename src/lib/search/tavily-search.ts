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

const DEFAULT_TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_TIMEOUT_MS = 10000;

export class TavilySearchError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export async function searchTavilyEvidence(
  query: string,
  options: TavilySearchOptions = {},
): Promise<TavilyEvidenceDraft[]> {
  const apiKey = options.apiKey ?? process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new TavilySearchError("Tavily search is not configured", 503);
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
      throw new TavilySearchError(
        `Tavily search failed with HTTP ${response.status}`,
        502,
      );
    }

    return normalizeTavilySearchResponse(await response.json());
  } catch (error) {
    if (error instanceof TavilySearchError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new TavilySearchError("Tavily search timed out", 504);
    }

    throw new TavilySearchError("Tavily search failed", 502);
  } finally {
    clearTimeout(timeout);
  }
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
