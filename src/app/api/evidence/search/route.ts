import { NextResponse } from "next/server";
import { buildModelDrivenWebEvidencePack } from "../../../../lib/search/model-driven-web-search";
import {
  type EvidencePack,
  type SearchFailureReason,
  type SearchMode,
} from "../../../../lib/search/evidence-pack";
import {
  createSearchSummary,
  sanitizeEvidencePackForClient,
} from "../../../../lib/search/search-response";
import type {
  MeetingSummary,
  ModelParticipant,
  ModelProvider,
} from "../../../../lib/types";

export const runtime = "nodejs";

type SearchRequestBody = {
  query?: unknown;
  searchMode?: unknown;
};

const DIRECT_SEARCH_PARTICIPANT: ModelParticipant = {
  id: "direct-evidence-search",
  name: "Direct Evidence Search",
  provider: "server",
  model: "shared-search-planner",
  status: "available",
  statusLabel: "Available",
};

const directSearchPlanner: ModelProvider = {
  name: "DirectEvidenceSearchPlanner",

  async generateSearchIntents() {
    return [];
  },

  async generateIndependentView() {
    return "";
  },

  async generateResponse() {
    return "";
  },

  async generateSummary(): Promise<MeetingSummary> {
    return {
      consensus: [],
      differences: [],
      minorityViews: [],
      risks: [],
      nextSteps: [],
    };
  },
};

export async function POST(request: Request) {
  try {
    const body = await readRequestBody(request);
    const query = getQuery(body);
    const searchMode = getSearchMode(body.searchMode);

    if (!query) {
      throw new SearchRequestError("query cannot be empty", 400);
    }

    const evidencePack = await buildModelDrivenWebEvidencePack({
      participants: [DIRECT_SEARCH_PARTICIPANT],
      provider: directSearchPlanner,
      searchMode,
      signal: request.signal,
      topic: query,
    });

    if (evidencePack.searchProcess?.evidenceMode === "search_failed") {
      return createSearchFailureResponse(evidencePack);
    }

    const safeEvidencePack = sanitizeEvidencePackForClient(evidencePack);

    return NextResponse.json({
      drafts: safeEvidencePack?.items ?? [],
      evidencePack: safeEvidencePack,
      searchSummary: createSearchSummary(evidencePack),
      ...(isEvidenceSearchDebugResponseEnabled()
        ? { debugSearchProcess: evidencePack.searchProcess }
        : {}),
      warnings: [
        ...(evidencePack.evidenceWarnings ?? []),
        ...evidencePack.items.flatMap((item) => item.quality?.warnings ?? []),
      ],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      {
        status: getErrorStatus(error),
      },
    );
  }
}

function isEvidenceSearchDebugResponseEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.NODE_ENV !== "production" && env.SEARCH_DEBUG_ENABLED === "true";
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

function getSearchMode(value: unknown): SearchMode {
  return value === "standard" ? "standard" : "deep";
}

function createSearchFailureResponse(evidencePack: EvidencePack) {
  const failureReason = evidencePack.searchProcess?.failureReason;

  return NextResponse.json(
    {
      error: `Tavily search failed: ${failureReason ?? "unknown_error"}`,
      searchSummary: createSearchSummary(evidencePack),
      ...(isEvidenceSearchDebugResponseEnabled()
        ? { debugSearchProcess: evidencePack.searchProcess }
        : {}),
    },
    {
      status: getFailureStatus(failureReason),
    },
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getErrorStatus(error: unknown): number {
  if (error instanceof SearchRequestError) {
    return error.status;
  }

  return 500;
}

function getFailureStatus(reason: SearchFailureReason | undefined) {
  if (reason === "missing_api_key") {
    return 503;
  }

  return 502;
}

class SearchRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
