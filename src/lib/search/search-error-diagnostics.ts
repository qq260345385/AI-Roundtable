import { AllProvidersFailedError } from "../meeting/engine";
import type { SearchProcess } from "./evidence-pack";
import { MeetingSearchFailedError } from "./meeting-search-failure";
import { TavilySearchError } from "./tavily-search";

export type SafeSearchErrorType =
  | "auth"
  | "quota"
  | "timeout"
  | "network"
  | "provider_error"
  | "parse_error"
  | "internal_error";

export type SafeRouteErrorDiagnostic = {
  failedStage: string;
  errorType: SafeSearchErrorType;
  safeErrorMessage: string;
  hasTavilyApiKey: boolean;
  searchStrategy?: string;
  passName?: string;
  provider?: string;
  statusCode: number;
  retryCount: number;
  stack?: string;
};

export function createSafeRouteErrorDiagnostic(
  error: unknown,
  input: {
    failedStage: string;
    retryCount?: number;
    statusCode?: number;
  },
): SafeRouteErrorDiagnostic {
  const searchProcess = getErrorSearchProcess(error);
  const errorType = getSafeSearchErrorType(error, searchProcess);
  const statusCode = input.statusCode ?? getDefaultStatusCode(error, errorType);
  const safeErrorMessage = formatSafeRouteErrorMessage(errorType);
  const stack =
    process.env.NODE_ENV !== "production" && error instanceof Error
      ? error.stack
      : undefined;

  return {
    failedStage: getFailedStage(input.failedStage, searchProcess),
    errorType,
    safeErrorMessage,
    hasTavilyApiKey: Boolean(process.env.TAVILY_API_KEY),
    ...(searchProcess?.searchStrategy
      ? { searchStrategy: searchProcess.searchStrategy }
      : {}),
    ...(searchProcess?.failedPassName
      ? { passName: searchProcess.failedPassName }
      : {}),
    ...(searchProcess?.provider ? { provider: searchProcess.provider } : {}),
    statusCode,
    retryCount: searchProcess?.retryCount ?? input.retryCount ?? 0,
    ...(stack ? { stack } : {}),
  };
}

export function createSafeRouteErrorPayload(
  diagnostic: SafeRouteErrorDiagnostic,
) {
  return {
    error: diagnostic.safeErrorMessage,
    errorType: diagnostic.errorType,
    failedStage: diagnostic.failedStage,
    safeErrorMessage: diagnostic.safeErrorMessage,
  };
}

export function logSafeRouteError(
  label: string,
  diagnostic: SafeRouteErrorDiagnostic,
) {
  console.error(label, diagnostic);
}

export function createSearchProcessFailureDiagnostic(
  searchProcess: SearchProcess | undefined,
  failedStage = "evidence_search",
) {
  return createSafeRouteErrorDiagnostic(
    new MeetingSearchFailedError(searchProcess?.failureReason, searchProcess),
    {
      failedStage,
    },
  );
}

function getErrorSearchProcess(error: unknown): SearchProcess | undefined {
  if (error instanceof MeetingSearchFailedError) {
    return error.searchProcess;
  }

  return undefined;
}

function getSafeSearchErrorType(
  error: unknown,
  searchProcess: SearchProcess | undefined,
): SafeSearchErrorType {
  const reason =
    error instanceof MeetingSearchFailedError
      ? error.failureReason
      : error instanceof TavilySearchError
        ? error.reason
        : searchProcess?.failureReason;

  if (reason === "missing_api_key" || reason === "unauthorized") {
    return "auth";
  }

  if (reason === "rate_limited") {
    return "quota";
  }

  if (reason === "network_error") {
    return hasAbortDiagnostic(error, searchProcess) ? "timeout" : "network";
  }

  if (reason === "invalid_response") {
    return "parse_error";
  }

  if (reason === "invalid_request" || reason === "unknown_error") {
    return "provider_error";
  }

  if (error instanceof AllProvidersFailedError) {
    return "provider_error";
  }

  return "internal_error";
}

function hasAbortDiagnostic(
  error: unknown,
  searchProcess: SearchProcess | undefined,
): boolean {
  if (
    error instanceof TavilySearchError &&
    error.diagnostics?.isAbortError === true
  ) {
    return true;
  }

  return (searchProcess?.providerDiagnostics ?? []).some((diagnostic) => {
    const value = diagnostic.diagnostics?.isAbortError;

    return value === true;
  });
}

function formatSafeRouteErrorMessage(errorType: SafeSearchErrorType): string {
  const prefix = "联网资料搜索失败，会议已终止。";

  switch (errorType) {
    case "auth":
      return `${prefix}搜索服务认证失败，请检查搜索服务 API Key 配置。`;
    case "quota":
      return `${prefix}搜索服务额度不足或触发限流，请稍后重试或检查配额。`;
    case "timeout":
      return `${prefix}搜索服务超时，请稍后重试。`;
    case "network":
      return `${prefix}网络连接失败，无法访问搜索服务。`;
    case "provider_error":
      return `${prefix}搜索服务返回错误，请稍后重试。`;
    case "parse_error":
      return `${prefix}搜索结果解析失败，搜索服务返回了非预期格式。`;
    case "internal_error":
    default:
      return "会议接口内部错误，请查看开发日志。";
  }
}

function getFailedStage(
  fallbackStage: string,
  searchProcess: SearchProcess | undefined,
) {
  return searchProcess?.failedStage ?? fallbackStage;
}

function getDefaultStatusCode(
  error: unknown,
  errorType: SafeSearchErrorType,
) {
  if (error instanceof MeetingSearchFailedError) {
    return error.status;
  }

  if (error instanceof TavilySearchError) {
    return error.status;
  }

  if (error instanceof AllProvidersFailedError) {
    return error.status;
  }

  if (errorType === "timeout") {
    return 504;
  }

  return 500;
}
