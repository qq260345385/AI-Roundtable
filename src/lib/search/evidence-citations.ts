import type { EvidencePack } from "./evidence-pack";

export type CitationCheckResult = {
  existingCitationIds?: string[];
  citableCitationIds?: string[];
  validCitationIds: string[];
  usedCitationIds: string[];
  missingCitationIds: string[];
  invalidCitationIds: string[];
  downgradedCitationIds?: string[];
  weakCitationIds?: string[];
  citationWarnings?: string[];
  hasInvalidCitations: boolean;
  hasCitationDisciplineWarning?: boolean;
  hasWeakCitations?: boolean;
};

const CITATION_PATTERN = /\[(S\d+)\]/gi;

export function extractCitationIds(text: string): string[] {
  const ids: string[] = [];
  const seenIds = new Set<string>();

  for (const match of text.matchAll(CITATION_PATTERN)) {
    const id = match[1].toUpperCase();

    if (!seenIds.has(id)) {
      seenIds.add(id);
      ids.push(id);
    }
  }

  return ids;
}

export function checkEvidenceCitations(
  text: string,
  evidencePack?: EvidencePack,
): CitationCheckResult {
  const usedCitationIds = extractCitationIds(text);
  const existingCitationIds =
    evidencePack?.enabled && evidencePack.items.length > 0
      ? evidencePack.items.map((item) => item.id)
      : [];
  const citableCitationIds =
    evidencePack?.enabled && evidencePack.items.length > 0
      ? evidencePack.items
          .filter(isCitableEvidenceCitation)
          .map((item) => item.id)
      : [];
  const validCitationIds = existingCitationIds;
  const validCitationIdSet = new Set(validCitationIds);
  const usedCitationIdSet = new Set(usedCitationIds);
  const invalidCitationIds = usedCitationIds.filter(
    (id) => !validCitationIdSet.has(id),
  );
  const missingCitationIds = validCitationIds.filter(
    (id) => !usedCitationIdSet.has(id),
  );
  const weakCitationIds =
    evidencePack?.enabled && evidencePack.items.length > 0
      ? usedCitationIds.filter((id) => {
          const item = evidencePack.items.find((candidate) => candidate.id === id);

          return item ? isWeakEvidenceCitation(item) : false;
        })
      : [];
  const downgradedCitationIds = weakCitationIds;
  const hasNoCitableEvidenceWarning =
    evidencePack?.enabled === true &&
    validCitationIds.length > 0 &&
    citableCitationIds.length === 0 &&
    usedCitationIds.length > 0;
  const citationWarnings = [
    ...(hasNoCitableEvidenceWarning
      ? ["No citable evidence is available, but the text used citation IDs."]
      : []),
    ...downgradedCitationIds.map(
      (id) =>
        `${id} is downgraded or context-only evidence and should not be cited as support.`,
    ),
  ];

  return {
    existingCitationIds,
    citableCitationIds,
    validCitationIds,
    usedCitationIds,
    missingCitationIds,
    invalidCitationIds,
    downgradedCitationIds,
    weakCitationIds,
    citationWarnings,
    hasInvalidCitations: invalidCitationIds.length > 0,
    hasCitationDisciplineWarning:
      hasNoCitableEvidenceWarning || downgradedCitationIds.length > 0,
    hasWeakCitations: weakCitationIds.length > 0,
  };
}

function isCitableEvidenceCitation(
  item: EvidencePack["items"][number],
): boolean {
  const role = item.quality?.evidenceJudgment?.role;

  if (role === "core" || role === "supporting") {
    return true;
  }

  if (role === "background" || role === "discard") {
    return false;
  }

  if (
    item.quality?.citationLevel === "context_only" ||
    item.quality?.citationLevel === "not_citable"
  ) {
    return false;
  }

  return (
    item.quality?.citationLevel === "fact" ||
    item.quality?.citationLevel === "qualified_fact" ||
    item.quality?.reliability === "high" ||
    item.quality?.reliability === "medium"
  );
}

function isWeakEvidenceCitation(
  item: EvidencePack["items"][number],
): boolean {
  return (
    item.quality?.evidenceJudgment?.role === "background" ||
    item.quality?.evidenceJudgment?.role === "discard" ||
    item.quality?.citationLevel === "context_only" ||
    item.quality?.citationLevel === "not_citable" ||
    item.quality?.reliability === "low" ||
    item.quality?.reliability === "very_low"
  );
}
