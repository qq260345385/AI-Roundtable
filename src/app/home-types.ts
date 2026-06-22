import type { SearchIntensity, SearchRegion } from "@/lib/types";
import type { DocumentInputStrategy } from "@/lib/search/evidence-pack";

export type MeetingStatus = "initial" | "loading" | "success" | "error";
export type ModelLoadStatus = "loading" | "success" | "error";

export const LOCALE_STORAGE_KEY = "ai-roundtable-locale";
export const SEARCH_REGION_STORAGE_KEY = "ai-roundtable-search-region";
export const SEARCH_INTENSITY_STORAGE_KEY = "ai-roundtable-search-intensity";
export const MAX_EVIDENCE_DRAFTS = 10;

export type HomePreferences = {
  locale?: string | null;
  searchRegion?: SearchRegion | null;
  searchIntensity?: SearchIntensity | null;
};

export type EvidenceDraft = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  snippet: string;
  quality?: {
    warnings: string[];
    textLength: number;
    wasTruncated: boolean;
  };
};

export type EvidenceParseApiResponse = {
  draft?: EvidenceDraft;
  error?: string;
};

export type EvidencePackRequestStrategy = DocumentInputStrategy;
