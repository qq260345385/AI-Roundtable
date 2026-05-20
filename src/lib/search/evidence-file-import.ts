export type EvidenceFileInput = {
  name: string;
  text: string;
  type?: string;
  lastModified?: number;
};

export type ImportedEvidenceDraft = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  snippet: string;
};

const MAX_TITLE_LENGTH = 120;
const MAX_SNIPPET_LENGTH = 60000;

export function createEvidenceDraftFromFile(
  file: EvidenceFileInput,
): ImportedEvidenceDraft {
  return {
    title: sanitizeImportedText(file.name).slice(0, MAX_TITLE_LENGTH),
    source: "本地文件",
    url: "",
    publishedAt: formatModifiedDate(file.lastModified),
    snippet: sanitizeImportedText(file.text).slice(0, MAX_SNIPPET_LENGTH),
  };
}

function formatModifiedDate(lastModified: number | undefined): string {
  if (typeof lastModified !== "number" || Number.isNaN(lastModified)) {
    return "";
  }

  return new Date(lastModified).toISOString().slice(0, 10);
}

function sanitizeImportedText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/Authorization/gi, "[redacted-header]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]");
}
