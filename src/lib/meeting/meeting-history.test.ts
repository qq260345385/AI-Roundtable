import { describe, expect, test } from "vitest";
import type { MeetingResult, ModelParticipant } from "@/lib/types";
import {
  addMeetingHistoryRecord,
  createMeetingHistoryRecord,
  deleteMeetingHistoryRecord,
  parseMeetingHistory,
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
});
