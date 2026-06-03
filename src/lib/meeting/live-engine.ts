import type {
  LiveMeetingEvent,
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
import {
  AllProvidersFailedError,
  createInsufficientParticipantsSummary,
  getMeetingStatus,
  getMeetingWarnings,
} from "./engine";
import { applyEvidenceQualityGateToSummary } from "./summary-quality-gate";
import { sanitizeRoleLeak } from "./role-leak";
import { generateFallbackSummaryFromTurns } from "../providers/openai-compatible-provider";
import {
  classifyFailureFromMessage,
  validateModelTurnContent,
  type InvalidModelTurnReason,
} from "./model-turn-validation";

type EmitLiveMeetingEvent = (event: LiveMeetingEvent) => void | Promise<void>;

export async function runLiveMeeting(
  request: MeetingRequest,
  provider: ModelProvider,
  emit: EmitLiveMeetingEvent,
): Promise<MeetingResult> {
  const meetingRequest = {
    ...request,
    evidencePack: request.evidencePack
      ? resolveEvidencePackDelivery(request.evidencePack, request.participants)
      : undefined,
  };
  const failures: MeetingProviderFailure[] = [];
  const isTimeSensitive = detectTimeSensitiveTopic(meetingRequest.topic);

  await emit({
    type: "meeting_started",
    topic: meetingRequest.topic,
    participants: meetingRequest.participants,
    evidencePack: meetingRequest.evidencePack,
    debugSearchProcess: meetingRequest.evidencePack?.searchProcess,
    isBriefMode: request.isBriefMode === true,
    isTimeSensitive,
    factCheckNotice: isTimeSensitive
      ? classifyEvidenceTopic(meetingRequest.topic) === "general_discussion"
        ? OPINION_TOPIC_NOTICE
        : FACT_HYGIENE_NOTICE
      : undefined,
  });
  throwIfAborted(request.signal);

  const independentTurns = await runIndependentPhase(
    meetingRequest,
    provider,
    failures,
    emit,
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
        emit,
      );
  const allTurns = [...independentTurns, ...responseTurns];

  if (allTurns.length === 0 && request.participants.length < 2) {
    throw new AllProvidersFailedError(
      "All providers failed to generate meeting responses.",
    );
  }

  await emit({
    type: "phase_started",
    phaseId: "summary",
    title: "第三阶段：共识整理",
    description: "整理共识、分歧和下一步。",
  });

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
          emit,
        ),
        meetingRequest.evidencePack,
      );

  await emit({
    type: "summary",
    summary,
  });

  const citationCheck = checkEvidenceCitations(
    collectMeetingText(allTurns, summary),
    meetingRequest.evidencePack,
  );
  const meeting: MeetingResult = {
    topic: meetingRequest.topic,
    meetingStatus: getMeetingStatus(
      shouldFailDueToInsufficientTurns,
      failures,
    ),
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

  await emit({
    type: "meeting_completed",
    meeting,
  });

  return meeting;
}

async function runIndependentPhase(
  request: MeetingRequest,
  provider: ModelProvider,
  failures: MeetingProviderFailure[],
  emit: EmitLiveMeetingEvent,
): Promise<MeetingTurn[]> {
  const turns: MeetingTurn[] = [];

  await emit({
    type: "phase_started",
    phaseId: "independent",
    title: "第一阶段：独立观点",
    description: "每个模型先不受其他发言影响，独立表达对议题的看法。",
  });

  for (const participant of request.participants) {
    throwIfAborted(request.signal);
    await emitParticipantStarted("independent", participant, emit);

    try {
      const content = await provider.generateIndependentView(
        participant,
        request.topic,
        request.evidencePack,
        getMeetingPromptOptions(request),
      );
      const validContent = validateModelTurnContent(content);

      if (!validContent.ok) {
        const failure = createFailureFromInvalidContent(
          participant,
          "independent",
          validContent,
        );

        failures.push(failure);
        await emit({ type: "failure", failure });
        continue;
      }

      const turn = createTurn("independent", participant, validContent.content);

      turns.push(turn);
      await emit({ type: "turn", turn });
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }

      const failure = createFailure(participant, "independent", error);

      failures.push(failure);
      await emit({ type: "failure", failure });
    }
  }

  return turns;
}

async function runResponsePhase(
  request: MeetingRequest,
  provider: ModelProvider,
  independentTurns: MeetingTurn[],
  failures: MeetingProviderFailure[],
  emit: EmitLiveMeetingEvent,
): Promise<MeetingTurn[]> {
  const turns: MeetingTurn[] = [];
  const respondingParticipants = getParticipantsForTurns(
    request,
    independentTurns,
  );

  await emit({
    type: "phase_started",
    phaseId: "response",
    title: "第二阶段：自由回应",
    description: "每个模型阅读前一阶段观点后，自由补充、质疑、反驳或延展。",
  });

  for (const participant of respondingParticipants) {
    throwIfAborted(request.signal);
    await emitParticipantStarted("response", participant, emit);

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
        const failure = createFailureFromInvalidContent(
          participant,
          "response",
          validContent,
        );

        failures.push(failure);
        await emit({ type: "failure", failure });
        continue;
      }

      const turn = createTurn("response", participant, validContent.content);

      turns.push(turn);
      await emit({ type: "turn", turn });
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }

      const failure = createFailure(participant, "response", error);

      failures.push(failure);
      await emit({ type: "failure", failure });
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
  emit: EmitLiveMeetingEvent,
): Promise<MeetingSummary> {
  for (const participant of getSummaryParticipants(
    request,
    successfulParticipants,
  )) {
    throwIfAborted(request.signal);
    await emitParticipantStarted("summary", participant, emit);

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

      const failure = createFailure(participant, "summary", error);

      failures.push(failure);
      await emit({ type: "failure", failure });
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

async function emitParticipantStarted(
  phaseId: "independent" | "response" | "summary",
  participant: ModelParticipant,
  emit: EmitLiveMeetingEvent,
) {
  await emit({
    type: "participant_started",
    phaseId,
    participantId: participant.id,
    participantName: participant.name,
  });
}
