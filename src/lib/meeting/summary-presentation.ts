import {
  classifyEvidenceTopic,
  type EvidenceTopicType,
} from "../search/evidence-pack";

export type SummaryPresentationStyle = "stance-oriented" | "evidence-oriented";

export function getSummaryPresentationStyle(
  topic: string | undefined,
): SummaryPresentationStyle {
  return classifyEvidenceTopic(topic) === "general_discussion"
    ? "stance-oriented"
    : "evidence-oriented";
}

export function isStanceOrientedTopic(topic: string | undefined): boolean {
  return getSummaryPresentationStyle(topic) === "stance-oriented";
}

export function getSummaryTopicType(topic: string | undefined): EvidenceTopicType {
  return classifyEvidenceTopic(topic);
}
