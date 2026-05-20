import JSZip from "jszip";
import { describe, expect, test } from "vitest";
import { parseEvidenceDocument } from "./document-evidence";

describe("parseEvidenceDocument", () => {
  test("parses plain text files into evidence drafts", async () => {
    const draft = await parseEvidenceDocument({
      data: new TextEncoder().encode("普通文本资料").buffer,
      lastModified: Date.UTC(2026, 4, 19),
      name: "notes.txt",
      type: "text/plain",
    });

    expect(draft).toEqual(
      expect.objectContaining({
        title: "notes.txt",
        source: "本地文件",
        publishedAt: "2026-05-19",
        snippet: "普通文本资料",
      }),
    );
  });

  test("parses docx document text", async () => {
    const data = await createZipBuffer({
      "word/document.xml":
        "<w:document><w:body><w:p><w:r><w:t>Word 资料内容</w:t></w:r></w:p></w:body></w:document>",
    });

    const draft = await parseEvidenceDocument({
      data,
      name: "brief.docx",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    expect(draft.snippet).toContain("Word 资料内容");
  });

  test("parses pdf document text", async () => {
    const draft = await parseEvidenceDocument({
      data: createMinimalPdf("PDF Evidence Demo"),
      name: "paper.pdf",
      type: "application/pdf",
    });

    expect(draft.snippet).toContain("PDF Evidence Demo");
  });

  test("parses xlsx shared string text", async () => {
    const data = await createZipBuffer({
      "xl/sharedStrings.xml":
        "<sst><si><t>Sheet 标题</t></si><si><t>Sheet 内容</t></si></sst>",
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row></sheetData></worksheet>',
    });

    const draft = await parseEvidenceDocument({
      data,
      name: "table.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(draft.snippet).toContain("Sheet 标题");
    expect(draft.snippet).toContain("Sheet 内容");
  });

  test("parses pptx slide text", async () => {
    const data = await createZipBuffer({
      "ppt/slides/slide1.xml":
        "<p:sld><p:cSld><p:spTree><a:t>第一页标题</a:t><a:t>第一页内容</a:t></p:spTree></p:cSld></p:sld>",
    });

    const draft = await parseEvidenceDocument({
      data,
      name: "slides.pptx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });

    expect(draft.snippet).toContain("第一页标题");
    expect(draft.snippet).toContain("第一页内容");
  });

  test("redacts obvious secrets from parsed document text", async () => {
    const draft = await parseEvidenceDocument({
      data: new TextEncoder().encode(
        "Authorization: Bearer secret-openai-key",
      ).buffer,
      name: "debug.txt",
      type: "text/plain",
    });

    expect(draft.snippet).not.toContain("Authorization");
    expect(draft.snippet).not.toContain("Bearer");
    expect(draft.snippet).not.toContain("secret-openai-key");
  });

  test("rejects unsupported file types", async () => {
    await expect(
      parseEvidenceDocument({
        data: new Uint8Array([1, 2, 3]).buffer,
        name: "image.png",
        type: "image/png",
      }),
    ).rejects.toThrow("unsupported evidence file type");
  });
});

async function createZipBuffer(files: Record<string, string>) {
  const zip = new JSZip();

  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }

  return await zip.generateAsync({ type: "arraybuffer" });
}

function createMinimalPdf(text: string) {
  return new TextEncoder().encode(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 43 >>
stream
BT /F1 24 Tf 100 700 Td (${text}) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer
<< /Root 1 0 R /Size 6 >>
startxref
404
%%EOF`).buffer;
}
