import { describe, expect, test } from "vitest";
import { buildMeetingStageViews } from "./meeting-room";
import type { MeetingResult } from "../types";

describe("buildMeetingStageViews", () => {
  test("creates separate stage views for two meeting phases and summary", () => {
    const meeting: MeetingResult = {
      topic: "会议室视图",
      phases: [
        {
          id: "independent",
          title: "第一阶段：独立观点",
          description: "独立表达。",
          turns: [],
        },
        {
          id: "response",
          title: "第二阶段：自由回应",
          description: "互相回应。",
          turns: [],
        },
      ],
      summary: {
        consensus: ["共识"],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
    };

    const views = buildMeetingStageViews(meeting);

    expect(views.map((view) => view.id)).toEqual([
      "independent",
      "response",
      "summary",
    ]);
    expect(views[0]).toMatchObject({
      index: 1,
      kind: "phase",
      title: "第一阶段：独立观点",
    });
    expect(views[2]).toMatchObject({
      index: 3,
      kind: "summary",
      title: "第三阶段：共识整理",
    });
  });
});
