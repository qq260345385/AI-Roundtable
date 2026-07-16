import { checkEvidenceCitations } from "../search/evidence-citations";
import type { EvidencePack } from "../search/evidence-pack";
import type {
  MeetingProviderFailure,
  MeetingSummary,
  MeetingTurn,
} from "../types";
import {
  applyDecisionBriefQualityGate,
  normalizeDecisionBrief,
} from "./decision-brief";
import { applyEvidenceQualityGateToSummary } from "./summary-quality-gate";

export type FinalizeMeetingSummaryInput = {
  summary: MeetingSummary;
  turns: MeetingTurn[];
  evidencePack?: EvidencePack;
  failures?: MeetingProviderFailure[];
  insufficientParticipants: boolean;
};

export function finalizeMeetingSummary(input: FinalizeMeetingSummaryInput) {
  const evidenceGated = applyEvidenceQualityGateToSummary(
    input.summary,
    input.evidencePack,
  );
  const normalized = normalizeDecisionBrief(evidenceGated);
  const summaryWithBrief: MeetingSummary = {
    ...evidenceGated,
    decisionBrief: normalized,
  };
  const citationCheck = checkEvidenceCitations(
    collectMeetingCitationText(input.turns, summaryWithBrief),
    input.evidencePack,
  );

  return {
    summary: {
      ...summaryWithBrief,
      decisionBrief: applyDecisionBriefQualityGate(
        normalized,
        evidenceGated,
        {
          citationCheck,
          evidencePack: input.evidencePack,
          failures: input.failures,
          insufficientParticipants: input.insufficientParticipants,
        },
      ),
    },
    citationCheck,
  };
}

export function collectMeetingCitationText(
  turns: MeetingTurn[],
  summary: MeetingSummary,
): string {
  const brief = normalizeDecisionBrief(summary);

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
    brief.recommendation,
    ...brief.rationale,
    ...brief.conditions,
    ...brief.risks,
    ...brief.evidenceGaps,
    ...brief.reversalConditions,
    brief.nextAction,
  ].join("\n");
}
