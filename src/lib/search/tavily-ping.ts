import {
  searchTavilyEvidence,
  TavilySearchError,
  type TavilyFailureReason,
} from "./tavily-search";

export const DEFAULT_TAVILY_PING_QUERY = "technology news";

export type TavilyPingErrorType =
  | "auth"
  | "quota"
  | "network"
  | "provider_error"
  | "parse_error"
  | "tavily_search_timeout";

export type TavilyPingResult =
  | {
      ok: true;
      durationMs: number;
      resultCount: number;
      hasTavilyApiKey: boolean;
      statusCode: number;
    }
  | {
      ok: false;
      durationMs: number;
      resultCount: 0;
      failedStage: string;
      errorType: TavilyPingErrorType;
      safeErrorMessage: string;
      hasTavilyApiKey: boolean;
      statusCode: number;
    };

export async function runTavilyPing(input: {
  failedStage?: string;
  query?: string;
  signal?: AbortSignal;
} = {}): Promise<TavilyPingResult> {
  const startedAt = Date.now();
  const hasTavilyApiKey = Boolean(process.env.TAVILY_API_KEY);
  const query = normalizePingQuery(input.query);

  try {
    // Provider connectivity only. This ping is not used for evidence scoring,
    // topicType, coverageDimension, topicRelevanceScore, or reliability.
    const results = await searchTavilyEvidence(query, {
      maxResults: 1,
      searchDepth: "basic",
      signal: input.signal,
      topic: "general",
    });

    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      resultCount: results.length,
      hasTavilyApiKey,
      statusCode: 200,
    };
  } catch (error) {
    const errorType = getPingErrorType(error);

    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      resultCount: 0,
      failedStage: input.failedStage ?? "tavily_ping",
      errorType,
      safeErrorMessage: formatPingErrorMessage(errorType),
      hasTavilyApiKey,
      statusCode: getPingStatusCode(error, errorType),
    };
  }
}

export function normalizePingQuery(query: string | undefined) {
  const normalized = query?.replace(/\s+/g, " ").trim();

  return normalized || DEFAULT_TAVILY_PING_QUERY;
}

function getPingErrorType(error: unknown): TavilyPingErrorType {
  const reason = error instanceof TavilySearchError ? error.reason : undefined;

  if (reason === "missing_api_key" || reason === "unauthorized") {
    return "auth";
  }

  if (reason === "rate_limited") {
    return "quota";
  }

  if (reason === "invalid_response") {
    return "parse_error";
  }

  if (reason === "network_error") {
    return isTavilyTimeout(error) ? "tavily_search_timeout" : "network";
  }

  return isProviderFailure(reason) ? "provider_error" : "provider_error";
}

function isTavilyTimeout(error: unknown) {
  return (
    error instanceof TavilySearchError &&
    (error.status === 504 || error.diagnostics?.isAbortError === true)
  );
}

function isProviderFailure(
  reason: TavilyFailureReason | undefined,
): boolean {
  return (
    reason === "invalid_request" ||
    reason === "unknown_error" ||
    reason === undefined
  );
}

function formatPingErrorMessage(errorType: TavilyPingErrorType) {
  switch (errorType) {
    case "auth":
      return "搜索服务认证失败";
    case "quota":
      return "搜索服务额度不足";
    case "tavily_search_timeout":
      return "搜索服务超时";
    case "network":
      return "网络连接失败";
    case "parse_error":
      return "搜索结果解析失败";
    case "provider_error":
    default:
      return "搜索服务返回异常";
  }
}

function getPingStatusCode(
  error: unknown,
  errorType: TavilyPingErrorType,
) {
  if (errorType === "tavily_search_timeout") {
    return 504;
  }

  if (error instanceof TavilySearchError) {
    return error.status;
  }

  return 502;
}
