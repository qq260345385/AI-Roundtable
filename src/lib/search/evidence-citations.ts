import type { EvidencePack } from "./evidence-pack";

export type CitationCheckResult = {
  validCitationIds: string[];
  usedCitationIds: string[];
  missingCitationIds: string[];
  invalidCitationIds: string[];
  weakCitationIds?: string[];
  citationWarnings?: string[];
  hasInvalidCitations: boolean;
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
  const validCitationIds =
    evidencePack?.enabled && evidencePack.items.length > 0
      ? evidencePack.items.map((item) => item.id)
      : [];
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
  const citationWarnings = weakCitationIds.map(
    (id) =>
      `${id} is context-only evidence and should not support factual claims.`,
  );

  return {
    validCitationIds,
    usedCitationIds,
    missingCitationIds,
    invalidCitationIds,
    weakCitationIds,
    citationWarnings,
    hasInvalidCitations: invalidCitationIds.length > 0,
    hasWeakCitations: weakCitationIds.length > 0,
  };
}

function isWeakEvidenceCitation(
  item: EvidencePack["items"][number],
): boolean {
  return (
    item.quality?.citationLevel === "context_only" ||
    item.quality?.citationLevel === "not_citable" ||
    item.quality?.reliability === "low" ||
    item.quality?.reliability === "very_low"
  );
}
