import { describe, expect, test } from "vitest";
import { POST } from "./route";

describe("POST /api/evidence/parse", () => {
  test("parses an uploaded evidence file", async () => {
    const formData = new FormData();
    formData.set("file", new File(["资料内容"], "notes.txt", {
      type: "text/plain",
      lastModified: Date.UTC(2026, 4, 19),
    }));

    const response = await POST(
      new Request("http://localhost/api/evidence/parse", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.draft).toEqual(
      expect.objectContaining({
        title: "notes.txt",
        source: "本地文件",
        snippet: "资料内容",
        quality: expect.objectContaining({
          textLength: 4,
          wasTruncated: false,
          warnings: expect.any(Array),
        }),
      }),
    );
    expect(body.evidencePack).toEqual(
      expect.objectContaining({
        enabled: true,
        strategy: "text_pack",
      }),
    );
  });

  test("returns quality warnings for short parsed content", async () => {
    const formData = new FormData();
    formData.set("file", new File(["短"], "short.txt", {
      type: "text/plain",
    }));

    const response = await POST(
      new Request("http://localhost/api/evidence/parse", {
        method: "POST",
        body: formData,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.warnings).toContain("资料摘要较短，可能不足以支撑可靠讨论");
    expect(body.draft.quality.warnings).toContain(
      "资料摘要较短，可能不足以支撑可靠讨论",
    );
  });

  test("returns 400 when no file is provided", async () => {
    const response = await POST(
      new Request("http://localhost/api/evidence/parse", {
        method: "POST",
        body: new FormData(),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("file is required");
  });

  test("does not leak obvious secrets from parsed output", async () => {
    const formData = new FormData();
    formData.set(
      "file",
      new File(["Authorization: Bearer secret-openai-key"], "debug.txt", {
        type: "text/plain",
      }),
    );

    const response = await POST(
      new Request("http://localhost/api/evidence/parse", {
        method: "POST",
        body: formData,
      }),
    );
    const bodyText = JSON.stringify(await response.json());

    expect(response.status).toBe(200);
    expect(bodyText).not.toContain("Authorization");
    expect(bodyText).not.toContain("Bearer");
    expect(bodyText).not.toContain("secret-openai-key");
  });
});
