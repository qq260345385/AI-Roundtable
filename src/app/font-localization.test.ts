import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("offline font configuration", () => {
  test("does not depend on Google Fonts at build time", () => {
    const layoutSource = readFileSync(
      join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(layoutSource).not.toContain("next/font/google");
    expect(layoutSource).not.toContain("Geist");
  });

  test("uses local system font variables instead of Geist variables", () => {
    const cssSource = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(cssSource).not.toContain("--font-geist");
    expect(cssSource).toContain("--font-sans-local");
    expect(cssSource).toContain("--font-mono-local");
  });
});
