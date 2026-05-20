import type { EvidencePack } from "./evidence-pack";

export type CitationCheckResult = {
  validCitationIds: string[];
  usedCitationIds: string[];
  missingCitationIds: string[];
  invalidCitationIds: string[];
  hasInvalidCitations: boolean;
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

  return {
    validCitationIds,
    usedCitationIds,
    missingCitationIds,
    invalidCitationIds,
    hasInvalidCitations: invalidCitationIds.length > 0,
  };
}
