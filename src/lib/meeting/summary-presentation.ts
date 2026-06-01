import {
  classifyEvidenceTopic,
  type EvidenceTopicType,
} from "../search/evidence-pack";
import type { MeetingSummary } from "../types";

export type SummaryPresentationStyle = "stance-oriented" | "evidence-oriented";

export type ThirdStageSummarySections = {
  consensus: string[];
  differences: string[];
  nextSteps: string[];
};

const LEGACY_EMPTY_FACT_NOTICE = "无。当前资料不足以确认关键事实。";

export function getSummaryPresentationStyle(
  topic: string | undefined,
): SummaryPresentationStyle {
  return classifyEvidenceTopic(topic) === "general_discussion"
    ? "stance-oriented"
    : "evidence-oriented";
}

export function isStanceOrientedTopic(topic: string | undefined): boolean {
  return getSummaryPresentationStyle(topic) === "stance-oriented";
}

export function getSummaryTopicType(topic: string | undefined): EvidenceTopicType {
  return classifyEvidenceTopic(topic);
}

export function getThirdStageSummarySections(
  summary: MeetingSummary,
): ThirdStageSummarySections {
  const consensusSource =
    summary.consensus.length > 0
      ? summary.consensus
      : [
          ...(summary.confirmableFacts ?? []),
          ...(summary.initialHypotheses ?? []),
        ];
  const differencesSource = [
    ...summary.differences,
    ...summary.minorityViews,
    ...(summary.insufficientlyConfirmed ?? []),
  ];
  const nextStepSource =
    summary.nextSteps.length > 0 ? summary.nextSteps : summary.risks;

  return {
    consensus: cleanSummaryItems(consensusSource),
    differences: cleanSummaryItems(differencesSource),
    nextSteps: cleanSummaryItems(nextStepSource),
  };
}

function cleanSummaryItems(items: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const rawItem of items) {
    const item = rawItem.trim();

    if (
      item.length === 0 ||
      item === LEGACY_EMPTY_FACT_NOTICE ||
      item.includes("资料不足以确认关键事实")
    ) {
      continue;
    }

    const key = item.replace(/\s+/g, "");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleaned.push(item);
  }

  return cleaned;
}
