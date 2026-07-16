import type { MeetingProviderFailure } from "../types";

export type FormattedMeetingFailure = {
  providerName: string;
  model: string;
  stageLabel: string;
  message: string;
  suggestion: string;
};

const HIDDEN_FAILURE_DETAILS = "Provider 请求失败，错误详情已隐藏。";

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
  const normalized = value.toLowerCase();

  if (
    normalized.includes("401") ||
    normalized.includes("unauthorized") ||
    normalized.includes("authentication")
  ) {
    return "Provider 身份验证失败。";
  }

  if (normalized.includes("404") || normalized.includes("model not found")) {
    return "Provider 模型不可用或不存在。";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("abort") ||
    normalized.includes("aborted")
  ) {
    return "Provider 请求超时或被中止。";
  }

  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return "Provider 请求受限，请稍后重试。";
  }

  if (normalized.includes("rejected") || normalized.includes("high risk")) {
    return "Provider 拒绝了请求。";
  }

  if (normalized.includes("empty")) {
    return "Provider 未返回有效内容。";
  }

  if (normalized.includes("truncated") || normalized.includes("partial")) {
    return "Provider 返回内容不完整。";
  }

  return HIDDEN_FAILURE_DETAILS;
}
