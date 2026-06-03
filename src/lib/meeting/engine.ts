import type {
  MeetingProviderFailure,
  MeetingRequest,
  MeetingResult,
  MeetingSummary,
  MeetingTurn,
  ModelParticipant,
  ModelProvider,
} from "../types";
import {
  FACT_HYGIENE_NOTICE,
  OPINION_TOPIC_NOTICE,
  detectTimeSensitiveTopic,
} from "./fact-hygiene";
import { classifyEvidenceTopic } from "../search/evidence-pack";
import { checkEvidenceCitations } from "../search/evidence-citations";
import { resolveEvidencePackDelivery } from "../search/evidence-pack";
import { applyEvidenceQualityGateToSummary } from "./summary-quality-gate";
import { sanitizeRoleLeak } from "./role-leak";
import { generateFallbackSummaryFromTurns } from "../providers/openai-compatible-provider";
import {
  classifyFailureFromMessage,
  validateModelTurnContent,
  type InvalidModelTurnReason,
} from "./model-turn-validation";

// 会议引擎只负责流程：独立观点、自由回应、共识整理。
export async function runMeeting(
  request: MeetingRequest,
  provider: ModelProvider,
): Promise<MeetingResult> {
  const meetingRequest = {
    ...request,
    evidencePack: request.evidencePack
      ? resolveEvidencePackDelivery(request.evidencePack, request.participants)
      : undefined,
  };
  const failures: MeetingProviderFailure[] = [];
  const isTimeSensitive = detectTimeSensitiveTopic(meetingRequest.topic);
  const independentTurns = await runIndependentPhase(
    meetingRequest,
    provider,
    failures,
  );
  const shouldFailDueToInsufficientTurns =
    request.participants.length >= 2 && independentTurns.length < 2;
  const responseTurns = shouldFailDueToInsufficientTurns
    ? []
    : await runResponsePhase(
        meetingRequest,
        provider,
        independentTurns,
        failures,
      );
  const allTurns = [...independentTurns, ...responseTurns];

  if (allTurns.length === 0 && request.participants.length < 2) {
    throw new AllProvidersFailedError(
      "All providers failed to generate meeting responses.",
    );
  }

  const successfulParticipants = getSuccessfulParticipants(request, allTurns);
  const summary = shouldFailDueToInsufficientTurns
    ? createInsufficientParticipantsSummary(independentTurns)
    : applyEvidenceQualityGateToSummary(
        await generateSummaryWithFallback(
          meetingRequest,
          provider,
          allTurns,
          successfulParticipants,
          failures,
        ),
        meetingRequest.evidencePack,
      );
  const citationCheck = checkEvidenceCitations(
    collectMeetingText(allTurns, summary),
    meetingRequest.evidencePack,
  );

  return {
    topic: meetingRequest.topic,
    meetingStatus: getMeetingStatus(shouldFailDueToInsufficientTurns, failures),
    phases: [
      {
        id: "independent",
        title: "第一阶段：独立观点",
        description: "每个模型先不受其他发言影响，独立表达对议题的看法。",
        turns: independentTurns,
      },
      {
        id: "response",
        title: "第二阶段：自由回应",
        description: "每个模型阅读前一阶段观点后，自由补充、质疑、反驳或延展。",
        turns: responseTurns,
      },
    ],
    summary,
    evidencePack: meetingRequest.evidencePack,
    debugSearchProcess: meetingRequest.evidencePack?.searchProcess,
    citationCheck,
    failures,
    hasPartialFailures: failures.length > 0,
    warnings: getMeetingWarnings(shouldFailDueToInsufficientTurns, failures),
    isBriefMode: request.isBriefMode === true,
    isTimeSensitive,
    factCheckNotice: isTimeSensitive
      ? classifyEvidenceTopic(meetingRequest.topic) === "general_discussion"
        ? OPINION_TOPIC_NOTICE
        : FACT_HYGIENE_NOTICE
      : undefined,
  };
}

function collectMeetingText(
  turns: MeetingTurn[],
  summary: MeetingSummary,
): string {
  return [
    ...turns.map((turn) => turn.content),
    ...summary.consensus,
    ...summary.differences,
    ...summary.minorityViews,
    ...(summary.confirmableFacts ?? []),
    ...(summary.initialHypotheses ?? []),
    ...(summary.communityViews ?? []),
    ...(summary.insufficientlyConfirmed ?? []),
    ...summary.risks,
    ...summary.nextSteps,
  ].join("\n");
}

async function runIndependentPhase(
  request: MeetingRequest,
  provider: ModelProvider,
  failures: MeetingProviderFailure[],
): Promise<MeetingTurn[]> {
  const turns: MeetingTurn[] = [];

  for (const participant of request.participants) {
    throwIfAborted(request.signal);

    try {
      const content = await provider.generateIndependentView(
        participant,
        request.topic,
        request.evidencePack,
        getMeetingPromptOptions(request),
      );
      const validContent = validateModelTurnContent(content);

      if (!validContent.ok) {
        failures.push(
          createFailureFromInvalidContent(
            participant,
            "independent",
            validContent,
          ),
        );
        continue;
      }

      turns.push(createTurn("independent", participant, validContent.content));
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }

      failures.push(createFailure(participant, "independent", error));
    }
  }

  return turns;
}

async function runResponsePhase(
  request: MeetingRequest,
  provider: ModelProvider,
  independentTurns: MeetingTurn[],
  failures: MeetingProviderFailure[],
): Promise<MeetingTurn[]> {
  const turns: MeetingTurn[] = [];
  const respondingParticipants = getParticipantsForTurns(
    request,
    independentTurns,
  );

  for (const participant of respondingParticipants) {
    throwIfAborted(request.signal);

    try {
      const content = await provider.generateResponse(
        participant,
        request.topic,
        independentTurns,
        request.evidencePack,
        getMeetingPromptOptions(request),
      );
      const validContent = validateModelTurnContent(content);

      if (!validContent.ok) {
        failures.push(
          createFailureFromInvalidContent(participant, "response", validContent),
        );
        continue;
      }

      turns.push(createTurn("response", participant, validContent.content));
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }

      failures.push(createFailure(participant, "response", error));
    }
  }

  return turns;
}

async function generateSummaryWithFallback(
  request: MeetingRequest,
  provider: ModelProvider,
  turns: MeetingTurn[],
  successfulParticipants: ModelParticipant[],
  failures: MeetingProviderFailure[],
): Promise<MeetingSummary> {
  for (const participant of getSummaryParticipants(
    request,
    successfulParticipants,
  )) {
    throwIfAborted(request.signal);

    try {
      let summary: MeetingSummary;

      if (provider.generateSummaryForParticipant) {
        summary = await provider.generateSummaryForParticipant(
          participant,
          request.topic,
          turns,
          request.evidencePack,
          getMeetingPromptOptions(request),
        );
      } else {
        summary = await provider.generateSummary(
          request.topic,
          turns,
          request.evidencePack,
          getMeetingPromptOptions(request),
        );
      }

      if (summary.summaryDebug?.fallbackUsed) {
        return generateFallbackSummaryFromTurns(
          request.topic,
          turns,
          request.evidencePack,
        );
      }

      return summary;
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }

      failures.push(createFailure(participant, "summary", error));
    }
  }

  return generateFallbackSummaryFromTurns(
    request.topic,
    turns,
    request.evidencePack,
  );
}

function getSummaryParticipants(
  request: MeetingRequest,
  successfulParticipants: ModelParticipant[],
): ModelParticipant[] {
  if (!request.summaryParticipant) {
    return successfulParticipants;
  }

  return [
    request.summaryParticipant,
    ...successfulParticipants.filter(
      (participant) => participant.id !== request.summaryParticipant?.id,
    ),
  ];
}

function getMeetingPromptOptions(request: MeetingRequest) {
  return {
    isBriefMode: request.isBriefMode,
    signal: request.signal,
  };
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
}

function getSuccessfulParticipants(
  request: MeetingRequest,
  turns: MeetingTurn[],
): ModelParticipant[] {
  const successfulIds = new Set(
    turns.map((turn) => turn.id.replace(/^(independent|response)-/, "")),
  );

  return request.participants.filter((participant) =>
    successfulIds.has(participant.id),
  );
}

function getParticipantsForTurns(
  request: MeetingRequest,
  turns: MeetingTurn[],
): ModelParticipant[] {
  const successfulIds = new Set(
    turns.map((turn) => turn.id.replace(/^(independent|response)-/, "")),
  );

  return request.participants.filter((participant) =>
    successfulIds.has(participant.id),
  );
}

function createTurn(
  phaseId: string,
  participant: ModelParticipant,
  content: string,
): MeetingTurn {
  return {
    id: `${phaseId}-${participant.id}`,
    phaseId,
    speakerName: participant.name,
    provider: participant.provider,
    model: participant.model,
    content: sanitizeRoleLeak(content),
  };
}

function createFailure(
  participant: ModelParticipant,
  stage: MeetingProviderFailure["stage"],
  error: unknown,
): MeetingProviderFailure {
  const message = sanitizeErrorMessage(error);
  const classified = classifyFailureFromMessage(message);

  return {
    providerId: participant.id,
    participantName: participant.name,
    providerName: participant.provider,
    model: participant.model,
    stage,
    errorType: classified.errorType,
    message,
    ...(classified.statusCode ? { statusCode: classified.statusCode } : {}),
  };
}

function createFailureFromInvalidContent(
  participant: ModelParticipant,
  stage: MeetingProviderFailure["stage"],
  reason: InvalidModelTurnReason,
): MeetingProviderFailure {
  return {
    providerId: participant.id,
    participantName: participant.name,
    providerName: participant.provider,
    model: participant.model,
    stage,
    errorType: reason.errorType,
    message: sanitizeErrorMessage(reason.message),
    ...(reason.statusCode ? { statusCode: reason.statusCode } : {}),
  };
}

function sanitizeErrorMessage(error: unknown): string {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof error.message === "string"
          ? error.message
          : "Unknown error";

  return rawMessage
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]")
    .slice(0, 160);
}

export class AllProvidersFailedError extends Error {
  status = 502;
}

export function getMeetingStatus(
  insufficientParticipants: boolean,
  failures: MeetingProviderFailure[],
): MeetingResult["meetingStatus"] {
  if (insufficientParticipants) {
    return "failed";
  }

  return failures.length > 0 ? "degraded" : "completed";
}

export function getMeetingWarnings(
  insufficientParticipants: boolean,
  failures: MeetingProviderFailure[],
): string[] {
  const warnings: string[] = [];

  if (insufficientParticipants) {
    warnings.push("有效发言模型少于 2 个，无法形成可靠圆桌讨论。");
  } else if (failures.length > 0) {
    warnings.push("部分模型调用失败，本轮会议已降级。");
  }

  return warnings;
}

export function createInsufficientParticipantsSummary(
  independentTurns: MeetingTurn[],
): MeetingSummary {
  const consensus = ["本轮有效发言模型少于 2 个，无法形成可靠共识。"];

  if (independentTurns.length === 1) {
    const turn = independentTurns[0];

    consensus.push(
      `单模型观点摘要（不代表共识）：${turn.speakerName}：${summarizeSingleTurn(
        turn.content,
      )}`,
    );
  }

  return {
    consensus,
    differences: ["本轮未形成有效多方交锋，因此无法整理真实分歧。"],
    minorityViews: [],
    risks: [],
    nextSteps: [
      "检查失败模型的 provider 返回错误、请求参数和模型兼容性。",
      "降低 prompt 长度或关闭联网资料后重试。",
      "至少保证 2 个模型成功完成第一阶段后，再进行圆桌讨论。",
    ],
    summaryDebug: {
      rawFormatDetected: "unknown",
      parseSucceeded: true,
      repairAttempted: false,
      fallbackUsed: true,
      fallbackReason: "有效发言模型少于 2 个，无法形成可靠圆桌讨论。",
      emptySectionsRepaired: [],
    },
  };
}

function summarizeSingleTurn(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= 180) {
    return normalized;
  }

  return `${normalized.slice(0, 180)}...`;
}
