import type { MeetingSummary } from "../types";
import {
  summarizeEvidenceQuality,
  type EvidencePack,
} from "../search/evidence-pack";
import { extractCitationIds } from "../search/evidence-citations";

export function applyEvidenceQualityGateToSummary(
  summary: MeetingSummary,
  evidencePack: EvidencePack | undefined,
): MeetingSummary {
  const dedupedSummary = applyCoverageNoticeToConfirmableFacts(
    dedupeSummaryUncertainty(summary),
    evidencePack,
  );

  if (!evidencePack?.enabled || evidencePack.items.length === 0) {
    return dedupedSummary;
  }

  const hasUsableEvidence = evidencePack.items.some((item) =>
    item.quality?.reliability === "high" ||
    item.quality?.reliability === "medium",
  );

  if (hasUsableEvidence) {
    return dedupeSummaryUncertainty(
      downgradeWeakConsensusClaims(
        downgradeWeakConfirmableFacts(dedupedSummary, evidencePack),
        evidencePack,
      ),
    );
  }

  const downgradedFacts = [
    ...(dedupedSummary.confirmableFacts ?? []),
  ];
  const { discussionDifferences, evidenceLimitations } =
    splitEvidenceLimitations(dedupedSummary.differences);
  const discussionConsensus = dedupedSummary.consensus
    .filter((item) => !isEmptyConsensusSentence(item))
    .map(markAsDiscussionConsensus);

  if (
    downgradedFacts.length === 0 &&
    discussionConsensus.length === 0 &&
    evidenceLimitations.length === 0
  ) {
    return dedupedSummary;
  }

  return dedupeSummaryUncertainty({
    ...dedupedSummary,
    consensus: discussionConsensus,
    differences: discussionDifferences,
    confirmableFacts: [],
    insufficientlyConfirmed: [
      ...(dedupedSummary.insufficientlyConfirmed ?? []),
      ...downgradedFacts.map(markAsInsufficientlyConfirmed),
      ...evidenceLimitations,
    ],
  });
}

function applyCoverageNoticeToConfirmableFacts(
  summary: MeetingSummary,
  evidencePack: EvidencePack | undefined,
): MeetingSummary {
  if (!evidencePack?.enabled || evidencePack.items.length === 0) {
    return summary;
  }

  const overview = summarizeEvidenceQuality(evidencePack, {
    evidenceStatus: evidencePack.evidenceStatus,
  });

  if (
    overview.coverageCompleteness >= 0.75 ||
    !overview.missingDimensions.some((dimension) =>
      [
        "business_revenue_or_enterprise_adoption",
        "funding_capital_or_market_analysis",
      ].includes(dimension),
    )
  ) {
    return summary;
  }

  const notice =
    "当前可确认事实尚未覆盖关键比较维度，不能据此确认综合结论。";
  const confirmableFacts = summary.confirmableFacts ?? [];

  if (confirmableFacts.some((fact) => normalizeSummaryPoint(fact) === normalizeSummaryPoint(notice))) {
    return summary;
  }

  return {
    ...summary,
    confirmableFacts: [notice, ...confirmableFacts],
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

function downgradeWeakConsensusClaims(
  summary: MeetingSummary,
  evidencePack: EvidencePack,
): MeetingSummary {
  if (summary.consensus.length === 0) {
    return summary;
  }

  const weakCitationIds = getWeakCitationIds(evidencePack);
  const consensus: string[] = [];
  const insufficientlyConfirmed = [...(summary.insufficientlyConfirmed ?? [])];

  for (const item of summary.consensus) {
    if (shouldDowngradeNumericClaim(item, weakCitationIds)) {
      insufficientlyConfirmed.push(markAsInsufficientlyConfirmed(item));
    } else {
      consensus.push(item);
    }
  }

  return {
    ...summary,
    consensus,
    insufficientlyConfirmed,
  };
}

function getWeakCitationIds(evidencePack: EvidencePack): Set<string> {
  return new Set(
    evidencePack.items
      .filter(
        (item) =>
          item.quality?.citationLevel === "context_only" ||
          item.quality?.citationLevel === "not_citable" ||
          item.quality?.reliability === "low" ||
          item.quality?.reliability === "very_low" ||
          item.quality?.snippetOnly === true ||
          (item.quality?.score ?? 0) < 60,
      )
      .map((item) => item.id),
  );
}

function shouldDowngradeNumericClaim(
  value: string,
  weakCitationIds: Set<string>,
): boolean {
  const citesWeakEvidence = extractCitationIds(value).some((id) =>
    weakCitationIds.has(id),
  );

  return citesWeakEvidence && containsSensitiveNumericClaim(value);
}

function containsSensitiveNumericClaim(value: string): boolean {
  return /(\$|￥|€|£|\b\d+(?:\.\d+)?\s*(?:billion|million|bn|m|亿美元|亿元|万亿|亿|万)\b|融资|估值|营收|收入|IPO|上市|时间表|valuation|funding|revenue)/i.test(
    value,
  );
}

function markAsInsufficientlyConfirmed(value: string): string {
  if (value.includes("不能确认") || value.includes("不足以确认")) {
    return value;
  }

  return `${value}（仅由低可信资料支持，不能确认。）`;
}

function markAsDiscussionConsensus(value: string): string {
  const withoutCitations = value.replace(/\s*\[[sS]\d+\]/g, "").trim();

  if (withoutCitations.includes("主要来自模型推理，需资料验证")) {
    return withoutCitations;
  }

  return `${withoutCitations}（讨论共识，主要来自模型推理，需资料验证。）`;
}

function splitEvidenceLimitations(items: string[]): {
  discussionDifferences: string[];
  evidenceLimitations: string[];
} {
  const discussionDifferences: string[] = [];
  const evidenceLimitations: string[] = [];

  for (const item of items) {
    if (isEvidenceLimitationSentence(item)) {
      evidenceLimitations.push(item);
    } else {
      discussionDifferences.push(item);
    }
  }

  return { discussionDifferences, evidenceLimitations };
}

function isEvidenceLimitationSentence(value: string): boolean {
  return /资料不足|证据不足|无法确认|不能确认|待核验|需要核验|insufficient evidence|not enough evidence|cannot confirm|needs verification/i.test(
    value,
  );
}

function isEmptyConsensusSentence(value: string): boolean {
  return /^(无|没有|暂无|none|no consensus)[。.\s]*$/i.test(value.trim());
}

function dedupeSummaryUncertainty(summary: MeetingSummary): MeetingSummary {
  const initialHypotheses = dedupeStrings(summary.initialHypotheses ?? []);
  const initialKeys = new Set(initialHypotheses.map(normalizeSummaryPoint));
  const insufficientlyConfirmed = dedupeStrings(
    summary.insufficientlyConfirmed ?? [],
  ).filter(
    (item) =>
      !isNoConfirmableFactsSentence(item) &&
      !initialKeys.has(normalizeSummaryPoint(item)),
  );

  return {
    ...summary,
    initialHypotheses,
    insufficientlyConfirmed,
  };
}

function isNoConfirmableFactsSentence(value: string): boolean {
  return normalizeSummaryPoint(value) === normalizeSummaryPoint("无。当前资料不足以确认关键事实。");
}

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const key = normalizeSummaryPoint(item);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalizeSummaryPoint(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[sS]\d+\]/g, "")
    .replace(/[，。；：、,.!?:;"'“”‘’()\[\]（）\s]/g, "")
    .trim();
}
