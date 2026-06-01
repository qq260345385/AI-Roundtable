import type { MeetingPhase, MeetingResult, MeetingSummary } from "../types";

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
      description: "整理共识、分歧和下一步。",
      summary: meeting.summary,
    },
  ];
}
