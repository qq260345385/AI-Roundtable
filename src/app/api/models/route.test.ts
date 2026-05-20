import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("GET /api/models", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test("returns available models without api keys after detection", async () => {
    process.env.AI_ROUNDTABLE_MODE = "real";
    process.env.OPENAI_API_KEY = "secret-openai-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    process.env.OPENAI_MODEL = "gpt-test";
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ data: [{ id: "gpt-test" }] })),
    );

    const response = await GET();
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.mode).toBe("real");
    expect(body.models).toHaveLength(1);
    expect(body.models[0].provider).toBe("OpenAI");
    expect(body.models[0].status).toBe("available");
    expect(body.models[0].statusLabel).toBe("已连接");
    expect(body.unavailableProviders).toEqual([
      expect.objectContaining({
        provider: "DeepSeek",
        reason: "missing DEEPSEEK_API_KEY",
        status: "unconfigured",
      }),
      expect.objectContaining({
        provider: "Qwen",
        reason: "missing QWEN_API_KEY",
        status: "unconfigured",
      }),
    ]);
    expect(text).not.toContain("secret-openai-key");
  });

  test("does not fail when real mode has no available provider", async () => {
    process.env.AI_ROUNDTABLE_MODE = "real";
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mode).toBe("real");
    expect(body.models).toEqual([]);
    expect(body.unavailableProviders).toEqual([
      expect.objectContaining({
        provider: "OpenAI",
        reason: "missing OPENAI_API_KEY",
        status: "unconfigured",
      }),
      expect.objectContaining({
        provider: "DeepSeek",
        reason: "missing DEEPSEEK_API_KEY",
        status: "unconfigured",
      }),
      expect.objectContaining({
        provider: "Qwen",
        reason: "missing QWEN_API_KEY",
        status: "unconfigured",
      }),
    ]);
  });

  test("detects models for providers missing model config without exposing api keys", async () => {
    process.env.AI_ROUNDTABLE_MODE = "real";
    process.env.OPENAI_API_KEY = "secret-openai-key";
    process.env.OPENAI_BASE_URL = "https://api.openai.com/v1";
    delete process.env.OPENAI_MODEL;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.QWEN_API_KEY;
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ data: [{ id: "gpt-test" }] })),
    );

    const response = await GET();
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.models).toEqual([]);
    expect(body.unavailableProviders[0]).toMatchObject({
      provider: "OpenAI",
      reason: "missing OPENAI_MODEL",
      status: "detected",
      detectedModels: ["gpt-test"],
    });
    expect(text).not.toContain("secret-openai-key");
  });

  test("sanitizes detection failures before returning provider status", async () => {
    process.env.AI_ROUNDTABLE_MODE = "real";
    process.env.AI_ROUNDTABLE_PROVIDER_IDS = "openai";
    process.env.AI_ROUNDTABLE_PROVIDER_OPENAI_NAME = "OpenAI";
    process.env.AI_ROUNDTABLE_PROVIDER_OPENAI_BASE_URL =
      "https://api.openai.com/v1";
    process.env.AI_ROUNDTABLE_PROVIDER_OPENAI_API_KEY = "secret-openai-key";
    process.env.AI_ROUNDTABLE_PROVIDER_OPENAI_MODEL = "gpt-test";
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response("Authorization Bearer secret-openai-key rejected", {
          status: 401,
        }),
    );

    const response = await GET();
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.models[0]).toMatchObject({
      provider: "OpenAI",
      status: "configured_unverified",
      statusLabel: "检测失败",
    });
    expect(text).not.toContain("secret-openai-key");
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("Bearer");
  });

  test("keeps other providers when one provider detection fails", async () => {
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
      if (String(url).includes("broken.example")) {
        return new Response("Authorization Bearer secret-openai-key failed", {
          status: 500,
        });
      }

      return new Response(
        JSON.stringify({
          data: [{ id: "working-model" }],
        }),
      );
    });

    const response = await GET();
    const body = await response.json();
    const text = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.models).toEqual([
      expect.objectContaining({
        provider: "BrokenProvider",
        status: "configured_unverified",
      }),
      expect.objectContaining({
        provider: "WorkingProvider",
        status: "available",
      }),
    ]);
    expect(text).not.toContain("secret-openai-key");
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("Bearer");
  });
});
