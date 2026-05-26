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
const DEFAULT_TIMEOUT_MS = 45000;

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
  const timeoutMs = options.timeoutMs ?? getTavilyExtractTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestSignal = createCombinedAbortSignal(
    request.signal,
    controller.signal,
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
        signal: requestSignal,
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
    let responseText = "";

    try {
      responseText = await response.text();
      data = JSON.parse(responseText);
    } catch {
      throw new TavilySearchError("invalid_response", {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/extract",
          errorKind: "invalid_response",
          responseTextSnippet: responseText,
          safeMessage: "Extract response was not valid JSON.",
        }),
        reason: "invalid_response",
      });
    }

    if (!isObject(data) || !Array.isArray(data.results)) {
      throw new TavilySearchError("invalid_response", {
        diagnostics: createSafeTavilyDiagnostics({
          apiKey,
          endpoint: "/extract",
          errorKind: "invalid_response",
          responseTextSnippet: safeJsonSnippet(data),
          safeMessage: "Extract response did not include a results array.",
        }),
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

export function getTavilyExtractTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
) {
  return normalizeTimeoutMs(env.TAVILY_EXTRACT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
}

function normalizeTimeoutMs(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(parsed), 1000), 180000);
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

async function readSafeResponseTextSnippet(response: Response) {
  try {
    return sanitizeExtractText(await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}

function safeJsonSnippet(value: unknown): string {
  try {
    return sanitizeExtractText(JSON.stringify(value)).slice(0, 300);
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
