import { afterEach, describe, expect, test, vi } from "vitest";
import {
  TavilySearchError,
  normalizeTavilySearchResponse,
  searchTavilyEvidence,
} from "./tavily-search";

describe("Tavily evidence search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("normalizes Tavily results into evidence drafts", () => {
    const drafts = normalizeTavilySearchResponse({
      results: [
        {
          title: "Official release notes",
          url: "https://example.com/release",
          content: "The release shipped today with web evidence support.",
          published_date: "2026-05-20",
        },
      ],
    });

    expect(drafts).toEqual([
      {
        title: "Official release notes",
        source: "example.com",
        url: "https://example.com/release",
        publishedAt: "2026-05-20",
        snippet: "The release shipped today with web evidence support.",
      },
    ]);
  });

  test("keeps at most twenty non-empty sanitized candidate results", () => {
    const drafts = normalizeTavilySearchResponse({
      results: [
        {
          title: "leaky",
          url: "https://example.com/secret",
          content: "Authorization: Bearer secret-openai-key",
        },
        { title: "empty", url: "https://example.com/empty", content: " " },
        ...Array.from({ length: 24 }, (_, index) => ({
          title: `result ${index + 1}`,
          url: `https://example.com/${index + 1}`,
          content: `content ${index + 1}`,
        })),
      ],
    });
    const serialized = JSON.stringify(drafts);

    expect(drafts).toHaveLength(20);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("secret-openai-key");
  });

  test("calls Tavily search with bearer auth and returns normalized drafts", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Fresh source",
            url: "https://news.example.com/a",
            content: "A fresh source was found.",
          },
        ],
      }),
    );

    const drafts = await searchTavilyEvidence("fresh topic", {
      apiKey: "tvly-test-key",
      fetchImpl: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tavily.com/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer tvly-test-key",
        }),
      }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(
      expect.objectContaining({
        query: "fresh topic",
        max_results: 20,
        search_depth: "basic",
      }),
    );
    expect(drafts[0]).toEqual(
      expect.objectContaining({
        title: "Fresh source",
        source: "news.example.com",
      }),
    );
  });

  test("throws a sanitized error when Tavily returns a non-200 response", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          detail: "Authorization failed for Bearer secret-openai-key",
        },
        { status: 401 },
      ),
    );

    await expect(
      searchTavilyEvidence("private topic", {
        apiKey: "tvly-test-key",
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({
      reason: "unauthorized",
      status: 502,
      message: "Tavily search failed: unauthorized",
    } satisfies Partial<TavilySearchError>);
  });

  test("classifies missing api key without calling Tavily", async () => {
    const fetchMock = vi.fn();

    await expect(
      searchTavilyEvidence("private topic", {
        apiKey: "",
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({
      reason: "missing_api_key",
      status: 503,
      message: "Tavily search failed: missing_api_key",
    } satisfies Partial<TavilySearchError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("classifies rate limits, network errors, and invalid responses safely", async () => {
    await expect(
      searchTavilyEvidence("rate limited topic", {
        apiKey: "tvly-test-key",
        fetchImpl: async () => Response.json({ error: "too many" }, { status: 429 }),
      }),
    ).rejects.toMatchObject({
      reason: "rate_limited",
      message: "Tavily search failed: rate_limited",
    } satisfies Partial<TavilySearchError>);

    await expect(
      searchTavilyEvidence("network topic", {
        apiKey: "tvly-test-key",
        fetchImpl: async () => {
          throw new Error("network failed with secret-openai-key");
        },
      }),
    ).rejects.toMatchObject({
      reason: "network_error",
      message: "Tavily search failed: network_error",
    } satisfies Partial<TavilySearchError>);

    await expect(
      searchTavilyEvidence("invalid topic", {
        apiKey: "tvly-test-key",
        fetchImpl: async () => Response.json({ answer: "missing results array" }),
      }),
    ).rejects.toMatchObject({
      reason: "invalid_response",
      message: "Tavily search failed: invalid_response",
    } satisfies Partial<TavilySearchError>);
  });
});
