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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
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

  test("returns 422 instead of sending low quality search results to models", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
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

    expect(response.status).toBe(422);
    expect(body.error).toBe(
      "no high or medium quality web search results were found",
    );
  });

  test("does not leak Tavily error bodies or bearer tokens", async () => {
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
