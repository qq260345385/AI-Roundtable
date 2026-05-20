import { describe, expect, test } from "vitest";
import { detectProviderStatuses } from "./provider-detection";
import type { ProviderConfig } from "../config/model-config";

function createProvider(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: "openai",
    envPrefix: "AI_ROUNDTABLE_PROVIDER_OPENAI",
    name: "OpenAI",
    apiKey: "secret-openai-key",
    baseUrl: "https://api.openai.com/v1",
    modelName: "gpt-test",
    missingConfig: [],
    ...overrides,
  };
}

describe("detectProviderStatuses", () => {
  test("marks a configured provider available when /models contains the model", async () => {
    const result = await detectProviderStatuses([createProvider()], {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "gpt-test" }, { id: "gpt-other" }],
          }),
        ),
    });

    expect(result.availableProviders).toHaveLength(1);
    expect(result.availableProviders[0].status).toBe("available");
    expect(result.availableProviders[0].statusLabel).toBe("已连接");
    expect(result.availableProviders[0].detectedModels).toEqual([
      "gpt-test",
      "gpt-other",
    ]);
  });

  test("detects models but does not enable a provider without MODEL", async () => {
    const result = await detectProviderStatuses([
      createProvider({
        modelName: undefined,
        missingConfig: ["AI_ROUNDTABLE_PROVIDER_OPENAI_MODEL"],
      }),
    ], {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "gpt-test" }, { id: "gpt-other" }],
          }),
        ),
    });

    expect(result.availableProviders).toEqual([]);
    expect(result.unavailableProviders[0]).toMatchObject({
      status: "detected",
      statusLabel: "已检测",
      detectedModels: ["gpt-test", "gpt-other"],
    });
  });

  test("marks a configured provider unavailable when model is not returned", async () => {
    const result = await detectProviderStatuses([createProvider()], {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            data: [{ id: "gpt-other" }],
          }),
        ),
    });

    expect(result.availableProviders).toEqual([]);
    expect(result.unavailableProviders[0]).toMatchObject({
      status: "model_not_found",
      statusLabel: "模型未找到",
      detectedModels: ["gpt-other"],
    });
  });

  test("sanitizes provider detection failures before returning them", async () => {
    const result = await detectProviderStatuses([createProvider()], {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            error: "bad Authorization Bearer secret-openai-key",
          }),
          { status: 401 },
        ),
    });
    const text = JSON.stringify(result);

    expect(result.availableProviders[0]).toMatchObject({
      status: "configured_unverified",
      statusLabel: "检测失败",
    });
    expect(text).not.toContain("secret-openai-key");
    expect(text).not.toContain("Authorization");
    expect(text).not.toContain("Bearer");
  });

  test("uses an abort signal when detecting models", async () => {
    let receivedSignal: AbortSignal | undefined;

    await detectProviderStatuses([createProvider()], {
      fetcher: async (_url, init) => {
        receivedSignal = init?.signal ?? undefined;

        return new Response(
          JSON.stringify({
            data: [{ id: "gpt-test" }],
          }),
        );
      },
    });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(false);
  });

  test("treats model detection timeout as configured but unverified", async () => {
    const result = await detectProviderStatuses([createProvider()], {
      timeoutMs: 1,
      fetcher: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("secret-openai-key timeout"));
          });
        }),
    });
    const text = JSON.stringify(result);

    expect(result.availableProviders[0]).toMatchObject({
      status: "configured_unverified",
      statusLabel: "检测失败",
    });
    expect(text).not.toContain("secret-openai-key");
  });

  test("isolates one provider detection failure from other providers", async () => {
    const result = await detectProviderStatuses(
      [
        createProvider({
          id: "broken",
          envPrefix: "AI_ROUNDTABLE_PROVIDER_BROKEN",
          name: "BrokenProvider",
          baseUrl: "https://broken.example/v1",
          modelName: "broken-model",
        }),
        createProvider({
          id: "working",
          envPrefix: "AI_ROUNDTABLE_PROVIDER_WORKING",
          name: "WorkingProvider",
          baseUrl: "https://working.example/v1",
          modelName: "working-model",
        }),
      ],
      {
        fetcher: async (url) => {
          if (String(url).includes("broken.example")) {
            return new Response("secret-openai-key failed", { status: 500 });
          }

          return new Response(
            JSON.stringify({
              data: [{ id: "working-model" }],
            }),
          );
        },
      },
    );

    expect(result.availableProviders.map((provider) => provider.providerName)).toEqual([
      "BrokenProvider",
      "WorkingProvider",
    ]);
    expect(result.availableProviders[0].status).toBe("configured_unverified");
    expect(result.availableProviders[1].status).toBe("available");
    expect(JSON.stringify(result)).not.toContain("secret-openai-key");
  });
});
