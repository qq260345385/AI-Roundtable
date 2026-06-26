import type {
  SearchFreshness,
  SearchIntent,
  SearchIntentDecision,
  SearchIntentRecord,
  SearchQueryLevel,
  SearchQueryPlan,
  SearchQueryQuality,
  SearchSourcePreference,
  TopicAnalysis,
} from "./evidence-pack";
import {
  analyzeTopicForEvidence,
  formatDimensionSearchTerm,
} from "./evidence-pack";
import {
  buildTavilySearchQueries,
  SEARCH_REGION_COUNTRY_MAP,
} from "./tavily-search";
import type { ModelParticipant, ModelProvider } from "../types";

export const MAX_MODEL_DRIVEN_QUERIES = 8;
export const MAX_TAVILY_QUERY_LENGTH = 160;
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
const SOURCE_NAME_QUERY_TERMS = new Set([
  "reuters",
  "bloomberg",
  "ft",
  "wsj",
  "nytimes",
  "semiAnalysis".toLowerCase(),
  "epoch",
  "arxiv",
  "mlcommons",
  "stanford",
  "techcrunch",
  "wired",
  "engadget",
  "theverge",
]);
export const TRUSTED_MEDIA_DOMAINS = [
  "reuters.com",
  "bloomberg.com",
  "ft.com",
  "wsj.com",
  "nytimes.com",
  "theinformation.com",
  "techcrunch.com",
  "theverge.com",
  "wired.com",
  "engadget.com",
  "arstechnica.com",
];
export const LOCALIZED_MEDIA_DOMAINS = [
  "people.com.cn",
  "people.cn",
  "stcn.com",
  "globaltimes.cn",
  "gasgoo.com",
  "finance.yahoo.com",
  "tw.stock.yahoo.com",
  "36kr.com",
];
export const INDUSTRY_REPORT_DOMAINS = [
  "semianalysis.com",
  "epoch.ai",
  "stanford.edu",
  "arxiv.org",
  "mlcommons.org",
];
export const SOCIAL_VIDEO_DOMAINS = [
  "reddit.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "instagram.com",
  "tiktok.com",
];

export type SearchPassName =
  | "general_web"
  | "official"
  | "localized_media"
  | "reputable_media"
  | "industry_report"
  | "social_clue"
  | "targeted_retry";

export type SearchPassSpec = {
  name: SearchPassName;
  query: string;
  freshness: SearchFreshness;
  queryLevel?: SearchQueryLevel;
  derivedFrom?: string;
  queryQuality?: SearchQueryQuality;
  chunksPerSource?: number;
  country?: string;
  excludeDomains?: string[];
  includeDomains?: string[];
  includeRawContent?: boolean | "markdown" | "text";
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  searchTopic?: "general" | "news" | "finance";
  timeRange?: "day" | "week" | "month" | "year" | "d" | "w" | "m" | "y";
};
export function buildGeneralWebPass(
  topicAnalysis: TopicAnalysis,
  fallbackQuery: string,
  queryLevel: SearchQueryLevel,
): SearchPassSpec {
  const query =
    selectBestTopicAnalysisQuery(topicAnalysis, fallbackQuery) ??
    buildQueryFromTopicAnalysisParts(topicAnalysis, fallbackQuery);
  const pass: SearchPassSpec = {
    name: "general_web",
    query,
    freshness: topicAnalysis.freshnessRequirement ?? "recent",
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange(topicAnalysis.freshnessRequirement ?? "recent"),
  };

  annotateSearchPass(pass, queryLevel, "topic_analysis", topicAnalysis);

  return pass;
}

function buildGeneralCandidateRetrievalPasses(
  topicAnalysis: TopicAnalysis,
  fallbackQuery: string,
): SearchPassSpec[] {
  return buildShortCandidateRetrievalQueries(topicAnalysis, fallbackQuery)
    .slice(0, 5)
    .map((query, index) => {
      const pass: SearchPassSpec = {
        name: "general_web",
        query,
        freshness: topicAnalysis.freshnessRequirement ?? "recent",
        searchDepth: index === 0 ? "basic" : "advanced",
        searchTopic: "general",
        timeRange: getTavilyTimeRange(
          topicAnalysis.freshnessRequirement ?? "recent",
        ),
      };

      annotateSearchPass(
        pass,
        index === 0 ? "precise" : index <= 2 ? "scenario" : "evidence_type",
        "topic_analysis:candidate_retrieval",
        topicAnalysis,
      );

      return pass;
    });
}

function buildShortCandidateRetrievalQueries(
  topicAnalysis: TopicAnalysis,
  fallbackQuery: string,
): string[] {
  const entities = getSearchEntityTerms(topicAnalysis).slice(0, 4);
  const scenarios = topicAnalysis.targetScenarios
    .map((scenario) => normalizeSearchQueryTerms(scenario, topicAnalysis))
    .filter(Boolean)
    .slice(0, 4);
  const evidenceTerms = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .map((term) => normalizeSearchQueryTerms(term, topicAnalysis))
    .filter(Boolean)
    .slice(0, 4);
  const axes = topicAnalysis.comparisonAxes
    .map((axis) => normalizeSearchQueryTerms(axis.replace(/_/g, " "), topicAnalysis))
    .filter(Boolean)
    .slice(0, 3);
  const seeds = [
    [...entities, ...(scenarios.length > 0 ? scenarios.slice(0, 2) : evidenceTerms.slice(0, 2))],
    ...scenarios.map((scenario) => [...entities, scenario]),
    ...evidenceTerms.map((term) => [...entities, term]),
    [...entities, ...axes.slice(0, 2)],
    [...entities, "official", "product"],
    [...entities, "evaluation", "report"],
    [...entities, "user feedback", "community"],
    [normalizeSearchQueryTerms(fallbackQuery, topicAnalysis)],
    ...topicAnalysis.searchQueries.map((query) => [
      normalizeSearchQueryTerms(query, topicAnalysis),
    ]),
  ];
  const seen = new Set<string>();
  const queries: string[] = [];

  for (const parts of seeds) {
    const query = trimSearchTermsToLength(
      dedupeQueryParts(
        parts
          .flatMap(splitSearchPhrases)
          .map(stripSearchTermPunctuation)
          .filter(Boolean)
          .filter((part) => !isResidualEntityFragment(part, topicAnalysis)),
      ),
      120,
    );
    const quality = evaluateSearchQueryQuality(query, topicAnalysis);
    const key = getQueryDedupeKey(query);

    if (!query || !quality.ok || seen.has(key)) {
      continue;
    }

    seen.add(key);
    queries.push(query);
  }

  return queries.length > 0
    ? queries
    : [normalizeSearchQueryTerms(fallbackQuery, topicAnalysis)].filter(Boolean);
}

function trimSearchTermsToLength(terms: string[], maxLength: number): string {
  const selected: string[] = [];

  for (const term of terms) {
    const candidate = [...selected, term].join(" ");

    if (candidate.length > maxLength) {
      continue;
    }

    selected.push(term);
  }

  return trimQueryToLength(selected.join(" "));
}

export function getSearchEntityTerms(topicAnalysis: TopicAnalysis): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];

  for (const entity of topicAnalysis.targetEntities) {
    const normalized = stripSearchTermPunctuation(entity).trim();
    const lower = normalized.toLowerCase();

    if (
      !normalized ||
      seen.has(lower) ||
      isLowValueSearchTerm(normalized) ||
      isResidualEntityFragment(normalized, topicAnalysis) ||
      isLikelyScenarioFragment(normalized, topicAnalysis)
    ) {
      continue;
    }

    seen.add(lower);
    terms.push(normalized);
  }

  return terms;
}

function isLikelyScenarioFragment(
  value: string,
  topicAnalysis: TopicAnalysis,
): boolean {
  const normalized = value.toLowerCase();

  if (!/[\u4e00-\u9fff]/.test(value)) {
    return false;
  }

  if (value.length > 10) {
    return true;
  }

  return topicAnalysis.targetScenarios.some((scenario) => {
    const scenarioText = scenario.toLowerCase();

    return scenarioText.length >= 2 && normalized.includes(scenarioText);
  });
}

export function selectBestTopicAnalysisQuery(
  topicAnalysis: TopicAnalysis,
  fallbackQuery: string,
): string | undefined {
  const candidates = [
    ...topicAnalysis.searchQueries,
    buildQueryFromTopicAnalysisParts(topicAnalysis, fallbackQuery),
    fallbackQuery,
  ]
    .map((query) => normalizeSearchQueryTerms(query, topicAnalysis))
    .filter(Boolean);
  const ranked = candidates
    .map((query) => ({
      query,
      quality: evaluateSearchQueryQuality(query, topicAnalysis),
    }))
    .filter((candidate) => candidate.quality.ok)
    .sort((left, right) => {
      const leftScore =
        scoreSearchQueryCandidate(left.query, left.quality) +
        scoreTopicAnalysisQueryCoverage(left.query, topicAnalysis);
      const rightScore =
        scoreSearchQueryCandidate(right.query, right.quality) +
        scoreTopicAnalysisQueryCoverage(right.query, topicAnalysis);

      return rightScore - leftScore;
    });

  return ranked[0]?.query;
}

function scoreTopicAnalysisQueryCoverage(
  query: string,
  topicAnalysis: TopicAnalysis,
): number {
  const normalized = query.toLowerCase();

  return topicAnalysis.evidenceNeeds.reduce((score, need) => {
    const terms = splitSearchPhrases(formatDimensionSearchTerm(need.dimension))
      .map((term) => term.toLowerCase())
      .filter((term) => term.length >= 3);
    const hasTerm = terms.some((term) => normalized.includes(term));

    return score + (hasTerm ? 12 : 0);
  }, 0);
}

function scoreSearchQueryCandidate(
  query: string,
  quality: SearchQueryQuality,
): number {
  const lengthPenalty = Math.max(0, query.length - 120) * 0.2;

  return (
    (quality.hasEntity ? 40 : 0) +
    (quality.hasScenarioOrEvidenceNeed ? 35 : 0) +
    Math.min(quality.tokenCount, 10) * 3 -
    quality.duplicateRatio * 40 -
    lengthPenalty
  );
}

export function buildQueryFromTopicAnalysisParts(
  topicAnalysis: TopicAnalysis,
  fallbackQuery: string,
): string {
  const dimensions = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .filter(Boolean)
    .slice(0, topicAnalysis.topicType === "entity_competition" ? 5 : 3);
  const parts = [
    ...topicAnalysis.targetEntities.slice(0, 5),
    ...topicAnalysis.targetScenarios.slice(0, 3),
    ...dimensions,
  ];
  const query = normalizeSearchQueryTerms(parts.join(" "), topicAnalysis);

  if (getMeaningfulTokenCount(query) >= 2) {
    return query;
  }

  return normalizeSearchQueryTerms(fallbackQuery, topicAnalysis);
}

export function normalizeSearchQueryTerms(
  query: string,
  topicAnalysis: TopicAnalysis,
): string {
  const terms = splitSearchPhrases(query)
    .map((term) => stripSearchTermPunctuation(term))
    .filter(Boolean)
    .filter((term) => !isLowValueSearchTerm(term))
    .filter((term) => !isResidualEntityFragment(term, topicAnalysis));

  return trimQueryToLength(dedupeQueryParts(terms).join(" "));
}

export function annotateSearchPass(
  pass: SearchPassSpec,
  queryLevel: SearchQueryLevel,
  derivedFrom: string,
  topicAnalysis: TopicAnalysis,
) {
  pass.queryLevel = queryLevel;
  pass.derivedFrom = derivedFrom;
  pass.queryQuality = evaluateSearchQueryQuality(pass.query, topicAnalysis);
}

export function evaluateSearchQueryQuality(
  query: string,
  topicAnalysis: TopicAnalysis,
): SearchQueryQuality {
  const tokens = splitSearchPhrases(query)
    .map(stripSearchTermPunctuation)
    .filter(Boolean);
  const normalizedQuery = query.toLowerCase();
  const uniqueTokens = new Set(tokens.map((token) => token.toLowerCase()));
  const duplicateRatio =
    tokens.length === 0 ? 1 : 1 - uniqueTokens.size / tokens.length;
  const hasResidualFragment = tokens.some((token) =>
    isResidualEntityFragment(token, topicAnalysis),
  );
  const sourceNameTokenCount = tokens.filter((token) =>
    SOURCE_NAME_QUERY_TERMS.has(token.toLowerCase()),
  ).length;
  const onlySourceNames =
    tokens.length > 0 && sourceNameTokenCount === tokens.length;
  const hasEntity = topicAnalysis.targetEntities.some((entity) =>
    normalizedQuery.includes(entity.toLowerCase()),
  );
  const scenarioTerms = topicAnalysis.targetScenarios.map((scenario) =>
    scenario.toLowerCase(),
  );
  const evidenceTerms = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .flatMap(splitSearchPhrases)
    .map((term) => term.toLowerCase());
  const hasScenarioOrEvidenceNeed = [...scenarioTerms, ...evidenceTerms].some(
    (term) => term.length >= 2 && normalizedQuery.includes(term),
  );
  const topicAnchorTokens = splitSearchPhrases(topicAnalysis.cleanedTopic)
    .filter((token) => !isLowValueSearchTerm(token))
    .map((token) => token.toLowerCase());
  const hasTopicAnchor = topicAnchorTokens.some((token) =>
    normalizedQuery.includes(token),
  );
  const lacksAnalyzerAnchor =
    !topicAnalysis.cleanedTopic &&
    topicAnalysis.targetEntities.length === 0 &&
    topicAnalysis.targetScenarios.length === 0;
  const ok =
    !lacksAnalyzerAnchor &&
    tokens.length >= 2 &&
    query.length <= MAX_TAVILY_QUERY_LENGTH &&
    duplicateRatio <= 0.55 &&
    !hasResidualFragment &&
    !onlySourceNames &&
    (hasEntity || hasScenarioOrEvidenceNeed || hasTopicAnchor);
  const reason = ok
    ? undefined
    : lacksAnalyzerAnchor
      ? "missing_topic_anchor"
      : tokens.length < 2
        ? "too_few_meaningful_tokens"
        : query.length > MAX_TAVILY_QUERY_LENGTH
          ? "query_too_long"
        : duplicateRatio > 0.55
          ? "duplicate_terms"
          : hasResidualFragment
            ? "residual_entity_fragment"
            : onlySourceNames
              ? "source_names_only"
              : "missing_entity_or_scenario_anchor";

  return {
    ok,
    ...(reason ? { reason } : {}),
    hasEntity,
    hasScenarioOrEvidenceNeed,
    tokenCount: tokens.length,
    duplicateRatio: Number(duplicateRatio.toFixed(3)),
  };
}

export function buildSearchPasses(
  topic: string,
  plannedQueries: string[],
  topicAnalysis: TopicAnalysis = analyzeTopicForEvidence(topic),
): SearchPassSpec[] {
  if (topicAnalysis.topicType === "entity_competition") {
    return buildEntityCompetitionSearchPasses(
      topic,
      topicAnalysis,
      plannedQueries,
    );
  }

  const rawBaseQuery =
    plannedQueries.find(Boolean) ?? topicAnalysis.searchQueries.find(Boolean) ?? topic;
  const baseQuery =
    selectBestTopicAnalysisQuery(topicAnalysis, rawBaseQuery) ??
    buildQueryFromTopicAnalysisParts(topicAnalysis, rawBaseQuery);
  const plannedQueryContext = normalizeSearchQueryTerms(
    plannedQueries.slice(0, 2).join(" "),
    topicAnalysis,
  );
  const isChinese = isPrimaryChineseTopic(topic);
  const localizedPasses = buildLocalizedMediaPasses(topic, topicAnalysis);
  const generalWebPasses = buildGeneralCandidateRetrievalPasses(
    topicAnalysis,
    baseQuery,
  );

  const officialPass: SearchPassSpec = {
    name: "official",
    query: isChinese
      ? trimQueryToLength(`${plannedQueryContext} ${baseQuery} 官方 发布 公告`)
      : trimQueryToLength(
          `${baseQuery} official statement official blog official docs announcement report ${plannedQueryContext}`,
    ),
    freshness: "latest",
    includeDomains: buildOfficialDomainCandidates(topic, topicAnalysis),
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("latest"),
  };
  if (isChinese) {
    officialPass.query = trimQueryToLength(
      `${plannedQueryContext} ${baseQuery} 官方 发布 公告`,
    );
  }

  if (isChinese) {
    officialPass.query = trimQueryToLength(
      `\u5b98\u65b9 \u53d1\u5e03 \u516c\u544a ${baseQuery} ${plannedQueryContext}`,
    );
  }

  const reputableMediaPass: SearchPassSpec = {
    name: "reputable_media",
    query: trimQueryToLength(
      `${baseQuery} independent analysis market report user feedback ${plannedQueryContext}`,
    ),
    freshness: "latest",
    includeDomains: TRUSTED_MEDIA_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "news",
    timeRange: getTavilyTimeRange("latest"),
  };

  const industryReportPass: SearchPassSpec = {
    name: "industry_report",
    query: trimQueryToLength(
      `${baseQuery} benchmark evaluation industry report technical analysis`,
    ),
    freshness: "recent",
    includeDomains: INDUSTRY_REPORT_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };

  const socialCluePass: SearchPassSpec = {
    name: "social_clue",
    query: trimQueryToLength(
      `${baseQuery} user feedback discussion community sentiment`,
    ),
    freshness: "recent",
    includeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "fast",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };
  annotateSearchPass(officialPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(reputableMediaPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(industryReportPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(socialCluePass, "scenario", "topic_analysis", topicAnalysis);
  for (const localizedPass of localizedPasses) {
    annotateSearchPass(localizedPass, "scenario", "topic_analysis", topicAnalysis);
  }

  if (isChinese) {
    return [
      ...generalWebPasses,
      ...localizedPasses,
      officialPass,
      reputableMediaPass,
      industryReportPass,
      socialCluePass,
    ];
  }

  return [
    ...generalWebPasses,
    officialPass,
    ...localizedPasses,
    reputableMediaPass,
    industryReportPass,
    socialCluePass,
  ];
}

export function selectSearchPassesForExecution(
  passes: SearchPassSpec[],
  topicAnalysis: TopicAnalysis,
): {
  selected: SearchPassSpec[];
  skipped: { pass: SearchPassSpec; reason: string }[];
} {
  const skipped: { pass: SearchPassSpec; reason: string }[] = [];
  const executable: SearchPassSpec[] = [];

  for (const pass of passes) {
    const prepared = prepareSearchPassForExecution(pass, topicAnalysis);

    if (prepared.pass) {
      executable.push(prepared.pass);
    } else {
      skipped.push({ pass: prepared.originalPass, reason: prepared.reason });
    }
  }

  const general = executable.find((pass) => pass.name === "general_web");
  const orderedOthers = executable
    .filter((pass) => pass !== general)
    .sort((left, right) => {
      const priorityDelta =
        getSearchPassExecutionPriority(left, topicAnalysis) -
        getSearchPassExecutionPriority(right, topicAnalysis);

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return (
        scoreSearchQueryCandidate(right.query, right.queryQuality ?? evaluateSearchQueryQuality(right.query, topicAnalysis)) -
        scoreSearchQueryCandidate(left.query, left.queryQuality ?? evaluateSearchQueryQuality(left.query, topicAnalysis))
      );
    });
  const selected = [...(general ? [general] : []), ...orderedOthers];
  const selectedKeys = new Set(selected.map((pass) => getSearchPassInstanceKey(pass)));

  for (const pass of executable) {
    if (!selectedKeys.has(getSearchPassInstanceKey(pass))) {
      skipped.push({
        pass,
        reason: "dynamic_pass_limit",
      });
    }
  }

  return { selected, skipped };
}

export function prepareSearchPassForExecution(
  pass: SearchPassSpec,
  topicAnalysis: TopicAnalysis,
): { originalPass: SearchPassSpec; pass?: SearchPassSpec; reason: string } {
  const quality = pass.queryQuality ?? evaluateSearchQueryQuality(pass.query, topicAnalysis);

  if (quality.ok) {
    return {
      originalPass: pass,
      pass: {
        ...pass,
        queryQuality: quality,
      },
      reason: "ready",
    };
  }

  const rebuiltQuery = rebuildSearchPassQuery(pass, topicAnalysis);
  const rebuiltQuality = evaluateSearchQueryQuality(rebuiltQuery, topicAnalysis);

  if (rebuiltQuery && rebuiltQuality.ok) {
    return {
      originalPass: pass,
      pass: {
        ...pass,
        query: rebuiltQuery,
        queryQuality: rebuiltQuality,
        derivedFrom: `${pass.derivedFrom ?? "topic_analysis"}:rebuilt`,
      },
      reason: "rebuilt",
    };
  }

  return {
    originalPass: {
      ...pass,
      queryQuality: quality,
    },
    reason: "query_quality_gate",
  };
}

function rebuildSearchPassQuery(
  pass: SearchPassSpec,
  topicAnalysis: TopicAnalysis,
): string {
  const base = buildQueryFromTopicAnalysisParts(topicAnalysis, pass.query);

  if (pass.name === "official") {
    if (/[\p{Script=Han}]/u.test(topicAnalysis.cleanedTopic)) {
      return normalizeSearchQueryTerms(`${base} 官方 发布 公告`, topicAnalysis);
    }

    return normalizeSearchQueryTerms(`${base} official statement announcement`, topicAnalysis);
  }

  if (pass.name === "reputable_media") {
    return normalizeSearchQueryTerms(`${base} independent analysis report`, topicAnalysis);
  }

  if (pass.name === "industry_report") {
    return normalizeSearchQueryTerms(`${base} benchmark evaluation industry report`, topicAnalysis);
  }

  if (pass.name === "social_clue") {
    return normalizeSearchQueryTerms(`${base} user feedback discussion`, topicAnalysis);
  }

  return base;
}

function getSearchPassExecutionPriority(
  pass: SearchPassSpec,
  topicAnalysis: TopicAnalysis,
): number {
  if (pass.name === "general_web") return 0;
  if (pass.name === "localized_media") return 10;

  const dimensions = new Set(topicAnalysis.evidenceNeeds.map((need) => need.dimension));

  if (pass.name === "official") {
    if (
      topicAnalysis.topicType === "policy_regulation" ||
      topicAnalysis.topicType === "product_release_analysis" ||
      dimensions.has("official_position") ||
      dimensions.has("business_revenue") ||
      dimensions.has("enterprise_adoption") ||
      dimensions.has("funding_capital") ||
      dimensions.has("market_analysis")
    ) {
      return 12;
    }

    return 25;
  }

  if (pass.name === "industry_report") {
    if (
      dimensions.has("technical_capability") ||
      dimensions.has("benchmark_evaluation") ||
      topicAnalysis.topicType === "capability_comparison" ||
      topicAnalysis.topicType === "technical_research_analysis"
    ) {
      return 15;
    }

    return 35;
  }

  if (pass.name === "reputable_media") {
    if (
      dimensions.has("business_revenue") ||
      dimensions.has("enterprise_adoption") ||
      dimensions.has("funding_capital") ||
      dimensions.has("market_analysis") ||
      topicAnalysis.timeSensitivity !== "low"
    ) {
      return 18;
    }

    return 30;
  }

  if (pass.name === "social_clue") {
    return dimensions.has("user_feedback") ? 22 : 50;
  }

  return 40;
}

function getSearchPassInstanceKey(pass: SearchPassSpec): string {
  return `${pass.name}:${pass.query}`;
}

function buildEntityCompetitionSearchPasses(
  topic: string,
  topicAnalysis: TopicAnalysis = analyzeTopicForEvidence(topic),
  plannedQueries: string[] = [],
): SearchPassSpec[] {
  const isChinese = isPrimaryChineseTopic(topic);
  const localizedPasses = buildLocalizedMediaPasses(topic, topicAnalysis);
  const rawBaseQuery =
    topicAnalysis.searchQueries.find(Boolean) ?? plannedQueries.find(Boolean) ?? topic;
  const baseQuery =
    selectBestTopicAnalysisQuery(topicAnalysis, rawBaseQuery) ??
    buildQueryFromTopicAnalysisParts(topicAnalysis, rawBaseQuery);
  const generalWebPasses = buildGeneralCandidateRetrievalPasses(
    topicAnalysis,
    baseQuery,
  );
  const needsQuery = topicAnalysis.evidenceNeeds
    .map((need) => formatDimensionSearchTerm(need.dimension))
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");

  const officialPass: SearchPassSpec = {
    name: "official",
    query: isChinese
      ? trimQueryToLength(`${baseQuery} 官方 ${needsQuery}`)
      : trimQueryToLength(
          `${baseQuery} official statement ${needsQuery}`,
        ),
    freshness: "latest",
    includeDomains: buildOfficialDomainCandidates(topic, topicAnalysis),
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("latest"),
  };
  if (isChinese) {
    officialPass.query = trimQueryToLength(`${baseQuery} 官方 ${needsQuery}`);
  }

  if (isChinese) {
    officialPass.query = trimQueryToLength(
      `\u5b98\u65b9 ${baseQuery} ${needsQuery}`,
    );
  }

  const reputableMediaPass: SearchPassSpec = {
    name: "reputable_media",
    query: trimQueryToLength(
      `${baseQuery} independent analysis market report ${needsQuery}`,
    ),
    freshness: "latest",
    includeDomains: TRUSTED_MEDIA_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "news",
    timeRange: getTavilyTimeRange("latest"),
  };

  const industryReportPass: SearchPassSpec = {
    name: "industry_report",
    query: trimQueryToLength(
      `${baseQuery} industry report benchmark evaluation ${needsQuery}`,
    ),
    freshness: "recent",
    includeDomains: INDUSTRY_REPORT_DOMAINS,
    excludeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "basic",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };

  const socialCluePass: SearchPassSpec = {
    name: "social_clue",
    query: trimQueryToLength(
      `${baseQuery} user feedback discussion community sentiment`,
    ),
    freshness: "recent",
    includeDomains: SOCIAL_VIDEO_DOMAINS,
    searchDepth: "fast",
    searchTopic: "general",
    timeRange: getTavilyTimeRange("recent"),
  };
  annotateSearchPass(officialPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(reputableMediaPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(industryReportPass, "evidence_type", "topic_analysis", topicAnalysis);
  annotateSearchPass(socialCluePass, "scenario", "topic_analysis", topicAnalysis);
  for (const localizedPass of localizedPasses) {
    annotateSearchPass(localizedPass, "scenario", "topic_analysis", topicAnalysis);
  }

  if (isChinese) {
    return [
      ...generalWebPasses,
      ...localizedPasses,
      officialPass,
      reputableMediaPass,
      industryReportPass,
      socialCluePass,
    ];
  }

  return [
    ...generalWebPasses,
    officialPass,
    ...localizedPasses,
    reputableMediaPass,
    industryReportPass,
    socialCluePass,
  ];
}

function buildLocalizedMediaPasses(
  topic: string,
  topicAnalysis: TopicAnalysis = analyzeTopicForEvidence(topic),
): SearchPassSpec[] {
  if (!isPrimaryChineseTopic(topic)) {
    return [];
  }

  const evidenceQuery = topicAnalysis.searchQueries.find(Boolean) ?? topic;
  const variants = buildLocalizedQueryVariants(evidenceQuery);
  const queryParts = dedupeQueryParts([
    variants.originalLanguageQuery,
    variants.normalizedOriginalQuery,
    variants.aliasQuery,
    "本地媒体 行业媒体 财经",
  ]);
  const localMediaQuery = trimQueryToLength(queryParts.join(" "));
  const safeLocalizedQuery = localMediaQuery.includes("\u672c\u5730\u5a92\u4f53")
    ? localMediaQuery
    : trimQueryToLength(
        `${localMediaQuery} \u672c\u5730\u5a92\u4f53 \u884c\u4e1a\u5a92\u4f53 \u8d22\u7ecf`,
      );
  const finalLocalizedQuery = trimQueryToLength(
    Array.from(
      new Map(
        safeLocalizedQuery
          .split(/\s+/)
          .filter(Boolean)
          .map((segment) => [segment.toLowerCase(), segment] as const),
      ).values(),
    ).join(" "),
  );

  return [
    {
      name: "localized_media",
      query: finalLocalizedQuery,
      freshness: "latest",
      country: "china",
      includeDomains: LOCALIZED_MEDIA_DOMAINS,
      excludeDomains: SOCIAL_VIDEO_DOMAINS,
      searchDepth: "basic",
      searchTopic: "general",
      timeRange: getTavilyTimeRange("latest"),
    },
  ];
}

export function dedupeQueryParts(parts: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();

    if (!trimmed) {
      continue;
    }

    const normalized = trimmed.toLowerCase().replace(/\s+/g, " ");

    if (seen.has(normalized)) {
      continue;
    }

    const isDuplicate = Array.from(seen).some(
      (existing) =>
        (existing.length >= 4 && normalized.includes(existing)) ||
        (normalized.length >= 4 && existing.includes(normalized)),
    );

    if (isDuplicate) {
      continue;
    }

    seen.add(normalized);
    result.push(trimmed);
  }

  return result;
}

function buildLocalizedQueryVariants(topic: string): {
  originalLanguageQuery: string;
  normalizedOriginalQuery: string;
  translatedQuery: string;
  aliasQuery: string;
  officialSourceQuery: string;
  localMediaQuery: string;
} {
  const normalizedOriginalQuery = normalizeLocalizedQueryText(topic);
  const aliasQuery = buildSymbolAliasQuery(topic);

  return {
    originalLanguageQuery: topic.trim(),
    normalizedOriginalQuery,
    translatedQuery: "",
    aliasQuery,
    officialSourceQuery: trimQueryToLength(`${topic} 官网 官方 公告 声明`),
    localMediaQuery: trimQueryToLength(`${topic} 本地媒体 财经 行业 报道`),
  };
}

function normalizeLocalizedQueryText(topic: string): string {
  return topic
    .normalize("NFKC")
    .replace(/[()（）［］【】「」『』"'“”‘’]/g, " ")
    .replace(/[·•・]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSymbolAliasQuery(topic: string): string {
  const aliases = new Set<string>();
  const normalized = normalizeLocalizedQueryText(topic);

  aliases.add(normalized);
  aliases.add(normalized.replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, ""));
  aliases.add(
    normalized
      .replace(/[αΑ]/g, "alpha")
      .replace(/[βΒ]/g, "beta")
      .replace(/[γΓ]/g, "gamma"),
  );

  return Array.from(aliases)
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
}

function isPrimaryChineseTopic(topic: string): boolean {
  const cjkCount = (topic.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinCount = (topic.match(/[a-z]/gi) ?? []).length;

  return cjkCount >= 2 && cjkCount >= latinCount;
}

export function buildOfficialDomainCandidates(
  topic: string,
  topicAnalysis?: TopicAnalysis,
): string[] | undefined {
  const matches =
    topic.match(/\b[A-Z][A-Za-z0-9-]*(?:\s+[A-Z][A-Za-z0-9-]*){0,3}\b/g) ?? [];
  const entityMatches = matches.filter(
    (match) => !/^(AI|API|LLM|GDP|IPO)$/i.test(match.trim()),
  );

  void topicAnalysis;

  if (entityMatches.length !== 1) {
    return undefined;
  }

  const candidates = new Set<string>();

  for (const match of entityMatches) {
    const words = match
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z0-9-]/g, ""))
      .filter((word) => word.length >= 2);

    if (words.length === 0) {
      continue;
    }

    candidates.add(`${words.join("-")}.com`);
    candidates.add(`${words.join("")}.com`);

    if (words.length > 1) {
      candidates.add(`${words[0]}.com`);
    }
  }

  const values = Array.from(candidates).filter(
    (domain) => !SOCIAL_VIDEO_DOMAINS.includes(domain),
  );

  return values.length > 0 ? values.slice(0, 12) : undefined;
}

export function getTavilyTimeRange(
  freshness: SearchFreshness,
): SearchPassSpec["timeRange"] | undefined {
  if (freshness === "latest") {
    return "month";
  }

  if (freshness === "recent") {
    return "year";
  }

  return undefined;
}

export async function buildParticipantSearchQueries(
  topic: string,
  participants: ModelParticipant[],
  provider: ModelProvider,
  signal?: AbortSignal,
  topicAnalysis: TopicAnalysis = analyzeTopicForEvidence(topic),
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
            intents: await provider.generateSearchIntents(participant, topic, {
              signal,
            }),
          };
        }

        if (provider.generateSearchQueries) {
          const queries = await provider.generateSearchQueries(
            participant,
            topic,
            { signal },
          );

          return {
            participant,
            intents: queries.map(createLegacySearchIntent),
          };
        }

        return {
          participant,
          intents: [] as SearchIntent[],
        };
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }

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
  const plan = buildTavilySearchPlanFromIntents(
    topic,
    searchIntents,
    { topicAnalysis },
  );

  if (plan.queries.length > 0) {
    return {
      queries: plan.queries.slice(0, MAX_MODEL_DRIVEN_QUERIES),
      searchIntents,
      queryPlans: plan.queryPlans.slice(0, MAX_MODEL_DRIVEN_QUERIES),
      intentDecisions: plan.intentDecisions,
    };
  }

  const fallbackQueries =
    topicAnalysis.searchQueries.length > 0
      ? topicAnalysis.searchQueries.slice(0, MAX_MODEL_DRIVEN_QUERIES)
      : buildTavilySearchQueries(topic).slice(
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
      queryLevel: "precise" as const,
      derivedFrom: "topic_analysis",
      queryQuality: evaluateSearchQueryQuality(query, topicAnalysis),
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
  options: { currentYear?: number; topicAnalysis?: TopicAnalysis } = {},
): {
  queries: string[];
  queryPlans: SearchQueryPlan[];
  intentDecisions: SearchIntentDecision[];
} {
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

      const query = buildQueryFromIntent(
        topic,
        normalizedIntent,
        options.topicAnalysis,
      );

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
      const existingQuery = seenQueries.get(dedupeKey) ?? findOverlappingQuery(query, seenQueries);

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
        queryLevel: "precise",
        derivedFrom: options.topicAnalysis ? "intent_plus_topic_analysis" : "model_intent",
        ...(options.topicAnalysis
          ? { queryQuality: evaluateSearchQueryQuality(query, options.topicAnalysis) }
          : {}),
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
  topicAnalysis?: TopicAnalysis,
): string {
  const terms = [
    intent.question,
    topicAnalysis ? buildQueryFromTopicAnalysisParts(topicAnalysis, intent.question) : "",
    ...intent.mustInclude,
    ...intent.shouldInclude,
    ...getSourcePreferenceTerms(intent.sourcePreference),
    ...getFreshnessTerms(topic, intent),
    ...getDefaultSourceExclusionTerms(intent.sourcePreference),
    ...intent.exclude.map((term) => `-${term}`),
  ].flatMap(splitSearchPhrases);
  const compactTerms = topicAnalysis
    ? normalizeSearchQueryTerms(terms.join(" "), topicAnalysis).split(/\s+/)
    : Array.from(new Set(terms)).filter((term) => !isLowValueSearchTerm(term));
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

export function splitSearchPhrases(value: string): string[] {
  return value
    .split(/\s+/)
    .map((term) => normalizeSearchText(term, 80))
    .filter(Boolean);
}

export function stripSearchTermPunctuation(term: string): string {
  return term
    .replace(/^[^\p{L}\p{N}+-]+/gu, "")
    .replace(/[^\p{L}\p{N}+-]+$/gu, "")
    .trim();
}

export function isResidualEntityFragment(
  term: string,
  topicAnalysis: TopicAnalysis,
): boolean {
  const normalizedTerm = term.toLowerCase();

  if (normalizedTerm.length < 2 || normalizedTerm.length > 4) {
    return false;
  }

  const entityTerms = [
    ...topicAnalysis.targetEntities,
    ...(topicAnalysis.cleanedTopic.match(/[A-Za-z][A-Za-z0-9+-]{1,}/g) ?? []),
  ];

  return entityTerms.some((entity) => {
    const normalizedEntity = entity.toLowerCase();

    return (
      normalizedEntity.length > normalizedTerm.length &&
      normalizedEntity.includes(normalizedTerm) &&
      !normalizedEntity.split(/[\s.-]+/).includes(normalizedTerm)
    );
  });
}

export function isLowValueSearchTerm(term: string): boolean {
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
    return ["analysis", "report"];
  }

  if (sourcePreference === "community") {
    return ["community", "discussion"];
  }

  return [];
}

function getDefaultSourceExclusionTerms(
  sourcePreference: SearchSourcePreference,
): string[] {
  if (sourcePreference === "community") {
    return [];
  }

  return [
    "-linkedin",
    "-instagram",
    "-reddit",
    "-youtube",
    "-tiktok",
    "-twitter",
    "-x.com",
  ];
}

function getFreshnessTerms(
  topic: string,
  intent: SearchIntent,
): string[] {
  const explicitYear = extractExplicitYear(topic) ?? extractExplicitYear(intent.question);

  if (intent.freshness === "latest") {
    return explicitYear ? [`${explicitYear}`, "latest"] : ["latest"];
  }

  if (intent.freshness === "recent") {
    return explicitYear ? [`${explicitYear}`, "recent"] : ["recent"];
  }

  if (isRealtimeTopic(topic)) {
    return explicitYear ? [`${explicitYear}`, "latest", "official"] : ["latest", "official"];
  }

  return [];
}

function extractExplicitYear(text: string): number | undefined {
  const match = text.match(/\b(20\d{2})\b/);

  if (match) {
    const year = Number(match[1]);

    if (year >= 2020 && year <= 2030) {
      return year;
    }
  }

  return undefined;
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

export function trimQueryToLength(query: string): string {
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

export function getMeaningfulTokenCount(query: string): number {
  return query.match(/[\p{L}\p{N}][\p{L}\p{N}.-]*/gu)?.length ?? 0;
}

export function getQueryDedupeKey(query: string): string {
  return query
    .toLowerCase()
    .replace(/[“”‘’\x22\x27]/g, "")
    .replace(/\b20\d{2}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findOverlappingQuery(
  query: string,
  seenQueries: Map<string, string>,
): string | undefined {
  const normalized = getQueryDedupeKey(query);

  if (!normalized) {
    return undefined;
  }

  for (const [existingKey, existingQuery] of seenQueries) {
    if (existingKey === normalized) {
      continue;
    }

    if (existingKey.length >= 8 && normalized.includes(existingKey)) {
      return existingQuery;
    }

    if (normalized.length >= 8 && existingKey.includes(normalized)) {
      return existingQuery;
    }
  }

  return undefined;
}

export function normalizeSearchText(value: string, maxLength: number): string {
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

export function resolveSearchRegionPreference(input: {
  topic: string;
  searchRegion?: import("../types").SearchRegion;
}): {
  resolvedRegion: import("../types").SearchRegion;
  regionSource: "user_preference" | "auto_detected" | "default_global";
  regionFallbackReason: string;
} {
  const { topic, searchRegion } = input;

  if (searchRegion && searchRegion !== "auto") {
    return {
      resolvedRegion: searchRegion,
      regionSource: "user_preference",
      regionFallbackReason: "none",
    };
  }

  const detected = detectRegionFromTopic(topic);

  if (detected) {
    return {
      resolvedRegion: detected,
      regionSource: "auto_detected",
      regionFallbackReason: "none",
    };
  }

  return {
    resolvedRegion: "global",
    regionSource: "default_global",
    regionFallbackReason: "uncertain_auto_region",
  };
}

function detectRegionFromTopic(
  topic: string,
): import("../types").SearchRegion | undefined {
  const normalized = topic.toLowerCase();

  if (hasChinaSignals(normalized)) {
    return "china";
  }

  if (hasJapanSignals(normalized)) {
    return "japan";
  }

  if (hasKoreaSignals(normalized)) {
    return "korea";
  }

  if (hasUsSignals(normalized)) {
    return "us";
  }

  return undefined;
}

function hasChinaSignals(text: string): boolean {
  const cjkCount = (text.match(/[一-鿿]/g) ?? []).length;
  const latinCount = (text.match(/[a-z]/g) ?? []).length;

  if (cjkCount >= 4 && cjkCount > latinCount * 2) {
    const chinaKeywords = [
      "中国", "国内", "中国市场", "中国政策", "中国监管",
      "中国政府", "中国公司", "中国企业", "中国城市",
      "北京", "上海", "深圳", "广州", "杭州", "成都",
      "中国人民银行", "工信部", "国务院", "发改委",
      "a股", "港股", "科创板", "创业板",
      "人民币", "rmb",
    ];

    if (chinaKeywords.some((keyword) => text.includes(keyword))) {
      return true;
    }
  }

  return false;
}

function hasJapanSignals(text: string): boolean {
  const japanKeywords = [
    "日本", "japan", "japanese",
    "东京", "tokyo",
    "日经", "nikkei",
    "日元", "yen",
    "日本政策", "日本监管", "日本市场",
    "日本公司", "日本企业",
  ];

  return japanKeywords.some((keyword) => text.includes(keyword));
}

function hasKoreaSignals(text: string): boolean {
  const koreaKeywords = [
    "韩国", "korea", "korean",
    "首尔", "seoul",
    "韩元", "won",
    "韩国政策", "韩国监管", "韩国市场",
    "韩国公司", "韩国企业",
    "三星", "samsung",
    "现代", "hyundai",
    "lg",
    "sk",
  ];

  return koreaKeywords.some((keyword) => text.includes(keyword));
}

function hasUsSignals(text: string): boolean {
  const usKeywords = [
    "美国", "us market", "us policy", "us regulation",
    "美国政策", "美国监管", "美国市场",
    "美国公司", "美国企业",
    "华尔街", "wall street",
    "美联储", "fed ", "federal reserve",
    "sec", "美国证监会",
    "纳斯达克", "nasdaq",
    "纽约", "new york",
    "硅谷", "silicon valley",
  ];

  return usKeywords.some((keyword) => text.includes(keyword));
}

export function getEffectiveCountryForRegion(
  searchRegion: import("../types").SearchRegion | undefined,
): string | undefined {
  if (!searchRegion || searchRegion === "auto") {
    return undefined;
  }

  return SEARCH_REGION_COUNTRY_MAP[searchRegion];
}