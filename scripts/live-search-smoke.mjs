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
];

const apiKey = getTavilyApiKey();

if (!apiKey) {
  console.log(
    "[skip] TAVILY_API_KEY is not set. Live Tavily smoke test was skipped.",
  );
  process.exit(0);
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
      NODE_ENV: "development",
      NODE_OPTIONS: withEnvProxy(process.env.NODE_OPTIONS),
      SEARCH_DEBUG_ENABLED: "true",
      SEARCH_PROVIDER: searchProvider,
      TAVILY_API_KEY: apiKey,
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
    : `${nodeOptions} --use-env-proxy`.trim();
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

function pushLog(logs, chunk) {
  logs.push(String(chunk).replace(/Bearer\s+\S+/gi, "Bearer [redacted]"));
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
  const timeout = setTimeout(() => controller.abort(), 90000);

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