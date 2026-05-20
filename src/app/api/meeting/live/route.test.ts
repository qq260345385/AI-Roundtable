import { afterEach, describe, expect, test } from "vitest";
import { POST } from "./route";

const originalEnv = { ...process.env };

describe("POST /api/meeting/live", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
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
});

async function readNdjsonEvents(response: Response) {
  const text = await response.text();

  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
