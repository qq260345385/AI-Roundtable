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
  detectTimeSensitiveTopic,
} from "./fact-hygiene";
import { checkEvidenceCitations } from "../search/evidence-citations";
import { resolveEvidencePackDelivery } from "../search/evidence-pack";
import { applyEvidenceQualityGateToSummary } from "./summary-quality-gate";
import { sanitizeRoleLeak } from "./role-leak";
import { generateFallbackSummaryFromTurns } from "../providers/openai-compatible-provider";

const DISCUSSION_FOCUSES = [
  "风险与不确定性：监管、安全、治理、黑天鹅、不确定性",
  "商业与资本效率：收入、成本、融资、客户结构、商业闭环",
  "技术与产品能力：模型能力、产品化、工程效率、技术路线",
  "生态与用户采用：开发者生态、用户迁移成本、开源竞争、企业采用、长期格局",
] as const;

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
  const responseTurns = await runResponsePhase(
    meetingRequest,
    provider,
    independentTurns,
    failures,
  );
  const allTurns = [...independentTurns, ...responseTurns];

  if (allTurns.length === 0) {
    throw new AllProvidersFailedError(
      "All providers failed to generate meeting responses.",
    );
  }

  const successfulParticipants = getSuccessfulParticipants(request, allTurns);
  const summary = applyEvidenceQualityGateToSummary(
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
    isBriefMode: request.isBriefMode === true,
    isTimeSensitive,
    factCheckNotice: isTimeSensitive ? FACT_HYGIENE_NOTICE : undefined,
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
        getMeetingPromptOptions(request, participant),
      );

      turns.push(createTurn("independent", participant, content));
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

  for (const participant of request.participants) {
    throwIfAborted(request.signal);

    try {
      const content = await provider.generateResponse(
        participant,
        request.topic,
        independentTurns,
        request.evidencePack,
        getMeetingPromptOptions(request, participant),
      );

      turns.push(createTurn("response", participant, content));
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
          getMeetingPromptOptions(request, participant),
        );
      } else {
        summary = await provider.generateSummary(
          request.topic,
          turns,
          request.evidencePack,
          getMeetingPromptOptions(request, participant),
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

function getMeetingPromptOptions(
  request: MeetingRequest,
  participant: ModelParticipant,
) {
  return {
    discussionFocus: getParticipantDiscussionFocus(
      request.participants,
      participant,
    ),
    isBriefMode: request.isBriefMode,
    signal: request.signal,
  };
}

function getParticipantDiscussionFocus(
  participants: ModelParticipant[],
  participant: ModelParticipant,
) {
  const index = participants.findIndex((item) => item.id === participant.id);

  return DISCUSSION_FOCUSES[Math.max(0, index) % DISCUSSION_FOCUSES.length];
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

export class AllProvidersFailedError extends Error {
  status = 502;
}
