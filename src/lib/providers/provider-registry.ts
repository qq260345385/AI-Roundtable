import { loadModelConfig, type EnvValues } from "../config/model-config";
import { demoMeetingRequest } from "../mock-data";
import type {
  MeetingSummary,
  MeetingTurn,
  ModelParticipant,
  ModelProvider,
  UnavailableProvider,
} from "../types";
import { mockProvider } from "./mock-provider";
import { OpenAICompatibleProvider } from "./openai-compatible-provider";
import { detectProviderStatuses } from "./provider-detection";
import { inferModelCapabilities } from "./model-capabilities";

export type ProviderRegistry = {
  mode: "mock" | "real";
  participants: ModelParticipant[];
  provider: ModelProvider;
  providers: ModelProvider[];
  unavailableProviders: UnavailableProvider[];
};

type ProviderRegistryOptions = {
  allowEmptyRealMode?: boolean;
  fetcher?: typeof fetch;
};

export async function createProviderRegistry(
  env?: EnvValues,
  options: ProviderRegistryOptions = {},
): Promise<ProviderRegistry> {
  const config = loadModelConfig(env);

  if (config.mode === "mock") {
    return {
      mode: "mock",
      participants: demoMeetingRequest.participants,
      provider: mockProvider,
      providers: [mockProvider],
      unavailableProviders: [],
    };
  }

  const detected = await detectProviderStatuses(config.providers, {
    fetcher: options.fetcher,
  });

  if (
    detected.availableProviders.length === 0 &&
    !options.allowEmptyRealMode
  ) {
    throw new Error("real mode has no available provider");
  }

  const providers = detected.availableProviders.map(
    (providerConfig) => new OpenAICompatibleProvider(providerConfig),
  );
  const participants = detected.availableProviders.map((providerConfig) => ({
    id: `${providerConfig.id}-${providerConfig.modelName}`,
    name: `${providerConfig.providerName} ${providerConfig.modelName}`,
    provider: providerConfig.providerName,
    model: providerConfig.modelName,
    status: providerConfig.status,
    statusLabel: providerConfig.statusLabel,
    detectedModels: providerConfig.detectedModels,
    capabilities: inferModelCapabilities(
      providerConfig.providerName,
      providerConfig.modelName,
      providerConfig.capabilities,
    ),
  }));

  return {
    mode: "real",
    participants,
    providers,
    provider: providers.length > 0 ? createProviderRouter(providers) : mockProvider,
    unavailableProviders: detected.unavailableProviders,
  };
}

function createProviderRouter(providers: ModelProvider[]): ModelProvider {
  return {
    name: "ProviderRouter",

    async generateSearchIntents(participant, topic, options) {
      const provider = findProvider(providers, participant);

      if (provider.generateSearchIntents) {
        return provider.generateSearchIntents(participant, topic, options);
      }

      if (provider.generateSearchQueries) {
        const queries = await provider.generateSearchQueries(
          participant,
          topic,
          options,
        );

        return queries.map((query) => ({
          question: query,
          mustInclude: [],
          shouldInclude: [],
          exclude: [],
          freshness: "any" as const,
          sourcePreference: "mixed" as const,
          rationale: "Legacy plain-text search query.",
        }));
      }

      return [
        {
          question: `${topic} official report`,
          mustInclude: [topic],
          shouldInclude: ["official report"],
          exclude: [],
          freshness: "latest" as const,
          sourcePreference: "official" as const,
          rationale: "Fallback official-source search intent.",
        },
        {
          question: `${topic} benchmark`,
          mustInclude: [topic],
          shouldInclude: ["benchmark"],
          exclude: [],
          freshness: "recent" as const,
          sourcePreference: "benchmark" as const,
          rationale: "Fallback benchmark-source search intent.",
        },
      ];
    },

    async generateSearchQueries(participant, topic, options) {
      const provider = findProvider(providers, participant);

      if (provider.generateSearchIntents) {
        const intents = await provider.generateSearchIntents(
          participant,
          topic,
          options,
        );

        return intents.map((intent) =>
          [
            intent.question,
            ...intent.mustInclude,
            ...intent.shouldInclude,
          ].join(" "),
        );
      }

      if (provider.generateSearchQueries) {
        return provider.generateSearchQueries(participant, topic, options);
      }

      return [
        `${topic} official report`,
        `${topic} benchmark`,
        `${topic} latest analysis`,
      ];
    },

    async generateIndependentView(participant, topic, evidencePack, options) {
      return findProvider(providers, participant).generateIndependentView(
        participant,
        topic,
        evidencePack,
        options,
      );
    },

    async generateResponse(participant, topic, previousTurns, evidencePack, options) {
      return findProvider(providers, participant).generateResponse(
        participant,
        topic,
        previousTurns,
        evidencePack,
        options,
      );
    },

    async generateSummary(
      topic: string,
      turns: MeetingTurn[],
      evidencePack,
      options,
    ): Promise<MeetingSummary> {
      return providers[0].generateSummary(topic, turns, evidencePack, options);
    },

    async generateSummaryForParticipant(
      participant,
      topic,
      turns,
      evidencePack,
      options,
    ) {
      return findProvider(providers, participant).generateSummary(
        topic,
        turns,
        evidencePack,
        options,
      );
    },
  };
}

function findProvider(
  providers: ModelProvider[],
  participant: ModelParticipant,
): ModelProvider {
  const provider = providers.find((item) => item.name === participant.provider);

  if (!provider) {
    throw new Error(`No provider found for ${participant.provider}`);
  }

  return provider;
}
