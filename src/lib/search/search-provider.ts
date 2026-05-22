import type {
  SearchCacheEvent,
  SearchFreshness,
} from "./evidence-pack";

export type SearchProviderRequest = {
  query: string;
  topic: string;
  maxResults: number;
  searchDepth: "basic" | "advanced" | "fast" | "ultra-fast";
  freshness: SearchFreshness;
  signal?: AbortSignal;
};

export type SearchProviderResult = {
  title: string;
  url?: string;
  content?: string;
  snippet?: string;
  publishedDate?: string;
  sourceQuery: string;
  provider: string;
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
