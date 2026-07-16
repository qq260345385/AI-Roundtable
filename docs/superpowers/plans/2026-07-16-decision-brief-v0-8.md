# AI Roundtable v0.8.0 Decision Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a focused meeting setup and a conclusion-first decision brief that remains useful under low evidence or partial failures while preserving the full meeting trail.

**Architecture:** Extend `MeetingSummary` with an optional wire-compatible `DecisionBrief`, normalize it in a dedicated pure module, and route both synchronous and streaming engines through one summary-finalization function before persistence or rendering. Keep orchestration in `page.tsx`, decision presentation in a dedicated component, legacy summary detail behind disclosure controls, and search internals unchanged.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2.4, TypeScript 5, Tailwind CSS 4, Vitest 4.1.7, React server rendering tests, Playwright 1.61.1, npm, GitHub Actions.

## Global Constraints

- Work in `D:\AI Roundtable-git`; treat `D:\AI Roundtable` as the run directory only. Before every task, run `git status --short` and preserve unrelated changes.
- Follow the approved design at `docs/superpowers/specs/2026-07-16-decision-brief-v0-8-design.md` and the repository `AGENTS.md` product direction.
- Before changing a Next.js API, routing, or testing convention, read the matching guide under `node_modules/next/dist/docs/`; use role-based Playwright locators because hidden disclosure content must not satisfy visible-result assertions.
- Keep `MeetingSummary.decisionBrief` optional at API and persistence boundaries. Completed UI paths must call the normalizer and never read the optional field directly.
- Do not rewrite `evidence-pack.ts`, search planning, provider configuration, or add account/database/cloud features.
- Do not expose raw provider bodies, tokens, authorization headers, secrets, or stack traces in decision gaps, export, or UI.
- Preserve the existing three meeting phases and do not render a recommendation before the finalized `summary` event.
- Use TDD: add one focused failing assertion, observe the expected failure, implement the minimum behavior, then rerun the focused test.
- After each task, run its focused tests and `npx tsc --noEmit`; before release run the complete verification matrix in Task 8.
- Use Conventional Commit-style messages shown below. Do not publish, push, or open a PR unless the user separately authorizes it.

---

### Task 1: Establish the decision-brief contract and pure compatibility rules

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/meeting/decision-brief.ts`
- Create: `src/lib/meeting/decision-brief.test.ts`

**Interfaces:**
- Consumes: optional untrusted `MeetingSummary.decisionBrief`, legacy summary arrays, `EvidencePack`, `CitationCheckResult`, and `MeetingProviderFailure[]`.
- Produces: `DecisionBrief`, `createEmptyDecisionBrief()`, `normalizeDecisionBrief(summary)`, and `applyDecisionBriefQualityGate(brief, summary, context)`.

- [ ] **Step 1: Add the failing contract and normalization tests**

Create tests for a valid brief, dirty strings, duplicate/oversized arrays, a legacy summary, a completely empty summary, low evidence, invalid citations, partial failures, severe disagreement, and insufficient participants. Pin the deterministic limits in the test:

```ts
const limits = {
  recommendation: 320,
  item: 220,
  list: 5,
  nextAction: 220,
};

test("converts a legacy summary into a tentative low-confidence view", () => {
  const brief = normalizeDecisionBrief({
    consensus: ["先进行两周小规模试点。"],
    differences: ["成本上限仍有分歧。"],
    minorityViews: [],
    risks: ["样本量有限。"],
    nextSteps: ["指定负责人并启动试点。"],
  });

  expect(brief).toMatchObject({
    recommendation: "先进行两周小规模试点。",
    status: "tentative",
    confidence: "low",
    nextAction: "指定负责人并启动试点。",
  });
  expect(brief.reversalConditions).not.toHaveLength(0);
});
```

Run:

```powershell
npx vitest run src/lib/meeting/decision-brief.test.ts
```

Expected: FAIL because the types and module do not exist.

- [ ] **Step 2: Add the wire-compatible types**

Add these exact public types to `src/lib/types.ts` and append `decisionBrief?: DecisionBrief` to `MeetingSummary`:

```ts
export type DecisionStatus = "firm" | "tentative" | "unavailable";
export type DecisionConfidence = "high" | "medium" | "low";

export type DecisionBrief = {
  recommendation: string;
  status: DecisionStatus;
  rationale: string[];
  conditions: string[];
  risks: string[];
  confidence: DecisionConfidence;
  evidenceGaps: string[];
  reversalConditions: string[];
  nextAction: string;
};
```

- [ ] **Step 3: Implement conservative normalization**

In `decision-brief.ts`, export the limits so tests and UI do not invent separate constraints. Use whitespace trimming, empty removal, stable de-duplication, and truncation without parsing claims or citations.

```ts
export const DECISION_BRIEF_LIMITS = {
  recommendation: 320,
  item: 220,
  list: 5,
  nextAction: 220,
} as const;

export function normalizeDecisionBrief(summary: MeetingSummary): DecisionBrief {
  const raw = isRecord(summary.decisionBrief) ? summary.decisionBrief : undefined;
  const recommendation = cleanText(raw?.recommendation, 320)
    || cleanText(summary.consensus[0], 320)
    || cleanText(summary.nextSteps[0], 320);

  if (!recommendation) {
    return createUnavailableDecisionBrief("本轮未形成可执行推荐。");
  }

  const isLegacy = !hasCompleteDecisionBrief(raw);
  return {
    recommendation,
    status: isLegacy ? "tentative" : readStatus(raw.status),
    rationale: cleanList(raw?.rationale, summary.consensus),
    conditions: cleanList(raw?.conditions),
    risks: cleanList(raw?.risks, [...summary.differences, ...summary.risks]),
    confidence: isLegacy ? "low" : readConfidence(raw.confidence),
    evidenceGaps: cleanList(raw?.evidenceGaps, summary.insufficientlyConfirmed),
    reversalConditions: cleanList(
      raw?.reversalConditions,
      summary.differences.map((item) => `若“${item}”得到验证，应重新评估推荐。`),
    ),
    nextAction: cleanText(raw?.nextAction, 220)
      || cleanText(summary.nextSteps[0], 220)
      || "补充关键资料后重新开会。",
  };
}
```

Use one legal placeholder for streaming state:

```ts
export function createEmptyDecisionBrief(): DecisionBrief {
  return createUnavailableDecisionBrief("会议总结尚未生成。");
}
```

- [ ] **Step 4: Implement downgrade-only quality rules**

Define `severeDisagreement` as `summary.consensus.length === 0 && summary.differences.length >= 2`. Treat any of these as downgrade reasons:

- `evidencePack.evidenceStatus === "low"`
- `evidencePack.searchProcess?.evidenceMode` is `low_evidence`, `search_failed`, `no_reliable_sources`, or `realtime_unverified`
- `citationCheck.hasInvalidCitations` or `citationCheck.hasCitationDisciplineWarning`
- at least one provider failure
- severe disagreement
- missing/incomplete original `decisionBrief`

Low evidence, invalid citations, partial failures, or severe disagreement force `tentative` and `low`; a milder incomplete brief forces at least `tentative` and at most `medium`. `insufficientParticipants` or an unavailable normalized recommendation forces `unavailable`/`low`. Add one sanitized, user-readable item to `evidenceGaps` and one observable item to `reversalConditions` for every applicable class; never copy `failure.message` or `responseBodySummary`.

```ts
export type DecisionBriefQualityContext = {
  citationCheck?: CitationCheckResult;
  evidencePack?: EvidencePack;
  failures?: MeetingProviderFailure[];
  insufficientParticipants?: boolean;
};
```

- [ ] **Step 5: Verify the pure module**

Run:

```powershell
npx vitest run src/lib/meeting/decision-brief.test.ts
npx tsc --noEmit
```

Expected: all decision-brief tests pass and TypeScript accepts the optional boundary field.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/types.ts src/lib/meeting/decision-brief.ts src/lib/meeting/decision-brief.test.ts
git commit -m "feat: add decision brief contract"
```

---

### Task 2: Generate and parse decision briefs from real and mock providers

**Files:**
- Modify: `src/lib/providers/openai-compatible-provider.ts`
- Modify: `src/lib/providers/openai-compatible-provider.test.ts`
- Modify: `src/lib/providers/mock-provider.ts`
- Modify: `src/lib/providers/mock-provider.test.ts`

**Interfaces:**
- Consumes: provider JSON/Markdown responses and the existing `ModelProvider.generateSummary` signature.
- Produces: `MeetingSummary` with an optional parsed `decisionBrief`; legacy parser fallback remains valid.

- [ ] **Step 1: Add failing parser and prompt assertions**

Add a `parseSummary` case with the complete nested object and assert all fields survive. Extend prompt tests to require `decisionBrief`, a single recommendation, conditions, reversal conditions, and one next action. Keep an old three-array JSON fixture and assert it still parses with `decisionBrief` absent.

```ts
expect(parseSummary(JSON.stringify({
  consensus: ["试点风险可控。"],
  differences: ["预算边界未定。"],
  risks: ["供应商锁定。"],
  nextSteps: ["启动两周试点。"],
  decisionBrief: {
    recommendation: "先启动两周试点，再决定全面采购。",
    status: "firm",
    rationale: ["可用较低成本验证核心假设。"],
    conditions: ["试点预算不超过既定上限。"],
    risks: ["供应商锁定。"],
    confidence: "medium",
    evidenceGaps: [],
    reversalConditions: ["若核心指标低于基线则停止采购。"],
    nextAction: "今天指定试点负责人。",
  },
})).decisionBrief?.status).toBe("firm");
```

Run:

```powershell
npx vitest run src/lib/providers/openai-compatible-provider.test.ts src/lib/providers/mock-provider.test.ts
```

Expected: FAIL because the prompt/parser/mock output does not include the new object.

- [ ] **Step 2: Extend the summary prompt without removing legacy sections**

Change `generateSummary` to request one JSON object containing all existing summary keys plus `decisionBrief`. State explicitly that:

- the recommendation must be one actionable sentence;
- reasons must come only from valid turns and supplied evidence;
- model agreement is not external proof;
- low evidence requires `tentative`/`low`;
- `nextAction` is one concrete near-term action;
- all nine `DecisionBrief` fields are mandatory.

Do not change `ModelProvider.generateSummary` or API request shapes.

- [ ] **Step 3: Parse the nested object defensively**

Extend `buildSummaryFromParsed` to copy only strings, known enums, and string arrays from `data.decisionBrief`. Do not normalize quality here; malformed or partial objects are intentionally left for Task 1's central normalizer. Preserve `summaryDebug` behavior and current fallback generation.

```ts
decisionBrief: readDecisionBrief(data.decisionBrief),
```

Only spread the property when `readDecisionBrief` returns a value so legacy parser snapshots stay compatible.

- [ ] **Step 4: Refresh MockProvider around current product behavior**

Replace stale roadmap phrases such as “增加用户输入议题” and “接入真实 Provider”. Make the independent view, response, and summary depend on `topic`, explain tradeoffs, and return a complete deterministic brief. The Mock recommendation should be suitable for the quick-start E2E flow, for example:

```ts
decisionBrief: {
  recommendation: `围绕“${topic}”先执行一个范围明确、可回滚的小规模方案。`,
  status: "firm",
  rationale: ["先验证关键假设可以降低一次性投入风险。"],
  conditions: ["提前定义成功指标、负责人和停止条件。"],
  risks: ["Mock 模式不包含外部事实核验。"],
  confidence: "medium",
  evidenceGaps: ["如议题依赖实时事实，需要启用联网资料后复核。"],
  reversalConditions: ["若试点指标明显低于基线，则停止并重新评估。"],
  nextAction: "今天确认一个试点负责人和成功指标。",
}
```

- [ ] **Step 5: Verify providers**

Run:

```powershell
npx vitest run src/lib/providers/openai-compatible-provider.test.ts src/lib/providers/mock-provider.test.ts
npx tsc --noEmit
```

Expected: provider tests pass; old summary formats continue to parse; no stale roadmap assertions remain.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/providers/openai-compatible-provider.ts src/lib/providers/openai-compatible-provider.test.ts src/lib/providers/mock-provider.ts src/lib/providers/mock-provider.test.ts
git commit -m "feat: generate decision briefs"
```

---

### Task 3: Finalize synchronous and streaming summaries through one path

**Files:**
- Create: `src/lib/meeting/summary-finalization.ts`
- Create: `src/lib/meeting/summary-finalization.test.ts`
- Modify: `src/lib/meeting/engine.ts`
- Modify: `src/lib/meeting/engine.test.ts`
- Modify: `src/lib/meeting/live-engine.ts`
- Modify: `src/lib/meeting/live-state.ts`
- Modify: `src/lib/meeting/live-state.test.ts`
- Modify: `src/app/api/meeting/route.test.ts`
- Modify: `src/app/api/meeting/live/route.test.ts`

**Interfaces:**
- Consumes: raw provider summary, turns, Evidence Pack, provider failures, and insufficient-participant state.
- Produces: `{ summary: MeetingSummary; citationCheck: CitationCheckResult }` with a finalized brief, identically for standard and NDJSON streaming routes.

- [ ] **Step 1: Add a failing shared-finalization test**

Cover ordering explicitly: evidence summary gate first, normalized brief second, citation check across turns plus brief third, decision downgrade last. Assert decision-brief citations are included in the check and an invalid ID downgrades a nominally firm brief.

```ts
const finalized = finalizeMeetingSummary({
  summary: createFirmSummary("依据 [S9] 先试点。"),
  turns: [],
  evidencePack: createEvidencePack(["S1"]),
  failures: [],
  insufficientParticipants: false,
});

expect(finalized.citationCheck.invalidCitationIds).toContain("S9");
expect(finalized.summary.decisionBrief).toMatchObject({
  status: "tentative",
  confidence: "low",
});
```

Run:

```powershell
npx vitest run src/lib/meeting/summary-finalization.test.ts
```

Expected: FAIL because the shared finalizer does not exist.

- [ ] **Step 2: Implement the shared finalizer and canonical citation text**

```ts
export function finalizeMeetingSummary(input: {
  summary: MeetingSummary;
  turns: MeetingTurn[];
  evidencePack?: EvidencePack;
  failures?: MeetingProviderFailure[];
  insufficientParticipants: boolean;
}): { summary: MeetingSummary; citationCheck: CitationCheckResult } {
  const evidenceGated = applyEvidenceQualityGateToSummary(
    input.summary,
    input.evidencePack,
  );
  const normalized = normalizeDecisionBrief(evidenceGated);
  const summaryWithBrief = { ...evidenceGated, decisionBrief: normalized };
  const citationCheck = checkEvidenceCitations(
    collectMeetingCitationText(input.turns, summaryWithBrief),
    input.evidencePack,
  );

  return {
    summary: {
      ...summaryWithBrief,
      decisionBrief: applyDecisionBriefQualityGate(
        normalized,
        evidenceGated,
        {
          citationCheck,
          evidencePack: input.evidencePack,
          failures: input.failures,
          insufficientParticipants: input.insufficientParticipants,
        },
      ),
    },
    citationCheck,
  };
}
```

`collectMeetingCitationText` must include every legacy summary array and all text/array fields in `DecisionBrief`. It must not include debug metadata or provider failure messages.

- [ ] **Step 3: Route `runMeeting` through the finalizer**

Replace the inline evidence-gate/citation-check sequence in `engine.ts`. Pass `shouldFailDueToInsufficientTurns` and the accumulated `failures`. Remove the now-duplicated local `collectMeetingText`. Add focused assertions for:

- normal meeting returns a brief;
- partial failure returns `tentative`/`low`;
- fewer than two valid models returns `unavailable`/`low`;
- existing legacy summary fields remain unchanged.

- [ ] **Step 4: Route `runLiveMeeting` through the same finalizer**

Use the same call and emit the finalized `summary` exactly once before `meeting_completed`. Remove the duplicated citation collector. Put `createEmptyDecisionBrief()` in `EMPTY_SUMMARY`, but keep `MeetingRoom` from displaying it while `isCompleted === false`.

Add tests that consume the stream and assert the `summary` event and `meeting_completed.meeting.summary` contain equal `decisionBrief` objects.

- [ ] **Step 5: Lock the API boundary**

Extend both route tests to assert:

```ts
expect(body.meeting.summary.decisionBrief).toMatchObject({
  recommendation: expect.any(String),
  status: expect.stringMatching(/^(firm|tentative|unavailable)$/),
  confidence: expect.stringMatching(/^(high|medium|low)$/),
});
```

For the live route, parse the NDJSON events and assert no non-final progress event includes a recommendation.

- [ ] **Step 6: Verify engines and routes**

Run:

```powershell
npx vitest run src/lib/meeting/summary-finalization.test.ts src/lib/meeting/engine.test.ts src/lib/meeting/live-state.test.ts src/app/api/meeting/route.test.ts src/app/api/meeting/live/route.test.ts
npx tsc --noEmit
```

Expected: all standard/live tests pass with identical decision semantics.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/meeting/summary-finalization.ts src/lib/meeting/summary-finalization.test.ts src/lib/meeting/engine.ts src/lib/meeting/engine.test.ts src/lib/meeting/live-engine.ts src/lib/meeting/live-state.ts src/lib/meeting/live-state.test.ts src/app/api/meeting/route.test.ts src/app/api/meeting/live/route.test.ts
git commit -m "feat: finalize meeting decisions consistently"
```

---

### Task 4: Preserve compatibility in browser history and make exports conclusion-first

**Files:**
- Modify: `src/lib/meeting/meeting-history.ts`
- Modify: `src/lib/meeting/meeting-history.test.ts`
- Modify: `src/lib/meeting/export-markdown.ts`
- Modify: `src/lib/meeting/export-markdown.test.ts`

**Interfaces:**
- Consumes: current and pre-v0.8 serialized `MeetingHistoryRecord[]`, finalized or legacy `MeetingResult`.
- Produces: normalized in-memory history records without storage mutation; Markdown beginning with the same decision hierarchy as the result page.

- [ ] **Step 1: Add failing legacy-history compatibility tests**

Parse a literal v0.7 record with no `decisionBrief`. Assert the returned in-memory record has `tentative`/`low`, while the original JSON string remains byte-for-byte unchanged and `localStorage` is not involved.

```ts
const serialized = JSON.stringify([legacyRecord]);
const [record] = parseMeetingHistory(serialized);

expect(record.meeting.summary.decisionBrief?.status).toBe("tentative");
expect(serialized).toBe(JSON.stringify([legacyRecord]));
```

Also assert current records retain their complete brief through serialize/parse.

Run:

```powershell
npx vitest run src/lib/meeting/meeting-history.test.ts
```

Expected: FAIL because records are currently returned without normalization.

- [ ] **Step 2: Normalize only the in-memory record**

After `isMeetingHistoryRecord`, return a cloned record with a cloned meeting/summary and `decisionBrief: normalizeDecisionBrief(record.meeting.summary)`. Keep `serializeMeetingHistory` unchanged so no migration write occurs merely by reading history.

- [ ] **Step 3: Add failing Markdown order and downgrade tests**

Require the first meeting-content section after topic/status notices to be `## 决策简报`, with these subheadings in order:

1. `### 推荐结论`
2. `### 状态与置信度`
3. `### 核心理由`
4. `### 成立条件`
5. `### 风险与主要反对意见`
6. `### 缺失证据`
7. `### 推翻条件`
8. `### 下一步行动`

Assert a legacy summary exports a tentative/low compatible brief and that the original third-stage and Evidence sections still appear later.

Run:

```powershell
npx vitest run src/lib/meeting/export-markdown.test.ts
```

Expected: FAIL because export is currently evidence/transcript-first.

- [ ] **Step 4: Implement one conclusion-first export helper**

Call `normalizeDecisionBrief(meeting.summary)` inside export and append the decision section immediately after meeting status/fact notice. Reuse the canonical labels, sanitize every string, and include decision-brief fields in `collectExportCitationText`. Do not drop participants, phases, old summary, Evidence, citation status, failures, or optional debug sections.

```ts
function appendDecisionBrief(lines: string[], meeting: MeetingResult) {
  const brief = normalizeDecisionBrief(meeting.summary);
  lines.push("## 决策简报", "");
  appendParagraph(lines, "推荐结论", brief.recommendation);
  appendParagraph(lines, "状态与置信度", `${formatStatus(brief.status)} · ${formatConfidence(brief.confidence)}`);
  appendList(lines, "核心理由", brief.rationale);
  appendList(lines, "成立条件", brief.conditions);
  appendList(lines, "风险与主要反对意见", brief.risks);
  appendList(lines, "缺失证据", brief.evidenceGaps);
  appendList(lines, "推翻条件", brief.reversalConditions);
  appendParagraph(lines, "下一步行动", brief.nextAction);
}
```

- [ ] **Step 5: Verify history and export**

Run:

```powershell
npx vitest run src/lib/meeting/meeting-history.test.ts src/lib/meeting/export-markdown.test.ts
npx tsc --noEmit
```

Expected: both current and legacy formats pass, and export ordering is deterministic.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/meeting/meeting-history.ts src/lib/meeting/meeting-history.test.ts src/lib/meeting/export-markdown.ts src/lib/meeting/export-markdown.test.ts
git commit -m "feat: preserve and export decision briefs"
```

---

### Task 5: Make the completed meeting default to a traceable decision brief

**Files:**
- Create: `src/components/roundtable/DecisionBriefPanel.tsx`
- Create: `src/components/roundtable/DecisionBriefPanel.test.tsx`
- Create: `src/components/roundtable/MeetingTraceabilityPanel.tsx`
- Create: `src/components/roundtable/MeetingTraceabilityPanel.test.tsx`
- Create: `src/components/roundtable/MeetingRoom.test.tsx`
- Modify: `src/components/roundtable/MeetingRoom.tsx`
- Modify: `src/lib/i18n/ui-text.ts`
- Delete: `src/components/roundtable/MeetingBoard.tsx`
- Delete: `src/components/roundtable/MeetingBoard.test.tsx`
- Delete: `src/components/roundtable/SummaryPanel.tsx`
- Delete: `src/components/roundtable/TranscriptPanel.tsx`

**Interfaces:**
- Consumes: `MeetingResult`, normalized `DecisionBrief`, `isCompleted`, and bilingual `UiText`.
- Produces: a conclusion-first summary-stage view with semantic labels and collapsed traceability details.

- [ ] **Step 1: Audit production imports before deletion**

Run:

```powershell
rg -n "MeetingBoard|MeetingRecapPanel|SummaryPanel|TranscriptPanel|WebSearchProcessPanel" src
```

Expected current state: `MeetingRoom` imports only `WebSearchProcessPanel` from `MeetingBoard`; the full `MeetingBoard` is test-only. If any additional production import exists, keep that component and migrate it instead of deleting it.

- [ ] **Step 2: Add failing semantic render tests**

Render `DecisionBriefPanel` with `renderToStaticMarkup`. Assert visible labels and status text for `firm`, `tentative`, and `unavailable`; assert empty optional lists show a restrained fallback instead of disappearing. Use headings and text content rather than Tailwind class snapshots.

```tsx
const html = renderToStaticMarkup(
  <DecisionBriefPanel meeting={meeting} text={getUiText("zh")} />,
);
expect(html).toContain("推荐结论");
expect(html).toContain("暂定建议");
expect(html).toContain("低置信度");
expect(html).toContain("推翻条件");
expect(html).toContain("下一步行动");
```

Move the applicable `MeetingBoard.test.tsx` cases into `MeetingTraceabilityPanel.test.tsx` and `MeetingRoom.test.tsx`. Assert completed `MeetingRoom` places the decision recommendation before “详细过程”, while a live incomplete meeting contains neither the recommendation nor placeholder text.

Run:

```powershell
npx vitest run src/components/roundtable/DecisionBriefPanel.test.tsx src/components/roundtable/MeetingTraceabilityPanel.test.tsx src/components/roundtable/MeetingRoom.test.tsx
```

Expected: FAIL because the panel and localized keys do not exist.

- [ ] **Step 3: Add bilingual UI text**

Add a `decisionBrief` group to both locales with exact semantic keys:

```ts
decisionBrief: {
  title: "决策简报",
  recommendation: "推荐结论",
  status: { firm: "明确建议", tentative: "暂定建议", unavailable: "暂不可用" },
  confidence: { high: "高置信度", medium: "中置信度", low: "低置信度" },
  rationale: "核心理由",
  conditions: "成立条件",
  risks: "风险与主要反对意见",
  evidenceGaps: "缺失证据",
  reversalConditions: "推翻条件",
  nextAction: "下一步行动",
  noItems: "本轮未识别到额外项目。",
  details: "详细过程与依据",
}
```

Provide natural English equivalents in the same shape so `UiText` stays structurally inferred.

- [ ] **Step 4: Implement the presentation-only panel**

`DecisionBriefPanel` should call `normalizeDecisionBrief(meeting.summary)` once, render the recommendation as the only large statement, show status/confidence badges, then the six supporting sections in the approved order. It must not compute quality, inspect raw provider errors, or mutate the meeting.

Use semantic HTML (`section`, `h2`, `h3`, `ul`) and restrained zinc/emerald/amber styling. `unavailable` must not be colored as success.

- [ ] **Step 5: Consolidate the old result board into traceability details**

Create `MeetingTraceabilityPanel.tsx` by moving the existing status, fact hygiene, Evidence status/delivery, web search process, citation check, provider failure, and developer-search helpers out of `MeetingBoard.tsx`. Reuse `MeetingRecapPanel` inside this traceability panel. Do not render `SummaryPanel` or `TranscriptPanel`, because `MeetingRoom` already provides the unified summary and all turns through its three-stage navigation.

For `activeStage.kind === "summary"`:

- if incomplete, keep the current summary-progress/empty behavior and never render `DecisionBriefPanel`;
- if completed, render `DecisionBriefPanel` first;
- below it, add one `<details>` labeled `text.decisionBrief.details` containing current `SummaryStage` and `MeetingTraceabilityPanel`; developer diagnostics remain nested and closed by default.

Keep the fixed three-stage switcher so users can inspect independent and response turns. In completed summary mode, omit the participant sidebar and render the decision column at the full content width; when the user switches back to the independent or response stage, restore the existing two-column participant/turn layout. Retain the sidebar throughout live phases.

After tests are moved to `DecisionBriefPanel`, `MeetingRoom`, and `MeetingTraceabilityPanel`, delete `MeetingBoard.tsx`, `MeetingBoard.test.tsx`, `SummaryPanel.tsx`, and `TranscriptPanel.tsx`. Keep `MeetingRecapPanel.tsx`, because the new traceability panel consumes it.

- [ ] **Step 6: Verify result rendering and imports**

Run:

```powershell
npx vitest run src/components/roundtable/DecisionBriefPanel.test.tsx src/components/roundtable/MeetingTraceabilityPanel.test.tsx src/components/roundtable/MeetingRoom.test.tsx
rg -n "from \"./MeetingBoard\"|<MeetingBoard" src
npx tsc --noEmit
npm run lint
```

Expected: tests pass; `rg` returns no production import; lint/typecheck pass.

- [ ] **Step 7: Commit**

```powershell
git add src/components/roundtable/DecisionBriefPanel.tsx src/components/roundtable/DecisionBriefPanel.test.tsx src/components/roundtable/MeetingTraceabilityPanel.tsx src/components/roundtable/MeetingTraceabilityPanel.test.tsx src/components/roundtable/MeetingRoom.tsx src/components/roundtable/MeetingRoom.test.tsx src/components/roundtable/MeetingBoard.tsx src/components/roundtable/MeetingBoard.test.tsx src/components/roundtable/SummaryPanel.tsx src/components/roundtable/TranscriptPanel.tsx src/lib/i18n/ui-text.ts
git commit -m "feat: show conclusion-first meeting results"
```

---

### Task 6: Refocus the home page without changing request semantics

**Files:**
- Create: `src/components/roundtable/MeetingAdvancedSettings.tsx`
- Create: `src/components/roundtable/MeetingSetupView.test.tsx`
- Modify: `src/components/roundtable/MeetingSetupView.tsx`
- Modify: `src/components/roundtable/MeetingSetupPanels.tsx`
- Modify: `src/app/page-architecture.test.ts`
- Modify: `src/lib/i18n/ui-text.ts`

**Interfaces:**
- Consumes: the existing `MeetingSetupViewProps` values and callbacks from `page.tsx`.
- Produces: one focused composer, compact selected-model controls, and a native collapsed advanced-settings region; submitted request fields remain byte-for-byte equivalent for the same state.

- [ ] **Step 1: Add failing layout and control-placement tests**

Render the setup view with a small fixture and assert:

- topic textbox and primary submit button precede model/advanced/history content;
- selected models appear as compact chips;
- a button or labeled control opens the existing model selection area;
- `<details>` for “更多设置” is closed by default;
- search, evidence, brief mode, search driver, and summary model controls are inside it;
- history appears after the main composer;

Use `renderToStaticMarkup` for order and default disclosure markup. Do not add a second DOM-test framework solely for this task; Task 7 verifies live interactions and the posted request body in a real browser.

Run:

```powershell
npx vitest run src/components/roundtable/MeetingSetupView.test.tsx src/app/page-architecture.test.ts
```

Expected: FAIL because the current layout starts with large participant and roundtable panels.

- [ ] **Step 2: Extract advanced settings instead of growing the 952-line panel file**

Move only the composition of existing controls into `MeetingAdvancedSettings.tsx`; reuse `SearchTogglePill`, `EvidencePackEditor`, and `ModelSelectField` rather than duplicating their logic. Keep all state in `page.tsx` and all existing callbacks in `MeetingSetupViewProps`.

The outer structure should be:

```tsx
<details className="surface-card group">
  <summary>{text.meetingForm.advancedSettings}</summary>
  <div>
    {/* web search, local evidence, brief mode, search driver, summary model */}
  </div>
</details>
```

- [ ] **Step 3: Recompose `MeetingSetupView` around the core action**

Use a single centered column (maximum width around 880px): restrained header, topic composer, selected-model chips plus edit control, collapsed advanced settings, status/provider exceptions, then history. Remove `RoundtableDiagram` from the default setup page and replace the always-visible `ParticipantList` with a compact selectable section/disclosure; do not remove seat-order callbacks from the public props until their behavior has a replacement.

Default selection still comes from current `page.tsx` logic. Do not add a new required step, modal, or state machine.

- [ ] **Step 4: Keep request behavior unchanged**

Do not change `startMeeting`, `MeetingRequest`, evidence parsing, search preferences, summary participant selection, or local-storage keys. Add an architecture assertion that `page.tsx` still passes every existing setup prop/callback and remains at or below 650 lines.

- [ ] **Step 5: Add bilingual setup labels**

Add keys such as `advancedSettings`, `selectedModels`, `editModels`, and `modelSelection` under `meetingForm` in both locales. Do not hard-code user-facing strings in the new components.

- [ ] **Step 6: Verify setup behavior**

Run:

```powershell
npx vitest run src/components/roundtable/MeetingSetupView.test.tsx src/app/page-architecture.test.ts
npx tsc --noEmit
npm run lint
```

Expected: focused layout tests pass and typecheck/lint pass. Request semantics are verified by inspecting the real `/api/meeting/live` request in Task 7.

- [ ] **Step 7: Commit**

```powershell
git add src/components/roundtable/MeetingAdvancedSettings.tsx src/components/roundtable/MeetingSetupView.tsx src/components/roundtable/MeetingSetupView.test.tsx src/components/roundtable/MeetingSetupPanels.tsx src/app/page-architecture.test.ts src/lib/i18n/ui-text.ts
git commit -m "feat: focus the meeting setup flow"
```

---

### Task 7: Add end-to-end coverage and full-page visual verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `playwright.config.ts`
- Create: `e2e/fixtures/meetings.ts`
- Create: `e2e/roundtable.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: running Next.js app, real Mock API for the happy path, intercepted NDJSON only for deterministic degraded cases.
- Produces: desktop/mobile E2E assertions, failure artifacts, and full-page review screenshots under ignored `output/playwright/`.

- [ ] **Step 1: Install the compatible Playwright test dependency**

Run:

```powershell
npm install --save-dev @playwright/test@1.61.1
npx playwright install chromium
```

Add scripts:

```json
"test:e2e": "playwright test",
"test:e2e:headed": "playwright test --headed"
```

Do not add E2E to `npm run verify`; CI gets a separate browser job, and developers can run the deterministic suite explicitly.

- [ ] **Step 2: Configure one desktop and one mobile project**

```ts
export default defineConfig({
  testDir: "./e2e",
  outputDir: "output/playwright/test-results",
  reporter: [["list"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:3000", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://127.0.0.1:3000", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
```

- [ ] **Step 3: Write the failing quick Mock flow**

Use visible role locators only:

1. Open `/`.
2. Verify advanced settings are collapsed.
3. Fill the topic.
4. Start the meeting without opening settings.
5. Wait for the finalized decision heading and recommendation.
6. Assert status, confidence, conditions, and next action are visible.
7. Assert “详细过程与依据” exists but its inner transcript is hidden until expanded.
8. Save `page.screenshot({ fullPage: true, path: testInfo.outputPath("quick-mock-full-page.png") })`.

Run:

```powershell
npx playwright test e2e/roundtable.spec.ts --project=desktop-chromium --grep "quick Mock"
```

Expected before UI completion: FAIL on the decision heading or setup layout; after Tasks 5–6: PASS.

- [ ] **Step 4: Write a deterministic low-evidence/partial-failure flow**

Intercept only `/api/meeting/live` and return valid NDJSON fixture events ending in a `MeetingResult` with one provider failure, low Evidence, and a nominally tentative brief. Keep `/api/models` and the page real. Assert visible `暂定建议`, `低置信度`, a missing-evidence item, a reversal condition, and no `明确建议`/`高置信度`.

Use a helper that serializes each event with `JSON.stringify(event) + "\n"`; do not hand-author malformed NDJSON strings.

In the same routed request, inspect `route.request().postDataJSON()` after changing web search, meeting length, search region/intensity, and summary model in the expanded advanced settings. Assert the body contains the chosen `participantIds`, `evidencePack`, `isBriefMode`, `searchDriverParticipantId`, `searchMode`, `searchPreferences`, `summaryParticipantId`, and `webSearchEnabled` values before fulfilling the fixture response. This is the regression guard that the visual re-layout did not change request semantics.

- [ ] **Step 5: Add CI browser coverage**

Add a separate `e2e` job after the existing unit/build job:

```yaml
e2e:
  needs: test
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v6
    - uses: actions/setup-node@v6
      with:
        node-version: 20
        cache: npm
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: npm run test:e2e
    - uses: actions/upload-artifact@v6
      if: failure()
      with:
        name: playwright-report
        path: output/playwright/
```

- [ ] **Step 6: Run desktop and mobile full-page verification**

Run:

```powershell
npm run test:e2e
```

Open and inspect all generated full-page screenshots, checking that the composer and decision brief are not clipped, disclosure state is correct, there is no horizontal overflow, and fixed stage navigation does not cover the final action. If a screen is too long to inspect clearly, add a second element screenshot but retain the full-page capture.

- [ ] **Step 7: Commit**

```powershell
git add package.json package-lock.json playwright.config.ts e2e .github/workflows/ci.yml
git commit -m "test: cover decision brief journeys"
```

---

### Task 8: Apply patch-only maintenance, update v0.8.0 docs, and run release verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/lib/version.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/design.md`

**Interfaces:**
- Consumes: completed v0.8 feature, official npm audit report, existing release documentation.
- Produces: v0.8.0 metadata, accurate user docs, patch-only dependency updates, and recorded verification evidence.

- [ ] **Step 1: Capture the pre-update dependency and security state**

Run against the official registry:

```powershell
npm outdated --registry=https://registry.npmjs.org
npm audit --registry=https://registry.npmjs.org
```

Expected baseline from planning: five transitive findings (one high, three moderate, one low), but treat current command output as authoritative. Save the package/advisory names in the task notes, not secrets or environment values.

- [ ] **Step 2: Apply only compatible patch/security updates**

Use `npm update` or targeted exact compatible versions. Do not cross major versions for TypeScript, ESLint, `@types/node`, Next.js, or React in this release. After each dependency batch run:

```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npm audit --registry=https://registry.npmjs.org
```

If a vulnerability has no compatible fix, document it in `CHANGELOG.md` with affected dev/runtime scope and follow-up; do not use `npm audit fix --force`.

- [ ] **Step 3: Update version metadata and product documentation**

Set:

```ts
export const APP_VERSION = "v0.8.0";
```

Set `package.json` version to `0.8.0`. Update README quick path and capabilities so the default flow is topic → models → meeting → decision brief; add `npm run test:e2e` to commands. Add a top `v0.8.0 internal alpha` CHANGELOG entry covering decision data, conservative downgrade behavior, conclusion-first UI/export, focused setup, legacy history, Mock refresh, and E2E. Update `docs/design.md` to describe the canonical finalization path and result hierarchy.

- [ ] **Step 4: Run the complete automated verification matrix**

Run:

```powershell
npm run verify
npm run test:e2e
```

Expected:

- all Vitest files pass;
- `tsc --noEmit` has zero errors;
- ESLint has zero errors;
- Next production build succeeds;
- both Playwright projects pass both journeys.

- [ ] **Step 5: Run the optional real-search smoke only when credentials are available**

```powershell
npm run test:live-search
```

This remains outside `verify`. If credentials are absent, record “not run: credentials unavailable”; do not treat it as an automated-suite failure and do not expose keys in logs.

- [ ] **Step 6: Perform final visual and compatibility checks**

- Open one saved pre-v0.8 history fixture and verify it shows a tentative compatible brief without rewriting storage.
- Inspect desktop and mobile full-page screenshots from Task 7.
- Copy Markdown for firm, tentative, and unavailable meetings; verify decision-first order and sanitized failure text.
- Confirm the live screen never shows the empty placeholder recommendation.
- Run `git diff --check` and `git status --short`.

- [ ] **Step 7: Commit the release update**

```powershell
git add package.json package-lock.json src/lib/version.ts README.md CHANGELOG.md docs/design.md
git commit -m "chore: prepare v0.8.0"
```

- [ ] **Step 8: Request final review before integration**

Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Report the exact verification commands and results, remaining audit findings, whether the optional live-search smoke ran, and the full-page screenshot paths. Do not push or create a PR without explicit authorization.

---

## Final Acceptance Checklist

- [ ] A user can start a meeting without expanding advanced settings.
- [ ] The completed first screen shows recommendation, status, confidence, conditions, and one next action.
- [ ] Low evidence, invalid citations, severe disagreement, and partial failures cannot appear as high-confidence firm advice.
- [ ] Insufficient valid models produce `unavailable` rather than a fabricated recommendation.
- [ ] Raw phases, differences, Evidence, citations, failures, and diagnostics remain traceable behind deliberate disclosure/navigation.
- [ ] Old history records open through an in-memory compatibility view and are not rewritten on read.
- [ ] UI and Markdown share the same conclusion-first structure.
- [ ] Mock copy reflects current capabilities and no longer recommends adding features already present.
- [ ] Standard and live routes produce identical finalized decision semantics.
- [ ] Unit, integration, type, lint, build, desktop E2E, mobile E2E, and full-page visual checks pass.
