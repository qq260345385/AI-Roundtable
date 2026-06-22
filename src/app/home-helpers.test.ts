import { describe, expect, test } from "vitest";
import { getUiText } from "@/lib/i18n/ui-text";
import type { LiveMeetingEvent } from "@/lib/types";
import type { EvidenceDraft } from "./home-types";
import {
  buildEvidencePackRequest,
  getLiveEventStageId,
  getStartButtonText,
  hasInvalidEvidenceDrafts,
} from "@/components/roundtable/MeetingSetupPanels";

const validDraft: EvidenceDraft = {
  title: "Local evidence",
  source: "Local file",
  url: "",
  publishedAt: "",
  snippet: "Useful source excerpt.",
};

describe("home page helpers", () => {
  test("builds the evidence pack request without changing the wire shape", () => {
    expect(buildEvidencePackRequest(false, [validDraft], "native_file")).toEqual(
      {
        enabled: false,
        items: [],
      },
    );

    expect(buildEvidencePackRequest(true, [validDraft], "text_pack")).toEqual({
      enabled: true,
      strategy: "text_pack",
      items: [
        {
          title: "Local evidence",
          source: "Local file",
          url: "",
          publishedAt: "",
          snippet: "Useful source excerpt.",
        },
      ],
    });
  });

  test("keeps evidence draft validation tied to enabled local evidence", () => {
    expect(hasInvalidEvidenceDrafts(false, [])).toBe(false);
    expect(hasInvalidEvidenceDrafts(true, [])).toBe(true);
    expect(hasInvalidEvidenceDrafts(true, [{ ...validDraft, snippet: " " }])).toBe(
      true,
    );
    expect(hasInvalidEvidenceDrafts(true, [validDraft])).toBe(false);
  });

  test("keeps start button gating messages stable", () => {
    const text = getUiText("en");

    expect(
      getStartButtonText({
        hasInvalidEvidencePack: false,
        isEvidenceImporting: false,
        meetingStatus: "initial",
        modelLoadStatus: "loading",
        mode: "mock",
        participantCount: 4,
        selectedParticipantCount: 4,
        text,
      }),
    ).toBe(text.meetingForm.modelsLoading);

    expect(
      getStartButtonText({
        hasInvalidEvidencePack: true,
        isEvidenceImporting: false,
        meetingStatus: "initial",
        modelLoadStatus: "success",
        mode: "mock",
        participantCount: 4,
        selectedParticipantCount: 4,
        text,
      }),
    ).toBe(text.meetingForm.selectEvidence);
  });

  test("maps live events to the visible meeting stage", () => {
    expect(
      getLiveEventStageId({
        type: "summary",
        summary: {
          consensus: [],
          differences: [],
          disagreements: [],
          minorityViews: [],
          nextSteps: [],
          risks: [],
        },
      } as LiveMeetingEvent),
    ).toBe("summary");

    expect(
      getLiveEventStageId({
        type: "turn",
        turn: {
          id: "turn-1",
          phaseId: "response",
          provider: "mock",
          model: "mock-model",
          speakerId: "model-a",
          speakerName: "Model A",
          content: "Reply",
        },
      } as LiveMeetingEvent),
    ).toBe("response");
  });
});
