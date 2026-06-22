"use client";

import { type Dispatch, type SetStateAction, useRef } from "react";
import { FACT_HYGIENE_NOTICE } from "@/lib/meeting/fact-hygiene";
import { applyLiveMeetingEvent } from "@/lib/meeting/live-state";
import { getLiveMeetingStatusMessage } from "@/lib/meeting/live-status-message";
import type { Locale } from "@/lib/i18n/ui-text";
import { getUiText } from "@/lib/i18n/ui-text";
import type { MeetingHistoryRecord } from "@/lib/meeting/meeting-history";
import type { DocumentInputStrategy } from "@/lib/search/evidence-pack";
import type {
  LiveMeetingEvent,
  LiveParticipantStatuses,
  MeetingResult,
  ModelParticipant,
  RoundtableMode,
  UnavailableProvider,
} from "@/lib/types";
import {
  MAX_EVIDENCE_DRAFTS,
  type EvidenceDraft,
  type EvidenceParseApiResponse,
  type MeetingStatus,
  type ModelLoadStatus,
} from "@/app/home-types";
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

export function SearchTogglePill({
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

export function ModelSelectField({
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
    <label className="surface-card block p-4 text-sm font-medium text-zinc-800">
      <span>{label}</span>
      <select
        className="focus-ring mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
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
            {participant.name} 路 {participant.provider}
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

export function ModelChoiceDialog({
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/35 px-4 backdrop-blur-sm"
      role="dialog"
    >
      <section className="surface-panel w-full max-w-md p-5">
        <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          {text.evidence.searchDriverDialogDescription}
        </p>
        <div className="mt-4 space-y-2">
          {participants.map((participant) => (
            <label
              className="surface-card flex cursor-pointer items-center gap-3 p-3 text-sm text-zinc-800 hover:border-emerald-300"
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
                  {participant.provider} 路 {participant.model}
                </span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="control-button border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={onClose}
            type="button"
          >
            {text.common.cancel}
          </button>
          <button
            className="control-button border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300"
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

export function FactHygieneNotice({ text }: TextProps) {
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

export function EvidencePackEditor({
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
    <section className="surface-card p-4">
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
          <div className="rounded-lg border border-zinc-200 bg-white/80 p-3">
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
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white/80 p-4">
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
              className="control-button border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:cursor-pointer hover:bg-emerald-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:hover:scale-100"
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
                    {text.evidence.itemPrefix} S{index + 1} 路{" "}
                    {draft.title || text.evidence.untitled}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {draft.source || text.evidence.localFile}
                    {draft.publishedAt ? ` 路 ${draft.publishedAt}` : ""}
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

export function UnavailableProviderList({
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

export function ProviderModeNotice({
  modelLoadStatus,
  mode,
  participantCount,
  text,
}: ProviderModeNoticeProps) {
  if (modelLoadStatus === "loading") {
    return (
      <section className="surface-card p-4 text-sm leading-6 text-zinc-600">
        {text.providerNotice.loading}
      </section>
    );
  }

  if (modelLoadStatus === "error") {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700 shadow-sm">
        {text.providerNotice.error}
      </section>
    );
  }

  if (mode === "mock") {
    return (
      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900 shadow-sm">
        {text.providerNotice.mock}
      </section>
    );
  }

  if (mode === "real" && participantCount === 0) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700 shadow-sm">
        {text.providerNotice.realEmpty}
      </section>
    );
  }

  if (mode === "real") {
    return (
      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800 shadow-sm">
        {text.providerNotice.real}
      </section>
    );
  }

  return (
    <section className="surface-card p-4 text-sm leading-6 text-zinc-600">
      {text.providerNotice.unknown}
    </section>
  );
}

export type StartButtonTextOptions = {
  hasInvalidEvidencePack: boolean;
  isEvidenceImporting: boolean;
  meetingStatus: MeetingStatus;
  modelLoadStatus: ModelLoadStatus;
  mode: RoundtableMode | null;
  participantCount: number;
  selectedParticipantCount: number;
  text: ReturnType<typeof getUiText>;
};

export function getStartButtonText(options: StartButtonTextOptions): string {
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

export function hasInvalidEvidenceDrafts(
  enabled: boolean,
  drafts: EvidenceDraft[],
): boolean {
  return enabled && (drafts.length === 0 || drafts.some((draft) => !draft.snippet.trim()));
}

export function buildEvidencePackRequest(
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

export async function parseEvidenceFile(
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

export async function readLiveMeetingEvents(
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

export type LiveMeetingSetters = {
  setIsMeetingStreaming: Dispatch<SetStateAction<boolean>>;
  setLiveActiveStageId: Dispatch<SetStateAction<string>>;
  setLiveParticipantStatuses: Dispatch<
    SetStateAction<LiveParticipantStatuses>
  >;
  setMeeting: Dispatch<SetStateAction<MeetingResult | null>>;
  setMessage: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<MeetingStatus>>;
};

export function handleLiveMeetingEvent(
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
    setters.setStatus(event.meeting.meetingStatus === "failed" ? "error" : "success");
    setters.setMessage(getCompletedMeetingMessage(event.meeting, text));
    setters.setIsMeetingStreaming(false);
  }
}

export function getCompletedMeetingMessage(
  meeting: MeetingResult,
  text: ReturnType<typeof getUiText>,
): string {
  if (meeting.meetingStatus === "failed") {
    return text.meetingBoard.meetingStatus.failedDescription;
  }

  if (meeting.meetingStatus === "degraded") {
    return text.meetingBoard.meetingStatus.degradedDescription;
  }

  return text.meetingForm.messages.meetingDone;
}

export function getLiveEventStageId(event: LiveMeetingEvent): string | undefined {
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

export function StatusMessage({ message, status }: StatusMessageProps) {
  const className =
    status === "error"
      ? "mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-700"
      : "mt-4 border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800";

  return <p className={className}>{message}</p>;
}

type MeetingHistoryPanelProps = {
  history: MeetingHistoryRecord[];
  locale: Locale;
  onDelete: (recordId: string) => void;
  onOpen: (record: MeetingHistoryRecord) => void;
  text: ReturnType<typeof getUiText>;
};

export function MeetingHistoryPanel({
  history,
  locale,
  onDelete,
  onOpen,
  text,
}: MeetingHistoryPanelProps) {
  const dateFormatter = new Intl.DateTimeFormat(
    locale === "zh" ? "zh-CN" : "en-US",
    {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
    },
  );

  return (
    <section className="surface-panel p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            {text.history.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            {text.history.description}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-200 bg-white/70 px-2 py-1 text-xs text-zinc-500">
          {history.length}
        </span>
      </div>

      {history.length === 0 ? (
        <p className="surface-card mt-4 border-dashed p-4 text-sm leading-6 text-zinc-600">
          {text.history.empty}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {history.map((record) => (
            <article
              className="rounded-lg border border-zinc-200 bg-white/70 p-4 transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white hover:shadow-sm"
              key={record.id}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="line-clamp-2 font-medium text-zinc-950">
                    {record.topic}
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {text.history.createdAt}
                    {dateFormatter.format(new Date(record.createdAt))}
                    <span className="mx-2 text-zinc-300">/</span>
                    {text.history.participants}
                    {record.participantNames.join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="control-button border border-emerald-700 bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:cursor-pointer hover:bg-emerald-800 active:scale-[0.98]"
                    onClick={() => onOpen(record)}
                    type="button"
                  >
                    {text.history.open}
                  </button>
                  <button
                    className="control-button border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:cursor-pointer hover:border-red-200 hover:text-red-700 active:scale-[0.98]"
                    onClick={() => onDelete(record.id)}
                    type="button"
                  >
                    {text.history.delete}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function getErrorMessage(
  error: unknown,
  text: ReturnType<typeof getUiText>,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return text.meetingForm.messages.unknownError;
}

