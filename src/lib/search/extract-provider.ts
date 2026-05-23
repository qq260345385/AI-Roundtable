export type ExtractProviderRequest = {
  urls: string[];
  query: string;
  chunksPerSource: number;
  extractDepth: "basic" | "advanced";
  signal?: AbortSignal;
};

export type ExtractProviderResult = {
  title: string;
  url: string;
  content: string;
  sourceQuery: string;
  provider: string;
  raw?: unknown;
};

export type ExtractProviderResponse = {
  provider: string;
  results: ExtractProviderResult[];
  diagnostics?: Record<string, unknown>;
  rawStats?: Record<string, unknown>;
};

export type ExtractProvider = {
  id: string;
  displayName: string;
  extract(request: ExtractProviderRequest): Promise<ExtractProviderResponse>;
};
