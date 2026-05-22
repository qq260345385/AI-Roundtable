import { describe, expect, test } from "vitest";
import {
  createSearchProviderRegistry,
  getSearchProvider,
} from "./search-provider-registry";
import { TavilySearchProvider } from "./tavily-search";

describe("search provider registry", () => {
  test("uses Tavily as the default search provider", () => {
    const provider = getSearchProvider({});

    expect(provider).toBeInstanceOf(TavilySearchProvider);
    expect(provider.id).toBe("tavily");
    expect(provider.displayName).toBe("Tavily");
  });

  test("uses Tavily when SEARCH_PROVIDER=tavily", () => {
    const provider = getSearchProvider({ SEARCH_PROVIDER: "tavily" });

    expect(provider).toBeInstanceOf(TavilySearchProvider);
    expect(provider.id).toBe("tavily");
  });

  test("safely falls back to Tavily for unknown SEARCH_PROVIDER", () => {
    const registry = createSearchProviderRegistry({
      SEARCH_PROVIDER: "brave",
    });

    expect(registry.selectedProvider.id).toBe("tavily");
    expect(registry.requestedProviderId).toBe("brave");
    expect(registry.fallbackReason).toBe("unknown_search_provider");
  });
});
