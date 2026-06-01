import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
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

const DEFAULT_PROVIDER_FILE = "providers.local.json";

type ProviderFileEntry = {
  id?: unknown;
  name?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  model?: unknown;
  modelName?: unknown;
  capabilities?: unknown;
  supportsDocuments?: unknown;
  supportsImages?: unknown;
  supportsNativeFiles?: unknown;
};

export function loadModelConfig(env: EnvValues = process.env): ModelConfig {
  const mode = env.AI_ROUNDTABLE_MODE === "real" ? "real" : "mock";
  const inlineProviders = readInlineProviderConfigs(env);

  if (inlineProviders) {
    return {
      mode,
      providers: inlineProviders,
    };
  }

  const fileProviders = readProviderFileConfigs(env);

  if (fileProviders) {
    return {
      mode,
      providers: fileProviders,
    };
  }

  const providerIds = readProviderIds(env);

  return {
    mode,
    providers: providerIds.map((id) => readProviderConfig(env, id)),
  };
}

function readInlineProviderConfigs(env: EnvValues): ProviderConfig[] | undefined {
  const inlineJson = env.AI_ROUNDTABLE_PROVIDERS_JSON?.trim();

  if (!inlineJson) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(inlineJson);
  } catch (error) {
    throw new Error("AI_ROUNDTABLE_PROVIDERS_JSON is not valid JSON.", {
      cause: error,
    });
  }

  return readProviderEntries(parsed, "AI_ROUNDTABLE_PROVIDERS_JSON");
}

function readProviderFileConfigs(env: EnvValues): ProviderConfig[] | undefined {
  const providerFilePath = resolveProviderFilePath(env);

  if (!providerFilePath) {
    return undefined;
  }

  if (!existsSync(providerFilePath)) {
    if (env.AI_ROUNDTABLE_PROVIDERS_FILE?.trim()) {
      throw new Error(`Provider config file not found: ${providerFilePath}`);
    }

    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(providerFilePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Provider config file is not valid JSON: ${providerFilePath}`,
      { cause: error },
    );
  }

  return readProviderEntries(parsed, providerFilePath);
}

function readProviderEntries(
  parsed: unknown,
  sourceLabel: string,
): ProviderConfig[] | undefined {
  const entries = getProviderFileEntries(parsed);
  const providers: ProviderConfig[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries) {
    const provider = readProviderFileConfig(entry, sourceLabel);

    if (seenIds.has(provider.id)) {
      continue;
    }

    seenIds.add(provider.id);
    providers.push(provider);
  }

  return providers.length > 0 ? providers : undefined;
}

function resolveProviderFilePath(env: EnvValues): string | undefined {
  const explicitPath = env.AI_ROUNDTABLE_PROVIDERS_FILE?.trim();

  if (explicitPath) {
    return resolve(/* turbopackIgnore: true */ process.cwd(), explicitPath);
  }

  if (env !== process.env) {
    return undefined;
  }

  return resolve(/* turbopackIgnore: true */ process.cwd(), DEFAULT_PROVIDER_FILE);
}

function getProviderFileEntries(parsed: unknown): ProviderFileEntry[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord);
  }

  if (isRecord(parsed) && Array.isArray(parsed.providers)) {
    return parsed.providers.filter(isRecord);
  }

  throw new Error(
    "Provider config file must be an array or an object with a providers array.",
  );
}

function readProviderFileConfig(
  entry: ProviderFileEntry,
  filePath: string,
): ProviderConfig {
  const id = readStringValue(entry.id)?.toLowerCase();

  if (!id) {
    throw new Error(`Provider config entry in ${filePath} is missing id.`);
  }

  const envPrefix = `AI_ROUNDTABLE_PROVIDER_${toEnvId(id)}`;
  const name = readStringValue(entry.name) || id;
  const baseUrl = readStringValue(entry.baseUrl);
  const apiKey = readStringValue(entry.apiKey);
  const modelName =
    readStringValue(entry.model) || readStringValue(entry.modelName);
  const capabilities = readProviderFileCapabilities(entry);
  const missingConfig = getMissingConfig({
    envPrefix,
    apiKey,
    baseUrl,
    modelName,
  });

  return hideApiKey({
    id,
    envPrefix,
    name,
    baseUrl,
    apiKey,
    modelName,
    missingConfig,
    capabilities,
  });
}

function readProviderFileCapabilities(
  entry: ProviderFileEntry,
): EvidenceAttachmentCapabilities | undefined {
  const capabilityList = parseCapabilityList(readCapabilityFileValue(entry));
  const documentStatus = resolveCapabilityStatus(
    readBooleanValue(entry.supportsDocuments),
    capabilityList.has("documents"),
  );
  const imageStatus = resolveCapabilityStatus(
    readBooleanValue(entry.supportsImages),
    capabilityList.has("images"),
  );
  const nativeStatus = resolveCapabilityStatus(
    readBooleanValue(entry.supportsNativeFiles),
    capabilityList.has("native_files"),
  );
  const hasCapabilityConfig =
    entry.capabilities !== undefined ||
    entry.supportsDocuments !== undefined ||
    entry.supportsImages !== undefined ||
    entry.supportsNativeFiles !== undefined;

  if (!hasCapabilityConfig) {
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

function readCapabilityFileValue(entry: ProviderFileEntry): string | undefined {
  if (Array.isArray(entry.capabilities)) {
    return entry.capabilities
      .map((item) => readStringValue(item))
      .filter((item): item is string => Boolean(item))
      .join(",");
  }

  return readStringValue(entry.capabilities);
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

function readBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  return readBooleanEnv(readStringValue(value));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
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
