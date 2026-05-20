import { NextResponse } from "next/server";
import {
  AllProvidersFailedError,
  runMeeting,
} from "../../../lib/meeting/engine";
import { createProviderRegistry } from "../../../lib/providers/provider-registry";
import { normalizeEvidencePack } from "../../../lib/search/evidence-pack";
import type { ModelParticipant } from "../../../lib/types";

type MeetingRequestBody = {
  evidencePack?: unknown;
  isBriefMode?: unknown;
  participantIds?: unknown;
  question?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = await readRequestBody(request);
    const question = getQuestion(body);
    const isBriefMode = body.isBriefMode === true;
    const participantIds = getParticipantIds(body);
    const evidencePack = normalizeEvidencePack(body.evidencePack);

    if (!question) {
      return NextResponse.json(
        {
          error: "question cannot be empty",
        },
        { status: 400 },
      );
    }

    const registry = await createProviderRegistry();
    const participants = selectParticipants(
      registry.participants,
      participantIds,
    );

    if (participants.length === 0) {
      return NextResponse.json(
        {
          error: "at least one participant must be selected",
        },
        { status: 400 },
      );
    }

    const meeting = await runMeeting(
      {
        topic: question,
        participants,
        evidencePack,
        isBriefMode,
      },
      registry.provider,
    );

    return NextResponse.json({
      mode: registry.mode,
      meeting,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: getErrorMessage(error),
      },
      { status: getErrorStatus(error) },
    );
  }
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

  const selectedIds = new Set(participantIds);

  return participants.filter((participant) => selectedIds.has(participant.id));
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

  return 500;
}

class BadRequestError extends Error {
  status = 400;
}
