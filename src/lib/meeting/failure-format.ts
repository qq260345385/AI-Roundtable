import type { MeetingProviderFailure } from "../types";

export type FormattedMeetingFailure = {
  providerName: string;
  model: string;
  stageLabel: string;
  message: string;
  suggestion: string;
};

export function formatFailureForDisplay(
  failure: MeetingProviderFailure,
): FormattedMeetingFailure {
  return {
    providerName: failure.providerName,
    model: failure.model,
    stageLabel: getFailureStageLabel(failure.stage),
    message: sanitizeDisplayText(failure.message),
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

function sanitizeDisplayText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]");
}
