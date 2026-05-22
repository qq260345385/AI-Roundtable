import type {
  EvidencePack,
  SearchCacheEvent,
  SearchFreshness,
  SearchIntent,
  SearchIntentDecision,
  SearchIntentRecord,
  SearchProviderDiagnostic,
  SearchQueryPlan,
  SearchSourcePreference,
} from "./evidence-pack";
import {
  createSearchFailureProcess,
  normalizeEvidencePack,
} from "./evidence-pack";
import {
  buildTavilySearchQueries,
  dedupeSearchResults,
  getTavilyFailureReason,
  type TavilyEvidenceDraft,
} from "./tavily-search";
import { getSearchProvider } from "./search-provider-registry";
import type {
  SearchProvider,
  SearchProviderResponse,
} from "./search-provider";
import type {
  ModelParticipant,
  ModelProvider,
} from "../types";

const MAX_MODEL_DRIVEN_QUERIES = 8;
const WEB_SEARCH_RESULTS_PER_QUERY = 5;
const MAX_TAVILY_QUERY_LENGTH = 160;
const VAGUE_TERMS = new Set([
  "impact",
  "future",
  "analysis",
  "overview",
  "trend",
  "trends",
  "news",
]);
const MARKETING_TERMS = new Set([
  "best",
  "ultimate",
  "game changer",
  "revolutionary",
  "amazing",
  "powerful",
  "leading",
]);

type Searcher = (
  query: string,
  options?: {
    freshness?: SearchFreshness;
    maxResults?: number;
    onCacheEvent?: (event: SearchCacheEvent) => void;
  },
) => Promise<TavilyEvidenceDraft[]>;

type BuildModelDrivenWebEvidencePackOptions = {
  baseEvidencePack?: EvidencePack;
  participants: ModelParticipant[];
  provider: ModelProvider;
  searchProvider?: SearchProvider;
  searcher?: Searcher;
  topic: string;
};

export async function buildModelDrivenWebEvidencePack({
  baseEvidencePack,
  participants,
  provider,
  searchProvider = getSearchProvider(),
  searcher,
  topic,
}: BuildModelDrivenWebEvidencePackOptions): Promise<EvidencePack> {
  const searchPlan = await buildParticipantSearchQueries(
    topic,
    participants,
    provider,
  );
  const searchQueries = searchPlan.queries;
  const baseItems = baseEvidencePack?.enabled ? baseEvidencePack.items : [];
  const freshnessByQuery = new Map(
    searchPlan.queryPlans.map((plan) => [plan.query, plan.freshness]),
  );
  const cacheEvents: SearchCacheEvent[] = [];
  const providerDiagnostics: SearchProviderDiagnostic[] = [];
  let dedupeStats: ReturnType<typeof dedupeSearchResults>["stats"] | undefined;
  let webDrafts: TavilyEvidenceDraft[];

  try {
    const rawWebDrafts = (
      await Promise.all(
        searchQueries.map((query) =>
          searchWithConfiguredProvider({
            freshness: freshnessByQuery.get(query) ?? "any",
            provider: searchProvider,
            query,
            searcher,
            topic,
          }).then((response) => {
            cacheEvents.push(...(response.cacheEvents ?? []));
            providerDiagnostics.push(createProviderDiagnostic(response));

            return response.results.map((result) => ({
              title: result.title,
              url: result.url,
              snippet: result.content ?? result.snippet ?? "",
              publishedAt: result.publishedDate,
              query,
            }));
          }),
        ),
      )
    ).flat();
    const deduped = dedupeSearchResults(rawWebDrafts);

    webDrafts = deduped.items;
    dedupeStats = deduped.stats;
  } catch (error) {
    const failureReason = getTavilyFailureReason(error);

    return normalizeEvidencePack(
      {
        enabled: true,
        evidenceStatus: "none",
        evidenceWarnings: [
          ...(baseEvidencePack?.evidenceWarnings ?? []),
          "Tavily search failed; the meeting should treat real-time facts as manually unverified.",
        ],
        items: baseItems,
        searchProcess: createSearchFailureProcess({
          cacheEvents,
          dedupeStats,
          executedQueries: searchQueries,
          failureReason,
          provider: searchProvider.id,
          providerDiagnostics,
          searchIntents: searchPlan.searchIntents,
          queryPlans: searchPlan.queryPlans,
          intentDecisions: searchPlan.intentDecisions,
          warnings: [failureReason],
        }),
        searchQueries,
        strategy: baseEvidencePack?.strategy ?? "text_pack",
      },
      {
        topic,
      },
    );
  }
  const preflightPack = normalizeEvidencePack(
    {
      enabled: baseItems.length > 0 || webDrafts.length > 0,
      items: [...baseItems, ...webDrafts],
    },
    {
      topic,
    },
  );
  const evidenceStatus =
    preflightPack.evidenceStatus ??
    (preflightPack.items.length > 0 ? "low" : "none");
  const evidenceWarnings = [
    ...(baseEvidencePack?.evidenceWarnings ?? []),
    ...getEvidenceWarnings(evidenceStatus),
  ];

  return normalizeEvidencePack(
    {
      enabled: true,
      evidenceStatus,
      evidenceWarnings,
      items: [...baseItems, ...webDrafts],
      searchProcess: {
        cacheEvents,
        dedupeStats,
        executedQueries: searchQueries,
        searchIntents: searchPlan.searchIntents,
        queryPlans: searchPlan.queryPlans,
        intentDecisions: searchPlan.intentDecisions,
        provider: searchProvider.id,
        providerDiagnostics,
      },
      searchQueries,
      strategy: baseEvidencePack?.strategy ?? "text_pack",
    },
    {
      topic,
    },
  );
}

async function searchWithConfiguredProvider(input: {
  freshness: SearchFreshness;
  provider: SearchProvider;
  query: string;
  searcher?: Searcher;
  topic: string;
}): Promise<SearchProviderResponse> {
  if (input.searcher) {
    const cacheEvents: SearchCacheEvent[] = [];
    const drafts = await input.searcher(input.query, {
      freshness: input.freshness,
      maxResults: WEB_SEARCH_RESULTS_PER_QUERY,
      onCacheEvent: (event) => cacheEvents.push(event),
    });

    return {
      provider: input.provider.id,
      results: drafts.map((draft) => ({
        title: draft.title,
        ...(draft.url ? { url: draft.url } : {}),
        content: draft.snippet,
        snippet: draft.snippet,
        ...(draft.publishedAt ? { publishedDate: draft.publishedAt } : {}),
        sourceQuery: input.query,
        provider: input.provider.id,
      })),
      ...(cacheEvents.length > 0 ? { cacheEvents } : {}),
      diagnostics: {
        adapter: "legacy_searcher",
        resultCount: drafts.length,
      },
    };
  }

  return input.provider.search({
    freshness: input.freshness,
    maxResults: WEB_SEARCH_RESULTS_PER_QUERY,
    query: input.query,
    searchDepth: "basic",
    topic: input.topic,
  });
}

function createProviderDiagnostic(
  response: SearchProviderResponse,
): SearchProviderDiagnostic {
  return {
    provider: response.provider,
    ...(response.diagnostics ? { diagnostics: response.diagnostics } : {}),
    ...(response.rawStats ? { rawStats: response.rawStats } : {}),
  };
}

async function buildParticipantSearchQueries(
  topic: string,
  participants: ModelParticipant[],
  provider: ModelProvider,
): Promise<{
  queries: string[];
  searchIntents: SearchIntentRecord[];
  queryPlans: SearchQueryPlan[];
  intentDecisions: SearchIntentDecision[];
}> {
  const participantPlans = await Promise.all(
    participants.map(async (participant) => {
      try {
        if (provider.generateSearchIntents) {
          return {
            participant,
            intents: await provider.generateSearchIntents(participant, topic),
          };
        }

        if (provider.generateSearchQueries) {
          const queries = await provider.generateSearchQueries(participant, topic);

          return {
            participant,
            intents: queries.map(createLegacySearchIntent),
          };
        }

        return {
          participant,
          intents: [] as SearchIntent[],
        };
      } catch {
        return {
          participant,
          intents: [] as SearchIntent[],
        };
      }
    }),
  );
  const searchIntents = participantPlans.map(({ participant, intents }) => ({
    participantId: participant.id,
    participantName: participant.name,
    provider: participant.provider,
    model: participant.model,
    intents: intents.map(normalizeSearchIntent).filter((intent) => intent.question),
  }));
  const plan = buildTavilySearchPlanFromIntents(topic, searchIntents);

  if (plan.queries.length > 0) {
    return {
      queries: plan.queries.slice(0, MAX_MODEL_DRIVEN_QUERIES),
      searchIntents,
      queryPlans: plan.queryPlans.slice(0, MAX_MODEL_DRIVEN_QUERIES),
      intentDecisions: plan.intentDecisions,
    };
  }

  const fallbackQueries = buildTavilySearchQueries(topic).slice(
    0,
    MAX_MODEL_DRIVEN_QUERIES,
  );

  return {
    queries: fallbackQueries,
    searchIntents: searchIntents.map((intent) => ({
      ...intent,
      intents:
        intent.intents.length > 0
          ? intent.intents
          : fallbackQueries.map(createLegacySearchIntent),
    })),
    queryPlans: fallbackQueries.map((query) => ({
      query,
      reason: "Fallback query generated from the meeting topic.",
      participantIds: participants.map((participant) => participant.id),
      sourcePreference: "mixed" as const,
      freshness: "any" as const,
    })),
    intentDecisions: [
      ...plan.intentDecisions,
      ...fallbackQueries.map((query) => ({
        question: query,
        action: "used" as const,
        reason: "fallback_topic_query",
        query,
      })),
    ],
  };
}

export function buildTavilySearchPlanFromIntents(
  topic: string,
  searchIntents: SearchIntentRecord[],
  options: { currentYear?: number } = {},
): {
  queries: string[];
  queryPlans: SearchQueryPlan[];
  intentDecisions: SearchIntentDecision[];
} {
  const currentYear = options.currentYear ?? new Date().getFullYear();
  const seenQueries = new Map<string, string>();
  const queries: string[] = [];
  const queryPlans: SearchQueryPlan[] = [];
  const intentDecisions: SearchIntentDecision[] = [];

  for (const record of searchIntents) {
    for (const intent of record.intents) {
      const normalizedIntent = normalizeSearchIntent(intent);
      const question = normalizedIntent.question;

      if (isVagueIntent(normalizedIntent)) {
        intentDecisions.push({
          participantId: record.participantId,
          participantName: record.participantName,
          question,
          action: "discarded",
          reason: "vague_intent",
        });
        continue;
      }

      const query = buildQueryFromIntent(topic, normalizedIntent, currentYear);

      if (!query) {
        intentDecisions.push({
          participantId: record.participantId,
          participantName: record.participantName,
          question,
          action: "discarded",
          reason: "empty_query",
        });
        continue;
      }

      const dedupeKey = getQueryDedupeKey(query);
      const existingQuery = seenQueries.get(dedupeKey);

      if (existingQuery) {
        intentDecisions.push({
          participantId: record.participantId,
          participantName: record.participantName,
          question,
          action: "merged",
          reason: "duplicate_query",
          mergedInto: existingQuery,
        });
        continue;
      }

      seenQueries.set(dedupeKey, query);
      queries.push(query);
      queryPlans.push({
        query,
        reason: getQueryGenerationReason(topic, normalizedIntent),
        participantIds: [record.participantId],
        sourcePreference: normalizedIntent.sourcePreference,
        freshness: normalizedIntent.freshness,
      });
      intentDecisions.push({
        participantId: record.participantId,
        participantName: record.participantName,
        question,
        action: "used",
        reason: "usable_query",
        query,
      });

      if (queries.length >= MAX_MODEL_DRIVEN_QUERIES) {
        return { queries, queryPlans, intentDecisions };
      }
    }
  }

  return { queries, queryPlans, intentDecisions };
}

function buildQueryFromIntent(
  topic: string,
  intent: SearchIntent,
  currentYear: number,
): string {
  const terms = [
    intent.question,
    ...intent.mustInclude,
    ...intent.shouldInclude,
    ...getSourcePreferenceTerms(intent.sourcePreference),
    ...getFreshnessTerms(topic, intent, currentYear),
    ...intent.exclude.map((term) => `-${term}`),
  ].flatMap(splitSearchPhrases);
  const compactTerms = Array.from(new Set(terms)).filter(
    (term) => !isLowValueSearchTerm(term),
  );
  const query = trimQueryToLength(compactTerms.join(" "));

  return getMeaningfulTokenCount(query) >= 2 ? query : "";
}

function normalizeSearchIntent(intent: SearchIntent): SearchIntent {
  return {
    question: normalizeSearchText(intent.question, 180),
    mustInclude: intent.mustInclude
      .map((item) => normalizeSearchText(item, 80))
      .filter(Boolean),
    shouldInclude: intent.shouldInclude
      .map((item) => normalizeSearchText(item, 80))
      .filter(Boolean),
    exclude: intent.exclude
      .map((item) => normalizeSearchText(item, 80))
      .filter(Boolean),
    freshness: normalizeFreshness(intent.freshness),
    sourcePreference: normalizeSourcePreference(intent.sourcePreference),
    rationale: normalizeSearchText(intent.rationale, 240),
  };
}

function createLegacySearchIntent(query: string): SearchIntent {
  return {
    question: query,
    mustInclude: [],
    shouldInclude: [],
    exclude: [],
    freshness: "any",
    sourcePreference: "mixed",
    rationale: "Legacy plain-text search query.",
  };
}

function isVagueIntent(intent: SearchIntent): boolean {
  const searchableTerms = [
    intent.question,
    ...intent.mustInclude,
    ...intent.shouldInclude,
  ].flatMap(splitSearchPhrases);
  const meaningfulTerms = searchableTerms.filter(
    (term) => !isLowValueSearchTerm(term),
  );

  return (
    meaningfulTerms.length === 0 ||
    getMeaningfulTokenCount(meaningfulTerms.join(" ")) < 2
  );
}

function splitSearchPhrases(value: string): string[] {
  return value
    .split(/\s+/)
    .map((term) => normalizeSearchText(term, 80))
    .filter(Boolean);
}

function isLowValueSearchTerm(term: string): boolean {
  const normalized = term.toLowerCase();

  return VAGUE_TERMS.has(normalized) || MARKETING_TERMS.has(normalized);
}

function getSourcePreferenceTerms(
  sourcePreference: SearchSourcePreference,
): string[] {
  if (sourcePreference === "official") {
    return ["official", "release"];
  }

  if (sourcePreference === "benchmark") {
    return ["benchmark", "leaderboard", "eval", "official"];
  }

  if (sourcePreference === "media") {
    return ["Reuters", "Bloomberg"];
  }

  if (sourcePreference === "community") {
    return ["community", "discussion"];
  }

  return [];
}

function getFreshnessTerms(
  topic: string,
  intent: SearchIntent,
  currentYear: number,
): string[] {
  if (intent.freshness === "latest") {
    return [`${currentYear}`, "latest"];
  }

  if (intent.freshness === "recent") {
    return [`${currentYear}`, "recent"];
  }

  if (isRealtimeTopic(topic)) {
    return [`${currentYear}`, "latest", "official"];
  }

  return [];
}

function getQueryGenerationReason(topic: string, intent: SearchIntent): string {
  const reasons = [
    `sourcePreference=${intent.sourcePreference}`,
    `freshness=${intent.freshness}`,
  ];

  if (isRealtimeTopic(topic)) {
    reasons.push("topic appears time-sensitive");
  }

  if (isBenchmarkTopic(topic) || intent.sourcePreference === "benchmark") {
    reasons.push("benchmark terms added");
  }

  return reasons.join("; ");
}

function isRealtimeTopic(topic: string): boolean {
  return /latest|current|today|now|ranking|release|price|policy|news|最新|现在|目前|排名|发布|价格|政策/.test(
    topic.toLowerCase(),
  );
}

function isBenchmarkTopic(topic: string): boolean {
  return /benchmark|leaderboard|eval|ranking|model|llm|ai|评测|榜单|排名|模型/.test(
    topic.toLowerCase(),
  );
}

function trimQueryToLength(query: string): string {
  const compact = query.replace(/\s+/g, " ").trim();

  if (compact.length <= MAX_TAVILY_QUERY_LENGTH) {
    return compact;
  }

  const words = compact.split(" ");
  const kept: string[] = [];
  let length = 0;

  for (const word of words) {
    const nextLength = length + word.length + (kept.length > 0 ? 1 : 0);

    if (nextLength > MAX_TAVILY_QUERY_LENGTH) {
      break;
    }

    kept.push(word);
    length = nextLength;
  }

  return kept.join(" ");
}

function getMeaningfulTokenCount(query: string): number {
  return query.match(/[\p{L}\p{N}][\p{L}\p{N}.-]*/gu)?.length ?? 0;
}

function getQueryDedupeKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return compact.slice(0, maxLength).replace(/\s+\S*$/, "").trim();
}

function normalizeFreshness(value: SearchFreshness): SearchFreshness {
  return value === "latest" || value === "recent" || value === "any"
    ? value
    : "any";
}

function normalizeSourcePreference(
  value: SearchSourcePreference,
): SearchSourcePreference {
  return value === "official" ||
    value === "benchmark" ||
    value === "media" ||
    value === "community" ||
    value === "mixed"
    ? value
    : "mixed";
}

function getEvidenceWarnings(status: string): string[] {
  if (status === "low") {
    return [
      "未找到高质量联网资料，已切换为低证据会议模式。本次会议仍会继续，但涉及实时事实的结论请人工核验。",
    ];
  }

  if (status === "none") {
    return [
      "未找到可用联网资料，本次会议将主要基于模型已有知识和推理，涉及实时事实请人工核验。",
    ];
  }

  return [];
}
