"use client";

import {
  type Dispatch,
  FormEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { MeetingHeader } from "@/components/roundtable/MeetingHeader";
import { MeetingRoom } from "@/components/roundtable/MeetingRoom";
import { ParticipantList } from "@/components/roundtable/ParticipantList";
import { RoundtableDiagram } from "@/components/roundtable/RoundtableDiagram";
import { exportMeetingToMarkdown } from "@/lib/meeting/export-markdown";
import {
  getParticipantsInSelectionOrder,
  swapSelectedParticipantSeats,
} from "@/lib/models/participant-selection";
import {
  applyLiveMeetingEvent,
  createInitialLiveMeeting,
  createInitialParticipantStatuses,
} from "@/lib/meeting/live-state";
import {
  FACT_HYGIENE_NOTICE,
  shouldShowFactHygieneNotice,
} from "@/lib/meeting/fact-hygiene";
import { getLiveMeetingStatusMessage } from "@/lib/meeting/live-status-message";
import { getUiText, isLocale, type Locale } from "@/lib/i18n/ui-text";
import type {
  MeetingApiResponse,
  LiveMeetingEvent,
  LiveParticipantStatuses,
  MeetingResult,
  ModelsApiResponse,
  ModelParticipant,
  RoundtableMode,
  SearchIntensity,
  SearchRegion,
  UnavailableProvider,
} from "@/lib/types";
import type {
  DocumentInputStrategy,
} from "@/lib/search/evidence-pack";

type MeetingStatus = "initial" | "loading" | "success" | "error";
type ModelLoadStatus = "loading" | "success" | "error";
const LOCALE_STORAGE_KEY = "ai-roundtable-locale";
const SEARCH_REGION_STORAGE_KEY = "ai-roundtable-search-region";
const SEARCH_INTENSITY_STORAGE_KEY = "ai-roundtable-search-intensity";
const MAX_EVIDENCE_DRAFTS = 10;

type EvidenceDraft = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  snippet: string;
  quality?: {
    warnings: string[];
    textLength: number;
    wasTruncated: boolean;
  };
};
type EvidenceParseApiResponse = {
  draft?: EvidenceDraft;
  error?: string;
};

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
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === "undefined") {
      return "zh";
    }

    const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(storedLocale) ? storedLocale : "zh";
  });
  const [searchRegion, setSearchRegion] = useState<SearchRegion>(() => {
    if (typeof window === "undefined") {
      return "auto";
    }

    const stored = window.localStorage.getItem(SEARCH_REGION_STORAGE_KEY);
    const validRegions: SearchRegion[] = ["auto", "global", "china", "us", "europe", "japan", "korea"];
    return validRegions.includes(stored as SearchRegion) ? (stored as SearchRegion) : "auto";
  });
  const [searchIntensity, setSearchIntensity] = useState<SearchIntensity>(() => {
    if (typeof window === "undefined") {
      return "deep";
    }

    const stored = window.localStorage.getItem(SEARCH_INTENSITY_STORAGE_KEY);
    return stored === "standard" ? "standard" : "deep";
  });
  const meetingAbortControllerRef = useRef<AbortController | null>(null);
  const uiText = getUiText(locale);

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
    <div className="min-h-screen bg-zinc-100">
      <MeetingHeader
        topic={headerTopic}
        participantCount={selectedParticipants.length}
        phaseCount={3}
        mode={mode}
        locale={locale}
        onLocaleChange={changeLocale}
        searchRegion={searchRegion}
        onSearchRegionChange={(region) => {
          setSearchRegion(region);
          window.localStorage.setItem(SEARCH_REGION_STORAGE_KEY, region);
        }}
        searchIntensity={searchIntensity}
        onSearchIntensityChange={(intensity) => {
          setSearchIntensity(intensity);
          window.localStorage.setItem(SEARCH_INTENSITY_STORAGE_KEY, intensity);
        }}
        text={uiText}
      />

      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <ParticipantList
            disabled={status === "loading"}
            isLoading={modelLoadStatus === "loading"}
            mode={mode}
            onSelectionChange={setSelectedParticipantIds}
            participants={participants}
            selectedParticipantIds={selectedParticipantIds}
            text={uiText}
          />
          <ProviderModeNotice
            modelLoadStatus={modelLoadStatus}
            mode={mode}
            participantCount={participants.length}
            text={uiText}
          />
          <UnavailableProviderList providers={unavailableProviders} text={uiText} />
          <RoundtableDiagram
            onSeatSwap={
              status === "loading"
                ? undefined
                : (draggedParticipantId, targetParticipantId) => {
                    setSelectedParticipantIds((currentIds) =>
                      swapSelectedParticipantSeats(
                        currentIds,
                        draggedParticipantId,
                        targetParticipantId,
                      ),
                    );
                  }
            }
            participants={selectedParticipants}
            text={uiText}
          />
        </div>

        <div className="space-y-5">
          <section className="border border-zinc-200 bg-white p-5">
            <h2 className="text-lg font-semibold text-zinc-950">
              {uiText.meetingForm.title}
            </h2>
            <form className="mt-4 space-y-4" onSubmit={startMeeting}>
              <div className="rounded-[28px] border border-zinc-200 bg-white p-4 shadow-sm transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-blue-300 focus-within:shadow-[0_12px_36px_rgba(37,99,235,0.10)]">
                <textarea
                  className="min-h-32 w-full resize-y border-0 bg-transparent p-0 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:text-zinc-500"
                  disabled={status === "loading"}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={uiText.meetingForm.placeholder}
                  value={question}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <SearchTogglePill
                    active={isWebSearchEnabled}
                    disabled={isWebSearchToggleDisabled}
                    label={uiText.evidence.webSearchToggle}
                    onClick={() => {
                      if (isWebSearchToggleDisabled) {
                        return;
                      }
                      changeWebSearchEnabled(!isWebSearchEnabled);
                    }}
                    title={uiText.evidence.webSearchDescription}
                  />
                  <button
                    className="ml-auto border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-transform duration-150 ease-out hover:scale-[1.03] hover:cursor-pointer hover:bg-emerald-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:hover:scale-100 disabled:hover:bg-zinc-300"
                    disabled={isStartDisabled}
                    type="submit"
                  >
                    {startButtonText}
                  </button>
                </div>
              </div>
              {shouldShowFactNotice ? <FactHygieneNotice text={uiText} /> : null}
              {isWebSearchEnabled ? (
                <ModelSelectField
                  disabled={status === "loading"}
                  label={uiText.evidence.searchDriverModelLabel}
                  onChange={setSearchDriverParticipantId}
                  participants={participants}
                  placeholder={uiText.evidence.searchDriverModelPlaceholder}
                  text={uiText}
                  value={searchDriverParticipantId}
                />
              ) : null}
              <EvidencePackEditor
                disabled={status === "loading"}
                drafts={evidenceDrafts}
                enabled={isEvidencePackEnabled}
                importMessage={evidenceImportMessage}
                isImporting={isEvidenceImporting}
                onEnabledChange={(enabled) => {
                  setIsEvidencePackEnabled(enabled);
                  setEvidenceImportMessage("");
                }}
                onImportFiles={importEvidenceFiles}
                onRemoveDraft={(index) =>
                  setEvidenceDrafts((currentDrafts) =>
                    currentDrafts.filter((_, draftIndex) => draftIndex !== index),
                  )
                }
                onStrategyChange={setDocumentInputStrategy}
                participants={selectedParticipants}
                strategy={documentInputStrategy}
                text={uiText}
              />
              <label className="flex items-start gap-2 border border-zinc-200 bg-zinc-50 p-4 text-sm font-medium text-zinc-800 transition-[border-color,background-color] duration-150 ease-out hover:border-emerald-200 hover:bg-emerald-50/40">
                <input
                  checked={isBriefMode}
                  className="mt-1 h-4 w-4 accent-emerald-700"
                  disabled={status === "loading"}
                  onChange={(event) => setIsBriefMode(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  {uiText.meetingForm.briefMode}
                  <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500">
                    {uiText.meetingForm.briefModeDescription}
                  </span>
                </span>
              </label>
              <ModelSelectField
                allowAuto
                disabled={status === "loading"}
                label={uiText.meetingForm.summaryModelLabel}
                onChange={setSummaryParticipantId}
                participants={participants}
                placeholder={uiText.meetingForm.summaryModelAuto}
                text={uiText}
                value={summaryParticipantId}
              />
              {isEvidencePackEnabled && hasEvidenceWarnings ? (
                <p className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  {uiText.meetingForm.evidenceWarning}
                </p>
              ) : null}
            </form>
            {message ? <StatusMessage message={message} status={status} /> : null}
          </section>

          <EmptyMeetingState text={uiText} />
        </div>
      </main>
      <ModelChoiceDialog
        isOpen={isSearchDriverDialogOpen}
        onClose={() => setIsSearchDriverDialogOpen(false)}
        onConfirm={() => setIsSearchDriverDialogOpen(false)}
        onSelect={setSearchDriverParticipantId}
        participants={participants}
        selectedParticipantId={searchDriverParticipantId}
        text={uiText}
        title={uiText.evidence.searchDriverDialogTitle}
      />
    </div>
  );
}

type TextProps = {
  text: ReturnType<typeof getUiText>;
};

type SearchTogglePillProps = {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  title: string;
};

function SearchTogglePill({
  active,
  disabled,
  label,
  onClick,
  title,
}: SearchTogglePillProps) {
  return (
    <button
      aria-pressed={active}
      className={[
        "group inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium",
        "transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2",
        disabled
          ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400"
          : active
            ? "cursor-pointer border-blue-300 bg-blue-50 text-blue-700 shadow-[0_8px_22px_rgba(37,99,235,0.16)] hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-100"
            : "cursor-pointer border-zinc-200 bg-white text-zinc-800 shadow-sm hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/50 hover:text-blue-700",
      ].join(" ")}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      <span
        className={[
          "grid h-5 w-5 place-items-center rounded-full transition-[background-color,color,transform] duration-200 ease-out",
          active
            ? "bg-blue-100 text-blue-700 group-hover:scale-110"
            : "bg-zinc-50 text-zinc-700 group-hover:bg-blue-100 group-hover:text-blue-700",
        ].join(" ")}
      >
        <svg
          aria-hidden="true"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="M3.75 12h16.5M12 3.75c2.25 2.2 3.38 4.95 3.38 8.25S14.25 18.05 12 20.25C9.75 18.05 8.62 15.3 8.62 12S9.75 5.95 12 3.75Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <path
            d="M20.25 12a8.25 8.25 0 1 1-16.5 0 8.25 8.25 0 0 1 16.5 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      </span>
      <span>{label}</span>
    </button>
  );
}

type ModelSelectFieldProps = {
  allowAuto?: boolean;
  disabled: boolean;
  label: string;
  onChange: (participantId: string) => void;
  participants: ModelParticipant[];
  placeholder: string;
  text: ReturnType<typeof getUiText>;
  value: string;
};

function ModelSelectField({
  allowAuto = false,
  disabled,
  label,
  onChange,
  participants,
  placeholder,
  text,
  value,
}: ModelSelectFieldProps) {
  return (
    <label className="block border border-zinc-200 bg-white p-4 text-sm font-medium text-zinc-800">
      <span>{label}</span>
      <select
        className="mt-2 w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
        disabled={disabled || participants.length === 0}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {allowAuto ? <option value="">{placeholder}</option> : null}
        {!allowAuto && participants.length === 0 ? (
          <option value="">{placeholder}</option>
        ) : null}
        {participants.map((participant) => (
          <option key={participant.id} value={participant.id}>
            {participant.name} · {participant.provider}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500">
        {participants.length === 0
          ? text.meetingForm.messages.realNoModels
          : placeholder}
      </span>
    </label>
  );
}

type ModelChoiceDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onSelect: (participantId: string) => void;
  participants: ModelParticipant[];
  selectedParticipantId: string;
  text: ReturnType<typeof getUiText>;
  title: string;
};

function ModelChoiceDialog({
  isOpen,
  onClose,
  onConfirm,
  onSelect,
  participants,
  selectedParticipantId,
  text,
  title,
}: ModelChoiceDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 px-4"
      role="dialog"
    >
      <section className="w-full max-w-md border border-zinc-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {text.evidence.searchDriverDialogDescription}
        </p>
        <div className="mt-4 space-y-2">
          {participants.map((participant) => (
            <label
              className="flex cursor-pointer items-center gap-3 border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 hover:border-emerald-300"
              key={participant.id}
            >
              <input
                checked={selectedParticipantId === participant.id}
                className="h-4 w-4 accent-emerald-700"
                name="search-driver-model"
                onChange={() => onSelect(participant.id)}
                type="radio"
              />
              <span>
                <span className="block font-medium">{participant.name}</span>
                <span className="block text-xs text-zinc-500">
                  {participant.provider} · {participant.model}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={onClose}
            type="button"
          >
            {text.common.cancel}
          </button>
          <button
            className="border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300"
            disabled={participants.length === 0}
            onClick={onConfirm}
            type="button"
          >
            {text.common.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}

function FactHygieneNotice({ text }: TextProps) {
  return (
    <section className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
      <span className="font-medium">{text.meetingForm.factNoticeTitle}</span>
      {FACT_HYGIENE_NOTICE}
    </section>
  );
}

type EvidencePackEditorProps = {
  disabled: boolean;
  drafts: EvidenceDraft[];
  enabled: boolean;
  importMessage: string;
  isImporting: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onImportFiles: (files: FileList | null) => void;
  onRemoveDraft: (index: number) => void;
  onStrategyChange: (strategy: DocumentInputStrategy) => void;
  participants: ModelParticipant[];
  strategy: DocumentInputStrategy;
  text: ReturnType<typeof getUiText>;
};

function EvidencePackEditor({
  disabled,
  drafts,
  enabled,
  importMessage,
  isImporting,
  onEnabledChange,
  onImportFiles,
  onRemoveDraft,
  onStrategyChange,
  participants,
  strategy,
  text,
}: EvidencePackEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deliveryPreview = getEvidenceDeliveryPreview(strategy, participants, text);

  return (
    <section className="border border-zinc-200 bg-zinc-50 p-4">
      <label className="flex items-start gap-2 text-sm font-medium text-zinc-800">
        <input
          checked={enabled}
          className="mt-1 h-4 w-4 accent-emerald-700"
          disabled={disabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          {text.evidence.enable}
          <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500">
            {text.evidence.description}
          </span>
        </span>
      </label>

      {enabled ? (
        <div className="mt-4 space-y-3">
          <div className="border border-zinc-200 bg-white p-3">
            <p className="text-sm font-medium text-zinc-900">
              {text.evidence.strategyTitle}
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {getDocumentInputStrategyOptions(text).map((option) => (
                <button
                  className={`border p-3 text-left transition-[border-color,background-color,transform,box-shadow] duration-150 ease-out hover:-translate-y-0.5 hover:cursor-pointer hover:shadow-sm disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none ${
                    strategy === option.value
                      ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                  }`}
                  disabled={disabled}
                  key={option.value}
                  onClick={() => onStrategyChange(option.value)}
                  type="button"
                >
                  <span className="block text-sm font-semibold">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
            <div
              className={`mt-3 border p-3 text-xs leading-5 ${
                deliveryPreview.isFallback
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              <span className="font-medium">{text.evidence.deliveryTitle}：</span>
              {deliveryPreview.modeLabel}
              <span className="mt-1 block">{deliveryPreview.reason}</span>
            </div>
          </div>
          <div className="border border-dashed border-zinc-300 bg-white p-4">
            <input
              accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,.xlsx,.pptx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              className="hidden"
              disabled={
                disabled || isImporting || drafts.length >= MAX_EVIDENCE_DRAFTS
              }
              multiple
              onChange={(event) => {
                onImportFiles(event.target.files);
                event.currentTarget.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-medium text-white transition-[background-color,transform] duration-150 ease-out hover:scale-[1.03] hover:cursor-pointer hover:bg-emerald-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:hover:scale-100"
              disabled={
                disabled || isImporting || drafts.length >= MAX_EVIDENCE_DRAFTS
              }
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {isImporting ? text.evidence.parsing : text.evidence.add}
            </button>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {text.evidence.support}
            </p>
          </div>
          {importMessage ? (
            <p className="text-xs leading-5 text-zinc-600">{importMessage}</p>
          ) : null}
          {drafts.length === 0 ? (
            <p className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              {text.evidence.empty}
            </p>
          ) : null}
          {drafts.map((draft, index) => (
            <article
              className="border border-emerald-100 bg-white p-3 transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-sm"
              key={`${draft.title}-${index}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">
                    {text.evidence.itemPrefix} S{index + 1} ·{" "}
                    {draft.title || text.evidence.untitled}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {draft.source || text.evidence.localFile}
                    {draft.publishedAt ? ` · ${draft.publishedAt}` : ""}
                  </p>
                </div>
                <button
                  className="shrink-0 text-xs font-medium text-zinc-500 transition-colors hover:cursor-pointer hover:text-red-700 disabled:cursor-not-allowed disabled:text-zinc-300"
                  disabled={disabled}
                  onClick={() => onRemoveDraft(index)}
                  type="button"
                >
                  {text.evidence.remove}
                </button>
              </div>
              <p className="mt-3 line-clamp-4 text-sm leading-6 text-zinc-700">
                {draft.snippet}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span>
                  {text.evidence.characters}
                  {draft.quality?.textLength ?? draft.snippet.length}
                </span>
                {draft.quality?.wasTruncated ? (
                  <span className="text-amber-700">
                    {text.evidence.truncated}
                  </span>
                ) : null}
              </div>
              {draft.quality?.warnings && draft.quality.warnings.length > 0 ? (
                <div className="mt-2 border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900">
                  <span className="font-medium">{text.evidence.warning}</span>
                  {draft.quality.warnings.join("；")}
                </div>
              ) : null}
            </article>
          ))}
          <p className="text-xs leading-5 text-zinc-500">
            {text.evidence.numberingNote}
          </p>
        </div>
      ) : null}
    </section>
  );
}

type UnavailableProviderListProps = {
  providers: UnavailableProvider[];
  text: ReturnType<typeof getUiText>;
};

function UnavailableProviderList({
  providers,
  text,
}: UnavailableProviderListProps) {
  if (providers.length === 0) {
    return null;
  }

  return (
    <section className="border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-950">
        {text.unavailable.title}
      </h2>
      <div className="mt-3 space-y-2 text-sm text-zinc-600">
        {providers.map((provider) => (
          <p
            className="border-l-2 border-zinc-300 bg-zinc-50 px-3 py-2 transition-[border-color,background-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-zinc-400 hover:bg-white"
            key={provider.provider}
          >
            <span className="font-medium text-zinc-800">
              {provider.name}（{getProviderStatusLabel(provider, text)}）：
            </span>
            {provider.reason}
            {provider.detectedModels && provider.detectedModels.length > 0 ? (
              <span className="mt-2 block text-xs text-zinc-500">
                {text.unavailable.detectedModels}
                {provider.detectedModels.slice(0, 5).join("、")}
              </span>
            ) : null}
            <span className="mt-1 block text-xs text-zinc-500">
              {text.unavailable.suggestion}
              {getUnavailableProviderSuggestion(provider, text)}
            </span>
          </p>
        ))}
      </div>
    </section>
  );
}

type ProviderModeNoticeProps = {
  modelLoadStatus: ModelLoadStatus;
  mode: RoundtableMode | null;
  participantCount: number;
  text: ReturnType<typeof getUiText>;
};

function ProviderModeNotice({
  modelLoadStatus,
  mode,
  participantCount,
  text,
}: ProviderModeNoticeProps) {
  if (modelLoadStatus === "loading") {
    return (
      <section className="border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-600">
        {text.providerNotice.loading}
      </section>
    );
  }

  if (modelLoadStatus === "error") {
    return (
      <section className="border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
        {text.providerNotice.error}
      </section>
    );
  }

  if (mode === "mock") {
    return (
      <section className="border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        {text.providerNotice.mock}
      </section>
    );
  }

  if (mode === "real" && participantCount === 0) {
    return (
      <section className="border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
        {text.providerNotice.realEmpty}
      </section>
    );
  }

  if (mode === "real") {
    return (
      <section className="border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
        {text.providerNotice.real}
      </section>
    );
  }

  return (
    <section className="border border-zinc-200 bg-white p-4 text-sm leading-6 text-zinc-600">
      {text.providerNotice.unknown}
    </section>
  );
}

type StartButtonTextOptions = {
  hasInvalidEvidencePack: boolean;
  isEvidenceImporting: boolean;
  meetingStatus: MeetingStatus;
  modelLoadStatus: ModelLoadStatus;
  mode: RoundtableMode | null;
  participantCount: number;
  selectedParticipantCount: number;
  text: ReturnType<typeof getUiText>;
};

function getStartButtonText(options: StartButtonTextOptions): string {
  if (options.isEvidenceImporting) {
    return options.text.meetingForm.evidenceLoading;
  }

  if (options.meetingStatus === "loading") {
    return options.text.meetingForm.meetingLoading;
  }

  if (options.modelLoadStatus === "loading") {
    return options.text.meetingForm.modelsLoading;
  }

  if (options.modelLoadStatus === "error") {
    return options.text.meetingForm.modelsError;
  }

  if (options.mode === "real" && options.participantCount === 0) {
    return options.text.meetingForm.noModels;
  }

  if (options.selectedParticipantCount === 0) {
    return options.text.meetingForm.selectModel;
  }

  if (options.hasInvalidEvidencePack) {
    return options.text.meetingForm.selectEvidence;
  }

  return options.text.meetingForm.start;
}

function hasInvalidEvidenceDrafts(
  enabled: boolean,
  drafts: EvidenceDraft[],
): boolean {
  return enabled && (drafts.length === 0 || drafts.some((draft) => !draft.snippet.trim()));
}

function buildEvidencePackRequest(
  enabled: boolean,
  drafts: EvidenceDraft[],
  strategy: DocumentInputStrategy,
) {
  if (!enabled || drafts.length === 0) {
    return {
      enabled: false,
      items: [],
    };
  }

  return {
    enabled: true,
    strategy,
    items: drafts.map((draft) => ({
      title: draft.title,
      source: draft.source,
      url: draft.url,
      publishedAt: draft.publishedAt,
      snippet: draft.snippet,
    })),
  };
}

function getDocumentInputStrategyOptions(text: ReturnType<typeof getUiText>) {
  return [
    {
      value: "native_file" as const,
      label: text.evidence.strategyNativeFile,
      description: text.evidence.strategyNativeFileDescription,
    },
    {
      value: "text_pack" as const,
      label: text.evidence.strategyTextPack,
      description: text.evidence.strategyTextPackDescription,
    },
    {
      value: "auto" as const,
      label: text.evidence.strategyAuto,
      description: text.evidence.strategyAutoDescription,
    },
  ];
}

function getEvidenceDeliveryPreview(
  strategy: DocumentInputStrategy,
  participants: ModelParticipant[],
  text: ReturnType<typeof getUiText>,
) {
  if (strategy === "text_pack") {
    return {
      modeLabel: text.evidence.deliveryTextPack,
      reason: text.evidence.deliveryTextPackReason,
      isFallback: false,
    };
  }

  const allParticipantsSupportNative =
    participants.length > 0 &&
    participants.every(
      (participant) =>
        participant.capabilities?.nativeEvidenceAttachments === true,
    );

  if (allParticipantsSupportNative) {
    return {
      modeLabel: text.evidence.deliveryNative,
      reason: text.evidence.deliveryNativeReason,
      isFallback: false,
    };
  }

  return {
    modeLabel: text.evidence.deliveryTextPack,
    reason: text.evidence.deliveryFallbackReason,
    isFallback: true,
  };
}

async function parseEvidenceFile(
  file: File,
  fallbackError: string,
): Promise<EvidenceDraft | undefined> {
  const formData = new FormData();
  formData.set("file", file);

  const response = await fetch("/api/evidence/parse", {
    method: "POST",
    body: formData,
  });
  const data = (await response.json()) as EvidenceParseApiResponse;

  if (!response.ok) {
    throw new Error(data.error || fallbackError);
  }

  return data.draft;
}

async function readLiveMeetingEvents(
  response: Response,
  onEvent: (event: LiveMeetingEvent) => void,
) {
  if (!response.body) {
    throw new Error("Live meeting stream is not available");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        onEvent(JSON.parse(line) as LiveMeetingEvent);
      }
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    onEvent(JSON.parse(buffer) as LiveMeetingEvent);
  }
}

type LiveMeetingSetters = {
  setIsMeetingStreaming: Dispatch<SetStateAction<boolean>>;
  setLiveActiveStageId: Dispatch<SetStateAction<string>>;
  setLiveParticipantStatuses: Dispatch<
    SetStateAction<LiveParticipantStatuses>
  >;
  setMeeting: Dispatch<SetStateAction<MeetingResult | null>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<MeetingStatus>>;
};

function handleLiveMeetingEvent(
  event: LiveMeetingEvent,
  initialMeeting: MeetingResult,
  participants: ModelParticipant[],
  text: ReturnType<typeof getUiText>,
  setters: LiveMeetingSetters,
) {
  if (event.type === "error") {
    setters.setStatus("error");
    setters.setMessage(event.error);
    setters.setIsMeetingStreaming(false);
    return;
  }

  setters.setMeeting((currentMeeting) => {
    const applied = applyLiveMeetingEvent(
      currentMeeting ?? initialMeeting,
      event,
    );

    return applied.meeting;
  });
  setters.setLiveParticipantStatuses((currentStatuses) => {
    const applied = applyLiveMeetingEvent(
      initialMeeting,
      event,
      currentStatuses,
      participants,
    );

    return applied.participantStatuses ?? currentStatuses;
  });

  const activeStageId = getLiveEventStageId(event);

  if (activeStageId) {
    setters.setLiveActiveStageId(activeStageId);
  }

  const liveStatusMessage = getLiveMeetingStatusMessage(event, text);

  if (liveStatusMessage) {
    setters.setMessage(liveStatusMessage);
  }

  if (event.type === "meeting_completed") {
    setters.setMeeting(event.meeting);
    setters.setStatus("success");
    setters.setMessage(text.meetingForm.messages.meetingDone);
    setters.setIsMeetingStreaming(false);
  }
}

function getLiveEventStageId(event: LiveMeetingEvent): string | undefined {
  if (event.type === "phase_started" || event.type === "participant_started") {
    return event.phaseId;
  }

  if (event.type === "turn") {
    return event.turn.phaseId;
  }

  if (event.type === "failure") {
    return event.failure.stage;
  }

  if (event.type === "summary" || event.type === "meeting_completed") {
    return "summary";
  }

  return undefined;
}

function getProviderStatusLabel(
  provider: UnavailableProvider,
  text: ReturnType<typeof getUiText>,
): string {
  if (provider.status === "configured_unverified") {
    return text.participants.status.configured_unverified;
  }

  return provider.statusLabel;
}

function getUnavailableProviderSuggestion(
  provider: UnavailableProvider,
  text: ReturnType<typeof getUiText>,
): string {
  if (provider.status === "detected") {
    return text.unavailable.suggestions.detected;
  }

  if (provider.status === "model_not_found") {
    return text.unavailable.suggestions.modelNotFound;
  }

  if (provider.status === "configured_unverified") {
    return text.unavailable.suggestions.configuredUnverified;
  }

  return text.unavailable.suggestions.default;
}

type StatusMessageProps = {
  message: string;
  status: MeetingStatus;
};

function StatusMessage({ message, status }: StatusMessageProps) {
  const className =
    status === "error"
      ? "mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      : "mt-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800";

  return <p className={className}>{message}</p>;
}

function EmptyMeetingState({ text }: TextProps) {
  return (
    <section className="border border-dashed border-zinc-300 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-950">
        {text.meetingBoard.contentTitle}
      </h2>
      <p className="mt-3 leading-7 text-zinc-600">
        {text.meetingBoard.empty}
      </p>
    </section>
  );
}

function getErrorMessage(
  error: unknown,
  text: ReturnType<typeof getUiText>,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return text.meetingForm.messages.unknownError;
}
