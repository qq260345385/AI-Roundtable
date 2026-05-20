import { describe, expect, test } from "vitest";
import { createEvidenceDraftFromFile } from "./evidence-file-import";

describe("createEvidenceDraftFromFile", () => {
  test("creates an evidence draft from a local text file", () => {
    const draft = createEvidenceDraftFromFile({
      name: "release-notes.md",
      text: "AI Roundtable 支持资料包引用。",
      type: "text/markdown",
      lastModified: Date.UTC(2026, 4, 19),
    });

    expect(draft).toEqual({
      title: "release-notes.md",
      source: "本地文件",
      url: "",
      publishedAt: "2026-05-19",
      snippet: "AI Roundtable 支持资料包引用。",
    });
  });

  test("normalizes whitespace and truncates long file content", () => {
    const draft = createEvidenceDraftFromFile({
      name: "long.txt",
      text: `  ${"A".repeat(70000)}  `,
      type: "text/plain",
    });

    expect(draft.snippet).toHaveLength(60000);
    expect(draft.snippet).toBe("A".repeat(60000));
  });

  test("redacts obvious secret fragments from imported content", () => {
    const draft = createEvidenceDraftFromFile({
      name: "debug-log.txt",
      text: "Authorization: Bearer secret-openai-key should not be copied.",
      type: "text/plain",
    });

    expect(draft.snippet).not.toContain("Authorization");
    expect(draft.snippet).not.toContain("Bearer");
    expect(draft.snippet).not.toContain("secret-openai-key");
    expect(draft.snippet).toContain("[redacted-header]");
    expect(draft.snippet).toContain("[redacted-token]");
  });
});
