import type { MeetingPhase, MeetingResult, MeetingSummary } from "../types";
import { getSummaryPresentationStyle } from "./summary-presentation";

export type MeetingStageView =
  | {
      id: string;
      index: number;
      kind: "phase";
      title: string;
      description: string;
      phase: MeetingPhase;
    }
  | {
      id: "summary";
      index: number;
      kind: "summary";
      title: string;
      description: string;
      summary: MeetingSummary;
    };

export function buildMeetingStageViews(
  meeting: MeetingResult,
): MeetingStageView[] {
  const summaryStyle = getSummaryPresentationStyle(meeting.topic);
  const phaseViews = meeting.phases.map((phase, index): MeetingStageView => ({
    id: phase.id,
    index: index + 1,
    kind: "phase",
    title: phase.title,
    description: phase.description,
    phase,
  }));

  return [
    ...phaseViews,
    {
      id: "summary",
      index: phaseViews.length + 1,
      kind: "summary",
      title: "第三阶段：共识整理",
      description:
        summaryStyle === "stance-oriented"
          ? "整理主要立场、分歧、讨论局限和可以继续讨论的问题。"
          : "整理可确认事实、低置信推测、关键问题、风险和核验建议。",
      summary: meeting.summary,
    },
  ];
}
