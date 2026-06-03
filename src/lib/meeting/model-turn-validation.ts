import type { MeetingProviderFailure, MeetingTurn } from "../types";

export type InvalidModelTurnReason = {
  errorType: NonNullable<MeetingProviderFailure["errorType"]>;
  message: string;
  statusCode?: number;
};

export function isValidModelTurn(turn: MeetingTurn): boolean {
  return validateModelTurnContent(turn.content).ok;
}

export function validateModelTurnContent(
  content: string,
): { ok: true; content: string } | ({ ok: false } & InvalidModelTurnReason) {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return {
      ok: false,
      errorType: "empty_output",
      message: "Model returned empty output.",
    };
  }

  const partialReason = detectPartialOutput(trimmed);
  if (partialReason) {
    return partialReason;
  }

  const truncatedReason = detectTruncatedOutput(trimmed);
  if (truncatedReason) {
    return truncatedReason;
  }

  const rejectedReason = detectProviderRejection(trimmed);
  if (rejectedReason) {
    return rejectedReason;
  }

  const apiReason = detectApiError(trimmed);
  if (apiReason) {
    return apiReason;
  }

  const timeoutReason = detectTimeout(trimmed);
  if (timeoutReason) {
    return timeoutReason;
  }

  return { ok: true, content: trimmed };
}

export function classifyFailureFromMessage(
  message: string,
): InvalidModelTurnReason {
  const trimmed = message.trim() || "Unknown error";

  return (
    detectPartialOutput(trimmed) ??
    detectTruncatedOutput(trimmed) ??
    detectProviderRejection(trimmed) ??
    detectTimeout(trimmed) ??
    detectApiError(trimmed) ?? {
      errorType: "unknown",
      message: trimmed,
      statusCode: extractStatusCode(trimmed),
    }
  );
}

function detectProviderRejection(
  value: string,
): ({ ok: false } & InvalidModelTurnReason) | undefined {
  const normalized = value.toLowerCase();
  const isLikelyProviderNotice = value.length <= 800;
  const hasExplicitRejection =
    normalized.includes("request was rejected") ||
    normalized.includes("request rejected") ||
    normalized.includes("provider rejected") ||
    normalized.includes("response was blocked") ||
    normalized.includes("blocked by") ||
    normalized.includes("moderation") ||
    normalized.includes("safety policy") ||
    normalized.includes("content safety") ||
    normalized.includes("policy violation") ||
    normalized.includes("considered high risk") ||
    normalized.includes("cannot comply") ||
    normalized.includes("i can't comply") ||
    value.includes("请求被拒绝") ||
    value.includes("内容安全") ||
    value.includes("安全策略") ||
    value.includes("高风险拒绝") ||
    value.includes("被安全策略拦截");

  if (isLikelyProviderNotice && hasExplicitRejection) {
    return {
      ok: false,
      errorType: "provider_rejected",
      message: summarizeInvalidOutput(value),
      statusCode: extractStatusCode(value),
    };
  }

  return undefined;
}

function detectPartialOutput(
  value: string,
): ({ ok: false } & InvalidModelTurnReason) | undefined {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("partial output") ||
    normalized.includes("stream interrupted") ||
    normalized.includes("incomplete output") ||
    normalized.includes("output interrupted") ||
    normalized.includes("connection closed before completion") ||
    value.includes("输出中断") ||
    value.includes("生成中断") ||
    value.includes("未完整生成")
  ) {
    return {
      ok: false,
      errorType: "partial_output",
      message: summarizeInvalidOutput(value),
      statusCode: extractStatusCode(value),
    };
  }

  return undefined;
}

function detectTruncatedOutput(
  value: string,
): ({ ok: false } & InvalidModelTurnReason) | undefined {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("finish_reason: length") ||
    normalized.includes("finish reason: length") ||
    normalized.includes("max_tokens") ||
    normalized.includes("truncated") ||
    normalized.includes("was cut off") ||
    value.includes("被截断") ||
    value.includes("内容截断") ||
    value.includes("输出截断") ||
    value.endsWith("...")
  ) {
    return {
      ok: false,
      errorType: "truncated_output",
      message: summarizeInvalidOutput(value),
      statusCode: extractStatusCode(value),
    };
  }

  return undefined;
}

function detectApiError(
  value: string,
): ({ ok: false } & InvalidModelTurnReason) | undefined {
  const normalized = value.toLowerCase();
  const statusCode = extractStatusCode(value);

  if (
    normalized.includes("api request failed") ||
    normalized.includes("http request failed") ||
    normalized.includes("request failed:") ||
    normalized.includes("bad request") ||
    normalized.includes("invalid request") ||
    normalized.includes("api error")
  ) {
    return {
      ok: false,
      errorType: "api_error",
      message: summarizeInvalidOutput(value),
      statusCode,
    };
  }

  return undefined;
}

function detectTimeout(
  value: string,
): ({ ok: false } & InvalidModelTurnReason) | undefined {
  const normalized = value.toLowerCase();

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("超时")
  ) {
    return {
      ok: false,
      errorType: "timeout",
      message: summarizeInvalidOutput(value),
      statusCode: extractStatusCode(value),
    };
  }

  return undefined;
}

function summarizeInvalidOutput(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= 120) {
    return compact;
  }

  return `${compact.slice(0, 117)}...`;
}

function extractStatusCode(value: string): number | undefined {
  const match = value.match(/\b([45]\d{2})\b/);

  if (!match?.[1]) {
    return undefined;
  }

  return Number(match[1]);
}
