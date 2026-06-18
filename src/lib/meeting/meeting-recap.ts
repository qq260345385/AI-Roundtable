import type { MeetingProviderFailure, MeetingResult, MeetingTurn } from "../types";

export type MeetingRecapTimelineItem = {
  id: string;
  title: string;
  description: string;
  turnCount: number;
  participantNames: string[];
  excerpt?: string;
  isEmpty: boolean;
};

export type MeetingRecapModelRow = {
  key: string;
  speakerName: string;
  provider: string;
  model: string;
  independentExcerpt?: string;
  responseExcerpt?: string;
  responseStatus: "responded" | "no_response" | "failed_response";
  failureMessage?: string;
};

export type MeetingRecapViewModel = {
  timeline: MeetingRecapTimelineItem[];
  modelRows: MeetingRecapModelRow[];
  hasLowEvidenceGuard: boolean;
};

const EXCERPT_LENGTH = 140;

export function buildMeetingRecapViewModel(
  meeting: MeetingResult,
): MeetingRecapViewModel {
  const independentPhase = meeting.phases.find(
    (phase) => phase.id === "independent",
  );
  const responsePhase = meeting.phases.find(
    (phase) => phase.id === "response",
  );
  const responseFailures = new Map(
    (meeting.failures ?? [])
      .filter((failure) => failure.stage === "response")
      .map((failure) => [getFailureKey(failure), failure]),
  );
  const turnGroups = new Map<string, MeetingRecapModelRow>();

  for (const turn of [
    ...(independentPhase?.turns ?? []),
    ...(responsePhase?.turns ?? []),
  ]) {
    const key = getTurnKey(turn);
    const current =
      turnGroups.get(key) ??
      ({
        key,
        speakerName: turn.speakerName,
        provider: turn.provider,
        model: turn.model,
        responseExcerpt: undefined,
        responseStatus: "no_response",
      } satisfies MeetingRecapModelRow);

    if (turn.phaseId === "independent") {
      current.independentExcerpt = excerptTurn(turn.content);
    }

    if (turn.phaseId === "response") {
      current.responseExcerpt = excerptTurn(turn.content);
      current.responseStatus = "responded";
    }

    turnGroups.set(key, current);
  }

  for (const failure of meeting.failures ?? []) {
    if (failure.stage !== "response") {
      continue;
    }

    const key = getFailureKey(failure);
    const current =
      turnGroups.get(key) ??
      ({
        key,
        speakerName: failure.participantName ?? failure.providerName,
        provider: failure.providerName,
        model: failure.model,
        responseExcerpt: undefined,
        responseStatus: "no_response",
      } satisfies MeetingRecapModelRow);

    if (current.responseStatus !== "responded") {
      current.responseStatus = "failed_response";
      current.failureMessage = failure.message;
    }

    turnGroups.set(key, current);
  }

  for (const row of turnGroups.values()) {
    if (row.responseStatus === "no_response" && responseFailures.has(row.key)) {
      const failure = responseFailures.get(row.key);

      row.responseStatus = "failed_response";
      row.failureMessage = failure?.message;
    }
  }

  return {
    timeline: [
      ...(independentPhase ? [buildTimelineItem(independentPhase)] : []),
      ...(responsePhase ? [buildTimelineItem(responsePhase)] : []),
      buildSummaryTimelineItem(meeting),
    ],
    modelRows: Array.from(turnGroups.values()),
    hasLowEvidenceGuard:
      meeting.evidencePack?.evidenceStatus === "low" ||
      meeting.evidencePack?.evidenceStatus === "none" ||
      meeting.searchSummary?.status === "low_evidence",
  };
}

function buildTimelineItem(
  phase: MeetingResult["phases"][number],
): MeetingRecapTimelineItem {
  return {
    id: phase.id,
    title: phase.title,
    description: phase.description,
    turnCount: phase.turns.length,
    participantNames: getUniqueNames(phase.turns.map((turn) => turn.speakerName)),
    excerpt: phase.turns[0] ? excerptTurn(phase.turns[0].content) : undefined,
    isEmpty: phase.turns.length === 0,
  };
}

function buildSummaryTimelineItem(meeting: MeetingResult): MeetingRecapTimelineItem {
  const summaryItems = [
    ...meeting.summary.consensus,
    ...(meeting.summary.confirmableFacts ?? []),
    ...(meeting.summary.initialHypotheses ?? []),
    ...meeting.summary.differences,
    ...meeting.summary.nextSteps,
  ];

  return {
    id: "summary",
    title: "summary",
    description: "summary",
    turnCount: summaryItems.length,
    participantNames: [],
    excerpt: summaryItems[0] ? excerptTurn(summaryItems[0]) : undefined,
    isEmpty: summaryItems.length === 0,
  };
}

function getUniqueNames(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function excerptTurn(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= EXCERPT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, EXCERPT_LENGTH).trim()}...`;
}

function getTurnKey(turn: Pick<MeetingTurn, "speakerName" | "provider" | "model">) {
  return `${turn.speakerName}::${turn.provider}::${turn.model}`;
}

function getFailureKey(
  failure: Pick<
    MeetingProviderFailure,
    "participantName" | "providerName" | "model"
  >,
) {
  return `${failure.participantName ?? failure.providerName}::${failure.providerName}::${failure.model}`;
}
