"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MeetingRoom } from "@/components/roundtable/MeetingRoom";
import { MeetingSetupView } from "@/components/roundtable/MeetingSetupView";
import {
  buildEvidencePackRequest,
  getErrorMessage,
  getStartButtonText,
  handleLiveMeetingEvent,
  hasInvalidEvidenceDrafts,
  parseEvidenceFile,
  readLiveMeetingEvents,
} from "@/components/roundtable/MeetingSetupPanels";
import { exportMeetingToMarkdown } from "@/lib/meeting/export-markdown";
import {
  addMeetingHistoryRecord,
  createMeetingHistoryRecord,
  deleteMeetingHistoryRecord,
  MEETING_HISTORY_STORAGE_KEY,
  type MeetingHistoryRecord,
  parseMeetingHistory,
  serializeMeetingHistory,
} from "@/lib/meeting/meeting-history";
import {
  getParticipantsInSelectionOrder,
  swapSelectedParticipantSeats,
} from "@/lib/models/participant-selection";
import {
  createInitialLiveMeeting,
  createInitialParticipantStatuses,
} from "@/lib/meeting/live-state";
import { shouldShowFactHygieneNotice } from "@/lib/meeting/fact-hygiene";
import { getUiText, isLocale, type Locale } from "@/lib/i18n/ui-text";
import type {
  MeetingApiResponse,
  LiveParticipantStatuses,
  MeetingResult,
  ModelsApiResponse,
  ModelParticipant,
  RoundtableMode,
  SearchIntensity,
  SearchRegion,
  UnavailableProvider,
} from "@/lib/types";
import type { DocumentInputStrategy } from "@/lib/search/evidence-pack";
import {
  LOCALE_STORAGE_KEY,
  MAX_EVIDENCE_DRAFTS,
  SEARCH_INTENSITY_STORAGE_KEY,
  SEARCH_REGION_STORAGE_KEY,
  type EvidenceDraft,
  type MeetingStatus,
  type ModelLoadStatus,
} from "./home-types";

export default function Home() {
  const [mode, setMode] = useState<RoundtableMode | null>(null);
  const [modelLoadStatus, setModelLoadStatus] =
    useState<ModelLoadStatus>("loading");
  const [participants, setParticipants] = useState<ModelParticipant[]>([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<
    string[]
  >([]);
  const [unavailableProviders, setUnavailableProviders] = useState<
    UnavailableProvider[]
  >([]);
  const [question, setQuestion] = useState("");
  const [meeting, setMeeting] = useState<MeetingResult | null>(null);
  const [status, setStatus] = useState<MeetingStatus>("initial");
  const [message, setMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [meetingParticipants, setMeetingParticipants] = useState<
    ModelParticipant[]
  >([]);
  const [meetingHistory, setMeetingHistory] = useState<MeetingHistoryRecord[]>(
    [],
  );
  const [liveParticipantStatuses, setLiveParticipantStatuses] =
    useState<LiveParticipantStatuses>({});
  const [liveActiveStageId, setLiveActiveStageId] = useState("independent");
  const [isMeetingStreaming, setIsMeetingStreaming] = useState(false);
  const [isStopMeetingConfirming, setIsStopMeetingConfirming] = useState(false);
  const [isEvidencePackEnabled, setIsEvidencePackEnabled] = useState(false);
  const [documentInputStrategy, setDocumentInputStrategy] =
    useState<DocumentInputStrategy>("native_file");
  const [evidenceDrafts, setEvidenceDrafts] = useState<EvidenceDraft[]>([]);
  const [evidenceImportMessage, setEvidenceImportMessage] = useState("");
  const [isEvidenceImporting, setIsEvidenceImporting] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [searchDriverParticipantId, setSearchDriverParticipantId] =
    useState("");
  const [summaryParticipantId, setSummaryParticipantId] = useState("");
  const [isSearchDriverDialogOpen, setIsSearchDriverDialogOpen] =
    useState(false);
  const [isBriefMode, setIsBriefMode] = useState(false);
  const [locale, setLocale] = useState<Locale>("zh");
  const [searchRegion, setSearchRegion] = useState<SearchRegion>("auto");
  const [searchIntensity, setSearchIntensity] =
    useState<SearchIntensity>("deep");
  const meetingAbortControllerRef = useRef<AbortController | null>(null);
  const uiText = getUiText(locale);

  useEffect(() => {
    const restoreClientStateTimer = window.setTimeout(() => {
      const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(storedLocale)) {
        setLocale(storedLocale);
      }

      const storedSearchRegion = window.localStorage.getItem(
        SEARCH_REGION_STORAGE_KEY,
      );
      const validRegions: SearchRegion[] = [
        "auto",
        "global",
        "china",
        "us",
        "europe",
        "japan",
        "korea",
      ];
      if (validRegions.includes(storedSearchRegion as SearchRegion)) {
        setSearchRegion(storedSearchRegion as SearchRegion);
      }

      const storedSearchIntensity = window.localStorage.getItem(
        SEARCH_INTENSITY_STORAGE_KEY,
      );
      if (storedSearchIntensity === "standard") {
        setSearchIntensity("standard");
      }

      setMeetingHistory(
        parseMeetingHistory(
          window.localStorage.getItem(MEETING_HISTORY_STORAGE_KEY),
        ),
      );
    }, 0);

    return () => window.clearTimeout(restoreClientStateTimer);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  function changeLocale(nextLocale: Locale) {
    setLocale(nextLocale);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : "en";
  }

  useEffect(() => {
    async function loadModels() {
      try {
        setModelLoadStatus("loading");
        const response = await fetch("/api/models");
        const data = (await response.json()) as ModelsApiResponse;

        if (!response.ok) {
          throw new Error(data.error || uiText.meetingForm.modelsError);
        }

        setMode(data.mode);
        setParticipants(data.models);
        setSelectedParticipantIds(data.models.map((model) => model.id));
        setSearchDriverParticipantId(data.models[0]?.id ?? "");
        setSummaryParticipantId((currentId) =>
          currentId && data.models.some((model) => model.id === currentId)
            ? currentId
            : "",
        );
        setUnavailableProviders(data.unavailableProviders);
        setModelLoadStatus("success");
      } catch (error) {
        setModelLoadStatus("error");
        setStatus("error");
        setMessage(
          `${uiText.meetingForm.messages.modelsLoadFailed}${getErrorMessage(error, uiText)}`,
        );
      }
    }

    loadModels();
  }, [uiText]);

  useEffect(() => {
    if (!copyMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopyMessage("");
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  function changeWebSearchEnabled(enabled: boolean) {
    setEvidenceImportMessage("");

    if (enabled && participants.length === 0) {
      return;
    }

    setIsWebSearchEnabled(enabled);

    if (enabled && participants.length > 0) {
      setSearchDriverParticipantId((currentId) => currentId || participants[0].id);
      setIsSearchDriverDialogOpen(true);
    }
  }

  async function startMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();
    const selectedParticipants = participants.filter((participant) =>
      selectedParticipantIds.includes(participant.id),
    );
    const hasNoRealModels = mode === "real" && participants.length === 0;

    if (!trimmedQuestion) {
      setStatus("error");
      setMessage(uiText.meetingForm.messages.questionRequired);
      return;
    }

    if (hasNoRealModels) {
      setStatus("error");
      setMessage(uiText.meetingForm.messages.realNoModels);
      return;
    }

    if (selectedParticipants.length === 0) {
      setStatus("error");
      setMessage(uiText.meetingForm.messages.selectParticipant);
      return;
    }

    if (hasInvalidEvidenceDrafts(isEvidencePackEnabled, evidenceDrafts)) {
      setStatus("error");
      setMessage(uiText.meetingForm.messages.evidenceRequired);
      return;
    }

    const meetingEvidenceDrafts = isEvidencePackEnabled ? evidenceDrafts : [];

    const initialMeeting = createInitialLiveMeeting(
      trimmedQuestion,
      isBriefMode,
    );
    const meetingAbortController = new AbortController();

    meetingAbortControllerRef.current?.abort();
    meetingAbortControllerRef.current = meetingAbortController;
    setStatus("loading");
    setMessage(
      isWebSearchEnabled
        ? uiText.evidence.webSearching
        : uiText.meetingForm.messages.meetingLoading,
    );
    setCopyMessage("");
    setMeeting(initialMeeting);
    setMeetingParticipants(selectedParticipants);
    setLiveParticipantStatuses(
      createInitialParticipantStatuses(selectedParticipants),
    );
    setLiveActiveStageId("independent");
    setIsMeetingStreaming(true);
    setIsStopMeetingConfirming(false);

    try {
      const response = await fetch("/api/meeting/live", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          evidencePack: buildEvidencePackRequest(
            isEvidencePackEnabled,
            meetingEvidenceDrafts,
            documentInputStrategy,
          ),
          isBriefMode,
          participantIds: selectedParticipantIds,
          question: trimmedQuestion,
          searchDriverParticipantId: isWebSearchEnabled
            ? searchDriverParticipantId || undefined
            : undefined,
          searchMode: searchIntensity === "standard" ? "standard" : "deep",
          searchPreferences: {
            searchRegion,
            searchIntensity,
          },
          summaryParticipantId: summaryParticipantId || undefined,
          webSearchEnabled: isWebSearchEnabled,
        }),
        signal: meetingAbortController.signal,
      });

      if (!response.ok) {
        const data = (await response.json()) as MeetingApiResponse;

        throw new Error(
          data.safeErrorMessage ||
            data.error ||
            uiText.meetingForm.messages.meetingFailed,
        );
      }

      await readLiveMeetingEvents(response, (event) => {
        handleLiveMeetingEvent(
          event,
          initialMeeting,
          selectedParticipants,
          uiText,
          {
            setLiveActiveStageId,
            setLiveParticipantStatuses,
            setMeeting,
            setMessage,
            setStatus,
            setIsMeetingStreaming,
          },
        );

        if (event.type === "meeting_completed") {
          saveMeetingHistory(event.meeting, selectedParticipants);
        }
      });
    } catch (error) {
      if (meetingAbortController.signal.aborted) {
        return;
      }

      setStatus("error");
      setMessage(getErrorMessage(error, uiText));
      setIsMeetingStreaming(false);
    } finally {
      if (meetingAbortControllerRef.current === meetingAbortController) {
        meetingAbortControllerRef.current = null;
      }
    }
  }

  function resetMeetingToSetup() {
    setMeeting(null);
    setStatus("initial");
    setMessage("");
    setCopyMessage("");
    setMeetingParticipants([]);
    setLiveParticipantStatuses({});
    setLiveActiveStageId("independent");
    setIsMeetingStreaming(false);
    setIsStopMeetingConfirming(false);
  }

  function saveMeetingHistory(
    completedMeeting: MeetingResult,
    completedParticipants: ModelParticipant[],
  ) {
    const record = createMeetingHistoryRecord({
      meeting: completedMeeting,
      participants: completedParticipants,
    });

    setMeetingHistory((currentRecords) => {
      const nextRecords = addMeetingHistoryRecord(currentRecords, record);
      window.localStorage.setItem(
        MEETING_HISTORY_STORAGE_KEY,
        serializeMeetingHistory(nextRecords),
      );

      return nextRecords;
    });
  }

  function openHistoryMeeting(record: MeetingHistoryRecord) {
    setMeeting(record.meeting);
    setMeetingParticipants(record.participants);
    setLiveParticipantStatuses(
      Object.fromEntries(
        record.participants.map((participant) => [participant.id, "completed"]),
      ),
    );
    setLiveActiveStageId("summary");
    setStatus("success");
    setMessage("");
    setCopyMessage("");
    setIsMeetingStreaming(false);
    setIsStopMeetingConfirming(false);
  }

  function deleteHistoryMeeting(recordId: string) {
    setMeetingHistory((currentRecords) => {
      const nextRecords = deleteMeetingHistoryRecord(currentRecords, recordId);
      window.localStorage.setItem(
        MEETING_HISTORY_STORAGE_KEY,
        serializeMeetingHistory(nextRecords),
      );

      return nextRecords;
    });
  }

  function stopMeeting() {
    if (!isStopMeetingConfirming) {
      setIsStopMeetingConfirming(true);
      return;
    }

    meetingAbortControllerRef.current?.abort();
    meetingAbortControllerRef.current = null;
    resetMeetingToSetup();
  }

  async function copyMarkdown() {
    if (!meeting) {
      return;
    }

    try {
      const markdown = exportMeetingToMarkdown(meeting, meetingParticipants, {
        includeEvidenceDebug: Boolean(meeting.debugSearchProcess),
      });
      await navigator.clipboard.writeText(markdown);
      setCopyMessage(uiText.save.copied);
    } catch {
      setCopyMessage(uiText.save.failed);
    }
  }

  async function importEvidenceFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return;
    }

    const remainingSlots = MAX_EVIDENCE_DRAFTS - evidenceDrafts.length;

    if (remainingSlots <= 0) {
      setEvidenceImportMessage(uiText.evidence.maxFiles);
      return;
    }

    const selectedFiles = Array.from(files).slice(0, remainingSlots);
    const importedDrafts: EvidenceDraft[] = [];
    const failedFiles: string[] = [];

    setIsEvidenceImporting(true);
    setEvidenceImportMessage(uiText.evidence.parsingMessage);

    for (const file of selectedFiles) {
      try {
        const draft = await parseEvidenceFile(file, uiText.evidence.parseFailed);

        if (draft?.snippet.trim()) {
          importedDrafts.push(draft);
        } else {
          failedFiles.push(file.name);
        }
      } catch {
        failedFiles.push(file.name);
      }
    }

    if (importedDrafts.length > 0) {
      setEvidenceDrafts((currentDrafts) => [
        ...currentDrafts,
        ...importedDrafts,
      ]);
    }

    const messages = [];

    if (importedDrafts.length > 0) {
      messages.push(
        `${uiText.evidence.imported} ${importedDrafts.length} ${uiText.evidence.importedSuffix}`,
      );
    }

    if (files.length > remainingSlots) {
      messages.push(uiText.evidence.maxReached);
    }

    if (failedFiles.length > 0) {
      messages.push(
        `${uiText.evidence.failedPrefix} ${failedFiles.length} ${uiText.evidence.failedSuffix}${failedFiles.slice(0, 3).join("、")}`,
      );
    }

    setEvidenceImportMessage(
      messages.length > 0 ? messages.join(" ") : uiText.evidence.noContent,
    );
    setIsEvidenceImporting(false);
  }

  const headerTopic = meeting?.topic || uiText.meetingForm.defaultTopic;
  const shouldShowFactNotice = shouldShowFactHygieneNotice(
    question,
    isWebSearchEnabled,
  );
  const hasInvalidEvidencePack = hasInvalidEvidenceDrafts(
    isEvidencePackEnabled,
    evidenceDrafts,
  );
  const hasEvidenceWarnings = evidenceDrafts.some(
    (draft) => (draft.quality?.warnings.length ?? 0) > 0,
  );
  const selectedParticipants = getParticipantsInSelectionOrder(
    participants,
    selectedParticipantIds,
  );
  const isStartDisabled =
    status === "loading" ||
    isEvidenceImporting ||
    modelLoadStatus !== "success" ||
    (mode === "real" && participants.length === 0) ||
    selectedParticipants.length === 0 ||
    hasInvalidEvidencePack;
  const isWebSearchToggleDisabled =
    status === "loading" || modelLoadStatus !== "success" || participants.length === 0;
  const startButtonText = getStartButtonText({
    hasInvalidEvidencePack,
    isEvidenceImporting,
    meetingStatus: status,
    modelLoadStatus,
    mode,
    participantCount: participants.length,
    selectedParticipantCount: selectedParticipants.length,
    text: uiText,
  });

  if (meeting) {
    return (
      <MeetingRoom
        activeStageId={liveActiveStageId}
        copyMessage={copyMessage}
        isCompleted={status === "success"}
        isLive={isMeetingStreaming}
        isStopConfirming={isStopMeetingConfirming}
        meeting={meeting}
        onBackToSetup={resetMeetingToSetup}
        onCancelStopMeeting={() => setIsStopMeetingConfirming(false)}
        onCopyMarkdown={copyMarkdown}
        onStageChange={setLiveActiveStageId}
        onStopMeeting={stopMeeting}
        participants={meetingParticipants}
        participantStatuses={liveParticipantStatuses}
        statusMessage={message}
        statusType={status}
        text={uiText}
      />
    );
  }

  return (
    <MeetingSetupView
      documentInputStrategy={documentInputStrategy}
      evidenceDrafts={evidenceDrafts}
      evidenceImportMessage={evidenceImportMessage}
      hasEvidenceWarnings={hasEvidenceWarnings}
      headerTopic={headerTopic}
      isBriefMode={isBriefMode}
      isEvidenceImporting={isEvidenceImporting}
      isEvidencePackEnabled={isEvidencePackEnabled}
      isSearchDriverDialogOpen={isSearchDriverDialogOpen}
      isStartDisabled={isStartDisabled}
      isWebSearchEnabled={isWebSearchEnabled}
      isWebSearchToggleDisabled={isWebSearchToggleDisabled}
      locale={locale}
      meetingHistory={meetingHistory}
      mode={mode}
      modelLoadStatus={modelLoadStatus}
      participants={participants}
      question={question}
      searchDriverParticipantId={searchDriverParticipantId}
      searchIntensity={searchIntensity}
      searchRegion={searchRegion}
      selectedParticipantIds={selectedParticipantIds}
      selectedParticipants={selectedParticipants}
      shouldShowFactNotice={shouldShowFactNotice}
      startButtonText={startButtonText}
      status={status}
      statusMessage={message}
      summaryParticipantId={summaryParticipantId}
      text={uiText}
      unavailableProviders={unavailableProviders}
      onBriefModeChange={setIsBriefMode}
      onDeleteHistoryMeeting={deleteHistoryMeeting}
      onDocumentInputStrategyChange={setDocumentInputStrategy}
      onEvidenceEnabledChange={(enabled) => {
        setIsEvidencePackEnabled(enabled);
        setEvidenceImportMessage("");
      }}
      onEvidenceFilesImport={importEvidenceFiles}
      onEvidenceRemoveDraft={(index) =>
        setEvidenceDrafts((currentDrafts) =>
          currentDrafts.filter((_, draftIndex) => draftIndex !== index),
        )
      }
      onLocaleChange={changeLocale}
      onOpenHistoryMeeting={openHistoryMeeting}
      onQuestionChange={setQuestion}
      onSearchDriverDialogClose={() => setIsSearchDriverDialogOpen(false)}
      onSearchDriverDialogConfirm={() => setIsSearchDriverDialogOpen(false)}
      onSearchDriverParticipantChange={setSearchDriverParticipantId}
      onSearchIntensityChange={(intensity) => {
        setSearchIntensity(intensity);
        window.localStorage.setItem(SEARCH_INTENSITY_STORAGE_KEY, intensity);
      }}
      onSearchRegionChange={(region) => {
        setSearchRegion(region);
        window.localStorage.setItem(SEARCH_REGION_STORAGE_KEY, region);
      }}
      onSelectedParticipantIdsChange={setSelectedParticipantIds}
      onSelectedParticipantSeatSwap={(draggedParticipantId, targetParticipantId) => {
        setSelectedParticipantIds((currentIds) =>
          swapSelectedParticipantSeats(
            currentIds,
            draggedParticipantId,
            targetParticipantId,
          ),
        );
      }}
      onStartMeeting={startMeeting}
      onSummaryParticipantChange={setSummaryParticipantId}
      onWebSearchToggle={() => {
        if (isWebSearchToggleDisabled) {
          return;
        }
        changeWebSearchEnabled(!isWebSearchEnabled);
      }}
    />
  );
}
