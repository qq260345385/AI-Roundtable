import { NextResponse } from "next/server";
import {
  createSearchFailureProcess,
  normalizeEvidencePack,
} from "../../../../lib/search/evidence-pack";
import {
  createSearchSummary,
  isSearchDebugResponseEnabled,
  sanitizeEvidencePackForClient,
} from "../../../../lib/search/search-response";
import {
  TavilySearchError,
  buildTavilySearchQueries,
  dedupeSearchResults,
  getSafeTavilyErrorMessage,
  getTavilyFailureReason,
  searchTavilyEvidence,
  type TavilySearchCacheEvent,
} from "../../../../lib/search/tavily-search";

export const runtime = "nodejs";

type SearchRequestBody = {
  query?: unknown;
};

export async function POST(request: Request) {
  const cacheEvents: TavilySearchCacheEvent[] = [];
  let searchQueries: string[] = [];

  try {
    const body = await readRequestBody(request);
    const query = getQuery(body);

    if (!query) {
      throw new SearchRequestError("query cannot be empty", 400);
    }

    searchQueries = buildTavilySearchQueries(query);
    const searchResults = (
      await Promise.all(
        searchQueries.map((searchQuery) =>
          searchTavilyEvidence(searchQuery, {
            maxResults: 5,
            onCacheEvent: (event) => cacheEvents.push(event),
          }).then((results) =>
            results.map((result) => ({ ...result, query: searchQuery })),
          ),
        ),
      )
    ).flat();
    const deduped = dedupeSearchResults(searchResults);
    const drafts = deduped.items;
    const preflightPack = normalizeEvidencePack(
      {
        enabled: true,
        items: drafts,
      },
      {
        topic: query,
      },
    );
    const evidenceStatus =
      preflightPack.evidenceStatus ?? (preflightPack.items.length > 0 ? "low" : "none");
    const evidenceWarnings = getEvidenceWarnings(evidenceStatus);
    const evidencePack = normalizeEvidencePack(
      {
        enabled: true,
        evidenceStatus,
        evidenceWarnings,
        items: drafts,
        searchProcess: {
          cacheEvents,
          dedupeStats: deduped.stats,
          executedQueries: searchQueries,
          searchIntents: [
            {
              participantId: "user-query",
              participantName: "User query",
              provider: "server",
              model: "tavily",
              intents: [
                {
                  question: query,
                  mustInclude: [query],
                  shouldInclude: [],
                  exclude: [],
                  freshness: "any",
                  sourcePreference: "mixed",
                  rationale: "User-triggered direct Tavily evidence search.",
                },
              ],
            },
          ],
        },
        searchQueries,
      },
      {
        topic: query,
      },
    );

    const safeEvidencePack = sanitizeEvidencePackForClient(evidencePack);

    return NextResponse.json({
      drafts: safeEvidencePack?.items ?? [],
      evidencePack: safeEvidencePack,
      searchSummary: createSearchSummary(evidencePack),
      ...(isSearchDebugResponseEnabled()
        ? { debugSearchProcess: evidencePack.searchProcess }
        : {}),
      warnings: [
        ...(evidencePack.evidenceWarnings ?? []),
        ...evidencePack.items.flatMap((item) => item.quality?.warnings ?? []),
      ],
    });
  } catch (error) {
    const failureProcess =
      error instanceof TavilySearchError
        ? createSearchFailureProcess({
            executedQueries: searchQueries,
            failureReason: getTavilyFailureReason(error),
            cacheEvents,
            warnings: [getTavilyFailureReason(error)],
          })
        : undefined;
    const failurePack = failureProcess
      ? normalizeEvidencePack({
          enabled: true,
          evidenceStatus: "none",
          items: [],
          searchProcess: failureProcess,
          searchQueries,
        })
      : undefined;

    return NextResponse.json(
      {
        error: getErrorMessage(error),
        ...(failurePack ? { searchSummary: createSearchSummary(failurePack) } : {}),
        ...(failureProcess && isSearchDebugResponseEnabled()
          ? { debugSearchProcess: failureProcess }
          : {}),
      },
      {
        status: getErrorStatus(error),
      },
    );
  }
}

async function readRequestBody(request: Request): Promise<SearchRequestBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new SearchRequestError("invalid json body", 400);
  }

  if (!isRequestBodyObject(body)) {
    throw new SearchRequestError("request body must be an object", 400);
  }

  return body;
}

function isRequestBodyObject(body: unknown): body is SearchRequestBody {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function getQuery(body: SearchRequestBody) {
  if (typeof body.query !== "string") {
    return "";
  }

  return body.query.trim();
}

function getErrorMessage(error: unknown): string {
  if (error instanceof TavilySearchError) {
    return getSafeTavilyErrorMessage(error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getErrorStatus(error: unknown): number {
  if (error instanceof SearchRequestError || error instanceof TavilySearchError) {
    return error.status;
  }

  return 500;
}

class SearchRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
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
