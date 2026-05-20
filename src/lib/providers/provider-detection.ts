import type { ProviderConfig, RealModelConfig } from "../config/model-config";
import type { UnavailableProvider } from "../types";

type DetectProviderStatusesOptions = {
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

type DetectionResult = {
  availableProviders: RealModelConfig[];
  unavailableProviders: UnavailableProvider[];
};

type ModelsResponse = {
  data?: unknown;
};

const MAX_DETECTED_MODELS = 8;
const DEFAULT_DETECTION_TIMEOUT_MS = 9000;

export async function detectProviderStatuses(
  providers: ProviderConfig[],
  options: DetectProviderStatusesOptions = {},
): Promise<DetectionResult> {
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_DETECTION_TIMEOUT_MS;
  const availableProviders: RealModelConfig[] = [];
  const unavailableProviders: UnavailableProvider[] = [];

  for (const provider of providers) {
    const missingBlockingConfig = provider.missingConfig.filter(
      (item) => !item.endsWith("_MODEL"),
    );

    if (missingBlockingConfig.length > 0) {
      unavailableProviders.push(
        createUnavailableProvider(
          provider,
          "unconfigured",
          "未配置",
          `missing ${missingBlockingConfig.join(", ")}`,
        ),
      );
      continue;
    }

    const detection = await detectModels(provider, fetcher, timeoutMs);

    if (!detection.ok) {
      if (provider.modelName && provider.baseUrl && provider.apiKey) {
        availableProviders.push(hideApiKey({
          id: provider.id,
          providerName: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          modelName: provider.modelName,
          status: "configured_unverified",
          statusLabel: "检测失败",
          detectedModels: [],
          capabilities: provider.capabilities,
        }));
      } else {
        unavailableProviders.push(
          createUnavailableProvider(
            provider,
            "unconfigured",
            "未配置",
            `missing ${provider.missingConfig.join(", ")}`,
          ),
        );
      }
      continue;
    }

    if (!provider.modelName) {
      unavailableProviders.push(
        createUnavailableProvider(
          provider,
          "detected",
          "已检测",
          getMissingModelReason(provider),
          detection.models,
        ),
      );
      continue;
    }

    if (!detection.models.includes(provider.modelName)) {
      unavailableProviders.push(
        createUnavailableProvider(
          provider,
          "model_not_found",
          "模型未找到",
          `${provider.modelName} was not found in detected models`,
          detection.models,
        ),
      );
      continue;
    }

    availableProviders.push(hideApiKey({
      id: provider.id,
      providerName: provider.name,
      baseUrl: provider.baseUrl ?? "",
      apiKey: provider.apiKey ?? "",
      modelName: provider.modelName,
      status: "available",
      statusLabel: "已连接",
      detectedModels: detection.models.slice(0, MAX_DETECTED_MODELS),
      capabilities: provider.capabilities,
    }));
  }

  return {
    availableProviders,
    unavailableProviders,
  };
}

async function detectModels(
  provider: ProviderConfig,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<{ ok: true; models: string[] } | { ok: false; reason: string }> {
  if (!provider.baseUrl || !provider.apiKey) {
    return {
      ok: false,
      reason: "provider configuration is incomplete",
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${trimTrailingSlash(provider.baseUrl)}/models`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
        },
      });

      if (!response.ok) {
        return {
          ok: false,
          reason: `models endpoint returned ${response.status}`,
        };
      }

      const data = (await response.json()) as ModelsResponse;

      return {
        ok: true,
        models: readDetectedModels(data),
      };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return {
      ok: false,
      reason: "models endpoint check failed",
    };
  }
}

function readDetectedModels(data: ModelsResponse): string[] {
  if (!Array.isArray(data.data)) {
    return [];
  }

  return data.data
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (
        item &&
        typeof item === "object" &&
        "id" in item &&
        typeof item.id === "string"
      ) {
        return item.id;
      }

      return "";
    })
    .filter(Boolean);
}

function createUnavailableProvider(
  provider: ProviderConfig,
  status: UnavailableProvider["status"],
  statusLabel: string,
  reason: string,
  detectedModels: string[] = [],
): UnavailableProvider {
  return {
    id: provider.id,
    name: provider.name,
    provider: provider.name,
    status,
    statusLabel,
    reason,
    detectedModels: detectedModels.slice(0, MAX_DETECTED_MODELS),
  };
}

function getMissingModelReason(provider: ProviderConfig): string {
  const missingModel = provider.missingConfig.find((item) =>
    item.endsWith("_MODEL"),
  );

  return `missing ${missingModel ?? `${provider.envPrefix}_MODEL`}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

function hideApiKey(config: RealModelConfig): RealModelConfig {
  Object.defineProperty(config, "apiKey", {
    value: config.apiKey,
    enumerable: false,
    configurable: true,
  });

  return config;
}
