import type { MeetingResult, ModelParticipant } from "../types";
import { formatFailureForDisplay } from "./failure-format";
import {
  isCoreEvidenceItem,
  isPublicOpinionEvidenceItem,
  summarizeEvidenceQuality,
  type SearchEvidence,
} from "../search/evidence-pack";

type ExportMarkdownOptions = {
  includeEvidenceDebug?: boolean;
  includeSummaryDebug?: boolean;
};

// 把会议结果导出成适合保存到 examples 的 Markdown 文本。
export function exportMeetingToMarkdown(
  meeting: MeetingResult,
  participants: ModelParticipant[],
  options: ExportMarkdownOptions = {},
): string {
  const lines: string[] = [];

  lines.push("# AI Roundtable 会议纪要");
  lines.push("");
  lines.push("## 会议议题");
  lines.push("");
  lines.push(meeting.topic);
  lines.push("");

  if (meeting.isTimeSensitive && meeting.factCheckNotice) {
    lines.push("## 事实核验提示");
    lines.push("");
    lines.push(meeting.factCheckNotice);
    lines.push("");
  }

  appendEvidenceStatus(lines, meeting);
  appendEvidencePack(lines, meeting);
  appendEvidenceDebug(lines, meeting, options);
  appendCitationCheck(lines, meeting);

  lines.push("## 参会模型");
  lines.push("");

  for (const participant of participants) {
    lines.push(
      `- ${participant.name}（${participant.provider} / ${participant.model}）`,
    );
  }

  lines.push("");

  for (const phase of meeting.phases) {
    lines.push(`## ${phase.title}`);
    lines.push("");

    for (const turn of phase.turns) {
      lines.push(`### ${turn.speakerName}`);
      lines.push("");
      lines.push(`模型：${turn.provider} / ${turn.model}`);
      lines.push("");
      lines.push(turn.content);
      lines.push("");
    }
  }

  lines.push("## 第三阶段：共识整理");
  lines.push("");
  const confirmableFacts = sanitizeSummaryItems(
    meeting.summary.confirmableFacts ?? meeting.summary.consensus,
  );
  const lowConfidenceHypotheses = sanitizeSummaryItems([
    ...(meeting.summary.initialHypotheses ?? []),
    ...(meeting.summary.communityViews ?? []),
  ]);
  const hasOfficialSources = hasStrongOfficialEvidence(meeting);
  appendList(
    lines,
    "可确认事实",
    confirmableFacts.length > 0
      ? confirmableFacts.map((fact) =>
          hasOfficialSources ? fact : hedgeUnofficialFact(fact),
        )
      : ["无。当前资料不足以确认关键事实。"],
  );
  appendList(
    lines,
    "低置信推测",
    lowConfidenceHypotheses.length > 0
      ? lowConfidenceHypotheses
      : ["无。"],
  );
  appendList(
    lines,
    "不能确认的关键问题",
    sanitizeSummaryItems(meeting.summary.insufficientlyConfirmed ?? []),
  );
  appendList(
    lines,
    "风险点",
    sanitizeSummaryItems(meeting.summary.risks).length > 0
      ? sanitizeSummaryItems(meeting.summary.risks)
      : ["无。"],
  );
  appendList(
    lines,
    "下一步核验建议",
    sanitizeSummaryItems(meeting.summary.nextSteps).length > 0
      ? sanitizeSummaryItems(meeting.summary.nextSteps)
      : ["无。"],
  );

  if (options.includeSummaryDebug && meeting.summary.summaryDebug) {
    const debug = meeting.summary.summaryDebug;

    lines.push("### Summary Debug");
    lines.push("");
    lines.push(`- rawFormatDetected: ${debug.rawFormatDetected}`);
    lines.push(`- parseSucceeded: ${debug.parseSucceeded}`);
    lines.push(`- repairAttempted: ${debug.repairAttempted}`);
    lines.push(`- fallbackUsed: ${debug.fallbackUsed}`);
    if (debug.fallbackReason) {
      lines.push(`- fallbackReason: ${sanitizeMarkdownText(debug.fallbackReason)}`);
    }
    if (debug.emptySectionsRepaired.length > 0) {
      lines.push(`- emptySectionsRepaired: ${debug.emptySectionsRepaired.join(", ")}`);
    }
    lines.push("");
  }

  if (meeting.failures && meeting.failures.length > 0) {
    lines.push("## 模型调用失败记录");
    lines.push("");

    for (const failure of meeting.failures) {
      const formattedFailure = formatFailureForDisplay(failure);

      lines.push(
        `- ${formattedFailure.providerName} / ${formattedFailure.model} / ${formattedFailure.stageLabel}：${formattedFailure.message}`,
      );
      lines.push(`  建议：${formattedFailure.suggestion}`);
    }

    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

function appendEvidenceDebug(
  lines: string[],
  meeting: MeetingResult,
  options: ExportMarkdownOptions,
) {
  const process = meeting.debugSearchProcess;

  if (options.includeEvidenceDebug !== true && !process) {
    return;
  }

  if (!process?.debugSummary) {
    lines.push("## Evidence Debug");
    lines.push("");
    lines.push("Evidence Debug unavailable: debugSearchProcess missing");
    lines.push("");
    return;
  }

  const summary = process.debugSummary;

  lines.push("## Evidence Debug");
  lines.push("");
  lines.push("### Evidence Hit Rate");
  appendDebugNumber(lines, "candidateCount", summary.evidenceHitRate.candidateCount);
  appendDebugNumber(lines, "coreEvidenceCount", summary.evidenceHitRate.coreEvidenceCount);
  appendDebugNumber(lines, "evidenceHitRate", summary.evidenceHitRate.evidenceHitRate);
  lines.push("");
  lines.push("### Extraction Success Rate");
  appendDebugNumber(
    lines,
    "extractAttemptCount",
    summary.extractionSuccessRate.extractAttemptCount,
  );
  appendDebugNumber(
    lines,
    "extractSuccessCount",
    summary.extractionSuccessRate.extractSuccessCount,
  );
  appendDebugNumber(
    lines,
    "extractionSuccessRate",
    summary.extractionSuccessRate.extractionSuccessRate,
  );
  lines.push("");
  lines.push("### Source Mix");
  appendDebugNumber(lines, "officialCount", summary.sourceMix.officialCount);
  appendDebugNumber(
    lines,
    "reputableMediaCount",
    summary.sourceMix.reputableMediaCount,
  );
  appendDebugNumber(
    lines,
    "industryReportCount",
    summary.sourceMix.industryReportCount,
  );
  appendDebugNumber(lines, "socialVideoCount", summary.sourceMix.socialVideoCount);
  appendDebugNumber(lines, "unknownCount", summary.sourceMix.unknownCount);
  lines.push("");
  lines.push("### Degrade Reasons Summary");
  appendDebugRecord(lines, summary.degradeReasonsSummary);
  lines.push("");
  lines.push("### Low-Evidence Trigger Reasons");
  appendDebugRecord(lines, summary.lowEvidenceTriggerReasons);
  lines.push("");
  lines.push("### Pass Stats");
  if (summary.passStats.length === 0) {
    lines.push("- none");
  } else {
    for (const stat of summary.passStats) {
      lines.push(
        `- ${stat.passName}: resultCount=${stat.resultCount}, extractedCount=${stat.extractedCount}, coreEvidenceCount=${stat.coreEvidenceCount}, socialVideoCount=${stat.socialVideoCount}, unknownCount=${stat.unknownCount}, query=${sanitizeMarkdownText(stat.query)}`,
      );
    }
  }
  lines.push("");
  lines.push("### Selected Evidence By Pass");
  if (summary.selectedEvidenceByPass.length === 0) {
    lines.push("- none");
  } else {
    for (const item of summary.selectedEvidenceByPass) {
      lines.push(`- ${item.passName}: ${item.count}`);
    }
  }
  lines.push("");
  lines.push("### Skipped Passes");
  if (summary.skippedPasses.length === 0) {
    lines.push("- none");
  } else {
    for (const passName of summary.skippedPasses) {
      lines.push(`- ${passName}`);
    }
  }
  lines.push("");
}

function appendDebugNumber(lines: string[], key: string, value: number) {
  lines.push(`- ${key}: ${value}`);
}

function appendDebugRecord(
  lines: string[],
  record: Record<string, number | boolean>,
) {
  for (const [key, value] of Object.entries(record)) {
    lines.push(`- ${key}: ${value}`);
  }
}

function appendCitationCheck(lines: string[], meeting: MeetingResult) {
  if (!meeting.citationCheck) {
    return;
  }

  lines.push("## 引用检查");
  lines.push("");

  if (!meeting.evidencePack?.enabled || meeting.evidencePack.items.length === 0) {
    lines.push("本轮会议未启用外部资料包，无法进行资料引用完整性检查。");
    lines.push("");
    return;
  }

  lines.push(
    `- 有效资料编号：${formatCitationIds(meeting.citationCheck.validCitationIds)}`,
  );
  lines.push(
    `- 已使用资料编号：${formatCitationIds(meeting.citationCheck.usedCitationIds)}`,
  );
  lines.push(
    `- 未被引用资料编号：${formatCitationIds(meeting.citationCheck.missingCitationIds)}`,
  );
  lines.push(
    `- 无效引用编号：${formatCitationIds(meeting.citationCheck.invalidCitationIds)}`,
  );

  if (meeting.citationCheck.hasInvalidCitations) {
    lines.push(
      "- 提醒：会议内容中存在资料包之外的引用编号，需要人工核验。",
    );
  }

  lines.push("");
}

function appendEvidencePack(lines: string[], meeting: MeetingResult) {
  if (meeting.evidencePack?.enabled && meeting.evidencePack.items.length > 0) {
    appendEvidenceQualityOverview(lines, meeting);

    const coreEvidence = meeting.evidencePack.items.filter(isCoreEvidenceItem);
    const publicOpinionEvidence = meeting.evidencePack.items.filter(
      isPublicOpinionEvidenceItem,
    );
    const technicalProductEvidence = meeting.evidencePack.items.filter(
      isTechnicalProductEvidenceItem,
    );
    const relatedBackgroundEvidence = meeting.evidencePack.items.filter(
      isRelatedBackgroundEvidenceItem,
    );
    const downgradedEvidence = meeting.evidencePack.items.filter(
      (item) =>
        !isCoreEvidenceItem(item) &&
        !isPublicOpinionEvidenceItem(item) &&
        !isTechnicalProductEvidenceItem(item) &&
        !isRelatedBackgroundEvidenceItem(item),
    );

    if (coreEvidence.length < 3 && meeting.evidencePack.items.length > 0) {
      lines.push("## Low-Evidence Mode");
      lines.push("");
      lines.push(
        `已找到联网参考资料，但核心证据不足，以下资料仅作为参考，结论需谨慎核验。`,
      );
      lines.push("");
    } else if (coreEvidence.length < 3) {
      lines.push("## Low-Evidence Mode");
      lines.push("");
      lines.push(
        `本轮核心证据少于 3 条，会议已进入 low-evidence mode；结论只能作为待核验判断，不能当作已确认事实。`,
      );
      lines.push("");
    }

    lines.push("## Evidence Pack");
    lines.push("");
    lines.push(
      `文档输入策略：${formatDocumentInputStrategy(meeting.evidencePack.strategy)}`,
    );
    lines.push("");
    appendEvidenceSection(lines, "核心证据", coreEvidence, "无。当前资料不足以形成核心证据。");
    appendEvidenceSection(lines, "相关背景资料", relatedBackgroundEvidence, "无。");
    appendEvidenceSection(lines, "技术/产品线索", technicalProductEvidence, "无。");
    appendEvidenceSection(lines, "舆论线索", publicOpinionEvidence, "无。");
    appendEvidenceSection(lines, "被降级资料", downgradedEvidence, "无。");
  } else {
    lines.push("## Evidence Pack");
    lines.push("");
    lines.push(
      "本轮会议未启用外部资料包。涉及实时信息、排名、价格、政策、版本、新闻等内容需要额外核验。",
    );
  }

  lines.push("");
}

function appendEvidenceSection(
  lines: string[],
  title: string,
  items: NonNullable<MeetingResult["evidencePack"]>["items"],
  emptyText: string,
) {
  lines.push(`## ${title}`);
  lines.push("");

  if (items.length === 0) {
    lines.push(emptyText);
    lines.push("");
    return;
  }

  for (const item of items) {
    appendEvidenceItem(lines, item);
  }

  lines.push("");
}

function appendEvidenceItem(
  lines: string[],
  item: NonNullable<MeetingResult["evidencePack"]>["items"][number],
) {
  const sourceText = item.source ? sanitizeMarkdownText(item.source) : "未标注来源";
  const urlText = item.url ? sanitizeMarkdownText(item.url) : "未提供 URL";

  lines.push(
    `- [${sanitizeMarkdownText(item.id)}] ${sanitizeMarkdownText(item.title)} - ${sourceText} - ${urlText}`,
  );

  if (!item.quality) {
    lines.push("  - 可信度：未评分");
    return;
  }

  lines.push(`  - 字符数：${item.quality.textLength}`);
  lines.push(`  - 来源类型：${formatSourceType(item.quality.sourceType)}`);
  lines.push(
    `  - 可信度：${formatReliability(item.quality.reliability)}（${formatScore(item.quality.score)}）`,
  );
  if (item.quality.coverageDimension) {
    lines.push(`  - 覆盖维度：${formatCoverageDimension(item.quality.coverageDimension)}`);
  }
  if (typeof item.quality.topicRelevanceScore === "number") {
    lines.push(`  - 议题相关度：${item.quality.topicRelevanceScore}/100`);
  }
  if (item.quality.relevanceReason) {
    lines.push(`  - 相关性说明：${sanitizeMarkdownText(item.quality.relevanceReason)}`);
  }

  if (item.quality.snippetOnly) {
    lines.push("  - 状态：仅搜索摘要或正文不足");
  }

  if (item.quality.wasTruncated) {
    lines.push("  - 状态：内容已截断");
  }

  if (item.quality.warnings.length > 0) {
    lines.push(
      `  - 提示：${item.quality.warnings.map(sanitizeMarkdownText).join("；")}`,
    );
  }
}

function appendEvidenceStatus(lines: string[], meeting: MeetingResult) {
  const status = meeting.evidencePack?.evidenceStatus;

  if (!status) {
    return;
  }

  const hasItems = (meeting.evidencePack?.items?.length ?? 0) > 0;

  lines.push("## 事实核验状态");
  lines.push("");
  lines.push(formatEvidenceStatusMessage(status, hasItems));

  const warnings = meeting.evidencePack?.evidenceWarnings ?? [];

  for (const warning of warnings) {
    lines.push(`- 提示：${sanitizeMarkdownText(warning)}`);
  }

  lines.push("");
}

function formatEvidenceStatusMessage(status: string, hasItems: boolean): string {
  if (status === "high") {
    return "本次会议参考了较可靠的联网资料。";
  }

  if (status === "medium") {
    return "本次会议参考了部分联网资料，但质量一般。";
  }

  if (status === "low") {
    if (hasItems) {
      return "已找到联网参考资料，但核心证据不足，结论需谨慎核验。";
    }

    return "本次会议未找到高质量资料，结论仅供参考。";
  }

  return "本次会议没有可用联网资料，主要基于模型已有知识和推理。";
}

function appendEvidenceQualityOverview(lines: string[], meeting: MeetingResult) {
  const overview = summarizeEvidenceQuality(meeting.evidencePack, {
    evidenceStatus: meeting.evidencePack?.evidenceStatus,
  });

  lines.push("## 资料质量概览");
  lines.push("");
  lines.push(`- 强官方资料数量：${overview.strongOfficialCount}`);
  lines.push(`- 官方社区资料数量：${overview.officialCommunityCount}`);
  lines.push(`- 可信媒体资料数量：${overview.reputableMediaCount}`);
  lines.push(`- 行业报告资料数量：${overview.industryReportCount}`);
  lines.push(
    `- 社区 / 社交 / 视频资料数量：${overview.socialForumVideoCount}`,
  );
  lines.push(`- 核心证据数量：${overview.coreEvidenceCount}`);
  lines.push(`- 内容过短资料数量：${overview.shortContentCount}`);
  lines.push(`- 标题党风险资料数量：${overview.clickbaitRiskCount}`);
  lines.push(`- 强覆盖维度：${formatOverviewList(overview.strongCoveredDimensions)}`);
  lines.push(`- 弱覆盖维度：${formatOverviewList(overview.weakCoveredDimensions)}`);
  lines.push(`- 缺失维度：${formatOverviewList(overview.missingDimensions)}`);
  lines.push(`- 覆盖度评分：${overview.coverageCompleteness}`);
  if (overview.reliabilityLimitReason) {
    lines.push(`- 可靠性限制：${sanitizeMarkdownText(overview.reliabilityLimitReason)}`);
  }
  lines.push(`- 本轮结论可靠性：${overview.overallReliability}`);
  lines.push("");
}

function isTechnicalProductEvidenceItem(item: SearchEvidence): boolean {
  const dimension = item.quality?.coverageDimension;

  return (
    !isCoreEvidenceItem(item) &&
    !isPublicOpinionEvidenceItem(item) &&
    (dimension === "technical_capability" ||
      dimension === "product_release" ||
      dimension === "safety_alignment")
  );
}

function isRelatedBackgroundEvidenceItem(item: SearchEvidence): boolean {
  if (
    isCoreEvidenceItem(item) ||
    isPublicOpinionEvidenceItem(item) ||
    isTechnicalProductEvidenceItem(item)
  ) {
    return false;
  }

  const quality = item.quality;

  return (
    Boolean(quality) &&
    (quality?.sourceType === "official_statement" ||
      quality?.sourceType === "official_blog" ||
      quality?.sourceType === "official_docs" ||
      quality?.sourceType === "reputable_media" ||
      quality?.sourceType === "industry_report") &&
    (quality?.topicRelevanceScore ?? quality?.relevanceScore ?? 0) >= 40
  );
}

function formatOverviewList(items: readonly string[]): string {
  return items.length > 0 ? items.join("、") : "无";
}

function formatDocumentInputStrategy(strategy: string | undefined): string {
  if (strategy === "native_file") {
    return "优先原生附件；不支持时回退为长文本资料包";
  }

  if (strategy === "auto") {
    return "自动选择；不支持原生附件时回退为长文本资料包";
  }

  return "长文本资料包";
}

function formatSourceType(sourceType: string): string {
  const labels: Record<string, string> = {
    official_statement: "官方声明",
    official_blog: "官方博客/新闻",
    official_docs: "官方文档",
    official_community: "官方社区",
    reputable_media: "可信媒体",
    industry_report: "行业报告/评测",
    social_forum: "社区/社交论坛",
    video_platform: "视频平台",
    unknown: "未知",
  };

  return labels[sourceType] ?? "未知";
}

function formatCoverageDimension(dimension: string): string {
  const labels: Record<string, string> = {
    technical_capability: "技术能力",
    product_release: "产品发布",
    safety_alignment: "安全与对齐",
    business_revenue: "商业与收入",
    enterprise_adoption: "企业采用",
    funding_capital: "融资与资本",
    regulation_governance: "监管与治理",
    ecosystem_developer: "生态与开发者",
    legal_lawsuit: "法律与诉讼",
    market_analysis: "市场分析",
    unknown: "未知",
  };

  return labels[dimension] ?? dimension;
}

function formatScore(score: unknown): string {
  return typeof score === "number" && Number.isFinite(score)
    ? `${score}/100`
    : "0/100";
}

function formatReliability(reliability: string): string {
  const labels: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低",
    very_low: "很低",
  };

  return labels[reliability] ?? "未知";
}

function appendList(lines: string[], title: string, items: string[]) {
  lines.push(`### ${title}`);
  lines.push("");

  for (const item of items) {
    lines.push(`- ${item}`);
  }

  lines.push("");
}

function formatCitationIds(ids: string[]): string {
  return ids.length > 0 ? ids.join(", ") : "无";
}

function sanitizeMarkdownText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted-token]")
    .replace(/secret[-_A-Za-z0-9]*/gi, "[redacted]")
    .replace(/Authorization/gi, "[redacted-header]");
}

function sanitizeSummaryItems(items: string[]): string[] {
  return items
    .map((item) =>
      item
        .replace(/```[\s\S]*?```/g, "")
        .replace(/\bundefined\b/g, "")
        .replace(/\[object Object\]/g, "")
        .trim(),
    )
    .filter((item) => item.length > 0);
}

function hasStrongOfficialEvidence(meeting: MeetingResult): boolean {
  const items = meeting.evidencePack?.items ?? [];

  return items.some(
    (item) =>
      item.quality?.reliability === "high" &&
      (item.quality?.sourceType === "official_statement" ||
        item.quality?.sourceType === "official_blog" ||
        item.quality?.sourceType === "official_docs"),
  );
}

function hedgeUnofficialFact(fact: string): string {
  if (
    fact.includes("据") ||
    fact.includes("媒体报道") ||
    fact.includes("资料声称") ||
    fact.includes("社区讨论") ||
    fact.includes("尚未核验") ||
    fact.includes("不能确认") ||
    fact.includes("不足以确认") ||
    fact.includes("当前资料")
  ) {
    return fact;
  }

  return `据资料，${fact}`;
}
