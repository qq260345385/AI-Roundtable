import { NextResponse } from "next/server";
import { buildModelDrivenWebEvidencePack } from "../../../../../lib/search/model-driven-web-search";
import { createSearchProcessFailureDiagnostic } from "../../../../../lib/search/search-error-diagnostics";
import {
  DEFAULT_TAVILY_PING_QUERY,
  normalizePingQuery,
  runTavilyPing,
} from "../../../../../lib/search/tavily-ping";
import type {
  ModelParticipant,
  ModelProvider,
} from "../../../../../lib/types";

export const runtime = "nodejs";

const DEBUG_QUERY = DEFAULT_TAVILY_PING_QUERY;

const debugParticipant: ModelParticipant = {
  id: "debug-search",
  name: "Debug Search",
  provider: "server",
  model: "debug-search",
  status: "available",
  statusLabel: "available",
};

const debugProvider: ModelProvider = {
  name: "DebugSearchProvider",
  async generateSearchIntents() {
    return [];
  },
  async generateIndependentView() {
    return "";
  },
  async generateResponse() {
    return "";
  },
  async generateSummary() {
    return {
      consensus: [],
      differences: [],
      minorityViews: [],
      risks: [],
      nextSteps: [],
    };
  },
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "full" ? "full" : "quick";
  const debugQuery = normalizePingQuery(url.searchParams.get("q") ?? DEBUG_QUERY);

  try {
    if (mode === "quick") {
      const result = await runTavilyPing({
        failedStage: "tavily_quick_debug",
        query: debugQuery,
        signal: request.signal,
      });

      return NextResponse.json(
        {
          mode,
          ...result,
        },
        { status: result.statusCode },
      );
    }

    const evidencePack = await buildModelDrivenWebEvidencePack({
      participants: [debugParticipant],
      provider: debugProvider,
      searchMode: "deep",
      signal: request.signal,
      topic: debugQuery,
    });
    const debugSummary = evidencePack.searchProcess?.debugSummary;

    if (evidencePack.searchProcess?.evidenceMode === "search_failed") {
      const diagnostic = createSearchProcessFailureDiagnostic(
        evidencePack.searchProcess,
        "evidence_search",
      );

      return NextResponse.json(
        {
          ok: false,
          failedStage: diagnostic.failedStage,
          errorType: diagnostic.errorType,
          safeErrorMessage: diagnostic.safeErrorMessage,
        },
        { status: diagnostic.statusCode },
      );
    }

    return NextResponse.json({
      mode,
      ok: true,
      candidateCount:
        debugSummary?.evidenceHitRate.candidateCount ??
        evidencePack.searchProcess?.rawCandidateCount ??
        0,
      coreEvidenceCount:
        debugSummary?.evidenceHitRate.coreEvidenceCount ?? 0,
      debugSummary,
    });
  } catch (error) {
    const diagnostic = createSearchProcessFailureDiagnostic(
      undefined,
      "evidence_search",
    );

    return NextResponse.json(
      {
        ok: false,
        failedStage: diagnostic.failedStage,
        errorType: diagnostic.errorType,
        safeErrorMessage:
          error instanceof Error
            ? "会议接口内部错误，请查看开发日志。"
            : diagnostic.safeErrorMessage,
      },
      { status: diagnostic.statusCode },
    );
  }
}
