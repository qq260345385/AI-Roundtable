import { describe, expect, test } from "vitest";
import {
  applyLiveMeetingEvent,
  createInitialLiveMeeting,
  createInitialParticipantStatuses,
} from "./live-state";
import type {
  LiveMeetingEvent,
  MeetingTurn,
  ModelParticipant,
} from "../types";

const participant: ModelParticipant = {
  id: "gpt",
  name: "GPT Mock",
  provider: "OpenAI",
  model: "gpt-mock",
  status: "mock",
  statusLabel: "Mock / 无需 API",
};

describe("live-state", () => {
  test("creates an empty live meeting shell before server events arrive", () => {
    const meeting = createInitialLiveMeeting("实时议题", true);

    expect(meeting.topic).toBe("实时议题");
    expect(meeting.phases[0].turns).toEqual([]);
    expect(meeting.phases[1].turns).toEqual([]);
    expect(meeting.isBriefMode).toBe(true);
  });

  test("applies turn and summary events incrementally", () => {
    const turn: MeetingTurn = {
      id: "independent-gpt",
      phaseId: "independent",
      speakerName: "GPT Mock",
      provider: "OpenAI",
      model: "gpt-mock",
      content: "实时发言",
    };
    const meeting = applyLiveMeetingEvent(
      createInitialLiveMeeting("实时议题", false),
      { type: "turn", turn },
    ).meeting;
    const completed = applyLiveMeetingEvent(meeting, {
      type: "summary",
      summary: {
        consensus: ["共识"],
        differences: [],
        minorityViews: [],
        risks: [],
        nextSteps: [],
      },
    }).meeting;

    expect(completed.phases[0].turns).toEqual([turn]);
    expect(completed.summary.consensus).toEqual(["共识"]);
  });

  test("updates participant status from live events", () => {
    const statuses = createInitialParticipantStatuses([participant]);
    const started = applyLiveMeetingEvent(
      createInitialLiveMeeting("实时议题", false),
      {
        type: "participant_started",
        phaseId: "independent",
        participantId: "gpt",
        participantName: "GPT Mock",
      },
      statuses,
    ).participantStatuses;

    expect(started?.gpt).toBe("speaking");

    const turnEvent: LiveMeetingEvent = {
      type: "turn",
      turn: {
        id: "independent-gpt",
        phaseId: "independent",
        speakerName: "GPT Mock",
        provider: "OpenAI",
        model: "gpt-mock",
        content: "完成",
      },
    };
    const finished = applyLiveMeetingEvent(
      createInitialLiveMeeting("实时议题", false),
      turnEvent,
      started,
      [participant],
    ).participantStatuses;

    expect(finished?.gpt).toBe("completed");
  });
});
