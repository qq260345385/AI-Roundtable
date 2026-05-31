import { classifyEvidenceTopic } from "../search/evidence-pack";

export const FACT_HYGIENE_NOTICE =
  "当前议题可能涉及实时信息。参会模型无法联网，输出仅代表模型已有知识或推测，请勿作为最新事实依据，并请人工核验。";

export const OPINION_TOPIC_NOTICE =
  "本议题主要属于观点或偏好讨论，未强依赖联网资料。以下内容反映参会模型的论证与判断。";

const TIME_SENSITIVE_PATTERNS = [
  /当前|现在|今天|昨日|昨天|明天|今年|本月|最近|最新|实时|新闻|资讯/u,
  /排名|榜单|价格|股价|汇率|政策|法规|版本|发布|发布日期|更新|最强|最好|第一/u,
  /\b(current|latest|today|yesterday|tomorrow|now|recent|news|price|ranking|version|release|policy)\b/i,
  /\b20\d{2}\b/u,
];

export function detectTimeSensitiveTopic(topic: string): boolean {
  const normalizedTopic = topic.trim();

  if (!normalizedTopic) {
    return false;
  }

  return TIME_SENSITIVE_PATTERNS.some((pattern) =>
    pattern.test(normalizedTopic),
  );
}

export function shouldShowFactHygieneNotice(
  topic: string,
  isWebSearchEnabled: boolean,
): boolean {
  return !isWebSearchEnabled && detectTimeSensitiveTopic(topic);
}

export function getFactHygienePrompt(topic: string): string {
  if (!detectTimeSensitiveTopic(topic)) {
    return "";
  }

  const topicType = classifyEvidenceTopic(topic);

  if (topicType === "general_discussion") {
    return [
      "本议题主要属于观点或偏好讨论，未强依赖联网资料。",
      "以下内容反映参会模型的论证与判断，不作为事实依据。",
    ].join("\n");
  }

  return [
    "事实卫生规则：当前会议议题可能涉及实时信息、最新事实或会随时间变化的内容。",
    "参会模型无法联网检索，不能确认当前最新事实。",
    "如果你不确定，请明确说明“不确定”或“需要外部核验”。",
    "不能编造版本、排名、价格、发布时间、新闻、政策或当前状态。",
    "不能把未经验证的信息升级成事实，只能表述为“模型已有知识倾向”“参会模型认为”或“需要外部验证”。",
  ].join("\n");
}
