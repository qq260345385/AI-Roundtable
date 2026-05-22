import { afterEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";
import { clearTavilySearchCache } from "../../../lib/search/tavily-search";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("POST /api/meeting", () => {
  afterEach(() => {
    clearTavilySearchCache();
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("returns an error when question is empty", async () => {
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        question: "   ",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("question cannot be empty");
  });

  test("returns an error when request body is invalid json", async () => {
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: "{",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid json body");
  });

  test("returns an error when request body is not an object", async () => {
    for (const bodyValue of ['"hello"', "[]", "null"]) {
      const request = new Request("http://localhost/api/meeting", {
        method: "POST",
        body: bodyValue,
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("request body must be an object");
      expect(JSON.stringify(body)).not.toContain("stack");
    }
  });

  test("returns an error when question is missing or not a string", async () => {
    for (const bodyValue of [{}, { question: 123 }]) {
      const request = new Request("http://localhost/api/meeting", {
        method: "POST",
        body: JSON.stringify(bodyValue),
      });

      const response = await POST(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toBe("question cannot be empty");
      expect(JSON.stringify(body)).not.toContain("stack");
    }
  });

  test("returns an error when participantIds is not a string array", async () => {
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: "gpt-mock",
        question: "如何选择参会模型？",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("participantIds must be an array of strings");
  });

  test("runs a meeting with selected participants only", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock", "claude-mock"],
        question: "如何选择参会模型？",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meeting.phases[0].turns).toHaveLength(2);
    expect(body.meeting.phases[1].turns).toHaveLength(2);
    expect(
      body.meeting.phases[0].turns.map(
        (turn: { speakerName: string }) => turn.speakerName,
      ),
    ).toEqual(["GPT Mock", "Claude Mock"]);
  });

  test("accepts brief meeting mode in the request body", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        isBriefMode: true,
        participantIds: ["gpt-mock"],
        question: "如何让会议更简洁？",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meeting.isBriefMode).toBe(true);
    expect(body.meeting.phases[0].turns[0].content.length).toBeLessThan(180);
  });

  test("normalizes evidence pack before running a meeting", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "如何引用资料包？",
        evidencePack: {
          enabled: true,
          items: [
            {
              id: "unsafe-id",
              title: "资料标题",
              snippet: "资料摘要",
            },
          ],
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meeting.evidencePack).toEqual(
      expect.objectContaining({
        enabled: true,
        strategy: "text_pack",
        delivery: expect.objectContaining({
          effectiveMode: "text_pack",
        }),
        items: [
          expect.objectContaining({
            id: "S1",
            title: "资料标题",
            snippet: "资料摘要",
          }),
        ],
      }),
    );
    expect(JSON.stringify(body)).not.toContain("unsafe-id");
  });

  test("returns citation check results in the meeting response", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "如何引用资料包？",
        evidencePack: {
          enabled: true,
          items: [
            {
              title: "资料标题",
              snippet: "资料摘要",
            },
          ],
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meeting.citationCheck).toEqual(
      expect.objectContaining({
        validCitationIds: ["S1"],
        hasInvalidCitations: false,
      }),
    );
  });

  test("returns evidence delivery fallback when native attachments are requested but unavailable", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "如何阅读这份资料？",
        evidencePack: {
          enabled: true,
          strategy: "native_file",
          items: [
            {
              title: "report.pdf",
              snippet: "资料摘要",
            },
          ],
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meeting.evidencePack.delivery).toEqual(
      expect.objectContaining({
        requestedStrategy: "native_file",
        effectiveMode: "text_pack",
        unsupportedProviderNames: ["OpenAI"],
      }),
    );
  });

  test("builds model-driven web evidence when web search is enabled", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.stubGlobal("fetch", async () =>
      Response.json({
        results: [
          {
            title: "Official source",
            url: "https://openai.com/research/test",
            content: `Official search result. ${"A".repeat(500)}`,
          },
        ],
      }),
    );

    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "目前 DeepSeek 在全球 AI 大模型里面是什么实力",
        webSearchEnabled: true,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meeting.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "completed",
        evidenceMode: "normal",
        totalReferences: 1,
      }),
    );
    expect(
      body.meeting.searchSummary.strongCount +
        body.meeting.searchSummary.mediumCount +
        body.meeting.searchSummary.weakCount,
    ).toBe(1);
    expect(body.meeting.evidencePack).toEqual(
      expect.objectContaining({
        enabled: true,
      }),
    );
    expect(body.meeting.evidencePack.searchProcess).toBeUndefined();
    expect(body.meeting.evidencePack.searchQueries).toBeUndefined();
    expect(body.meeting.debugSearchProcess).toBeUndefined();
    expect(body.meeting.evidencePack.items[0]).toEqual(
      expect.objectContaining({
        id: "S1",
        source: "openai.com",
      }),
    );
    expect(JSON.stringify(body.meeting)).not.toContain("queryPlans");
    expect(JSON.stringify(body.meeting)).not.toContain("searchIntents");
    expect(JSON.stringify(body.meeting)).not.toContain("executedQueries");
    expect(JSON.stringify(body.meeting)).not.toContain("cacheEvents");
    expect(JSON.stringify(body.meeting)).not.toContain("dedupeStats");
    expect(JSON.stringify(body.meeting)).not.toContain("sourceQueries");
    expect(JSON.stringify(body.meeting)).not.toContain('"score"');
    expect(JSON.stringify(body.meeting)).not.toContain("citationLevel");
    expect(JSON.stringify(body.meeting)).not.toContain("citationGuidance");
    expect(JSON.stringify(body.meeting)).not.toContain("weakCitationIds");
    expect(JSON.stringify(body.meeting)).not.toContain("citationWarnings");
    expect(JSON.stringify(body.meeting)).not.toContain("filteredReason");
    expect(JSON.stringify(body.meeting)).not.toContain("relevanceScore");
    expect(JSON.stringify(body.meeting)).not.toContain("authorityScore");
  });

  test("returns debugSearchProcess only in non-production server debug mode", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    process.env.SEARCH_DEBUG_ENABLED = "true";
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.stubGlobal("fetch", async () =>
      Response.json({
        results: [
          {
            title: "Official source",
            url: "https://openai.com/research/test",
            content: `Official search result. ${"A".repeat(500)}`,
          },
        ],
      }),
    );

    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "目前 DeepSeek 在全球 AI 大模型里面是什么实力",
        webSearchEnabled: true,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meeting.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "completed",
      }),
    );
    expect(body.meeting.evidencePack.searchProcess).toBeUndefined();
    expect(body.meeting.debugSearchProcess).toEqual(
      expect.objectContaining({
        evidenceMode: "normal",
        executedQueries: expect.arrayContaining([
          expect.stringContaining("official release or report"),
        ]),
        searchIntents: [
          expect.objectContaining({
            participantId: "gpt-mock",
            participantName: "GPT Mock",
            intents: [
              expect.objectContaining({
                sourcePreference: "official",
              }),
              expect.any(Object),
              expect.any(Object),
            ],
          }),
        ],
        queryPlans: [
          expect.objectContaining({
            query: expect.stringContaining("official release or report"),
            sourcePreference: "official",
          }),
          expect.any(Object),
          expect.any(Object),
        ],
        cacheEvents: expect.arrayContaining([
          expect.objectContaining({
            provider: "tavily",
            cacheStatus: "miss",
          }),
        ]),
        dedupeStats: expect.objectContaining({
          originalResultCount: expect.any(Number),
          dedupedResultCount: expect.any(Number),
          removedDuplicateCount: expect.any(Number),
          removedSameDomainCount: expect.any(Number),
        }),
      }),
    );
    expect(body.meeting.debugSearchProcess.results[0]).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        citationLevel: "qualified_fact",
      }),
    );
  });

  test("does not return debugSearchProcess in production even when search debug is enabled", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    process.env.NODE_ENV = "production";
    process.env.SEARCH_DEBUG_ENABLED = "true";
    process.env.TAVILY_API_KEY = "tvly-test-key";
    vi.stubGlobal("fetch", async () =>
      Response.json({
        results: [
          {
            title: "Official source",
            url: "https://openai.com/research/test",
            content: `Official search result. ${"A".repeat(500)}`,
          },
        ],
      }),
    );

    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "目前 DeepSeek 在全球 AI 大模型里面是什么实力",
        webSearchEnabled: true,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.meeting.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "completed",
      }),
    );
    expect(body.meeting.debugSearchProcess).toBeUndefined();
    expect(body.meeting.evidencePack.searchProcess).toBeUndefined();
    expect(JSON.stringify(body.meeting)).not.toContain("queryPlans");
    expect(JSON.stringify(body.meeting)).not.toContain("searchIntents");
  });

  test("returns an error when selected participant is not available", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["missing-model"],
        question: "如何选择参会模型？",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("selected participant is not available");
  });

  test("returns a clear error when real mode has no available provider", async () => {
    process.env.AI_ROUNDTABLE_MODE = "real";
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;

    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        question: "如何验证真实模型配置？",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("real mode has no available provider");
  });

  test("returns partial failures with a 200 response", async () => {
    process.env.AI_ROUNDTABLE_MODE = "real";
    process.env.AI_ROUNDTABLE_PROVIDER_IDS = "broken,working";
    process.env.AI_ROUNDTABLE_PROVIDER_BROKEN_NAME = "BrokenProvider";
    process.env.AI_ROUNDTABLE_PROVIDER_BROKEN_BASE_URL =
      "https://broken.example/v1";
    process.env.AI_ROUNDTABLE_PROVIDER_BROKEN_API_KEY = "secret-openai-key";
    process.env.AI_ROUNDTABLE_PROVIDER_BROKEN_MODEL = "broken-model";
    process.env.AI_ROUNDTABLE_PROVIDER_WORKING_NAME = "WorkingProvider";
    process.env.AI_ROUNDTABLE_PROVIDER_WORKING_BASE_URL =
      "https://working.example/v1";
    process.env.AI_ROUNDTABLE_PROVIDER_WORKING_API_KEY = "working-key";
    process.env.AI_ROUNDTABLE_PROVIDER_WORKING_MODEL = "working-model";
    vi.stubGlobal("fetch", async (url) => {
      if (String(url).endsWith("/models")) {
        const model = String(url).includes("broken.example")
          ? "broken-model"
          : "working-model";

        return new Response(JSON.stringify({ data: [{ id: model }] }));
      }

      if (String(url).includes("broken.example")) {
        return new Response("Authorization Bearer secret-openai-key failed", {
          status: 500,
        });
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"consensus":["工作模型完成总结"],"differences":[],"minorityViews":[],"risks":[],"nextSteps":[]}',
              },
            },
          ],
        }),
      );
    });

    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        question: "如何处理 provider 失败？",
      }),
    });

    const response = await POST(request);
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.meeting.hasPartialFailures).toBe(true);
    expect(body.meeting.failures.length).toBeGreaterThan(0);
    expect(text).not.toContain("secret-openai-key");
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("Bearer");
  });

  test("returns a sanitized error when every provider fails to respond", async () => {
    process.env.AI_ROUNDTABLE_MODE = "real";
    process.env.AI_ROUNDTABLE_PROVIDER_IDS = "broken";
    process.env.AI_ROUNDTABLE_PROVIDER_BROKEN_NAME = "BrokenProvider";
    process.env.AI_ROUNDTABLE_PROVIDER_BROKEN_BASE_URL =
      "https://broken.example/v1";
    process.env.AI_ROUNDTABLE_PROVIDER_BROKEN_API_KEY = "secret-openai-key";
    process.env.AI_ROUNDTABLE_PROVIDER_BROKEN_MODEL = "broken-model";
    vi.stubGlobal("fetch", async (url) => {
      if (String(url).endsWith("/models")) {
        return new Response(JSON.stringify({ data: [{ id: "broken-model" }] }));
      }

      return new Response("Authorization Bearer secret-openai-key failed", {
        status: 500,
      });
    });

    const request = new Request("http://localhost/api/meeting", {
      method: "POST",
      body: JSON.stringify({
        question: "如何处理 provider 失败？",
      }),
    });

    const response = await POST(request);
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(502);
    expect(body.error).toBe("All providers failed to generate meeting responses.");
    expect(text).not.toContain("secret-openai-key");
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("Bearer");
  });
});
