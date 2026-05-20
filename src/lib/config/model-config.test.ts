import { describe, expect, test } from "vitest";
import { loadModelConfig } from "./model-config";

describe("loadModelConfig", () => {
  test("reads arbitrary OpenAI-compatible providers from provider ids", () => {
    const config = loadModelConfig({
      AI_ROUNDTABLE_MODE: "real",
      AI_ROUNDTABLE_PROVIDER_IDS: "openai,siliconflow",
      AI_ROUNDTABLE_PROVIDER_OPENAI_NAME: "OpenAI",
      AI_ROUNDTABLE_PROVIDER_OPENAI_BASE_URL: "https://api.openai.com/v1",
      AI_ROUNDTABLE_PROVIDER_OPENAI_API_KEY: "openai-key",
      AI_ROUNDTABLE_PROVIDER_OPENAI_MODEL: "gpt-test",
      AI_ROUNDTABLE_PROVIDER_SILICONFLOW_NAME: "SiliconFlow",
      AI_ROUNDTABLE_PROVIDER_SILICONFLOW_BASE_URL:
        "https://api.siliconflow.cn/v1",
      AI_ROUNDTABLE_PROVIDER_SILICONFLOW_API_KEY: "siliconflow-key",
      AI_ROUNDTABLE_PROVIDER_SILICONFLOW_MODEL: "sf-test",
    });

    expect(config.mode).toBe("real");
    expect(config.providers.map((provider) => provider.id)).toEqual([
      "openai",
      "siliconflow",
    ]);
    expect(config.providers[1]).toMatchObject({
      id: "siliconflow",
      name: "SiliconFlow",
      baseUrl: "https://api.siliconflow.cn/v1",
      modelName: "sf-test",
    });
    expect(JSON.stringify(config.providers)).not.toContain("siliconflow-key");
  });

  test("keeps legacy OpenAI DeepSeek and Qwen env names compatible", () => {
    const config = loadModelConfig({
      AI_ROUNDTABLE_MODE: "real",
      OPENAI_API_KEY: "openai-key",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
      OPENAI_MODEL: "gpt-test",
      DEEPSEEK_API_KEY: "",
      QWEN_API_KEY: "",
    });

    expect(config.providers.map((provider) => provider.id)).toEqual([
      "openai",
      "deepseek",
      "qwen",
    ]);
    expect(config.providers[0]).toMatchObject({
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      modelName: "gpt-test",
    });
    expect(config.providers[0].apiKey).toBe("openai-key");
  });

  test("reports incomplete real provider config without marking it available", () => {
    const config = loadModelConfig({
      AI_ROUNDTABLE_MODE: "real",
      AI_ROUNDTABLE_PROVIDER_IDS: "custom",
      AI_ROUNDTABLE_PROVIDER_CUSTOM_NAME: "Custom",
      AI_ROUNDTABLE_PROVIDER_CUSTOM_API_KEY: "custom-key",
      AI_ROUNDTABLE_PROVIDER_CUSTOM_MODEL: "",
    });

    expect(config.providers[0].missingConfig).toContain(
      "AI_ROUNDTABLE_PROVIDER_CUSTOM_BASE_URL",
    );
    expect(config.providers[0].missingConfig).toContain(
      "AI_ROUNDTABLE_PROVIDER_CUSTOM_MODEL",
    );
  });

  test("reads generic provider capability declarations", () => {
    const config = loadModelConfig({
      AI_ROUNDTABLE_MODE: "real",
      AI_ROUNDTABLE_PROVIDER_IDS: "deepseek",
      AI_ROUNDTABLE_PROVIDER_DEEPSEEK_NAME: "DeepSeek",
      AI_ROUNDTABLE_PROVIDER_DEEPSEEK_BASE_URL: "https://api.deepseek.com",
      AI_ROUNDTABLE_PROVIDER_DEEPSEEK_API_KEY: "deepseek-key",
      AI_ROUNDTABLE_PROVIDER_DEEPSEEK_MODEL: "deepseek-v4-flash",
      AI_ROUNDTABLE_PROVIDER_DEEPSEEK_CAPABILITIES: "documents",
      AI_ROUNDTABLE_PROVIDER_DEEPSEEK_SUPPORTS_IMAGES: "false",
      AI_ROUNDTABLE_PROVIDER_DEEPSEEK_SUPPORTS_NATIVE_FILES: "false",
    });

    expect(config.providers[0].capabilities).toEqual({
      nativeEvidenceAttachments: false,
      nativeEvidenceAttachmentsStatus: "unsupported",
      documentRecognition: true,
      documentRecognitionStatus: "supported",
      imageRecognition: false,
      imageRecognitionStatus: "unsupported",
      source: "env",
    });
  });
});
