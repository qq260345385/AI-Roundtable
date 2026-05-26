const ROLE_LEAK_PATTERN = /(?:我是|作为|我作为)[^，。；\n]{0,40}分析师/;
const LEADING_ROLE_LEAK_PATTERN =
  /^\s*(?:我是|作为|我作为)[^，。；\n]{0,40}分析师[，,。；:：\s]*/;

export function sanitizeRoleLeak(content: string): string {
  if (!ROLE_LEAK_PATTERN.test(content)) {
    return content;
  }

  warnRoleLeak(content);

  return content.replace(LEADING_ROLE_LEAK_PATTERN, "").trimStart();
}

function warnRoleLeak(content: string) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.warn(
    "roleLeak warning: model output contained a fixed analyst self-introduction.",
    content.match(ROLE_LEAK_PATTERN)?.[0] ?? "",
  );
}
