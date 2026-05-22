<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Product Direction

AI Roundtable is a consumer-facing AI roundtable meeting product, not a developer debugging tool.

Any new feature must default to a simple, visually restrained, low-cognitive-load experience. Complex data may be kept in internal data structures, tests, logs, or an explicit developer mode, but it should not be shown by default to ordinary users.

The primary frontend experience should serve this core flow first: quickly enter a topic, choose models, and get a clear conclusion.
