import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";
import { clearTavilySearchCache } from "../../../../../lib/search/tavily-search";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("GET /api/evidence/search/debug", () => {
  afterEach(() => {
    clearTavilySearchCache();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("defaults to quick mode and only runs one Tavily search", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    const fetchMock = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Technology news result",
            url: "https://example.com/technology-news",
            content: "Technology news snippet",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request("http://localhost/api/evidence/search/debug"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        mode: "quick",
        resultCount: 1,
        hasTavilyApiKey: true,
      }),
    );
    expect(body.debugSummary).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("runs full evidence search only when mode=full", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.stubGlobal("fetch", async () =>
      Response.json({
        results: [
          {
            title: "技术新闻 官方资料",
            url: "https://example.com/technology-news",
            content:
              "技术新闻 官方 信息 本地媒体 报道 技术 产品 市场 监管。".repeat(
                80,
              ),
          },
        ],
      }),
    );

    const response = await GET(
      new Request("http://localhost/api/evidence/search/debug?mode=full"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("full");
    expect(body.candidateCount).toEqual(expect.any(Number));
    expect(body.coreEvidenceCount).toEqual(expect.any(Number));
    expect(body.debugSummary).toEqual(expect.any(Object));
    expect(body.meeting).toBeUndefined();
  });

  test("returns safe failure details when evidence search fails", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.stubGlobal("fetch", async () => Response.json({ unexpected: true }));

    const response = await GET(
      new Request("http://localhost/api/evidence/search/debug?mode=full"),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual(
      expect.objectContaining({
        ok: false,
        failedStage: "search_pass",
        errorType: "parse_error",
        safeErrorMessage: expect.stringContaining("搜索结果解析失败"),
      }),
    );
    expect(JSON.stringify(body)).not.toContain("tvly-test-key");
  });
});
