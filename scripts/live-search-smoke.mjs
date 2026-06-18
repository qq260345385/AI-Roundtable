import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const scenarios = [
  {
    id: "ai-model-latest-benchmark",
    title: "AI 模型最新能力对比类议题",
    question:
      "How strong is DeepSeek V3 in current global AI model benchmarks?",
  },
  {
    id: "official-technical-docs",
    title: "技术文档/官方资料类议题",
    question:
      "What do the official Next.js 16 docs say about app router caching changes?",
  },
  {
    id: "low-quality-chinese-web",
    title: "中文互联网资料质量较低的议题",
    question: "中文社区讨论里某个未官宣 AI 手机助手能力是否已经上线？",
  },
  {
    id: "hard-to-verify-low-evidence",
    title: "低证据或难以核验议题",
    question:
      "Is a rumored unreleased private AI model already outperforming all public benchmarks?",
  },
  {
    id: "policy-regulation",
    title: "政策/监管类议题",
    question:
      "How should companies evaluate the latest AI governance and model safety regulation updates?",
  },
  {
    id: "product-comparison",
    title: "产品能力/场景对比类议题",
    question:
      "Compare Kimi, GLM, GPT-4o, and Claude in Chinese office automation and coding assistance scenarios.",
  },
];

const apiKey = getTavilyApiKey();

if (!apiKey) {
  console.log(
    "[skip] TAVILY_API_KEY is not set. Live Tavily smoke test was skipped.",
  );
  process.exit(0);
}

const preflight = await runTavilySearchPreflight(apiKey);
console.log(
  JSON.stringify(
    {
      tavilyPreflight: preflight,
    },
    null,
    2,
  ),
);

if (preflight.errorKind !== "ok") {
  console.error(
    `[error] Tavily Search preflight failed before meeting smoke: ${preflight.errorKind}`,
  );
  process.exit(1);
}

const port = Number(process.env.LIVE_SEARCH_PORT ?? 3217);
const externalBaseUrl = process.env.LIVE_SEARCH_BASE_URL?.trim().replace(/\/+$/, "");
const usingExternalServer = Boolean(externalBaseUrl);
const baseUrl = externalBaseUrl || `http://127.0.0.1:${port}`;

if (!usingExternalServer && !existsSync(".next/BUILD_ID") && !existsSync(".next")) {
  console.warn(
    "[warn] .next directory was not found. `npm run dev` can compile on the fly, but a prior `npm run build` is recommended.",
  );
}

const searchProvider = process.env.SEARCH_PROVIDER?.trim() || "tavily";
const searchModes = getSearchModes();

let server;
let logs = [];

function spawnDevServer() {
  const startCommand = getStartCommand(port);
  const child = spawn(startCommand.command, startCommand.args, {
    env: {
      ...process.env,
      AI_ROUNDTABLE_MODE: "mock",
      EVIDENCE_OVERALL_TIMEOUT_MS:
        process.env.EVIDENCE_OVERALL_TIMEOUT_MS ?? "180000",
      EVIDENCE_PASS_TIMEOUT_MS:
        process.env.EVIDENCE_PASS_TIMEOUT_MS ?? "45000",
      NODE_ENV: "development",
      NODE_OPTIONS: withEnvProxy(process.env.NODE_OPTIONS),
      SEARCH_DEBUG_ENABLED: "true",
      SEARCH_PROVIDER: searchProvider,
      TAVILY_API_KEY: apiKey,
      TAVILY_SEARCH_TIMEOUT_MS:
        process.env.TAVILY_SEARCH_TIMEOUT_MS ?? "45000",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  logs = [];
  child.stdout.on("data", (chunk) => pushLog(logs, chunk));
  child.stderr.on("data", (chunk) => pushLog(logs, chunk));

  return child;
}

if (!usingExternalServer) {
  server = spawnDevServer();
}

try {
  if (!usingExternalServer) {
    await waitForServer(baseUrl);
  } else {
    console.log(`[live-search] using external server at ${baseUrl}`);
  }
  const summaries = [];
  const scenarioLimit = Number(process.env.LIVE_SEARCH_SCENARIO_LIMIT ?? scenarios.length);

  for (const searchMode of searchModes) {
    for (const scenario of scenarios.slice(0, scenarioLimit)) {
      console.log(`[live-search] running ${scenario.id} (${searchMode})`);
      const body = await postMeetingScenario(baseUrl, scenario.question, searchMode);
      const evidencePack = body.meeting?.evidencePack;
      const searchProcess = body.meeting?.debugSearchProcess;

      assertLiveSearchShape(scenario.id, evidencePack, searchProcess);

      summaries.push({
        id: scenario.id,
        title: scenario.title,
        searchMode,
        evidenceMode: searchProcess.evidenceMode,
        searchProvider: searchProcess.provider ?? searchProvider,
        searchIntent: summarizeSearchIntents(searchProcess.searchIntents),
        searchQueries: searchProcess.executedQueries,
        rawCandidateCount:
          searchProcess.rawCandidateCount ??
          searchProcess.dedupeStats?.originalResultCount ??
          0,
        dedupedCandidateCount:
          searchProcess.dedupedCandidateCount ??
          searchProcess.dedupeStats?.dedupedResultCount ??
          0,
        extractAttempted: searchProcess.extractAttempted ?? 0,
        extractedCandidateCount: searchProcess.extractedCandidateCount ?? 0,
        evidencePackItemCount: evidencePack.items.length,
        selectedEvidenceTarget: searchProcess.selectedEvidenceTarget ?? 0,
        selectedEvidenceCount: searchProcess.selectedEvidenceCount ?? 0,
        candidateShortfall: searchProcess.candidateShortfall ?? 0,
        fallbackTriggeredReason: searchProcess.fallbackTriggeredReason ?? "",
        passStats: summarizePassStats(searchProcess.passStats ?? []),
        topRawCandidates:
          searchProcess.debugSummary?.topRawCandidates ??
          searchProcess.topRawCandidates ??
          [],
        zeroPackAfterSuccessfulSearch:
          searchProcess.evidenceMode !== "search_failed" &&
          evidencePack.items.length === 0,
        qualityDistribution:
          searchProcess.qualityDistribution ??
          summarizeEvidenceReliability(evidencePack.items),
        filteredCount: searchProcess.qualityOverview.filteredCount,
        filteredReasons: searchProcess.filteredReasons,
        cache: summarizeCacheEvents(searchProcess.cacheEvents ?? []),
        dedupe: {
          originalResultCount: searchProcess.dedupeStats?.originalResultCount ?? 0,
          dedupedResultCount: searchProcess.dedupeStats?.dedupedResultCount ?? 0,
          removedDuplicateCount:
            searchProcess.dedupeStats?.removedDuplicateCount ?? 0,
          removedSameDomainCount:
            searchProcess.dedupeStats?.removedSameDomainCount ?? 0,
        },
      });
    }
  }

  console.log(JSON.stringify({ searchProvider, searchModes, scenarios: summaries }, null, 2));
} catch (error) {
  console.error("[error] Live Tavily smoke test failed.");
  console.error(error instanceof Error ? error.message : String(error));
  console.error("[server logs]");
  console.error(logs.slice(-20).join(""));
  process.exitCode = 1;
} finally {
  if (!usingExternalServer) {
    await stopServer(port);
  }
}

function getStartCommand(port) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `npm run dev -- -p ${port}`],
    };
  }

  return {
    command: "npm",
    args: ["run", "dev", "--", "-p", `${port}`],
  };
}

function withEnvProxy(nodeOptions = "") {
  return nodeOptions.includes("--use-env-proxy")
    ? nodeOptions
    : hasValidHttpProxyEnv()
      ? `${nodeOptions} --use-env-proxy`.trim()
      : nodeOptions;
}

function hasValidHttpProxyEnv() {
  const proxyValues = [
    process.env.HTTP_PROXY,
    process.env.HTTPS_PROXY,
    process.env.ALL_PROXY,
    process.env.http_proxy,
    process.env.https_proxy,
    process.env.all_proxy,
  ].filter(Boolean);

  if (proxyValues.length === 0) {
    return false;
  }

  return proxyValues.every((value) => {
    try {
      const parsed = new URL(value);

      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  });
}

function getTavilyApiKey() {
  const directKey = process.env.TAVILY_API_KEY?.trim();

  if (directKey) {
    return directKey;
  }

  if (!existsSync(".env.local")) {
    return "";
  }

  const envText = readFileSync(".env.local", "utf8");
  const line = envText
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith("TAVILY_API_KEY="));

  if (!line) {
    return "";
  }

  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

async function runTavilySearchPreflight(apiKey) {
  const endpoint = "https://api.tavily.com/search";
  const startedAt = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        include_answer: false,
        include_images: false,
        include_raw_content: false,
        max_results: 1,
        query: "Tavily API preflight",
        search_depth: "basic",
        topic: "general",
      }),
    });
    const responseTextSnippet = sanitizeForLog(await response.text()).slice(0, 300);
    const errorKind = response.ok
      ? "ok"
      : classifyTavilyHttpStatus(response.status);

    return {
      provider: "tavily",
      endpoint: "/search",
      errorKind,
      httpStatus: response.status,
      responseTextSnippet,
      requestHasApiKey: Boolean(apiKey),
      apiKeyLength: apiKey.length,
      nodeVersion: process.version,
      fetchAvailable: typeof fetch === "function",
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      provider: "tavily",
      endpoint: "/search",
      errorKind: "network_error",
      safeMessage: sanitizeForLog(
        error instanceof Error ? error.message : String(error),
      ).slice(0, 120),
      errorName: error instanceof Error ? error.name : undefined,
      isAbortError: error instanceof Error && error.name === "AbortError",
      isTypeError: error instanceof TypeError,
      requestHasApiKey: Boolean(apiKey),
      apiKeyLength: apiKey.length,
      nodeVersion: process.version,
      fetchAvailable: typeof fetch === "function",
      elapsedMs: Date.now() - startedAt,
    };
  }
}

function classifyTavilyHttpStatus(status) {
  if (status === 400) {
    return "invalid_request";
  }

  if (status === 401 || status === 403) {
    return "unauthorized";
  }

  if (status === 429) {
    return "rate_limited";
  }

  if (status >= 200 && status < 300) {
    return "ok";
  }

  return "unknown_error";
}

function pushLog(logs, chunk) {
  logs.push(sanitizeForLog(String(chunk)));
}

function sanitizeForLog(value) {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/tvly-[A-Za-z0-9._~+/=-]+/gi, "tvly-[redacted]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]");
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 60000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error("Next dev server exited before becoming ready.");
    }

    try {
      const response = await fetch(baseUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    await delay(500);
  }

  throw new Error("Timed out waiting for the Next dev server.");
}

function getSearchModes() {
  const requested = process.env.SEARCH_MODE?.trim();

  if (requested === "standard" || requested === "deep") {
    return [requested];
  }

  if (process.env.LIVE_SEARCH_BOTH_MODES === "true") {
    return ["standard", "deep"];
  }

  return ["standard"];
}

async function postMeetingScenario(baseUrl, question, searchMode) {
  const controller = new AbortController();
  const timeoutMs = Number(process.env.LIVE_SEARCH_MEETING_TIMEOUT_MS ?? 300000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/api/meeting`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        isBriefMode: true,
        participantIds: ["gpt-mock"],
        question,
        searchMode,
        webSearchEnabled: true,
      }),
      signal: controller.signal,
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(`Meeting API returned ${response.status}: ${body.error}`);
    }

    return body;
  } finally {
    clearTimeout(timeout);
  }
}

function assertLiveSearchShape(scenarioId, evidencePack, searchProcess) {
  if (!evidencePack) {
    throw new Error(`${scenarioId}: evidencePack is missing from meeting response`);
  }

  if (!searchProcess) {
    const hints = [
      `Scenario: ${scenarioId}`,
      "",
      "debugSearchProcess is missing from the API response.",
      "",
      "This usually means the server is running in production mode,",
      "which strips debugSearchProcess as a security measure.",
      "",
      "Fix options:",
    ];

    if (usingExternalServer) {
      hints.push(
        "1. Ensure LIVE_SEARCH_BASE_URL points to a dev-mode server.",
        "2. Start the target server with: npm run dev -- -p <port>",
        "3. Set SEARCH_DEBUG_ENABLED=true in the target server environment.",
        "4. Confirm NODE_ENV is NOT 'production' on the target server.",
      );
    } else {
      hints.push(
        "1. The script now uses `npm run dev` (not `npm start`).",
        "2. Verify SEARCH_DEBUG_ENABLED=true is set in the spawned process.",
        "3. If a custom start command is used, ensure NODE_ENV=development.",
      );
    }

    hints.push(
      "",
      "Security rule: debugSearchProcess requires BOTH:",
      "  SEARCH_DEBUG_ENABLED=true",
      "  NODE_ENV !== 'production'",
      "",
      "Production mode always strips debugSearchProcess for user safety.",
    );

    throw new Error(hints.join("\n"));
  }

  if (!Array.isArray(evidencePack.items)) {
    throw new Error(`${scenarioId}: evidencePack.items is not an array`);
  }

  if (!Array.isArray(searchProcess.searchIntents)) {
    throw new Error(`${scenarioId}: searchIntents is not an array`);
  }

  if (!Array.isArray(searchProcess.executedQueries)) {
    throw new Error(`${scenarioId}: executedQueries is not an array`);
  }

  if (!searchProcess.evidenceMode) {
    throw new Error(`${scenarioId}: evidenceMode is missing`);
  }

  if (searchProcess.evidenceMode === "search_failed") {
    throw new Error(
      `${scenarioId}: Tavily search failed with reason ${
        searchProcess.failureReason ?? "unknown_error"
      }`,
    );
  }
}

function summarizeSearchIntents(records) {
  return records.flatMap((record) =>
    record.intents.map((intent) => ({
      participantName: record.participantName,
      question: intent.question,
      mustInclude: intent.mustInclude,
      shouldInclude: intent.shouldInclude,
      exclude: intent.exclude,
      freshness: intent.freshness,
      sourcePreference: intent.sourcePreference,
      rationale: intent.rationale,
    })),
  );
}

function summarizeCacheEvents(events) {
  return {
    hitCount: events.filter((event) => event.cacheStatus === "hit").length,
    missCount: events.filter((event) => event.cacheStatus === "miss").length,
  };
}

function summarizePassStats(passStats) {
  return passStats.map((stat) => ({
    passName: stat.passName,
    query: stat.query,
    resultCount: stat.resultCount,
    skippedReason: stat.skippedReason ?? "",
    errorType: stat.errorType ?? "",
    searchParameters: stat.searchParameters ?? {},
  }));
}

function summarizeEvidenceReliability(items) {
  return {
    high: items.filter((item) => item.quality?.reliability === "high").length,
    medium: items.filter((item) => item.quality?.reliability === "medium").length,
    low: items.filter((item) => item.quality?.reliability === "low").length,
    very_low: items.filter((item) => item.quality?.reliability === "very_low")
      .length,
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopServer(port) {
  server.kill();

  if (process.platform !== "win32") {
    return;
  }

  try {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `$listeners = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess; foreach ($procId in $listeners) { Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue }`,
      ],
      { stdio: "ignore" },
    );

    await new Promise((resolve) => child.on("exit", resolve));
  } catch {
    // Best-effort cleanup only.
  }
}
