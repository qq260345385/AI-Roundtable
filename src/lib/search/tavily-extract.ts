import type {
  ExtractProvider,
  ExtractProviderRequest,
  ExtractProviderResponse,
} from "./extract-provider";
import {
  createSafeTavilyDiagnostics,
  TavilySearchError,
  type TavilyFailureReason,
} from "./tavily-search";

type FetchLike = typeof fetch;

type TavilyExtractOptions = {
  apiKey?: string;
  endpoint?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

type TavilyExtractResult = {
  title?: unknown;
  url?: unknown;
  raw_content?: unknown;
  content?: unknown;
};

const DEFAULT_TAVILY_EXTRACT_ENDPOINT = "https://api.tavily.com/extract";
const DEFAULT_TIMEOUT_MS = 15000;

export class TavilyExtractProvider implements ExtractProvider {
  id = "tavily";
  displayName = "Tavily Extract";

  async extract(
    request: ExtractProviderRequest,
  ): Promise<ExtractProviderResponse> {
    const response = await extractTavilyUrls(request, {});

    return {
      provider: this.id,
      results: response.results.map((result) => ({
        title: result.title,
        url: result.url,
        content: result.content,
        sourceQuery: request.query,
        provider: this.id,
      })),
      diagnostics: {
        requestedUrlCount: request.urls.length,
        resultCount: response.results.length,
        chunksPerSource: request.chunksPerSource,
        extractDepth: request.extractDepth,
      },
    };
  }
}

export async function extractTavilyUrls(
  request: ExtractProviderRequest,
  options: TavilyExtractOptions = {},
): Promise<{ results: { title: string; url: string; content: string }[] }> {
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
      options.endpoint ?? DEFAULT_TAVILY_EXTRACT_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chunks_per_source: request.chunksPerSource,
          extract_depth: request.extractDepth,
          include_images: false,
          query: request.query,
          urls: request.urls,
        }),
        signal: request.signal ?? controller.signal,
      },
    );

    if (!response.ok) {
      const responseTextSnippet = await readSafeResponseTextSnippet(response);

      throw new TavilySearchError(getHttpFailureReason(response.status), {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/extract",
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

    return {
      results: data.results
        .map(normalizeExtractResult)
        .filter(
          (result): result is { title: string; url: string; content: string } =>
            result !== null,
        ),
    };
  } catch (error) {
    if (error instanceof TavilySearchError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new TavilySearchError("network_error", {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/extract",
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
        endpoint: "/extract",
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

function normalizeExtractResult(result: unknown) {
  if (!isObject(result)) {
    return null;
  }

  const item = result as TavilyExtractResult;
  const url = stringFrom(item.url).trim();
  const content = sanitizeExtractText(
    stringFrom(item.raw_content) || stringFrom(item.content),
  ).trim();

  if (!/^https?:\/\/\S+$/i.test(url) || !content) {
    return null;
  }

  return {
    title: sanitizeExtractText(stringFrom(item.title)).trim() || url,
    url,
    content,
  };
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

async function readSafeResponseTextSnippet(response: Response) {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}

function stringFrom(value: unknown) {
  return typeof value === "string" ? value : "";
}

function sanitizeExtractText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
