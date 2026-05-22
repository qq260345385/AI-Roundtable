import { afterEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";
import { clearTavilySearchCache } from "../../../../lib/search/tavily-search";

const originalEnv = { ...process.env };

describe("POST /api/evidence/search", () => {
  afterEach(() => {
    clearTavilySearchCache();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  test("returns 400 when query is empty", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "   " }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("query cannot be empty");
  });

  test("returns 503 when Tavily API key is missing", async () => {
    delete process.env.TAVILY_API_KEY;

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("Tavily search failed: missing_api_key");
    expect(body.failureReason).toBeUndefined();
    expect(body.searchProcess).toBeUndefined();
    expect(body.debugSearchProcess).toBeUndefined();
    expect(body.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "failed",
        evidenceMode: "search_failed",
        totalReferences: 0,
      }),
    );
    expect(body.searchSummary.userMessage).toContain("Missing API key");
  });

  test("returns normalized evidence drafts from Tavily results", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => 
      Response.json({
        results: [
          {
            title: "Source A",
            url: "https://openai.com/a",
            content: `A current source for the meeting. ${"A".repeat(500)}`,
          },
        ],
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drafts).toHaveLength(1);
    expect(body.evidencePack).toEqual(
      expect.objectContaining({
        enabled: true,
        strategy: "text_pack",
      }),
    );
    expect(body.evidencePack.items[0]).toEqual(
      expect.objectContaining({
        id: "S1",
        title: "Source A",
        source: "openai.com",
      }),
    );
  });

  test("keeps cache and dedupe details out of the default API response", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({
        results: [
          {
            title: "Source A",
            url: "https://openai.com/a?utm_source=test#top",
            content: `A current source for the meeting. ${"A".repeat(500)}`,
          },
          {
            title: "Source A duplicate",
            url: "http://openai.com/a/",
            content: `A duplicate source for the meeting. ${"B".repeat(500)}`,
          },
        ],
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const bodyText = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(bodyText).not.toContain("cacheStatus");
    expect(bodyText).not.toContain("dedupeStats");
    expect(bodyText).not.toContain("providerDiagnostics");
    expect(bodyText).not.toContain("removedDuplicateCount");
    expect(bodyText).not.toContain("sourceQueries");
    expect(bodyText).not.toContain("same_domain_limit");
  });

  test("returns cache and dedupe diagnostics in debug mode", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    process.env.SEARCH_DEBUG_ENABLED = "true";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({
        results: [
          {
            title: "Source A",
            url: "https://openai.com/a?utm_source=test#top",
            content: `A current source for the meeting. ${"A".repeat(500)}`,
          },
          {
            title: "Source A duplicate",
            url: "http://openai.com/a/",
            content: `A duplicate source for the meeting. ${"B".repeat(500)}`,
          },
        ],
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.debugSearchProcess).toEqual(
      expect.objectContaining({
        cacheEvents: expect.arrayContaining([
          expect.objectContaining({ cacheStatus: "miss" }),
        ]),
        provider: "tavily",
        providerDiagnostics: expect.arrayContaining([
          expect.objectContaining({ provider: "tavily" }),
        ]),
        dedupeStats: expect.objectContaining({
          originalResultCount: expect.any(Number),
          dedupedResultCount: expect.any(Number),
          removedDuplicateCount: expect.any(Number),
        }),
      }),
    );
    expect(body.debugSearchProcess.dedupeStats.removals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "duplicate_url" }),
      ]),
    );
  });

  test("dedupes same-domain Tavily results before building the evidence pack", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    process.env.SEARCH_DEBUG_ENABLED = "true";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => 
      Response.json({
        results: [
          ...Array.from({ length: 12 }, (_, index) => ({
            title: `Official Source ${index + 1}`,
            url: `https://openai.com/research/${index + 1}`,
            content: `Official source content ${index + 1}. ${"A".repeat(500)}`,
          })),
          {
            title: "Reddit rumor",
            url: "https://reddit.com/r/test",
            content: "A long but low reliability community discussion.",
          },
        ],
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drafts).toHaveLength(4);
    expect(body.evidencePack.items).toHaveLength(4);
    expect(
      body.evidencePack.items.filter(
        (item: { source?: string }) => item.source === "openai.com",
      ),
    ).toHaveLength(3);
    expect(body.evidencePack.searchProcess).toBeUndefined();
    expect(body.debugSearchProcess.dedupeStats).toEqual(
      expect.objectContaining({
        removedSameDomainCount: expect.any(Number),
      }),
    );
    expect(
      body.debugSearchProcess.dedupeStats.removedSameDomainCount,
    ).toBeGreaterThan(0);
  });

  test("returns low evidence status instead of failing when only low quality results exist", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => 
      Response.json({
        results: [
          {
            title: "Reddit rumor",
            url: "https://reddit.com/r/test",
            content: "A long but low reliability community discussion.",
          },
          {
            title: "YouTube reaction",
            url: "https://youtube.com/watch?v=test",
            content: "A long but low reliability video summary.",
          },
        ],
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI rumors" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.evidencePack.evidenceStatus).toBe("low");
    expect(body.evidencePack.evidenceWarnings).toEqual(
      expect.arrayContaining([
        "未找到高质量联网资料，已切换为低证据会议模式。本次会议仍会继续，但涉及实时事实的结论请人工核验。",
      ]),
    );
    expect(body.drafts).toHaveLength(2);
  });

  test("returns none evidence status instead of failing when search results are empty", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => 
      Response.json({
        results: [],
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "unknown topic" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.drafts).toEqual([]);
    expect(body.evidencePack).toEqual(
      expect.objectContaining({
        enabled: false,
        evidenceStatus: "none",
      }),
    );
    expect(body.evidencePack.evidenceWarnings).toEqual(
      expect.arrayContaining([
        "未找到可用联网资料，本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。",
      ]),
    );
  });

  test("expands a Chinese time-sensitive model-ranking topic without provider-specific templates", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => 
      Response.json({
        results: [
          {
            title: "DeepSeek V3 benchmark",
            url: "https://artificialanalysis.ai/models/deepseek-v3",
            content: `DeepSeek benchmark result. ${"A".repeat(500)}`,
          },
        ],
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({
          query: "目前 DeepSeek 在全球 AI 大模型里面是什么实力",
        }),
      }),
    );
    const body = await response.json();
    const queries = fetchMock.mock.calls.map((call) =>
      JSON.parse(String(call[1]?.body)).query,
    );

    expect(response.status).toBe(200);
    expect(queries.length).toBeGreaterThan(1);
    expect(queries).toEqual(
      expect.arrayContaining([
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力 official report",
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力 benchmark",
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力 latest analysis",
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力 comparison",
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力",
      ]),
    );
    expect(queries).not.toContain("DeepSeek V3 benchmark Artificial Analysis");
    expect(queries).not.toContain("DeepSeek R1 LMSYS Chatbot Arena ranking");
    expect(body.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        totalReferences: body.evidencePack.items.length,
      }),
    );
    expect(body.evidencePack.searchQueries).toBeUndefined();
  });

  test("does not leak Tavily error bodies or bearer tokens", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => 
      Response.json(
        {
          detail: "Authorization failed for Bearer secret-openai-key",
        },
        { status: 401 },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const bodyText = JSON.stringify(await response.json());

    expect(response.status).toBe(502);
    expect(bodyText).toContain("unauthorized");
    expect(bodyText).not.toContain("Authorization");
    expect(bodyText).not.toContain("Bearer");
    expect(bodyText).not.toContain("secret-openai-key");
  });

  test("returns safe diagnostic reason for rate limited Tavily responses", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json(
        {
          detail: "rate limit for Bearer secret-openai-key",
        },
        { status: 429 },
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const body = await response.json();
    const bodyText = JSON.stringify(body);

    expect(response.status).toBe(502);
    expect(body.failureReason).toBeUndefined();
    expect(body.searchProcess).toBeUndefined();
    expect(body.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "failed",
        evidenceMode: "search_failed",
      }),
    );
    expect(body.searchSummary.userMessage).toContain("Rate limited");
    expect(bodyText).not.toContain("Bearer");
    expect(bodyText).not.toContain("secret-openai-key");
  });

  test("returns search process details in debug mode when Tavily search fails", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    process.env.SEARCH_DEBUG_ENABLED = "true";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("network secret-openai-key failure");
    });

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.searchProcess).toBeUndefined();
    expect(body.debugSearchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "search_failed",
        failureReason: "network_error",
        executedQueries: expect.arrayContaining(["AI news official report"]),
        qualityOverview: expect.objectContaining({
          includedCount: 0,
          filteredCount: 0,
        }),
      }),
    );
    expect(JSON.stringify(body)).not.toContain("secret-openai-key");
  });
});

