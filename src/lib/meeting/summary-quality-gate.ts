import type { MeetingSummary } from "../types";
import type { EvidencePack } from "../search/evidence-pack";
import { extractCitationIds } from "../search/evidence-citations";

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
    return downgradeWeakConfirmableFacts(summary, evidencePack);
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

function downgradeWeakConfirmableFacts(
  summary: MeetingSummary,
  evidencePack: EvidencePack,
): MeetingSummary {
  const facts = summary.confirmableFacts ?? [];

  if (facts.length === 0) {
    return summary;
  }

  const weakCitationIds = new Set(
    evidencePack.items
      .filter(
        (item) =>
          item.quality?.citationLevel === "context_only" ||
          item.quality?.citationLevel === "not_citable" ||
          item.quality?.reliability === "low" ||
          item.quality?.reliability === "very_low",
      )
      .map((item) => item.id),
  );

  if (weakCitationIds.size === 0) {
    return summary;
  }

  const confirmableFacts: string[] = [];
  const insufficientlyConfirmed: string[] = [
    ...(summary.insufficientlyConfirmed ?? []),
  ];

  for (const fact of facts) {
    const citesWeakEvidence = extractCitationIds(fact).some((id) =>
      weakCitationIds.has(id),
    );

    if (citesWeakEvidence) {
      insufficientlyConfirmed.push(markAsInsufficientlyConfirmed(fact));
    } else {
      confirmableFacts.push(fact);
    }
  }

  if (confirmableFacts.length === facts.length) {
    return summary;
  }

  return {
    ...summary,
    confirmableFacts,
    insufficientlyConfirmed,
  };
}

function markAsInsufficientlyConfirmed(value: string): string {
  if (value.includes("不能确认") || value.includes("不足以确认")) {
    return value;
  }

  return `${value}（仅由低可信资料支持，不能确认。）`;
}
