import { NextResponse } from "next/server";
import {
  EvidenceDocumentParseError,
  parseEvidenceDocument,
} from "../../../../lib/search/document-evidence";
import { normalizeEvidencePack } from "../../../../lib/search/evidence-pack";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new EvidenceDocumentParseError("file is required", 400);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new EvidenceDocumentParseError(
        "file is too large; maximum size is 10MB",
        413,
      );
    }

    const parsedDraft = await parseEvidenceDocument({
      data: await file.arrayBuffer(),
      lastModified: file.lastModified,
      name: file.name,
      type: file.type,
    });
    const evidencePack = normalizeEvidencePack({
      enabled: true,
      items: [parsedDraft],
    });
    const draft = evidencePack.items[0];

    if (!draft) {
      throw new EvidenceDocumentParseError(
        "no extractable text was found in this file",
        422,
      );
    }

    return NextResponse.json({
      draft,
      evidencePack,
      warnings: draft.quality?.warnings ?? [],
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

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function getErrorStatus(error: unknown): number {
  if (error instanceof EvidenceDocumentParseError) {
    return error.status;
  }

  return 500;
}
