import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

  test("does not mark Tavily as called when the API key is missing", async () => {
    delete process.env.TAVILY_API_KEY;
    process.env.SEARCH_DEBUG_ENABLED = "true";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "AI news" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.debugSearchProcess.debugSummary.searchHealth).toEqual(
      expect.objectContaining({
        hasTavilyApiKey: false,
        tavilyCalled: false,
        diagnosis: "missing_api_key",
      }),
    );
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

  test("keeps extract rescue details out of the default API response", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));

      if (Array.isArray(body.urls)) {
        return Response.json({
          results: [
            {
              title: "Extracted source",
              url: body.urls[0],
              raw_content: `Extracted source content. ${"A".repeat(900)}`,
            },
          ],
        });
      }

      return Response.json({
        results: [
          {
            title: "Sparse source",
            url: "https://openai.com/sparse-source",
            content: "Sparse source",
          },
        ],
      });
    });

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "sparse AI evidence" }),
      }),
    );
    const body = await response.json();
    const bodyText = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        totalReferences: 1,
      }),
    );
    expect(body.debugSearchProcess).toBeUndefined();
    expect(bodyText).not.toContain("rescueTriggered");
    expect(bodyText).not.toContain("extractAttempted");
    expect(bodyText).not.toContain("rawCandidateCount");
    expect(bodyText).not.toContain("Candidate Pool");
  });

  test("returns extract rescue statistics in debug mode", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    process.env.SEARCH_DEBUG_ENABLED = "true";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));

      if (Array.isArray(body.urls)) {
        return Response.json({
          results: [
            {
              title: "Extracted source",
              url: body.urls[0],
              raw_content: `Extracted source content. ${"A".repeat(900)}`,
            },
          ],
        });
      }

      return Response.json({
        results: [
          {
            title: "Sparse source",
            url: "https://openai.com/sparse-source",
            content: "Sparse source",
          },
        ],
      });
    });

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({ query: "sparse AI evidence" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.debugSearchProcess).toEqual(
      expect.objectContaining({
        searchMode: "deep",
        rescueTriggered: true,
        rescueReason: "official_snippet_only",
        rawCandidateCount: expect.any(Number),
        dedupedCandidateCount: expect.any(Number),
        extractAttempted: expect.any(Number),
        extractedCandidateCount: 1,
        extractSucceededCount: 1,
        finalEvidenceCount: body.evidencePack.items.length,
        qualityDistribution: expect.objectContaining({
          high: expect.any(Number),
          medium: expect.any(Number),
          low: expect.any(Number),
          very_low: expect.any(Number),
        }),
      }),
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
      body.debugSearchProcess.dedupeStats.removedDuplicateCount,
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

  test("uses the shared multi-pass planner instead of legacy fixed suffix queries", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    process.env.SEARCH_DEBUG_ENABLED = "true";
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
    const queries = fetchMock.mock.calls
      .map((call) => {
        const rawBody = call[1]?.body;

        if (!rawBody) {
          return "";
        }

        return JSON.parse(String(rawBody)).query;
      })
      .filter((query): query is string => typeof query === "string");

    expect(response.status).toBe(200);
    expect(queries.length).toBeGreaterThan(1);
    expect(queries).not.toEqual(
      expect.arrayContaining([
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力 official report",
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力 benchmark",
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力 latest analysis",
        "目前 DeepSeek 在全球 AI 大模型里面是什么实力 comparison",
      ]),
    );
    expect(queries.some((query) => /Reuters|Bloomberg|NYTimes|WSJ|FT/.test(query)))
      .toBe(false);
    expect(
      body.debugSearchProcess.passStats.some(
        (stat: { passName?: string; searchParameters?: { includeDomains?: string[] } }) =>
          stat.passName === "reputable_media" &&
          Array.isArray(stat.searchParameters?.includeDomains),
      ),
    ).toBe(true);
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

  test("returns a compact search health report in debug mode", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    process.env.SEARCH_DEBUG_ENABLED = "true";
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => 
      Response.json({
        results: [
          {
            title: "Only sparse candidate",
            url: "https://example.com/sparse",
            content: "Short background note",
          },
        ],
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/search", {
        method: "POST",
        body: JSON.stringify({
          query: "Compare Kimi, GLM, GPT-4o, and Claude in Chinese office automation and coding assistance scenarios.",
          searchMode: "deep",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.debugSearchProcess.debugSummary.searchHealth).toEqual(
      expect.objectContaining({
        hasTavilyApiKey: true,
        tavilyCalled: true,
        queryQualityIssueCount: expect.any(Number),
        candidateShortfall: expect.any(Number),
        directSupportingShortfall: expect.any(Boolean),
        diagnosis: expect.any(String),
      }),
    );
    expect(body.debugSearchProcess.rawCandidateTarget).toBe(60);
    expect(body.debugSearchProcess.candidateShortfall).toBeGreaterThan(0);
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
        executedQueries: expect.any(Array),
        qualityOverview: expect.objectContaining({
          includedCount: 0,
          filteredCount: 0,
        }),
      }),
    );
    expect(body.debugSearchProcess.debugSummary.searchHealth).toEqual(
      expect.objectContaining({
        hasTavilyApiKey: true,
        tavilyCalled: true,
        diagnosis: "provider_failed",
      }),
    );
    expect(JSON.stringify(body)).not.toContain("secret-openai-key");
  });

  test("does not keep legacy warning helpers in the route module", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/evidence/search/route.ts"),
      "utf8",
    );

    expect(source).not.toContain("eslint-disable-next-line");
    expect(source).not.toContain("function getEvidenceWarnings");
    expect(source).not.toContain("鏈壘");
  });
});

