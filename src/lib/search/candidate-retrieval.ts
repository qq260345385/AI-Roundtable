import type {
  EvidenceSearchPassParameters,
  SearchProcessCandidatePreview,
  SearchQueryQuality,
  SearchQueryLevel,
  SearchFreshness,
} from "./evidence-pack";
import { scoreEvidence } from "./evidence-pack";
import type { TavilyEvidenceDraft } from "./tavily-search";

export type RetrievalPassSnapshot = {
  chunksPerSource?: number;
  country?: string;
  derivedFrom?: string;
  excludeDomains?: string[];
  freshness: SearchFreshness;
  includeDomains?: string[];
  includeRawContent?: boolean | "markdown" | "text";
  query: string;
  queryLevel?: SearchQueryLevel;
  queryQuality?: SearchQueryQuality;
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  searchTopic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";
};

export function getRetrievalPassParameters(
  pass: Pick<
    RetrievalPassSnapshot,
    | "country"
    | "excludeDomains"
    | "includeDomains"
    | "includeRawContent"
    | "searchDepth"
    | "searchTopic"
    | "timeRange"
  >,
  maxResults?: number,
): EvidenceSearchPassParameters {
  return {
    ...(typeof maxResults === "number" ? { maxResults } : {}),
    ...(pass.searchDepth ? { searchDepth: pass.searchDepth } : {}),
    ...(pass.searchTopic ? { searchTopic: pass.searchTopic } : {}),
    ...(pass.timeRange ? { timeRange: pass.timeRange } : {}),
    ...(pass.country ? { country: pass.country } : {}),
    ...(pass.includeDomains && pass.includeDomains.length > 0
      ? { includeDomains: pass.includeDomains }
      : {}),
    ...(pass.excludeDomains && pass.excludeDomains.length > 0
      ? { excludeDomains: pass.excludeDomains }
      : {}),
    ...(pass.includeRawContent !== undefined
      ? { includeRawContent: pass.includeRawContent }
      : {}),
  };
}

export function buildTopRawCandidatePreviews(
  drafts: TavilyEvidenceDraft[],
  topic: string,
): SearchProcessCandidatePreview[] {
  return drafts
    .map((draft) => {
      const quality = scoreEvidence({
        title: draft.title,
        url: draft.url,
        source: draft.source,
        publishedAt: draft.publishedAt,
        snippet: draft.snippet,
        topic,
      });

      return {
        title: draft.title,
        ...(draft.query ? { query: draft.query } : {}),
        ...(draft.url ? { url: draft.url } : {}),
        ...(draft.source ? { source: draft.source } : {}),
        ...(typeof draft.providerScore === "number"
          ? { providerScore: draft.providerScore }
          : {}),
        snippetLength: draft.snippet.length,
        reliability: quality.reliability,
        score: quality.score,
        ...(draft.seenInPasses ? { seenInPasses: draft.seenInPasses } : {}),
        ...(quality.evidenceJudgment?.role
          ? { evidenceRole: quality.evidenceJudgment.role }
          : {}),
      };
    })
    .sort((left, right) => {
      const providerDelta =
        (right.providerScore ?? 0) - (left.providerScore ?? 0);

      if (providerDelta !== 0) {
        return providerDelta;
      }

      return right.score - left.score;
    })
    .slice(0, 12);
}
