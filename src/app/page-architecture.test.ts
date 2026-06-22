import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("home page architecture", () => {
  test("keeps page.tsx focused on orchestration instead of inline panels", () => {
    const source = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
    const lineCount = source.split(/\r?\n/).length;

    expect(lineCount).toBeLessThanOrEqual(650);
    expect(source).not.toContain("function EvidencePackEditor");
    expect(source).not.toContain("function MeetingHistoryPanel");
    expect(source).not.toContain("function ModelChoiceDialog");
    expect(source).not.toContain("function ProviderModeNotice");
  });
});
