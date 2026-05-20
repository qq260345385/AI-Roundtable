import type { RoundtableMode } from "../types";
import type {
  CapabilitySupportStatus,
  EvidenceAttachmentCapabilities,
} from "../search/evidence-pack";

export type EnvValues = {
  [key: string]: string | undefined;
};

export type ProviderConfig = {
  id: string;
  envPrefix: string;
  legacyPrefix?: string;
  name: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  missingConfig: string[];
  capabilities?: EvidenceAttachmentCapabilities;
};

export type RealModelConfig = {
  id: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  status: "available" | "configured_unverified";
  statusLabel: string;
  detectedModels?: string[];
  capabilities?: EvidenceAttachmentCapabilities;
};

export type ModelConfig = {
  mode: RoundtableMode;
  providers: ProviderConfig[];
};

const LEGACY_PROVIDER_IDS = ["openai", "deepseek", "qwen"];

const LEGACY_PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  qwen: "Qwen",
};

const LEGACY_DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

export function loadModelConfig(env: EnvValues = process.env): ModelConfig {
  const mode = env.AI_ROUNDTABLE_MODE === "real" ? "real" : "mock";
  const providerIds = readProviderIds(env);

  return {
    mode,
    providers: providerIds.map((id) => readProviderConfig(env, id)),
  };
}

function readProviderIds(env: EnvValues): string[] {
  const configuredIds = env.AI_ROUNDTABLE_PROVIDER_IDS?.split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);

  if (configuredIds && configuredIds.length > 0) {
    return Array.from(new Set(configuredIds));
  }

  return LEGACY_PROVIDER_IDS;
}

function readProviderConfig(env: EnvValues, id: string): ProviderConfig {
  const envId = toEnvId(id);
  const envPrefix = `AI_ROUNDTABLE_PROVIDER_${envId}`;
  const legacyPrefix = getLegacyPrefix(id);
  const name =
    env[`${envPrefix}_NAME`]?.trim() ||
    readLegacyValue(env, legacyPrefix, "NAME") ||
    LEGACY_PROVIDER_NAMES[id] ||
    id;
  const baseUrl =
    env[`${envPrefix}_BASE_URL`]?.trim() ||
    readLegacyValue(env, legacyPrefix, "BASE_URL") ||
    getLegacyDefaultBaseUrl(id, legacyPrefix);
  const apiKey =
    env[`${envPrefix}_API_KEY`]?.trim() ||
    readLegacyValue(env, legacyPrefix, "API_KEY");
  const modelName =
    env[`${envPrefix}_MODEL`]?.trim() ||
    readLegacyValue(env, legacyPrefix, "MODEL");
  const capabilities = readProviderCapabilities(env, envPrefix);
  const missingConfig = getMissingConfig({
    envPrefix,
    legacyPrefix,
    apiKey,
    baseUrl,
    modelName,
  });

  return hideApiKey({
    id,
    envPrefix,
    legacyPrefix,
    name,
    baseUrl,
    apiKey,
    modelName,
    missingConfig,
    capabilities,
  });
}

function readProviderCapabilities(
  env: EnvValues,
  envPrefix: string,
): EvidenceAttachmentCapabilities | undefined {
  const capabilityList = parseCapabilityList(env[`${envPrefix}_CAPABILITIES`]);
  const documentStatus = resolveCapabilityStatus(
    readBooleanEnv(env[`${envPrefix}_SUPPORTS_DOCUMENTS`]),
    capabilityList.has("documents"),
  );
  const imageStatus = resolveCapabilityStatus(
    readBooleanEnv(env[`${envPrefix}_SUPPORTS_IMAGES`]),
    capabilityList.has("images"),
  );
  const nativeStatus = resolveCapabilityStatus(
    readBooleanEnv(env[`${envPrefix}_SUPPORTS_NATIVE_FILES`]),
    capabilityList.has("native_files"),
  );
  const hasCapabilityEnv =
    env[`${envPrefix}_CAPABILITIES`] !== undefined ||
    env[`${envPrefix}_SUPPORTS_DOCUMENTS`] !== undefined ||
    env[`${envPrefix}_SUPPORTS_IMAGES`] !== undefined ||
    env[`${envPrefix}_SUPPORTS_NATIVE_FILES`] !== undefined;

  if (!hasCapabilityEnv) {
    return undefined;
  }

  return {
    nativeEvidenceAttachments: nativeStatus === "supported",
    nativeEvidenceAttachmentsStatus: nativeStatus,
    documentRecognition: documentStatus === "supported",
    documentRecognitionStatus: documentStatus,
    imageRecognition: imageStatus === "supported",
    imageRecognitionStatus: imageStatus,
    source: "env",
  };
}

function parseCapabilityList(value: string | undefined): Set<string> {
  const normalized = new Set<string>();

  for (const item of value?.split(",") ?? []) {
    const token = item.trim().toLowerCase().replace(/[-\s]/g, "_");

    if (token === "document" || token === "documents" || token === "doc") {
      normalized.add("documents");
    }

    if (token === "image" || token === "images" || token === "vision") {
      normalized.add("images");
    }

    if (
      token === "native_file" ||
      token === "native_files" ||
      token === "file_attachment" ||
      token === "file_attachments" ||
      token === "attachments"
    ) {
      normalized.add("native_files");
    }
  }

  return normalized;
}

function readBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function resolveCapabilityStatus(
  explicitValue: boolean | undefined,
  listedAsSupported: boolean,
): CapabilitySupportStatus {
  if (explicitValue === true || listedAsSupported) {
    return "supported";
  }

  if (explicitValue === false) {
    return "unsupported";
  }

  return "unknown";
}

function readLegacyValue(
  env: EnvValues,
  legacyPrefix: string | undefined,
  field: string,
): string | undefined {
  if (!legacyPrefix) {
    return undefined;
  }

  return env[`${legacyPrefix}_${field}`]?.trim() || undefined;
}

function getLegacyPrefix(id: string): string | undefined {
  if (!LEGACY_PROVIDER_IDS.includes(id)) {
    return undefined;
  }

  return id.toUpperCase();
}

function getLegacyDefaultBaseUrl(
  id: string,
  legacyPrefix: string | undefined,
): string | undefined {
  if (!legacyPrefix) {
    return undefined;
  }

  return LEGACY_DEFAULT_BASE_URLS[id];
}

function getMissingConfig(options: {
  envPrefix: string;
  legacyPrefix?: string;
  apiKey?: string;
  baseUrl?: string;
  modelName?: string;
}): string[] {
  const missing: string[] = [];

  if (!options.apiKey) {
    missing.push(getEnvName(options, "API_KEY"));
  }

  if (!options.baseUrl) {
    missing.push(getEnvName(options, "BASE_URL"));
  }

  if (!options.modelName) {
    missing.push(getEnvName(options, "MODEL"));
  }

  return missing;
}

function getEnvName(
  options: { envPrefix: string; legacyPrefix?: string },
  field: string,
): string {
  if (options.legacyPrefix) {
    return `${options.legacyPrefix}_${field}`;
  }

  return `${options.envPrefix}_${field}`;
}

function toEnvId(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]/g, "_");
}

function hideApiKey(config: ProviderConfig): ProviderConfig {
  if (!config.apiKey) {
    return config;
  }

  Object.defineProperty(config, "apiKey", {
    value: config.apiKey,
    enumerable: false,
    configurable: true,
  });

  return config;
}
