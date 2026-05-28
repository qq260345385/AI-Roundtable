import { afterEach, describe, expect, test, vi } from "vitest";
import {
  TavilySearchError,
  clearTavilySearchCache,
  dedupeSearchResults,
  normalizeUrl,
  normalizeTavilySearchResponse,
  searchTavilyEvidence,
} from "./tavily-search";

describe("Tavily evidence search", () => {
  afterEach(() => {
    clearTavilySearchCache();
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  test("normalizes URLs for canonical dedupe", () => {
    expect(
      normalizeUrl(
        "HTTP://Example.COM/path/?utm_source=news&fbclid=abc&keep=1#section",
      ),
    ).toBe("https://example.com/path?keep=1");
    expect(normalizeUrl("https://example.com/path/")).toBe(
      "https://example.com/path",
    );
  });

  test("dedupes tracking and hash variants while merging source queries", () => {
    const result = dedupeSearchResults([
      {
        title: "Short duplicate",
        url: "https://example.com/report?utm_source=x#top",
        snippet: "short",
        query: "query one",
      },
      {
        title: "Long canonical",
        url: "http://EXAMPLE.com/report/",
        snippet: "longer canonical content",
        query: "query two",
      },
    ]);

    expect(result.items).toEqual([
      expect.objectContaining({
        title: "Long canonical",
        url: "https://example.com/report",
        query: "query two",
        sourceQueries: ["query one", "query two"],
      }),
    ]);
    expect(result.stats).toEqual(
      expect.objectContaining({
        originalResultCount: 2,
        dedupedResultCount: 1,
        removedDuplicateCount: 1,
      }),
    );
    expect(result.stats.removals).toEqual([
      expect.objectContaining({
        reason: "duplicate_url",
      }),
    ]);
  });

  test("limits repeated domains while allowing more authoritative sources", () => {
    const result = dedupeSearchResults([
      {
        title: "Blog A",
        url: "https://example.com/a",
        snippet: "A".repeat(500),
      },
      {
        title: "Blog B",
        url: "https://example.com/b",
        snippet: "B".repeat(600),
      },
      {
        title: "Blog C",
        url: "https://example.com/c",
        snippet: "C".repeat(700),
      },
      {
        title: "Official A",
        url: "https://openai.com/a",
        snippet: "A".repeat(500),
      },
      {
        title: "Official B",
        url: "https://openai.com/b",
        snippet: "B".repeat(600),
      },
      {
        title: "Official C",
        url: "https://openai.com/c",
        snippet: "C".repeat(700),
      },
    ]);

    expect(result.items.map((item) => item.title)).toEqual([
      "Official C",
      "Official B",
      "Official A",
      "Blog C",
      "Blog B",
    ]);
    expect(result.stats.removedSameDomainCount).toBe(1);
    expect(result.stats.removals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Blog A",
          reason: "same_domain_limit",
          domain: "example.com",
        }),
      ]),
    );
  });

  test("keeps at most five non-empty sanitized candidate results", () => {
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

    expect(drafts).toHaveLength(5);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("secret-openai-key");
  });

  test("calls Tavily search with bearer auth and returns normalized drafts", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      void _url;
      void _init;

      return Response.json({
        results: [
          {
            title: "Fresh source",
            url: "https://news.example.com/a",
            content: "A fresh source was found.",
          },
        ],
      });
    });

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
        max_results: 5,
        search_depth: "advanced",
      }),
    );
    expect(drafts[0]).toEqual(
      expect.objectContaining({
        title: "Fresh source",
        source: "news.example.com",
      }),
    );
  });

  test("sends structured Tavily parameters and preserves provider metadata", async () => {
    const metadataEvents: unknown[] = [];
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Structured source",
            url: "https://example.com/structured",
            content: "Short summary",
            raw_content: "Long raw extracted content from Tavily search.",
            published_date: "2026-05-20",
            score: 0.91,
          },
        ],
        response_time: 1.23,
        request_id: "req-test-123",
        usage: { credits: 2 },
        auto_parameters: {
          topic: "news",
          search_depth: "advanced",
        },
      }),
    );

    const drafts = await searchTavilyEvidence("structured topic", {
      apiKey: "tvly-test-key",
      chunksPerSource: 5,
      country: "china",
      excludeDomains: ["reddit.com", "youtube.com"],
      fetchImpl: fetchMock,
      includeDomains: ["example.com"],
      includeRawContent: "text",
      includeUsage: true,
      maxResults: 5,
      onResponseMetadata: (metadata) => metadataEvents.push(metadata),
      searchDepth: "advanced",
      timeRange: "month",
      topic: "general",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      unknown,
      RequestInit,
    ];
    const requestBody = JSON.parse(String(init.body));

    expect(requestBody).toEqual(
      expect.objectContaining({
        chunks_per_source: 5,
        country: "china",
        exclude_domains: ["reddit.com", "youtube.com"],
        include_domains: ["example.com"],
        include_raw_content: "text",
        include_usage: true,
        max_results: 5,
        query: "structured topic",
        search_depth: "advanced",
        time_range: "month",
      }),
    );
    expect(requestBody).not.toHaveProperty("topic");
    expect(drafts[0]).toEqual(
      expect.objectContaining({
        providerScore: 0.91,
        snippet: "Long raw extracted content from Tavily search.",
      }),
    );
    expect(metadataEvents).toEqual([
      expect.objectContaining({
        responseTime: 1.23,
        requestId: "req-test-123",
        usage: { credits: 2 },
        autoParameters: {
          topic: "news",
          search_depth: "advanced",
        },
      }),
    ]);
  });

  test("defaults general Tavily searches to China region and text raw content", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Regional source",
            url: "https://example.com/china-region",
            content: "Regional source content.",
          },
        ],
      }),
    );

    await searchTavilyEvidence("regional technology topic", {
      apiKey: "tvly-test-key",
      fetchImpl: fetchMock,
      maxResults: 3,
      topic: "general",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      unknown,
      RequestInit,
    ];

    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        include_raw_content: "text",
      }),
    );
    expect(JSON.parse(String(init.body))).not.toHaveProperty("country");
    expect(JSON.parse(String(init.body))).not.toHaveProperty("topic");
  });

  test("omits Tavily topic so country can still be applied", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "News source",
            url: "https://example.com/news",
            content: "News source content.",
          },
        ],
      }),
    );

    await searchTavilyEvidence("regional news topic", {
      apiKey: "tvly-test-key",
      country: "china",
      fetchImpl: fetchMock,
      maxResults: 3,
      topic: "news",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      unknown,
      RequestInit,
    ];

    const requestBody = JSON.parse(String(init.body));

    expect(requestBody).not.toHaveProperty("country");
    expect(requestBody).not.toHaveProperty("topic");
  });

  test("uses Tavily cache for identical query options", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Cached source",
            url: "https://example.com/cache",
            content: "Cached source content.",
          },
        ],
      }),
    );
    const cacheEvents: unknown[] = [];

    await searchTavilyEvidence("cached topic", {
      apiKey: "tvly-test-key",
      fetchImpl: fetchMock,
      maxResults: 3,
      onCacheEvent: (event) => cacheEvents.push(event),
      searchDepth: "basic",
    });
    await searchTavilyEvidence("cached topic", {
      apiKey: "tvly-test-key",
      fetchImpl: fetchMock,
      maxResults: 3,
      onCacheEvent: (event) => cacheEvents.push(event),
      searchDepth: "basic",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cacheEvents).toEqual([
      expect.objectContaining({ cacheStatus: "miss" }),
      expect.objectContaining({ cacheStatus: "hit" }),
    ]);
  });

  test("refreshes Tavily cache after TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-22T00:00:00Z"));
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Fresh source",
            url: "https://example.com/fresh",
            content: "Fresh source content.",
          },
        ],
      }),
    );

    await searchTavilyEvidence("latest model release", {
      apiKey: "tvly-test-key",
      fetchImpl: fetchMock,
      freshness: "latest",
    });
    vi.setSystemTime(new Date("2026-05-22T00:31:00Z"));
    await searchTavilyEvidence("latest model release", {
      apiKey: "tvly-test-key",
      fetchImpl: fetchMock,
      freshness: "latest",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("does not cache failed Tavily responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "limited" }, { status: 429 }))
      .mockResolvedValueOnce(
        Response.json({
          results: [
            {
              title: "Recovered source",
              url: "https://example.com/recovered",
              content: "Recovered source content.",
            },
          ],
        }),
      );

    await expect(
      searchTavilyEvidence("unstable topic", {
        apiKey: "tvly-test-key",
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({ reason: "rate_limited" });
    await expect(
      searchTavilyEvidence("unstable topic", {
        apiKey: "tvly-test-key",
        fetchImpl: fetchMock,
      }),
    ).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  test("does not send chunks_per_source when search depth is not advanced", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Basic source",
            url: "https://example.com/basic",
            content: "Basic search content.",
          },
        ],
      }),
    );

    await searchTavilyEvidence("basic topic", {
      apiKey: "tvly-test-key",
      chunksPerSource: 5,
      fetchImpl: fetchMock,
      searchDepth: "basic",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const requestBody = JSON.parse(String(init.body));

    expect(requestBody).not.toHaveProperty("chunks_per_source");
  });

  test("sends chunks_per_source when search depth is advanced", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Advanced source",
            url: "https://example.com/advanced",
            content: "Advanced search content.",
          },
        ],
      }),
    );

    await searchTavilyEvidence("advanced topic", {
      apiKey: "tvly-test-key",
      chunksPerSource: 3,
      fetchImpl: fetchMock,
      searchDepth: "advanced",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const requestBody = JSON.parse(String(init.body));

    expect(requestBody).toHaveProperty("chunks_per_source", 3);
  });

  test("does not send country when topic is news", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "News source",
            url: "https://example.com/news",
            content: "News content.",
          },
        ],
      }),
    );

    await searchTavilyEvidence("news topic", {
      apiKey: "tvly-test-key",
      country: "china",
      fetchImpl: fetchMock,
      topic: "news",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const requestBody = JSON.parse(String(init.body));

    expect(requestBody).not.toHaveProperty("country");
  });

  test("sends country when topic is general", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "General source",
            url: "https://example.com/general",
            content: "General content.",
          },
        ],
      }),
    );

    await searchTavilyEvidence("general topic", {
      apiKey: "tvly-test-key",
      country: "china",
      fetchImpl: fetchMock,
      topic: "general",
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const requestBody = JSON.parse(String(init.body));

    expect(requestBody).toHaveProperty("country", "china");
  });

  test("truncates include_domains to 300 and exclude_domains to 150", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ results: [] }),
    );
    const manyIncludeDomains = Array.from({ length: 400 }, (_, i) => `include-${i}.com`);
    const manyExcludeDomains = Array.from({ length: 200 }, (_, i) => `exclude-${i}.com`);

    await searchTavilyEvidence("domain limit topic", {
      apiKey: "tvly-test-key",
      excludeDomains: manyExcludeDomains,
      fetchImpl: fetchMock,
      includeDomains: manyIncludeDomains,
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
    const requestBody = JSON.parse(String(init.body));

    expect(requestBody.include_domains).toHaveLength(300);
    expect(requestBody.exclude_domains).toHaveLength(150);
  });

  test("classifies Tavily detail.error as invalid_request instead of invalid_response", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        detail: {
          error: "When time_range is set, start_date or end_date cannot be set",
        },
      }),
    );

    await expect(
      searchTavilyEvidence("conflicting params topic", {
        apiKey: "tvly-test-key",
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({
      reason: "invalid_request",
      message: "Tavily search failed: invalid_request",
    } satisfies Partial<TavilySearchError>);
  });

  test("classifies Tavily detail string error as invalid_request", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        detail: "Rate limit exceeded for this endpoint",
      }),
    );

    await expect(
      searchTavilyEvidence("rate limit detail", {
        apiKey: "tvly-test-key",
        fetchImpl: fetchMock,
      }),
    ).rejects.toMatchObject({
      reason: "invalid_request",
    } satisfies Partial<TavilySearchError>);
  });

  test("sanitizes API key from Tavily detail.error message", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        detail: {
          error: "Authorization failed for Bearer secret-tavily-key-abc123",
        },
      }),
    );

    let error: unknown;

    try {
      await searchTavilyEvidence("auth error topic", {
        apiKey: "tvly-test-key",
        fetchImpl: fetchMock,
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(TavilySearchError);
    const tavilyError = error as TavilySearchError;
    expect(tavilyError.reason).toBe("invalid_request");
    expect(tavilyError.message).not.toContain("secret-tavily-key-abc123");
    expect(tavilyError.diagnostics?.safeMessage).not.toContain("secret-tavily-key-abc123");
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
