import type { MeetingProviderFailure } from "../types";

export type FormattedMeetingFailure = {
  providerName: string;
  model: string;
  stageLabel: string;
  message: string;
  suggestion: string;
};

const HIDDEN_FAILURE_DETAILS = "错误详情已隐藏，请检查本地日志。";

export function formatFailureForDisplay(
  failure: MeetingProviderFailure,
): FormattedMeetingFailure {
  return {
    providerName: failure.providerName,
    model: failure.model,
    stageLabel: getFailureStageLabel(failure.stage),
    message: sanitizeFailureMessage(failure.message),
    suggestion: getFailureSuggestion(failure.message),
  };
}

export function getFailureStageLabel(
  stage: MeetingProviderFailure["stage"],
): string {
  if (stage === "independent") {
    return "独立观点";
  }

  if (stage === "response") {
    return "自由回应";
  }

  return "共识整理";
}

export function getFailureSuggestion(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("401") ||
    normalized.includes("unauthorized") ||
    normalized.includes("authentication")
  ) {
    return "检查 API key 是否正确。";
  }

  if (normalized.includes("404") || normalized.includes("model not found")) {
    return "检查 MODEL 是否正确。";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("abort") ||
    normalized.includes("aborted")
  ) {
    return "检查 base URL、网络或 provider 响应速度。";
  }

  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return "稍后重试，或检查额度和限流设置。";
  }

  return "检查 provider 配置或稍后重试。";
}

export function sanitizeFailureMessage(value: string): string {
  const trimmed = value.trim();
  const containsSensitiveMaterial =
    /(?:^|[^A-Za-z0-9])(?:sk|tvly|ghp|xox[baprs])-[A-Za-z0-9_-]{6,}/i.test(trimmed) ||
    /(?:api[_-]?key|access[_-]?token|password|passwd|connection[_-]?string)\s*[:=]/i.test(trimmed) ||
    /(?:postgres|mysql|mongodb(?:\+srv)?):\/\/[^\s]+/i.test(trimmed) ||
    /Authorization\s*:/i.test(trimmed) ||
    /Bearer\s+[A-Za-z0-9._~+/=-]+/i.test(trimmed) ||
    /\bsecret[-_A-Za-z0-9]*/i.test(trimmed);
  const containsInternalDiagnostics =
    /[\r\n]/.test(trimmed) ||
    /\bat\s+[^\s]+\s*\([^)]*:\d+:\d+\)/i.test(trimmed) ||
    /(?:[A-Za-z]:\\|\/(?:Users|home|var|tmp)\/)/i.test(trimmed) ||
    /^[\[{][\s\S]*[\]}]$/.test(trimmed);

  if (containsSensitiveMaterial || containsInternalDiagnostics) {
    return HIDDEN_FAILURE_DETAILS;
  }

  return trimmed
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]")
    .slice(0, 240);
}
