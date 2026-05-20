import type { MeetingSummary } from "../types";
import type { EvidencePack } from "../search/evidence-pack";

export function applyEvidenceQualityGateToSummary(
  summary: MeetingSummary,
  evidencePack: EvidencePack | undefined,
): MeetingSummary {
  if (!evidencePack?.enabled || evidencePack.items.length === 0) {
    return summary;
  }

  const hasUsableEvidence = evidencePack.items.some((item) =>
    item.quality?.reliability === "high" ||
    item.quality?.reliability === "medium",
  );

  if (hasUsableEvidence) {
    return summary;
  }

  const downgradedFacts = [
    ...(summary.confirmableFacts ?? []),
    ...summary.consensus,
  ];

  if (downgradedFacts.length === 0) {
    return summary;
  }

  return {
    ...summary,
    consensus: [],
    confirmableFacts: [],
    insufficientlyConfirmed: [
      ...(summary.insufficientlyConfirmed ?? []),
      ...downgradedFacts.map(markAsInsufficientlyConfirmed),
    ],
  };
}

function markAsInsufficientlyConfirmed(value: string): string {
  if (value.includes("不能确认") || value.includes("不足以确认")) {
    return value;
  }

  return `${value}（仅由低可信资料支持，不能确认。）`;
}
