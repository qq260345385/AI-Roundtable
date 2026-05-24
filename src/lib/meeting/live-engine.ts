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
  detectTimeSensitiveTopic,
} from "./fact-hygiene";
import { checkEvidenceCitations } from "../search/evidence-citations";
import { resolveEvidencePackDelivery } from "../search/evidence-pack";
import { AllProvidersFailedError } from "./engine";
import { applyEvidenceQualityGateToSummary } from "./summary-quality-gate";

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
    isBriefMode: request.isBriefMode === true,
    isTimeSensitive,
    factCheckNotice: isTimeSensitive ? FACT_HYGIENE_NOTICE : undefined,
  });
  throwIfAborted(request.signal);

  const independentTurns = await runIndependentPhase(
    meetingRequest,
    provider,
    failures,
    emit,
  );
  const responseTurns = await runResponsePhase(
    meetingRequest,
    provider,
    independentTurns,
    failures,
    emit,
  );
  const allTurns = [...independentTurns, ...responseTurns];

  if (allTurns.length === 0) {
    throw new AllProvidersFailedError(
      "All providers failed to generate meeting responses.",
    );
  }

  await emit({
    type: "phase_started",
    phaseId: "summary",
    title: "第三阶段：共识整理",
    description: "整理共识、分歧、少数派观点、风险和下一步建议。",
  });

  const successfulParticipants = getSuccessfulParticipants(request, allTurns);
  const summary = applyEvidenceQualityGateToSummary(
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
    citationCheck,
    failures,
    hasPartialFailures: failures.length > 0,
    isBriefMode: request.isBriefMode === true,
    isTimeSensitive,
    factCheckNotice: isTimeSensitive ? FACT_HYGIENE_NOTICE : undefined,
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
      const turn = createTurn("independent", participant, content);

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

  await emit({
    type: "phase_started",
    phaseId: "response",
    title: "第二阶段：自由回应",
    description: "每个模型阅读前一阶段观点后，自由补充、质疑、反驳或延展。",
  });

  for (const participant of request.participants) {
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
      const turn = createTurn("response", participant, content);

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
  for (const participant of successfulParticipants) {
    throwIfAborted(request.signal);
    await emitParticipantStarted("summary", participant, emit);

    try {
      if (provider.generateSummaryForParticipant) {
        return await provider.generateSummaryForParticipant(
          participant,
          request.topic,
          turns,
          request.evidencePack,
          getMeetingPromptOptions(request),
        );
      }

      return await provider.generateSummary(
        request.topic,
        turns,
        request.evidencePack,
        getMeetingPromptOptions(request),
      );
    } catch (error) {
      if (request.signal?.aborted) {
        throw error;
      }

      const failure = createFailure(participant, "summary", error);

      failures.push(failure);
      await emit({ type: "failure", failure });
    }
  }

  return createFallbackSummary();
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
    content,
  };
}

function createFailure(
  participant: ModelParticipant,
  stage: MeetingProviderFailure["stage"],
  error: unknown,
): MeetingProviderFailure {
  return {
    providerId: participant.id,
    providerName: participant.provider,
    model: participant.model,
    stage,
    message: sanitizeErrorMessage(error),
  };
}

function sanitizeErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : "Unknown error";

  return rawMessage
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]")
    .slice(0, 160);
}

function createFallbackSummary(): MeetingSummary {
  return {
    consensus: ["已有模型发言已保留，但未能生成模型总结。"],
    differences: ["未能生成结构化分歧总结。"],
    minorityViews: ["未能生成结构化少数派观点总结。"],
    risks: ["未能生成模型总结，请查看会议发言和失败记录。"],
    nextSteps: ["检查 summary provider 的配置、模型输出和错误记录。"],
  };
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
