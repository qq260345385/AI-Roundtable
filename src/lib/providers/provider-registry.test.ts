import { describe, expect, test } from "vitest";
import { createProviderRegistry } from "./provider-registry";

describe("createProviderRegistry", () => {
  test("returns mock participants with mock status in mock mode", async () => {
    const registry = await createProviderRegistry({
      AI_ROUNDTABLE_MODE: "mock",
    });

    expect(registry.mode).toBe("mock");
    expect(registry.provider.name).toBe("MockProvider");
    expect(registry.participants.map((participant) => participant.name)).toEqual([
      "GPT Mock",
      "Claude Mock",
      "Gemini Mock",
      "DeepSeek Mock",
    ]);
    expect(registry.participants.every((participant) => participant.status === "mock")).toBe(
      true,
    );
    expect(
      registry.participants.every(
        (participant) => participant.statusLabel === "Mock / 无需 API",
      ),
    ).toBe(true);
    expect(registry.participants[0].capabilities).toEqual({
      nativeEvidenceAttachments: false,
      documentRecognition: false,
      imageRecognition: false,
    });
  });

  test("uses available real providers after model detection", async () => {
    const registry = await createProviderRegistry(
      {
        AI_ROUNDTABLE_MODE: "real",
        OPENAI_API_KEY: "openai-key",
        OPENAI_BASE_URL: "https://api.openai.com/v1",
        OPENAI_MODEL: "gpt-test",
        DEEPSEEK_API_KEY: "",
        DEEPSEEK_BASE_URL: "https://api.deepseek.com",
        DEEPSEEK_MODEL: "deepseek-test",
        QWEN_API_KEY: "",
        QWEN_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        QWEN_MODEL: "qwen-test",
      },
      {
        fetcher: async () =>
          new Response(JSON.stringify({ data: [{ id: "gpt-test" }] })),
      },
    );

    expect(registry.mode).toBe("real");
    expect(registry.participants).toHaveLength(1);
    expect(registry.participants[0].provider).toBe("OpenAI");
    expect(registry.participants[0].status).toBe("available");
    expect(registry.participants[0].statusLabel).toBe("已连接");
    expect(registry.participants[0].capabilities).toEqual({
      nativeEvidenceAttachments: false,
      nativeEvidenceAttachmentsStatus: "unknown",
      documentRecognition: false,
      documentRecognitionStatus: "unknown",
      imageRecognition: false,
      imageRecognitionStatus: "unknown",
      source: "default",
    });
    expect(JSON.stringify(registry.participants)).not.toContain("openai-key");
  });

  test("applies configured provider capabilities to real participants", async () => {
    const registry = await createProviderRegistry(
      {
        AI_ROUNDTABLE_MODE: "real",
        AI_ROUNDTABLE_PROVIDER_IDS: "deepseek",
        AI_ROUNDTABLE_PROVIDER_DEEPSEEK_NAME: "DeepSeek Flash",
        AI_ROUNDTABLE_PROVIDER_DEEPSEEK_API_KEY: "deepseek-key",
        AI_ROUNDTABLE_PROVIDER_DEEPSEEK_BASE_URL: "https://api.deepseek.com",
        AI_ROUNDTABLE_PROVIDER_DEEPSEEK_MODEL: "deepseek-v4-flash",
        AI_ROUNDTABLE_PROVIDER_DEEPSEEK_CAPABILITIES: "documents",
        AI_ROUNDTABLE_PROVIDER_DEEPSEEK_SUPPORTS_IMAGES: "false",
      },
      {
        fetcher: async () =>
          new Response(
            JSON.stringify({ data: [{ id: "deepseek-v4-flash" }] }),
          ),
      },
    );

    expect(registry.participants[0].capabilities).toEqual({
      nativeEvidenceAttachments: false,
      nativeEvidenceAttachmentsStatus: "unknown",
      documentRecognition: true,
      documentRecognitionStatus: "supported",
      imageRecognition: false,
      imageRecognitionStatus: "unsupported",
      source: "env",
    });
  });

  test("throws a clear error when real mode has no available provider", async () => {
    await expect(
      createProviderRegistry({
        AI_ROUNDTABLE_MODE: "real",
      }),
    ).rejects.toThrow("real mode has no available provider");
  });
});
