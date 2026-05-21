import { NextResponse } from "next/server";
import { normalizeEvidencePack } from "../../../../lib/search/evidence-pack";
import {
  TavilySearchError,
  buildTavilySearchQueries,
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

    const searchQueries = buildTavilySearchQueries(query);
    const drafts = dedupeEvidenceDrafts(
      (
        await Promise.all(
          searchQueries.map((searchQuery) =>
            searchTavilyEvidence(searchQuery, { maxResults: 5 }),
          ),
        )
      ).flat(),
    );
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
        enabled: preflightPack.items.length > 0,
        evidenceStatus,
        evidenceWarnings,
        items: preflightPack.items,
        searchQueries,
      },
      {
        topic: query,
      },
    );

    return NextResponse.json({
      drafts: evidencePack.items,
      evidencePack,
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

function dedupeEvidenceDrafts<T extends { title: string; url?: string }>(
  drafts: T[],
): T[] {
  const seen = new Set<string>();

  return drafts.filter((draft) => {
    const key = (draft.url || draft.title).toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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
