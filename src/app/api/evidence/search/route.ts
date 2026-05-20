import { NextResponse } from "next/server";
import { normalizeEvidencePack } from "../../../../lib/search/evidence-pack";
import {
  TavilySearchError,
  searchTavilyEvidence,
} from "../../../../lib/search/tavily-search";

export const runtime = "nodejs";

type SearchRequestBody = {
  query?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await readRequestBody(request);
    const query = getQuery(body);

    if (!query) {
      throw new SearchRequestError("query cannot be empty", 400);
    }

    const drafts = await searchTavilyEvidence(query);
    const evidencePack = normalizeEvidencePack(
      {
        enabled: true,
        items: drafts,
      },
      {
        allowLowReliabilityFallback: false,
      },
    );

    if (!evidencePack.enabled || evidencePack.items.length === 0) {
      throw new SearchRequestError(
        "no high or medium quality web search results were found",
        422,
      );
    }

    return NextResponse.json({
      drafts: evidencePack.items,
      evidencePack,
      warnings: evidencePack.items.flatMap(
        (item) => item.quality?.warnings ?? [],
      ),
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
