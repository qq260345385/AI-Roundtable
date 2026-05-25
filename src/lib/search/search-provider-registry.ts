import type { SearchProvider } from "./search-provider";
import { TavilySearchProvider } from "./tavily-search";

type SearchProviderEnv = {
  SEARCH_PROVIDER?: string;
};

export type SearchProviderRegistry = {
  requestedProviderId: string;
  selectedProvider: SearchProvider;
  fallbackReason?: "unknown_search_provider";
};

export function getSearchProvider(
  env: SearchProviderEnv = { SEARCH_PROVIDER: process.env.SEARCH_PROVIDER },
): SearchProvider {
  return createSearchProviderRegistry(env).selectedProvider;
}

export function createSearchProviderRegistry(
  env: SearchProviderEnv = { SEARCH_PROVIDER: process.env.SEARCH_PROVIDER },
): SearchProviderRegistry {
  const requestedProviderId = normalizeProviderId(env.SEARCH_PROVIDER);
  const providers = new Map<string, SearchProvider>([
    ["tavily", new TavilySearchProvider()],
  ]);
  const selectedProvider = providers.get(requestedProviderId);

  if (selectedProvider) {
    return {
      requestedProviderId,
      selectedProvider,
    };
  }

  return {
    requestedProviderId,
    selectedProvider: providers.get("tavily") ?? new TavilySearchProvider(),
    fallbackReason: "unknown_search_provider",
  };
}

function normalizeProviderId(value: string | undefined) {
  return value?.trim().toLowerCase() || "tavily";
}
