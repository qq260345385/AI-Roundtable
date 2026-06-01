import { NextResponse } from "next/server";
import {
  AllProvidersFailedError,
} from "../../../../lib/meeting/engine";
import { runLiveMeeting } from "../../../../lib/meeting/live-engine";
import { getParticipantsInSelectionOrder } from "../../../../lib/models/participant-selection";
import { createProviderRegistry } from "../../../../lib/providers/provider-registry";
import { buildModelDrivenWebEvidencePack } from "../../../../lib/search/model-driven-web-search";
import {
  normalizeEvidencePack,
  type SearchMode,
} from "../../../../lib/search/evidence-pack";
import {
  assertMeetingSearchSucceeded,
  MeetingSearchFailedError,
} from "../../../../lib/search/meeting-search-failure";
import {
  createSafeRouteErrorDiagnostic,
  createSafeRouteErrorPayload,
  logSafeRouteError,
} from "../../../../lib/search/search-error-diagnostics";
import { prepareLiveMeetingEventForClient } from "../../../../lib/search/search-response";
import { TavilySearchError } from "../../../../lib/search/tavily-search";
import type {
  LiveMeetingEvent,
  ModelParticipant,
  SearchPreferences,
} from "../../../../lib/types";

type MeetingRequestBody = {
  evidencePack?: unknown;
  isBriefMode?: unknown;
  participantIds?: unknown;
  question?: unknown;
  searchMode?: unknown;
  searchPreferences?: unknown;
  searchDriverParticipantId?: unknown;
  summaryParticipantId?: unknown;
  webSearchEnabled?: unknown;
};

const encoder = new TextEncoder();

export async function POST(request: Request) {
  let failedStage = "request";

  try {
    failedStage = "read_request";
    const body = await readRequestBody(request);
    const question = getQuestion(body);
    const isBriefMode = body.isBriefMode === true;
    const participantIds = getParticipantIds(body);
    const searchMode = getSearchMode(body.searchMode);
    let evidencePack = normalizeEvidencePack(body.evidencePack);

    if (!question) {
      return NextResponse.json(
        {
          error: "question cannot be empty",
        },
        { status: 400 },
      );
    }

    failedStage = "provider_registry";
    const registry = await createProviderRegistry();
    const participants = selectParticipants(
      registry.participants,
      participantIds,
    );
    const searchDriverParticipant = selectOptionalParticipant(
      registry.participants,
      body.searchDriverParticipantId,
      "selected search driver model is not available",
    );
    const summaryParticipant = selectOptionalParticipant(
      registry.participants,
      body.summaryParticipantId,
      "selected summary model is not available",
    );

    if (participants.length === 0) {
      return NextResponse.json(
        {
          error: "at least one participant must be selected",
        },
        { status: 400 },
      );
    }

    if (body.webSearchEnabled === true) {
      failedStage = "evidence_search";
      evidencePack = await buildModelDrivenWebEvidencePack({
        baseEvidencePack: evidencePack,
        participants: searchDriverParticipant
          ? [searchDriverParticipant]
          : participants,
        provider: registry.provider,
        searchMode,
        searchPreferences: normalizeSearchPreferences(body.searchPreferences),
        signal: request.signal,
        topic: question,
      });
      assertMeetingSearchSucceeded(evidencePack);
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let isClosed = false;

        async function emit(event: LiveMeetingEvent) {
          if (request.signal.aborted || isClosed) {
            return;
          }

          controller.enqueue(
            encoder.encode(
              `${JSON.stringify(prepareLiveMeetingEventForClient(event))}\n`,
            ),
          );
        }

        try {
          failedStage = "meeting_stream";
          await runLiveMeeting(
            {
              topic: question,
              participants,
              evidencePack,
              isBriefMode,
              signal: request.signal,
              summaryParticipant,
            },
            registry.provider,
            emit,
          );
        } catch (error) {
          if (request.signal.aborted) {
            return;
          }

          const diagnostic = createSafeRouteErrorDiagnostic(error, {
            failedStage,
            statusCode: getErrorStatus(error),
          });
          logSafeRouteError("[api/meeting/live] stream failed", diagnostic);
          await emit({
            type: "error",
            error: diagnostic.safeErrorMessage,
            status: diagnostic.statusCode,
          });
        } finally {
          isClosed = true;

          try {
            controller.close();
          } catch {
            // The client may have already canceled the stream.
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
      },
    });
  } catch (error) {
    const status = getErrorStatus(error);

    if (status < 500) {
      return NextResponse.json(
        {
          error: getErrorMessage(error),
        },
        { status },
      );
    }

    const diagnostic = createSafeRouteErrorDiagnostic(error, {
      failedStage,
      statusCode: status,
    });
    logSafeRouteError("[api/meeting/live] request failed", diagnostic);

    return NextResponse.json(
      createSafeRouteErrorPayload(diagnostic),
      { status: diagnostic.statusCode },
    );
  }
}

function getSearchMode(value: unknown): SearchMode {
  return value === "standard" ? "standard" : "deep";
}

async function readRequestBody(
  request: Request,
): Promise<MeetingRequestBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new BadRequestError("invalid json body");
  }

  if (!isRequestBodyObject(body)) {
    throw new BadRequestError("request body must be an object");
  }

  return body;
}

function isRequestBodyObject(body: unknown): body is MeetingRequestBody {
  return typeof body === "object" && body !== null && !Array.isArray(body);
}

function getQuestion(body: MeetingRequestBody): string {
  if (typeof body.question !== "string") {
    return "";
  }

  return body.question.trim();
}

function getParticipantIds(body: MeetingRequestBody): string[] | undefined {
  if (body.participantIds === undefined) {
    return undefined;
  }

  if (!Array.isArray(body.participantIds)) {
    throw new BadRequestError("participantIds must be an array of strings");
  }

  if (!body.participantIds.every((item) => typeof item === "string")) {
    throw new BadRequestError("participantIds must be an array of strings");
  }

  return body.participantIds
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectParticipants(
  participants: ModelParticipant[],
  participantIds: string[] | undefined,
) {
  if (!participantIds) {
    return participants;
  }

  const knownIds = new Set(participants.map((participant) => participant.id));
  const unknownId = participantIds.find((id) => !knownIds.has(id));

  if (unknownId) {
    throw new BadRequestError("selected participant is not available");
  }

  return getParticipantsInSelectionOrder(participants, participantIds);
}

function selectOptionalParticipant(
  participants: ModelParticipant[],
  participantId: unknown,
  errorMessage: string,
): ModelParticipant | undefined {
  if (participantId === undefined || participantId === null) {
    return undefined;
  }

  if (typeof participantId !== "string") {
    throw new BadRequestError(errorMessage);
  }

  const trimmedId = participantId.trim();

  if (!trimmedId) {
    return undefined;
  }

  const participant = participants.find((item) => item.id === trimmedId);

  if (!participant) {
    throw new BadRequestError(errorMessage);
  }

  return participant;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getErrorStatus(error: unknown): number {
  if (error instanceof BadRequestError) {
    return error.status;
  }

  if (error instanceof AllProvidersFailedError) {
    return error.status;
  }

  if (error instanceof TavilySearchError) {
    return error.status;
  }

  if (error instanceof MeetingSearchFailedError) {
    return error.status;
  }

  return 500;
}

class BadRequestError extends Error {
  status = 400;
}

function normalizeSearchPreferences(value: unknown): SearchPreferences | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const obj = value as Record<string, unknown>;
  const result: SearchPreferences = {};

  if (typeof obj.searchRegion === "string") {
    const validRegions = ["auto", "global", "china", "us", "europe", "japan", "korea"];

    if (validRegions.includes(obj.searchRegion)) {
      result.searchRegion = obj.searchRegion as SearchPreferences["searchRegion"];
    }
  }

  if (typeof obj.searchIntensity === "string") {
    if (obj.searchIntensity === "standard" || obj.searchIntensity === "deep") {
      result.searchIntensity = obj.searchIntensity;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
