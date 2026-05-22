import { afterEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("POST /api/meeting/live", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("streams live meeting events as newline-delimited JSON", async () => {
    process.env.AI_ROUNDTABLE_MODE = "mock";
    const request = new Request("http://localhost/api/meeting/live", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "如何改善实时会议体验？",
      }),
    });

    const response = await POST(request);
    const events = await readNdjsonEvents(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect(events.map((event) => event.type)).toContain("meeting_started");
    expect(events.map((event) => event.type)).toContain("turn");
    expect(events.map((event) => event.type)).toContain("summary");
    expect(events.at(-1)?.type).toBe("meeting_completed");
  });

  test("returns normal json 400 for invalid request bodies", async () => {
    const request = new Request("http://localhost/api/meeting/live", {
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

  test("streams model-driven web evidence when web search is enabled", async () => {
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
    const request = new Request("http://localhost/api/meeting/live", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "目前 DeepSeek 在全球 AI 大模型里面是什么实力",
        webSearchEnabled: true,
      }),
    });

    const response = await POST(request);
    const events = await readNdjsonEvents(response);
    const started = events.find((event) => event.type === "meeting_started");
    const completed = events.find((event) => event.type === "meeting_completed");

    expect(response.status).toBe(200);
    expect(started.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "completed",
        totalReferences: 1,
      }),
    );
    expect(started.evidencePack.searchProcess).toBeUndefined();
    expect(started.evidencePack.searchQueries).toBeUndefined();
    expect(started.debugSearchProcess).toBeUndefined();
    expect(completed.meeting.evidencePack.items[0]).toEqual(
      expect.objectContaining({
        id: "S1",
        source: "openai.com",
      }),
    );
    expect(completed.meeting.searchSummary).toEqual(
      expect.objectContaining({
        enabled: true,
        status: "completed",
        totalReferences: 1,
      }),
    );
    expect(completed.meeting.evidencePack.searchProcess).toBeUndefined();
    expect(completed.meeting.evidencePack.searchQueries).toBeUndefined();
    expect(completed.meeting.debugSearchProcess).toBeUndefined();
    expect(JSON.stringify(events)).not.toContain("queryPlans");
  });

  test("streams debugSearchProcess only in non-production server debug mode", async () => {
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
    const request = new Request("http://localhost/api/meeting/live", {
      method: "POST",
      body: JSON.stringify({
        participantIds: ["gpt-mock"],
        question: "current DeepSeek AI model benchmark",
        webSearchEnabled: true,
      }),
    });

    const response = await POST(request);
    const events = await readNdjsonEvents(response);
    const started = events.find((event) => event.type === "meeting_started");
    const completed = events.find((event) => event.type === "meeting_completed");

    expect(response.status).toBe(200);
    expect(started.debugSearchProcess).toEqual(
      expect.objectContaining({
        executedQueries: expect.arrayContaining([
          expect.stringContaining("official release or report"),
        ]),
      }),
    );
    expect(completed.meeting.debugSearchProcess).toEqual(
      expect.objectContaining({
        queryPlans: expect.any(Array),
      }),
    );
  });
});

async function readNdjsonEvents(response: Response) {
  const text = await response.text();

  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
