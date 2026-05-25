const TOKEN_DISPLAY_NAMES = new Map<string, string>([
  ["api", "API"],
  ["claude", "Claude"],
  ["deepseek", "DeepSeek"],
  ["flash", "Flash"],
  ["gemini", "Gemini"],
  ["gpt", "GPT"],
  ["glm", "GLM"],
  ["kimi", "Kimi"],
  ["mini", "Mini"],
  ["mimo", "MiMo"],
  ["mock", "Mock"],
  ["pro", "Pro"],
  ["qwen", "Qwen"],
  ["sonnet", "Sonnet"],
]);

export function formatModelDisplayName(model: string): string {
  const tokens = model
    .trim()
    .split(/[-_\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return model;
  }

  return tokens.map(formatModelToken).join(" ");
}

function formatModelToken(token: string): string {
  const normalized = token.toLowerCase();
  const knownDisplayName = TOKEN_DISPLAY_NAMES.get(normalized);

  if (knownDisplayName) {
    return knownDisplayName;
  }

  if (/^v\d/.test(normalized)) {
    return `V${token.slice(1)}`;
  }

  if (/^\d/.test(token)) {
    return token;
  }

  return `${token.slice(0, 1).toUpperCase()}${token.slice(1).toLowerCase()}`;
}
