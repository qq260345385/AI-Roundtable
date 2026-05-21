import { afterEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const originalApiKey = process.env.TAVILY_API_KEY;

describe("POST /api/evidence/search", () => {
  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.TAVILY_API_KEY;
    } else {
      process.env.TAVILY_API_KEY = originalApiKey;
    }
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
    expect(body.error).toBe("Tavily search is not configured");
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

  test("returns only the best ten high or medium quality drafts when search returns many mixed candidates", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
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
    expect(body.drafts).toHaveLength(10);
    expect(body.evidencePack.items).toHaveLength(10);
    expect(
      body.evidencePack.items.every(
        (item: { quality?: { reliability?: string } }) =>
          item.quality?.reliability === "high" ||
          item.quality?.reliability === "medium",
      ),
    ).toBe(true);
    expect(JSON.stringify(body)).not.toContain("Reddit rumor");
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
    expect(body.evidencePack.searchQueries).toEqual(queries);
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
    expect(bodyText).toContain("Tavily search failed with HTTP 401");
    expect(bodyText).not.toContain("Authorization");
    expect(bodyText).not.toContain("Bearer");
    expect(bodyText).not.toContain("secret-openai-key");
  });
});

