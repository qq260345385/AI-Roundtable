import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("Home page hydration safety", () => {
  test("does not read localStorage inside useState initializers", () => {
    const source = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");

    expect(source).not.toMatch(/useState<[^>]+>\(\s*\(\)\s*=>\s*{[\s\S]*?localStorage/);
    expect(source).not.toMatch(/useState\(\s*\(\)\s*=>\s*{[\s\S]*?localStorage/);
  });
});
