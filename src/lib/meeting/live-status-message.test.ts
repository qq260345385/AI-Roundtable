import { describe, expect, test } from "vitest";
import { getUiText } from "../i18n/ui-text";
import { getLiveMeetingStatusMessage } from "./live-status-message";

describe("getLiveMeetingStatusMessage", () => {
  test("switches from searching to completed when live meeting starts with web evidence", () => {
    expect(
      getLiveMeetingStatusMessage(
        {
          type: "meeting_started",
          topic: "topic",
          participants: [],
          isBriefMode: false,
          isTimeSensitive: false,
          searchSummary: {
            enabled: true,
            status: "low_evidence",
            evidenceMode: "low_evidence",
            totalReferences: 10,
            strongCount: 0,
            mediumCount: 0,
            weakCount: 10,
            hasRealtimeWarning: true,
            userMessage: "Web search completed.",
          },
        },
        getUiText("zh"),
      ),
    ).toBe("联网搜索已完成，会议开始发言。");
  });

  test("returns no message for non-search meetings", () => {
    expect(
      getLiveMeetingStatusMessage(
        {
          type: "meeting_started",
          topic: "topic",
          participants: [],
          isBriefMode: false,
          isTimeSensitive: false,
        },
        getUiText("zh"),
      ),
    ).toBeUndefined();
  });
});
