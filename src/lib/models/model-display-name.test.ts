import { describe, expect, test } from "vitest";
import { formatModelDisplayName } from "./model-display-name";

describe("formatModelDisplayName", () => {
  test("formats common provider model ids as readable model names", () => {
    expect(formatModelDisplayName("deepseek-v4-flash")).toBe(
      "DeepSeek V4 Flash",
    );
    expect(formatModelDisplayName("deepseek-v4-pro")).toBe("DeepSeek V4 Pro");
    expect(formatModelDisplayName("mimo-v2.5-pro")).toBe("MiMo V2.5 Pro");
    expect(formatModelDisplayName("gpt-4o-mini")).toBe("GPT 4o Mini");
    expect(formatModelDisplayName("claude-3.5-sonnet")).toBe(
      "Claude 3.5 Sonnet",
    );
  });

  test("keeps unknown ids readable without adding display-name prefixes", () => {
    expect(formatModelDisplayName("custom-alpha_model")).toBe(
      "Custom Alpha Model",
    );
  });
});
