import type {
  SearchCacheEvent,
  SearchFreshness,
} from "./evidence-pack";
import type { SearchRegion } from "../types";

export type SearchProviderRequest = {
  query: string;
  topic: string;
  maxResults: number;
  searchDepth: "basic" | "advanced" | "fast" | "ultra-fast";
  freshness: SearchFreshness;
  chunksPerSource?: number;
  country?: string;
  exactMatch?: boolean;
  excludeDomains?: string[];
  includeDomains?: string[];
  includeRawContent?: boolean | "markdown" | "text";
  includeUsage?: boolean;
  searchRegion?: SearchRegion;
  searchTopic?: "general" | "news" | "finance";
  signal?: AbortSignal;
  timeRange?: "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";
};

export type SearchProviderResult = {
  title: string;
  url?: string;
  content?: string;
  snippet?: string;
  publishedDate?: string;
  sourceQuery: string;
  provider: string;
  providerScore?: number;
  raw?: unknown;
};

export type SearchProviderResponse = {
  provider: string;
  results: SearchProviderResult[];
  cacheEvents?: SearchCacheEvent[];
  rawStats?: Record<string, unknown>;
  diagnostics?: Record<string, unknown>;
};

export type SearchProvider = {
  id: string;
  displayName: string;
  search(request: SearchProviderRequest): Promise<SearchProviderResponse>;
};
