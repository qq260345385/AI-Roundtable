import type {
  EvidencePack,
  SearchEvidence,
  SearchCacheEvent,
  SearchFreshness,
  SearchIntent,
  SearchIntentDecision,
  SearchIntentRecord,
  SearchMode,
  SearchProviderDiagnostic,
  SearchQueryPlan,
  SearchSourcePreference,
} from "./evidence-pack";
import {
  createSearchFailureProcess,
  normalizeEvidencePack,
  scoreEvidence,
} from "./evidence-pack";
import {
  buildTavilySearchQueries,
  dedupeSearchResults,
  getTavilyFailureReason,
  TavilySearchError,
  type TavilyEvidenceDraft,
} from "./tavily-search";
import { getSearchProvider } from "./search-provider-registry";
import { getExtractProvider } from "./extract-provider-registry";
import type { ExtractProvider } from "./extract-provider";
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
const RESCUE_TRIGGER_USABLE_THRESHOLD = 3;
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

type SearchModeConfig = {
  candidateLimit: number;
  extractLimit: number;
  finalLimit: number;
  chunksPerSource: number;
};

type CandidatePoolItem = {
  draft: TavilyEvidenceDraft & { url: string };
  status: "usable" | "needs_extract" | "context_only" | "filtered";
  score: number;
};

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
  extractProvider?: ExtractProvider;
  participants: ModelParticipant[];
  provider: ModelProvider;
  searchMode?: SearchMode;
  searchProvider?: SearchProvider;
  searcher?: Searcher;
  topic: string;
};

export async function buildModelDrivenWebEvidencePack({
  baseEvidencePack,
  extractProvider = getExtractProvider(),
  participants,
  provider,
  searchMode = "standard",
  searchProvider = getSearchProvider(),
  searcher,
  topic,
}: BuildModelDrivenWebEvidencePackOptions): Promise<EvidencePack> {
  const modeConfig = getSearchModeConfig(searchMode);
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
  let rawCandidateCount = 0;
  let rescueTriggered = false;
  let rescueReason: string | undefined;
  let extractAttempted = 0;
  let extractedCandidateCount = 0;
  let extractSucceededCount = 0;

  try {
    const maxResultsPerQuery = getMaxResultsPerQuery(
      modeConfig.candidateLimit,
      searchQueries.length,
    );
    const rawWebDrafts = (
      await Promise.all(
        searchQueries.map((query) =>
          searchWithConfiguredProvider({
            freshness: freshnessByQuery.get(query) ?? "any",
            maxResults: maxResultsPerQuery,
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
    rawCandidateCount = rawWebDrafts.length;
    const deduped = dedupeSearchResults(rawWebDrafts);

    webDrafts = deduped.items.slice(0, modeConfig.candidateLimit);
    dedupeStats = deduped.stats;

    const preflightPack = normalizeEvidencePack(
      {
        enabled: webDrafts.length > 0,
        items: webDrafts,
      },
      {
        maxItems: modeConfig.finalLimit,
        topic,
      },
    );

    if (
      preflightPack.items.length < RESCUE_TRIGGER_USABLE_THRESHOLD &&
      webDrafts.some((draft) => draft.url)
    ) {
      rescueTriggered = true;
      rescueReason = "usable_evidence_below_threshold";
      const rescueCandidates = selectRescueCandidates(
        webDrafts,
        topic,
        modeConfig.extractLimit,
      );
      const fallbackRescueCandidates =
        rescueCandidates.length > 0
          ? rescueCandidates
          : webDrafts
              .filter((draft): draft is TavilyEvidenceDraft & { url: string } =>
                Boolean(draft.url),
              )
              .slice(0, modeConfig.extractLimit);

      extractAttempted = fallbackRescueCandidates.length;

      if (fallbackRescueCandidates.length > 0) {
        try {
          const extractResponse = await extractProvider.extract({
            urls: fallbackRescueCandidates.map((candidate) => candidate.url),
            query: getRescueQuery(topic, searchPlan.searchIntents),
            chunksPerSource: modeConfig.chunksPerSource,
            extractDepth: searchMode === "deep" ? "advanced" : "basic",
          });
          const extractedDrafts = extractResponse.results.map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.content,
            query: result.sourceQuery,
          }));

          extractedCandidateCount = extractedDrafts.length;
          extractSucceededCount = extractedDrafts.filter((draft) =>
            draft.snippet.trim(),
          ).length;

          const rescuedDeduped = dedupeSearchResults([
            ...webDrafts,
            ...extractedDrafts,
          ]);

          webDrafts = rescuedDeduped.items.slice(0, modeConfig.candidateLimit);
          dedupeStats = mergeDedupeStats(dedupeStats, rescuedDeduped.stats);
          providerDiagnostics.push({
            provider: extractResponse.provider,
            displayName: extractProvider.displayName,
            ...(extractResponse.diagnostics
              ? { diagnostics: extractResponse.diagnostics }
              : {}),
            ...(extractResponse.rawStats ? { rawStats: extractResponse.rawStats } : {}),
          });
        } catch (error) {
          rescueReason = `extract_failed:${getTavilyFailureReason(error)}`;
        }
      }
    }
  } catch (error) {
    const failureReason = getTavilyFailureReason(error);
    const failureDiagnostics =
      error instanceof TavilySearchError && error.diagnostics
        ? [
            ...providerDiagnostics,
            {
              provider: "tavily",
              diagnostics: error.diagnostics as unknown as Record<string, unknown>,
            },
          ]
        : providerDiagnostics;

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
          providerDiagnostics: failureDiagnostics,
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
      maxItems: modeConfig.finalLimit,
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
        dedupedCandidateCount: webDrafts.length,
        evidenceMode:
          rescueTriggered && extractSucceededCount > 0
            ? "rescued_evidence"
            : undefined,
        executedQueries: searchQueries,
        extractAttempted,
        extractedCandidateCount,
        extractSucceededCount,
        finalEvidenceCount: preflightPack.items.length,
        qualityDistribution: getQualityDistribution(preflightPack.items),
        rawCandidateCount,
        rescueReason,
        rescueTriggered,
        searchMode,
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
      maxItems: modeConfig.finalLimit,
      topic,
    },
  );
}

async function searchWithConfiguredProvider(input: {
  freshness: SearchFreshness;
  maxResults: number;
  provider: SearchProvider;
  query: string;
  searcher?: Searcher;
  topic: string;
}): Promise<SearchProviderResponse> {
  if (input.searcher) {
    const cacheEvents: SearchCacheEvent[] = [];
    const drafts = await input.searcher(input.query, {
      freshness: input.freshness,
      maxResults: input.maxResults,
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
    maxResults: input.maxResults,
    query: input.query,
    searchDepth: "basic",
    topic: input.topic,
  });
}

function getSearchModeConfig(searchMode: SearchMode): SearchModeConfig {
  if (searchMode === "deep") {
    return {
      candidateLimit: 60,
      extractLimit: 18,
      finalLimit: 10,
      chunksPerSource: 3,
    };
  }

  return {
    candidateLimit: 20,
    extractLimit: 8,
    finalLimit: 8,
    chunksPerSource: 2,
  };
}

function getMaxResultsPerQuery(candidateLimit: number, queryCount: number) {
  if (queryCount <= 0) {
    return WEB_SEARCH_RESULTS_PER_QUERY;
  }

  return Math.max(1, Math.ceil(candidateLimit / queryCount));
}

function selectRescueCandidates(
  drafts: TavilyEvidenceDraft[],
  topic: string,
  limit: number,
) {
  return drafts
    .flatMap((draft): CandidatePoolItem[] => {
      if (!draft.url) {
        return [];
      }

      const quality = scoreEvidence({
        title: draft.title,
        url: draft.url,
        source: draft.source,
        publishedAt: draft.publishedAt,
        snippet: draft.snippet,
        topic,
      });
      const status = getCandidateStatus(draft, quality.reliability);

      if (status === "filtered") {
        return [];
      }

      return [
        {
          draft: { ...draft, url: draft.url },
          status,
          score: quality.score ?? 0,
        },
      ];
    })
    .sort(compareCandidatePoolItems)
    .slice(0, limit)
    .map((candidate) => candidate.draft);
}

function getCandidateStatus(
  draft: TavilyEvidenceDraft,
  reliability: "high" | "medium" | "low" | "very_low",
): CandidatePoolItem["status"] {
  if (!draft.url) {
    return "filtered";
  }

  if (!draft.snippet.trim() || draft.snippet.length < 300) {
    return "needs_extract";
  }

  if (reliability === "very_low") {
    return "needs_extract";
  }

  if (reliability === "low") {
    return "context_only";
  }

  return "usable";
}

function compareCandidatePoolItems(
  left: CandidatePoolItem,
  right: CandidatePoolItem,
) {
  const statusDelta =
    getCandidateStatusRank(left.status) - getCandidateStatusRank(right.status);

  if (statusDelta !== 0) {
    return statusDelta;
  }

  return right.score - left.score;
}

function getCandidateStatusRank(status: CandidatePoolItem["status"]) {
  return {
    usable: 0,
    context_only: 1,
    needs_extract: 2,
    filtered: 3,
  }[status];
}

function getRescueQuery(topic: string, records: SearchIntentRecord[]) {
  return (
    records
      .flatMap((record) => record.intents.map((intent) => intent.question))
      .find(Boolean) ?? topic
  );
}

function getQualityDistribution(items: SearchEvidence[]) {
  return {
    high: items.filter((item) => item.quality?.reliability === "high").length,
    medium: items.filter((item) => item.quality?.reliability === "medium").length,
    low: items.filter((item) => item.quality?.reliability === "low").length,
    very_low: items.filter(
      (item) => item.quality?.reliability === "very_low",
    ).length,
  };
}

function mergeDedupeStats(
  original: ReturnType<typeof dedupeSearchResults>["stats"] | undefined,
  rescued: ReturnType<typeof dedupeSearchResults>["stats"],
) {
  if (!original) {
    return rescued;
  }

  return {
    originalResultCount: original.originalResultCount,
    dedupedResultCount: rescued.dedupedResultCount,
    removedDuplicateCount:
      original.removedDuplicateCount + rescued.removedDuplicateCount,
    removedSameDomainCount:
      original.removedSameDomainCount + rescued.removedSameDomainCount,
    removals: [...original.removals, ...rescued.removals],
    ...(original.domainLimitRelaxedReason || rescued.domainLimitRelaxedReason
      ? {
          domainLimitRelaxedReason:
            rescued.domainLimitRelaxedReason ?? original.domainLimitRelaxedReason,
        }
      : {}),
  };
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
