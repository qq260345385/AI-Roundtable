import { describe, expect, test } from "vitest";
import type { MeetingResult } from "../types";
import { buildMeetingRecapViewModel } from "./meeting-recap";

describe("meeting recap view model", () => {
  test("groups independent and response turns by model identity", () => {
    const meeting = createRecapMeeting();

    const recap = buildMeetingRecapViewModel(meeting);

    expect(recap.timeline.map((item) => item.id)).toEqual([
      "independent",
      "response",
      "summary",
    ]);
    expect(recap.timeline[0]).toEqual(
      expect.objectContaining({
        turnCount: 2,
        participantNames: ["Alpha Model", "Beta Model"],
        excerpt: expect.stringContaining("Alpha gives an independent view"),
      }),
    );
    expect(recap.modelRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          speakerName: "Alpha Model",
          provider: "AlphaAI",
          model: "alpha-large",
          independentExcerpt: expect.stringContaining("Alpha gives"),
          responseExcerpt: expect.stringContaining("Alpha responds"),
          responseStatus: "responded",
        }),
        expect.objectContaining({
          speakerName: "Beta Model",
          provider: "BetaAI",
          model: "beta-large",
          independentExcerpt: expect.stringContaining("Beta gives"),
          responseExcerpt: undefined,
          responseStatus: "no_response",
        }),
      ]),
    );
  });

  test("keeps failed response records separate from successful turns", () => {
    const meeting = createRecapMeeting({
      failures: [
        {
          providerId: "beta",
          participantName: "Beta Model",
          providerName: "BetaAI",
          model: "beta-large",
          stage: "response",
          errorType: "timeout",
          message: "Response timed out",
        },
      ],
    });

    const recap = buildMeetingRecapViewModel(meeting);
    const beta = recap.modelRows.find((row) => row.speakerName === "Beta Model");

    expect(beta).toEqual(
      expect.objectContaining({
        responseStatus: "failed_response",
        failureMessage: "Response timed out",
      }),
    );
    expect(beta?.responseExcerpt).toBeUndefined();
  });
});

function createRecapMeeting(
  overrides: Partial<MeetingResult> = {},
): MeetingResult {
  return {
    topic: "recap topic",
    phases: [
      {
        id: "independent",
        title: "第一阶段：独立观点",
        description: "Each model speaks independently.",
        turns: [
          {
            id: "t1",
            phaseId: "independent",
            speakerName: "Alpha Model",
            provider: "AlphaAI",
            model: "alpha-large",
            content:
              "Alpha gives an independent view with a long enough explanation for excerpting.",
          },
          {
            id: "t2",
            phaseId: "independent",
            speakerName: "Beta Model",
            provider: "BetaAI",
            model: "beta-large",
            content:
              "Beta gives an independent view and focuses on another angle.",
          },
        ],
      },
      {
        id: "response",
        title: "第二阶段：自由回应",
        description: "Models respond to earlier turns.",
        turns: [
          {
            id: "t3",
            phaseId: "response",
            speakerName: "Alpha Model",
            provider: "AlphaAI",
            model: "alpha-large",
            content:
              "Alpha responds to Beta and updates the earlier reasoning.",
          },
        ],
      },
    ],
    summary: {
      consensus: ["Shared conclusion."],
      differences: ["Real disagreement."],
      minorityViews: [],
      risks: [],
      nextSteps: ["Check sources."],
    },
    ...overrides,
  };
}
