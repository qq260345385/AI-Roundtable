import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";
import { clearTavilySearchCache } from "../../../../lib/search/tavily-search";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("GET /api/evidence/tavily-ping", () => {
  afterEach(() => {
    clearTavilySearchCache();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("runs a single minimal Tavily search with a neutral default query", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Technology news",
            url: "https://example.com/technology-news",
            content: "Technology news result",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(new Request("http://localhost/api/evidence/tavily-ping"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        resultCount: 1,
        hasTavilyApiKey: true,
      }),
    );
    expect(body.durationMs).toEqual(expect.any(Number));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      unknown,
      RequestInit,
    ];

    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        query: "technology news",
        max_results: 1,
      }),
    );
    expect(String(init.body)).not.toMatch(/Huawei|华为|韬定律/i);
  });

  test("allows overriding the Tavily ping query with q", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Neutral query result",
            url: "https://example.com/query",
            content: "Neutral query result",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/evidence/tavily-ping?q=test%20query"),
    );
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      unknown,
      RequestInit,
    ];

    expect(response.status).toBe(200);
    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        query: "test query",
        max_results: 1,
      }),
    );
  });

  test("returns a specific Tavily search timeout diagnostic", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    const response = await GET(new Request("http://localhost/api/evidence/tavily-ping"));
    const body = await response.json();

    expect(response.status).toBe(504);
    expect(body).toEqual(
      expect.objectContaining({
        ok: false,
        failedStage: "tavily_ping",
        errorType: "tavily_search_timeout",
        safeErrorMessage: "搜索服务超时",
        hasTavilyApiKey: true,
        statusCode: 504,
      }),
    );
    expect(JSON.stringify(body)).not.toContain("tvly-test-key");
  });
});
