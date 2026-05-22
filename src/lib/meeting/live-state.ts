import type {
  LiveMeetingEvent,
  LiveParticipantStatuses,
  MeetingResult,
  ModelParticipant,
} from "../types";

const EMPTY_SUMMARY = {
  consensus: [],
  differences: [],
  minorityViews: [],
  risks: [],
  nextSteps: [],
};

export function createInitialLiveMeeting(
  topic: string,
  isBriefMode: boolean,
): MeetingResult {
  return {
    topic,
    phases: [
      {
        id: "independent",
        title: "第一阶段：独立观点",
        description: "每个模型先不受其他发言影响，独立表达对议题的看法。",
        turns: [],
      },
      {
        id: "response",
        title: "第二阶段：自由回应",
        description: "每个模型阅读前一阶段观点后，自由补充、质疑、反驳或延展。",
        turns: [],
      },
    ],
    summary: { ...EMPTY_SUMMARY },
    failures: [],
    hasPartialFailures: false,
    isBriefMode,
  };
}

export function createInitialParticipantStatuses(
  participants: ModelParticipant[],
): LiveParticipantStatuses {
  return Object.fromEntries(
    participants.map((participant) => [participant.id, "waiting"]),
  );
}

export function applyLiveMeetingEvent(
  meeting: MeetingResult,
  event: LiveMeetingEvent,
  participantStatuses?: LiveParticipantStatuses,
  participants: ModelParticipant[] = [],
): {
  meeting: MeetingResult;
  participantStatuses?: LiveParticipantStatuses;
  activeStageId?: string;
  isCompleted?: boolean;
  error?: string;
} {
  if (event.type === "meeting_started") {
    return {
      meeting: {
        ...meeting,
        topic: event.topic,
        evidencePack: event.evidencePack,
        searchSummary: event.searchSummary,
        debugSearchProcess: event.debugSearchProcess,
        isBriefMode: event.isBriefMode,
        isTimeSensitive: event.isTimeSensitive,
        factCheckNotice: event.factCheckNotice,
      },
      participantStatuses,
    };
  }

  if (event.type === "phase_started") {
    return {
      meeting,
      participantStatuses,
      activeStageId: event.phaseId,
    };
  }

  if (event.type === "participant_started") {
    return {
      meeting,
      participantStatuses: participantStatuses
        ? {
            ...participantStatuses,
            [event.participantId]: "speaking",
          }
        : participantStatuses,
      activeStageId: event.phaseId,
    };
  }

  if (event.type === "turn") {
    return {
      meeting: appendTurn(meeting, event),
      participantStatuses: markParticipantForTurn(
        participantStatuses,
        participants,
        event,
        "completed",
      ),
      activeStageId: event.turn.phaseId,
    };
  }

  if (event.type === "failure") {
    return {
      meeting: {
        ...meeting,
        failures: [...(meeting.failures ?? []), event.failure],
        hasPartialFailures: true,
      },
      participantStatuses: participantStatuses
        ? {
            ...participantStatuses,
            [event.failure.providerId]: "failed",
          }
        : participantStatuses,
      activeStageId: event.failure.stage,
    };
  }

  if (event.type === "summary") {
    return {
      meeting: {
        ...meeting,
        summary: event.summary,
      },
      participantStatuses,
      activeStageId: "summary",
    };
  }

  if (event.type === "meeting_completed") {
    return {
      meeting: event.meeting,
      participantStatuses: completeSpeakingParticipants(participantStatuses),
      activeStageId: "summary",
      isCompleted: true,
    };
  }

  return {
    meeting,
    participantStatuses,
    error: event.error,
  };
}

function completeSpeakingParticipants(
  participantStatuses: LiveParticipantStatuses | undefined,
): LiveParticipantStatuses | undefined {
  if (!participantStatuses) {
    return participantStatuses;
  }

  return Object.fromEntries(
    Object.entries(participantStatuses).map(([participantId, status]) => [
      participantId,
      status === "speaking" ? "completed" : status,
    ]),
  );
}

function appendTurn(
  meeting: MeetingResult,
  event: Extract<LiveMeetingEvent, { type: "turn" }>,
): MeetingResult {
  return {
    ...meeting,
    phases: meeting.phases.map((phase) =>
      phase.id === event.turn.phaseId
        ? {
            ...phase,
            turns: [
              ...phase.turns.filter((turn) => turn.id !== event.turn.id),
              event.turn,
            ],
          }
        : phase,
    ),
  };
}

function markParticipantForTurn(
  participantStatuses: LiveParticipantStatuses | undefined,
  participants: ModelParticipant[],
  event: Extract<LiveMeetingEvent, { type: "turn" }>,
  status: LiveParticipantStatuses[string],
): LiveParticipantStatuses | undefined {
  if (!participantStatuses) {
    return participantStatuses;
  }

  const participant = participants.find(
    (item) =>
      item.provider === event.turn.provider && item.model === event.turn.model,
  );

  if (!participant) {
    return participantStatuses;
  }

  return {
    ...participantStatuses,
    [participant.id]: status,
  };
}
