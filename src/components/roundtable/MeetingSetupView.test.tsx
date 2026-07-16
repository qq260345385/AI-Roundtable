import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { getUiText } from "@/lib/i18n/ui-text";
import type { ModelParticipant } from "@/lib/types";
import { MeetingSetupView } from "./MeetingSetupView";

const participant: ModelParticipant = {
  id: "alpha",
  name: "Alpha Model",
  provider: "Mock",
  model: "alpha-large",
  status: "available",
  statusLabel: "模拟 / 无需 API",
};

describe("MeetingSetupView", () => {
  test("puts the topic composer before model selection, advanced settings, and history", () => {
    const text = getUiText("zh");
    const html = renderToStaticMarkup(
      <MeetingSetupView
        documentInputStrategy="text_pack"
        evidenceDrafts={[]}
        evidenceImportMessage=""
        hasEvidenceWarnings={false}
        headerTopic=""
        isBriefMode={false}
        isEvidenceImporting={false}
        isEvidencePackEnabled={false}
        isSearchDriverDialogOpen={false}
        isStartDisabled={false}
        isWebSearchEnabled={false}
        isWebSearchToggleDisabled={false}
        locale="zh"
        meetingHistory={[]}
        mode="mock"
        modelLoadStatus="success"
        participants={[participant]}
        question="Should we test this idea?"
        searchDriverParticipantId="alpha"
        searchIntensity="standard"
        searchRegion="auto"
        selectedParticipantIds={["alpha"]}
        selectedParticipants={[participant]}
        shouldShowFactNotice={false}
        startButtonText="开始圆桌会议"
        status="initial"
        statusMessage=""
        summaryParticipantId=""
        text={text}
        unavailableProviders={[]}
        onBriefModeChange={() => undefined}
        onDeleteHistoryMeeting={() => undefined}
        onDocumentInputStrategyChange={() => undefined}
        onEvidenceEnabledChange={() => undefined}
        onEvidenceFilesImport={() => undefined}
        onEvidenceRemoveDraft={() => undefined}
        onLocaleChange={() => undefined}
        onOpenHistoryMeeting={() => undefined}
        onQuestionChange={() => undefined}
        onSearchDriverDialogClose={() => undefined}
        onSearchDriverDialogConfirm={() => undefined}
        onSearchDriverParticipantChange={() => undefined}
        onSearchIntensityChange={() => undefined}
        onSearchRegionChange={() => undefined}
        onSelectedParticipantIdsChange={() => undefined}
        onSelectedParticipantSeatSwap={() => undefined}
        onStartMeeting={() => undefined}
        onSummaryParticipantChange={() => undefined}
        onWebSearchToggle={() => undefined}
      />,
    );

    expect(html).toContain("已选模型");
    expect(html).toContain("Alpha Model");
    expect(html).toContain("更多设置");
    expect(html).toContain('<details class="surface-panel group p-5"><summary');
    expect(html).not.toContain('<details class="surface-panel group p-5" open');
    expect(html.indexOf(text.meetingForm.title)).toBeLessThan(
      html.indexOf("模型选择"),
    );
    expect(html.indexOf("模型选择")).toBeLessThan(
      html.indexOf("更多设置"),
    );
    expect(html.indexOf("更多设置")).toBeLessThan(
      html.indexOf(text.history.title),
    );
    const advancedMarkup = html.slice(html.indexOf("更多设置"));
    expect(advancedMarkup).toContain(text.evidence.webSearchToggle);
    expect(advancedMarkup).toContain(text.evidence.enable);
    expect(advancedMarkup).toContain(text.meetingForm.briefMode);
    expect(advancedMarkup).toContain(text.meetingForm.summaryModelLabel);
  });
});
