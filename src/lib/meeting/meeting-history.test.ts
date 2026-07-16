import { describe, expect, test } from "vitest";
import type { MeetingResult, ModelParticipant } from "@/lib/types";
import {
  addMeetingHistoryRecord,
  createMeetingHistoryRecord,
  deleteMeetingHistoryRecord,
  parseMeetingHistory,
  serializeMeetingHistory,
} from "./meeting-history";

const participant: ModelParticipant = {
  id: "gpt",
  name: "GPT Mock",
  provider: "OpenAI",
  model: "gpt-mock",
  status: "mock",
  statusLabel: "Mock",
};

const meeting: MeetingResult = {
  topic: "history topic",
  phases: [
    {
      id: "independent",
      title: "Independent",
      description: "Independent views",
      turns: [],
    },
  ],
  summary: {
    consensus: ["summary"],
    differences: [],
    minorityViews: [],
    risks: [],
    nextSteps: [],
  },
};

describe("meeting history", () => {
  test("creates a record with meeting and participant details", () => {
    const record = createMeetingHistoryRecord({
      createdAt: "2026-06-01T12:00:00.000Z",
      id: "record-1",
      meeting,
      participants: [participant],
    });

    expect(record).toEqual(
      expect.objectContaining({
        createdAt: "2026-06-01T12:00:00.000Z",
        id: "record-1",
        topic: "history topic",
        participantNames: ["GPT Mock"],
        meeting,
        participants: [participant],
      }),
    );
  });

  test("adds newest records first and caps the history length", () => {
    const records = Array.from({ length: 3 }, (_, index) =>
      createMeetingHistoryRecord({
        createdAt: `2026-06-01T12:0${index}:00.000Z`,
        id: `record-${index}`,
        meeting,
        participants: [participant],
      }),
    );
    const nextRecord = createMeetingHistoryRecord({
      createdAt: "2026-06-01T12:10:00.000Z",
      id: "record-next",
      meeting,
      participants: [participant],
    });

    const nextRecords = addMeetingHistoryRecord(records, nextRecord, 3);

    expect(nextRecords.map((record) => record.id)).toEqual([
      "record-next",
      "record-0",
      "record-1",
    ]);
  });

  test("deletes a history record by id", () => {
    const records = ["a", "b"].map((id) =>
      createMeetingHistoryRecord({
        createdAt: "2026-06-01T12:00:00.000Z",
        id,
        meeting,
        participants: [participant],
      }),
    );

    expect(deleteMeetingHistoryRecord(records, "a").map((record) => record.id))
      .toEqual(["b"]);
  });

  test("parses invalid stored history as an empty list", () => {
    expect(parseMeetingHistory("{")).toEqual([]);
    expect(parseMeetingHistory(JSON.stringify([{ id: "broken" }]))).toEqual([]);
  });

  test("creates an in-memory compatibility brief for legacy records without rewriting input", () => {
    const legacyRecord = createMeetingHistoryRecord({
      createdAt: "2026-06-01T12:00:00.000Z",
      id: "legacy-record",
      meeting,
      participants: [participant],
    });
    const serialized = JSON.stringify([legacyRecord]);

    const [record] = parseMeetingHistory(serialized);

    expect(record.meeting.summary.decisionBrief).toMatchObject({
      recommendation: "summary",
      status: "tentative",
      confidence: "low",
    });
    expect(serialized).toBe(JSON.stringify([legacyRecord]));
    expect(JSON.parse(serialized)[0].meeting.summary.decisionBrief).toBeUndefined();
  });

  test("preserves a complete current brief through serialize and parse", () => {
    const currentMeeting: MeetingResult = {
      ...meeting,
      summary: {
        ...meeting.summary,
        decisionBrief: {
          recommendation: "先执行两周试点。",
          status: "firm",
          rationale: ["可以低成本验证。"],
          conditions: ["预算封顶。"],
          risks: ["样本有限。"],
          confidence: "medium",
          evidenceGaps: [],
          reversalConditions: ["若指标低于基线则停止。"],
          nextAction: "今天指定负责人。",
        },
      },
    };
    const record = createMeetingHistoryRecord({
      createdAt: "2026-07-16T12:00:00.000Z",
      id: "current-record",
      meeting: currentMeeting,
      participants: [participant],
    });

    const [parsed] = parseMeetingHistory(serializeMeetingHistory([record]));

    expect(parsed.meeting.summary.decisionBrief).toEqual(
      currentMeeting.summary.decisionBrief,
    );
  });
});
