import type { CitationCheckResult } from "../search/evidence-citations";
import type { EvidencePack } from "../search/evidence-pack";
import type {
  DecisionBrief,
  DecisionConfidence,
  DecisionStatus,
  MeetingProviderFailure,
  MeetingSummary,
} from "../types";

export const DECISION_BRIEF_LIMITS = {
  recommendation: 320,
  item: 220,
  list: 5,
  nextAction: 220,
} as const;

export type DecisionBriefQualityContext = {
  citationCheck?: CitationCheckResult;
  evidencePack?: EvidencePack;
  failures?: MeetingProviderFailure[];
  insufficientParticipants?: boolean;
};

const DECISION_STATUSES: DecisionStatus[] = [
  "firm",
  "tentative",
  "unavailable",
];
const DECISION_CONFIDENCES: DecisionConfidence[] = ["high", "medium", "low"];
const LOW_EVIDENCE_MODES = new Set([
  "low_evidence",
  "search_failed",
  "no_reliable_sources",
  "realtime_unverified",
]);

export function createEmptyDecisionBrief(): DecisionBrief {
  return createUnavailableDecisionBrief(
    "会议总结尚未生成。",
    "等待会议总结完成。",
  );
}

export function createUnavailableDecisionBrief(
  recommendation: string,
  nextAction = "补充关键资料后重新开会。",
): DecisionBrief {
  return {
    recommendation,
    status: "unavailable",
    rationale: [],
    conditions: [],
    risks: [],
    confidence: "low",
    evidenceGaps: [],
    reversalConditions: [],
    nextAction,
  };
}

export function normalizeDecisionBrief(summary: MeetingSummary): DecisionBrief {
  const raw = isRecord(summary.decisionBrief)
    ? summary.decisionBrief
    : undefined;
  const recommendation =
    cleanText(raw?.recommendation, DECISION_BRIEF_LIMITS.recommendation) ||
    cleanText(summary.consensus[0], DECISION_BRIEF_LIMITS.recommendation) ||
    cleanText(summary.nextSteps[0], DECISION_BRIEF_LIMITS.recommendation);

  if (!recommendation) {
    return createUnavailableDecisionBrief("本轮未形成可执行推荐。");
  }

  const isLegacyOrIncomplete = !hasCompleteDecisionBrief(raw);

  return {
    recommendation,
    status: isLegacyOrIncomplete ? "tentative" : readStatus(raw.status),
    rationale: cleanList(raw?.rationale, summary.consensus),
    conditions: cleanList(raw?.conditions),
    risks: cleanList(raw?.risks, [...summary.differences, ...summary.risks]),
    confidence: isLegacyOrIncomplete
      ? "low"
      : readConfidence(raw.confidence),
    evidenceGaps: cleanList(
      raw?.evidenceGaps,
      summary.insufficientlyConfirmed,
    ),
    reversalConditions: cleanList(
      raw?.reversalConditions,
      summary.differences.map(
        (item) => `若“${item}”得到验证，应重新评估推荐。`,
      ),
    ),
    nextAction:
      cleanText(raw?.nextAction, DECISION_BRIEF_LIMITS.nextAction) ||
      cleanText(summary.nextSteps[0], DECISION_BRIEF_LIMITS.nextAction) ||
      "补充关键资料后重新开会。",
  };
}

export function applyDecisionBriefQualityGate(
  brief: DecisionBrief,
  summary: MeetingSummary,
  context: DecisionBriefQualityContext,
): DecisionBrief {
  if (context.insufficientParticipants) {
    return createUnavailableDecisionBrief(
      "有效发言模型不足，无法形成可靠推荐。",
      "检查模型配置后重新开会。",
    );
  }

  const normalized = normalizeStandaloneBrief(brief);

  if (normalized.status === "unavailable") {
    return { ...normalized, confidence: "low" };
  }

  const lowEvidence =
    context.evidencePack?.evidenceStatus === "low" ||
    LOW_EVIDENCE_MODES.has(
      context.evidencePack?.searchProcess?.evidenceMode ?? "normal",
    );
  const invalidCitations = Boolean(
    context.citationCheck?.hasInvalidCitations ||
      context.citationCheck?.hasCitationDisciplineWarning,
  );
  const partialFailures = (context.failures?.length ?? 0) > 0;
  const severeDisagreement =
    summary.consensus.length === 0 && summary.differences.length >= 2;
  const incompleteBrief = !hasCompleteDecisionBrief(summary.decisionBrief);
  const forceLow =
    lowEvidence ||
    invalidCitations ||
    partialFailures ||
    severeDisagreement;
  const forceTentative = forceLow || incompleteBrief;

  const qualityGaps: string[] = [];
  const qualityReversalConditions: string[] = [];

  if (lowEvidence) {
    qualityGaps.push(
      "当前核心证据不足，主要事实仍需补充可靠资料核验。",
    );
    qualityReversalConditions.push(
      "若补充的可靠证据与当前判断冲突，应重新评估推荐。",
    );
  }

  if (invalidCitations) {
    qualityGaps.push("部分引用未通过资料包校验，主要事实需要人工核验。");
    qualityReversalConditions.push(
      "若人工核验发现关键引用无效，应重新评估推荐。",
    );
  }

  if (partialFailures) {
    qualityGaps.push("部分参会模型未完成发言，缺席观点可能影响结论。");
    qualityReversalConditions.push(
      "若缺席模型补充了关键反例，应重新评估推荐。",
    );
  }

  if (severeDisagreement) {
    qualityGaps.push("参会模型存在未消解的主要分歧。");
    qualityReversalConditions.push(
      "若主要分歧无法通过试点指标消解，应重新评估推荐。",
    );
  }

  if (incompleteBrief) {
    qualityGaps.push("决策简报字段不完整，当前建议由旧版总结保守补齐。");
  }

  return {
    ...normalized,
    status: forceTentative ? "tentative" : normalized.status,
    confidence: forceLow
      ? "low"
      : forceTentative || normalized.status === "tentative"
        ? capConfidence(normalized.confidence, "medium")
        : normalized.confidence,
    evidenceGaps: cleanList([...qualityGaps, ...normalized.evidenceGaps]),
    reversalConditions: cleanList([
      ...qualityReversalConditions,
      ...normalized.reversalConditions,
    ]),
  };
}

function normalizeStandaloneBrief(brief: DecisionBrief): DecisionBrief {
  return {
    recommendation:
      cleanText(brief.recommendation, DECISION_BRIEF_LIMITS.recommendation) ||
      "本轮未形成可执行推荐。",
    status: readStatus(brief.status),
    rationale: cleanList(brief.rationale),
    conditions: cleanList(brief.conditions),
    risks: cleanList(brief.risks),
    confidence: readConfidence(brief.confidence),
    evidenceGaps: cleanList(brief.evidenceGaps),
    reversalConditions: cleanList(brief.reversalConditions),
    nextAction:
      cleanText(brief.nextAction, DECISION_BRIEF_LIMITS.nextAction) ||
      "补充关键资料后重新开会。",
  };
}

function hasCompleteDecisionBrief(value: unknown): value is DecisionBrief {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.recommendation === "string" &&
    isDecisionStatus(value.status) &&
    Array.isArray(value.rationale) &&
    Array.isArray(value.conditions) &&
    Array.isArray(value.risks) &&
    isDecisionConfidence(value.confidence) &&
    Array.isArray(value.evidenceGaps) &&
    Array.isArray(value.reversalConditions) &&
    typeof value.nextAction === "string"
  );
}

function cleanList(
  primary: unknown,
  fallback: readonly unknown[] | undefined = [],
): string[] {
  const values = Array.isArray(primary) ? primary : fallback;
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const item = cleanText(value, DECISION_BRIEF_LIMITS.item);

    if (!item || seen.has(item)) {
      continue;
    }

    seen.add(item);
    result.push(item);

    if (result.length === DECISION_BRIEF_LIMITS.list) {
      break;
    }
  }

  return result;
}

function cleanText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function readStatus(value: unknown): DecisionStatus {
  return isDecisionStatus(value) ? value : "tentative";
}

function readConfidence(value: unknown): DecisionConfidence {
  return isDecisionConfidence(value) ? value : "low";
}

function isDecisionStatus(value: unknown): value is DecisionStatus {
  return DECISION_STATUSES.includes(value as DecisionStatus);
}

function isDecisionConfidence(value: unknown): value is DecisionConfidence {
  return DECISION_CONFIDENCES.includes(value as DecisionConfidence);
}

function capConfidence(
  confidence: DecisionConfidence,
  maximum: DecisionConfidence,
): DecisionConfidence {
  const rank: Record<DecisionConfidence, number> = {
    low: 0,
    medium: 1,
    high: 2,
  };

  return rank[confidence] <= rank[maximum] ? confidence : maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
