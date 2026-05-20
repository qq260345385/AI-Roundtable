import JSZip from "jszip";
import { createEvidenceDraftFromFile } from "./evidence-file-import";
import type { ImportedEvidenceDraft } from "./evidence-file-import";

export type EvidenceDocumentInput = {
  data: ArrayBuffer;
  lastModified?: number;
  name: string;
  type?: string;
};

type EvidenceDocumentKind = "docx" | "pdf" | "pptx" | "text" | "xlsx";

export async function parseEvidenceDocument(
  input: EvidenceDocumentInput,
): Promise<ImportedEvidenceDraft> {
  const kind = getEvidenceDocumentKind(input.name, input.type);

  if (!kind) {
    throw new EvidenceDocumentParseError("unsupported evidence file type", 400);
  }

  const text = await extractDocumentText(kind, input.data);

  if (!text.trim()) {
    throw new EvidenceDocumentParseError(
      "no extractable text was found in this file",
      422,
    );
  }

  return createEvidenceDraftFromFile({
    name: input.name,
    text,
    type: input.type,
    lastModified: input.lastModified,
  });
}

export class EvidenceDocumentParseError extends Error {
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

function getEvidenceDocumentKind(
  name: string,
  type: string | undefined,
): EvidenceDocumentKind | null {
  const lowerName = name.toLowerCase();

  if (
    type?.startsWith("text/") ||
    type === "application/json" ||
    [".txt", ".md", ".markdown", ".csv", ".json"].some((extension) =>
      lowerName.endsWith(extension),
    )
  ) {
    return "text";
  }

  if (
    type === "application/pdf" ||
    lowerName.endsWith(".pdf")
  ) {
    return "pdf";
  }

  if (
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx")
  ) {
    return "docx";
  }

  if (
    type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    lowerName.endsWith(".xlsx")
  ) {
    return "xlsx";
  }

  if (
    type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    lowerName.endsWith(".pptx")
  ) {
    return "pptx";
  }

  return null;
}

async function extractDocumentText(
  kind: EvidenceDocumentKind,
  data: ArrayBuffer,
) {
  if (kind === "text") {
    return new TextDecoder("utf-8", { fatal: false }).decode(data);
  }

  if (kind === "pdf") {
    return extractPdfText(data);
  }

  if (kind === "docx") {
    return extractDocxText(data);
  }

  if (kind === "xlsx") {
    return extractXlsxText(data);
  }

  return extractPptxText(data);
}

async function extractPdfText(data: ArrayBuffer) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: Buffer.from(data) });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocxText(data: ArrayBuffer) {
  const zip = await JSZip.loadAsync(data);
  const documentXml = await zip.file("word/document.xml")?.async("text");

  return documentXml ? extractXmlText(documentXml) : "";
}

async function extractPptxText(data: ArrayBuffer) {
  const zip = await JSZip.loadAsync(data);
  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort(comparePathsNaturally);
  const slideTexts = await Promise.all(
    slideFiles.map(async (path) => {
      const xml = await zip.file(path)?.async("text");

      return xml ? extractXmlText(xml) : "";
    }),
  );

  return slideTexts.join("\n");
}

async function extractXlsxText(data: ArrayBuffer) {
  const zip = await JSZip.loadAsync(data);
  const sharedStrings = await readSharedStrings(zip);
  const sheetFiles = Object.keys(zip.files)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort(comparePathsNaturally);
  const sheetTexts = await Promise.all(
    sheetFiles.map(async (path) => {
      const xml = await zip.file(path)?.async("text");

      return xml ? extractWorksheetText(xml, sharedStrings) : "";
    }),
  );

  return sheetTexts.join("\n");
}

async function readSharedStrings(zip: JSZip) {
  const xml = await zip.file("xl/sharedStrings.xml")?.async("text");

  if (!xml) {
    return [];
  }

  return extractXmlText(xml)
    .split("\n")
    .map((text) => text.trim())
    .filter(Boolean);
}

function extractWorksheetText(xml: string, sharedStrings: string[]) {
  const values = Array.from(xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)).map(
    (match) => {
      const attributes = match[1];
      const cellXml = match[2];
      const value = getFirstXmlTagValue(cellXml, "v");

      if (attributes.includes('t="s"') && value) {
        return sharedStrings[Number(value)] || "";
      }

      return value || extractXmlText(cellXml);
    },
  );

  return values.map(decodeXmlEntities).filter(Boolean).join("\n");
}

function extractXmlText(xml: string) {
  return Array.from(xml.matchAll(/<[^/:>\s]+:t\b[^>]*>([\s\S]*?)<\/[^:>]+:t>|<t\b[^>]*>([\s\S]*?)<\/t>/g))
    .map((match) => decodeXmlEntities(match[1] || match[2] || ""))
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n");
}

function getFirstXmlTagValue(xml: string, tagName: string) {
  const match = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`).exec(
    xml,
  );

  return match ? decodeXmlEntities(match[1].trim()) : "";
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function comparePathsNaturally(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
