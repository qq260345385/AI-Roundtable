import type { SearchEvidence, SearchMode } from "./evidence-pack";
import type { dedupeSearchResults } from "./tavily-search";

const SOCIAL_CLUE_FINAL_LIMIT = 2;
const MODEL_DRIVEN_FINAL_EVIDENCE_LIMIT = 12;

export type SearchModeConfig = {
  candidateLimit: number;
  extractLimit: number;
  finalLimit: number;
  chunksPerSource: number;
};
export function limitPublicOpinionEvidenceItems(items: SearchEvidence[]): SearchEvidence[] {
  let publicOpinionCount = 0;

  return items.filter((item) => {
    const sourceType = item.quality?.sourceType;

    if (
      sourceType !== "official_community" &&
      sourceType !== "social_forum" &&
      sourceType !== "video_platform"
    ) {
      return true;
    }

    publicOpinionCount += 1;

    return publicOpinionCount <= SOCIAL_CLUE_FINAL_LIMIT;
  });
}

export function getSearchModeConfig(searchMode: SearchMode): SearchModeConfig {
  if (searchMode === "deep") {
    return {
      candidateLimit: 60,
      extractLimit: 18,
      finalLimit: MODEL_DRIVEN_FINAL_EVIDENCE_LIMIT,
      chunksPerSource: 5,
    };
  }

  return {
    candidateLimit: 30,
    extractLimit: 8,
    finalLimit: MODEL_DRIVEN_FINAL_EVIDENCE_LIMIT,
    chunksPerSource: 5,
  };
}

export function getQualityDistribution(items: SearchEvidence[]) {
  return {
    high: items.filter((item) => item.quality?.reliability === "high").length,
    medium: items.filter((item) => item.quality?.reliability === "medium").length,
    low: items.filter((item) => item.quality?.reliability === "low").length,
    very_low: items.filter(
      (item) => item.quality?.reliability === "very_low",
    ).length,
  };
}

export function mergeDedupeStats(
  original: ReturnType<typeof dedupeSearchResults>["stats"] | undefined,
  rescued: ReturnType<typeof dedupeSearchResults>["stats"],
) {
  if (!original) {
    return rescued;
  }

  return {
    originalResultCount: original.originalResultCount,
    dedupedResultCount: rescued.dedupedResultCount,
    removedDuplicateCount:
      original.removedDuplicateCount + rescued.removedDuplicateCount,
    removedSameDomainCount:
      original.removedSameDomainCount + rescued.removedSameDomainCount,
    removals: [...original.removals, ...rescued.removals],
    ...(original.domainLimitRelaxedReason || rescued.domainLimitRelaxedReason
      ? {
          domainLimitRelaxedReason:
            rescued.domainLimitRelaxedReason ?? original.domainLimitRelaxedReason,
        }
      : {}),
  };
}

export function getEvidenceWarnings(status: string, searchedCandidateCount = 0): string[] {
  if (status === "low") {
    return [
      searchedCandidateCount > 0
        ? `已广搜 ${searchedCandidateCount} 条候选资料，但直接证据不足；已切换为低证据会议模式，涉及实时事实的结论请人工核验。`
        : undefined,
      "未找到高质量联网资料，已切换为低证据会议模式。本次会议仍会继续，但涉及实时事实的结论请人工核验。",
    ].filter((warning): warning is string => Boolean(warning));
  }

  if (status === "none") {
    return [
      searchedCandidateCount > 0
        ? `已广搜 ${searchedCandidateCount} 条候选资料，但没有足够可引用资料；本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。`
        : undefined,
      "未找到可用联网资料，本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。",
    ].filter((warning): warning is string => Boolean(warning));
  }

  return [];
}
