import type { MeetingResult, ModelParticipant } from "../types";
import { formatFailureForDisplay } from "./failure-format";
import { summarizeEvidenceQuality } from "../search/evidence-pack";

// 把会议结果导出成适合保存到 examples 的 Markdown 文本。
export function exportMeetingToMarkdown(
  meeting: MeetingResult,
  participants: ModelParticipant[],
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

  appendEvidencePack(lines, meeting);
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
  appendList(
    lines,
    "可确认事实",
    meeting.summary.confirmableFacts ?? meeting.summary.consensus,
  );
  appendList(lines, "初步推测", meeting.summary.initialHypotheses ?? []);
  appendList(lines, "社区观点", meeting.summary.communityViews ?? []);
  appendList(
    lines,
    "不足以确认",
    meeting.summary.insufficientlyConfirmed ?? [],
  );
  if (
    !meeting.summary.confirmableFacts &&
    (meeting.summary.differences.length > 0 ||
      meeting.summary.minorityViews.length > 0)
  ) {
    appendList(lines, "主要分歧", meeting.summary.differences);
    appendList(lines, "有价值的少数派观点", meeting.summary.minorityViews);
  }
  appendList(lines, "风险点", meeting.summary.risks);
  appendList(lines, "下一步建议", meeting.summary.nextSteps);

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

    lines.push("## 待核验资料候选");
    lines.push("");
    lines.push(
      `文档输入策略：${formatDocumentInputStrategy(meeting.evidencePack.strategy)}`,
    );
    lines.push("");

    for (const item of meeting.evidencePack.items) {
      const sourceText = item.source ? sanitizeMarkdownText(item.source) : "未标注来源";
      const urlText = item.url ? sanitizeMarkdownText(item.url) : "未提供 URL";

      lines.push(
        `- [${sanitizeMarkdownText(item.id)}] ${sanitizeMarkdownText(item.title)} - ${sourceText} - ${urlText}`,
      );

      if (item.quality) {
        lines.push(`  - 字符数：${item.quality.textLength}`);
        lines.push(`  - 来源类型：${formatSourceType(item.quality.sourceType)}`);
        lines.push(
          `  - 可信度：${formatReliability(item.quality.reliability)}（${item.quality.score}/100）`,
        );

        if (item.quality.wasTruncated) {
          lines.push("  - 状态：内容已截断");
        }

        if (item.quality.warnings.length > 0) {
          lines.push(
            `  - 提示：${item.quality.warnings.map(sanitizeMarkdownText).join("；")}`,
          );
        }
      }
    }
  } else {
    lines.push("## 待核验资料候选");
    lines.push("");
    lines.push(
      "本轮会议未启用外部资料包。涉及实时信息、排名、价格、政策、版本、新闻等内容需要额外核验。",
    );
  }

  lines.push("");
}

function appendEvidenceQualityOverview(lines: string[], meeting: MeetingResult) {
  const overview = summarizeEvidenceQuality(meeting.evidencePack);

  lines.push("## 资料质量概览");
  lines.push("");
  lines.push(`- 官方资料数量：${overview.officialCount}`);
  lines.push(`- 第三方评测资料数量：${overview.benchmarkCount}`);
  lines.push(`- 媒体资料数量：${overview.mediaCount}`);
  lines.push(
    `- 社区 / 社交 / 视频资料数量：${overview.communitySocialVideoCount}`,
  );
  lines.push(`- 内容过短资料数量：${overview.shortContentCount}`);
  lines.push(`- 标题党风险资料数量：${overview.clickbaitRiskCount}`);
  lines.push(`- 本轮结论可靠性：${overview.overallReliability}`);
  lines.push("");
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
    official: "官方资料",
    benchmark: "第三方评测",
    media: "媒体",
    blog: "博客",
    community: "社区",
    social: "社交平台",
    video: "视频平台",
    unknown: "未知",
  };

  return labels[sourceType] ?? "未知";
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
