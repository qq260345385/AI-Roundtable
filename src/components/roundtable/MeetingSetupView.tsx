"use client";

import type { FormEvent } from "react";
import { MeetingHeader } from "@/components/roundtable/MeetingHeader";
import { ParticipantList } from "@/components/roundtable/ParticipantList";
import { RoundtableDiagram } from "@/components/roundtable/RoundtableDiagram";
import {
  EvidencePackEditor,
  FactHygieneNotice,
  MeetingHistoryPanel,
  ModelChoiceDialog,
  ModelSelectField,
  ProviderModeNotice,
  SearchTogglePill,
  StatusMessage,
  UnavailableProviderList,
} from "@/components/roundtable/MeetingSetupPanels";
import type { Locale } from "@/lib/i18n/ui-text";
import { getUiText } from "@/lib/i18n/ui-text";
import type { MeetingHistoryRecord } from "@/lib/meeting/meeting-history";
import type { DocumentInputStrategy } from "@/lib/search/evidence-pack";
import type {
  ModelParticipant,
  RoundtableMode,
  SearchIntensity,
  SearchRegion,
  UnavailableProvider,
} from "@/lib/types";
import type {
  EvidenceDraft,
  MeetingStatus,
  ModelLoadStatus,
} from "@/app/home-types";

type MeetingSetupViewProps = {
  documentInputStrategy: DocumentInputStrategy;
  evidenceDrafts: EvidenceDraft[];
  evidenceImportMessage: string;
  hasEvidenceWarnings: boolean;
  headerTopic: string;
  isBriefMode: boolean;
  isEvidenceImporting: boolean;
  isEvidencePackEnabled: boolean;
  isSearchDriverDialogOpen: boolean;
  isStartDisabled: boolean;
  isWebSearchEnabled: boolean;
  isWebSearchToggleDisabled: boolean;
  locale: Locale;
  meetingHistory: MeetingHistoryRecord[];
  mode: RoundtableMode | null;
  modelLoadStatus: ModelLoadStatus;
  participants: ModelParticipant[];
  question: string;
  searchDriverParticipantId: string;
  searchIntensity: SearchIntensity;
  searchRegion: SearchRegion;
  selectedParticipantIds: string[];
  selectedParticipants: ModelParticipant[];
  shouldShowFactNotice: boolean;
  startButtonText: string;
  status: MeetingStatus;
  statusMessage: string;
  summaryParticipantId: string;
  text: ReturnType<typeof getUiText>;
  unavailableProviders: UnavailableProvider[];
  onBriefModeChange: (enabled: boolean) => void;
  onDeleteHistoryMeeting: (recordId: string) => void;
  onDocumentInputStrategyChange: (strategy: DocumentInputStrategy) => void;
  onEvidenceEnabledChange: (enabled: boolean) => void;
  onEvidenceFilesImport: (files: FileList | null) => void;
  onEvidenceRemoveDraft: (index: number) => void;
  onLocaleChange: (locale: Locale) => void;
  onOpenHistoryMeeting: (record: MeetingHistoryRecord) => void;
  onQuestionChange: (question: string) => void;
  onSearchDriverDialogClose: () => void;
  onSearchDriverDialogConfirm: () => void;
  onSearchDriverParticipantChange: (participantId: string) => void;
  onSearchIntensityChange: (intensity: SearchIntensity) => void;
  onSearchRegionChange: (region: SearchRegion) => void;
  onSelectedParticipantIdsChange: (participantIds: string[]) => void;
  onSelectedParticipantSeatSwap: (
    draggedParticipantId: string,
    targetParticipantId: string,
  ) => void;
  onStartMeeting: (event: FormEvent<HTMLFormElement>) => void;
  onSummaryParticipantChange: (participantId: string) => void;
  onWebSearchToggle: () => void;
};

export function MeetingSetupView({
  documentInputStrategy,
  evidenceDrafts,
  evidenceImportMessage,
  hasEvidenceWarnings,
  headerTopic,
  isBriefMode,
  isEvidenceImporting,
  isEvidencePackEnabled,
  isSearchDriverDialogOpen,
  isStartDisabled,
  isWebSearchEnabled,
  isWebSearchToggleDisabled,
  locale,
  meetingHistory,
  mode,
  modelLoadStatus,
  participants,
  question,
  searchDriverParticipantId,
  searchIntensity,
  searchRegion,
  selectedParticipantIds,
  selectedParticipants,
  shouldShowFactNotice,
  startButtonText,
  status,
  statusMessage,
  summaryParticipantId,
  text,
  unavailableProviders,
  onBriefModeChange,
  onDeleteHistoryMeeting,
  onDocumentInputStrategyChange,
  onEvidenceEnabledChange,
  onEvidenceFilesImport,
  onEvidenceRemoveDraft,
  onLocaleChange,
  onOpenHistoryMeeting,
  onQuestionChange,
  onSearchDriverDialogClose,
  onSearchDriverDialogConfirm,
  onSearchDriverParticipantChange,
  onSearchIntensityChange,
  onSearchRegionChange,
  onSelectedParticipantIdsChange,
  onSelectedParticipantSeatSwap,
  onStartMeeting,
  onSummaryParticipantChange,
  onWebSearchToggle,
}: MeetingSetupViewProps) {
  return (
    <div className="app-backdrop min-h-screen">
      <MeetingHeader
        locale={locale}
        mode={mode}
        onLocaleChange={onLocaleChange}
        onSearchIntensityChange={onSearchIntensityChange}
        onSearchRegionChange={onSearchRegionChange}
        participantCount={selectedParticipants.length}
        phaseCount={3}
        searchIntensity={searchIntensity}
        searchRegion={searchRegion}
        text={text}
        topic={headerTopic}
      />

      <main className="relative mx-auto grid max-w-6xl gap-5 px-5 py-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <ParticipantList
            disabled={status === "loading"}
            isLoading={modelLoadStatus === "loading"}
            mode={mode}
            onSelectionChange={onSelectedParticipantIdsChange}
            participants={participants}
            selectedParticipantIds={selectedParticipantIds}
            text={text}
          />
          <ProviderModeNotice
            modelLoadStatus={modelLoadStatus}
            mode={mode}
            participantCount={participants.length}
            text={text}
          />
          <UnavailableProviderList providers={unavailableProviders} text={text} />
          <RoundtableDiagram
            onSeatSwap={
              status === "loading" ? undefined : onSelectedParticipantSeatSwap
            }
            participants={selectedParticipants}
            text={text}
          />
        </div>

        <div className="space-y-5">
          <section className="surface-panel p-5">
            <h2 className="text-lg font-semibold text-zinc-950">
              {text.meetingForm.title}
            </h2>
            <form className="mt-4 space-y-4" onSubmit={onStartMeeting}>
              <div className="rounded-lg border border-zinc-200 bg-white/90 p-4 shadow-sm transition-[border-color,box-shadow] duration-200 ease-out focus-within:border-emerald-300 focus-within:shadow-[0_14px_36px_rgba(4,120,87,0.12)]">
                <textarea
                  className="min-h-32 w-full resize-y border-0 bg-transparent p-0 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:text-zinc-500"
                  disabled={status === "loading"}
                  onChange={(event) => onQuestionChange(event.target.value)}
                  placeholder={text.meetingForm.placeholder}
                  value={question}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <SearchTogglePill
                    active={isWebSearchEnabled}
                    disabled={isWebSearchToggleDisabled}
                    label={text.evidence.webSearchToggle}
                    onClick={onWebSearchToggle}
                    title={text.evidence.webSearchDescription}
                  />
                  <button
                    className="control-button ml-auto border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:cursor-pointer hover:bg-emerald-800 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300 disabled:hover:scale-100 disabled:hover:bg-zinc-300"
                    disabled={isStartDisabled}
                    type="submit"
                  >
                    {startButtonText}
                  </button>
                </div>
              </div>
              {shouldShowFactNotice ? <FactHygieneNotice text={text} /> : null}
              {isWebSearchEnabled ? (
                <ModelSelectField
                  disabled={status === "loading"}
                  label={text.evidence.searchDriverModelLabel}
                  onChange={onSearchDriverParticipantChange}
                  participants={participants}
                  placeholder={text.evidence.searchDriverModelPlaceholder}
                  text={text}
                  value={searchDriverParticipantId}
                />
              ) : null}
              <EvidencePackEditor
                disabled={status === "loading"}
                drafts={evidenceDrafts}
                enabled={isEvidencePackEnabled}
                importMessage={evidenceImportMessage}
                isImporting={isEvidenceImporting}
                onEnabledChange={onEvidenceEnabledChange}
                onImportFiles={onEvidenceFilesImport}
                onRemoveDraft={onEvidenceRemoveDraft}
                onStrategyChange={onDocumentInputStrategyChange}
                participants={selectedParticipants}
                strategy={documentInputStrategy}
                text={text}
              />
              <label className="surface-card flex items-start gap-2 p-4 text-sm font-medium text-zinc-800 transition-[border-color,background-color] duration-150 ease-out hover:border-emerald-200 hover:bg-emerald-50/40">
                <input
                  checked={isBriefMode}
                  className="mt-1 h-4 w-4 accent-emerald-700"
                  disabled={status === "loading"}
                  onChange={(event) => onBriefModeChange(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  {text.meetingForm.briefMode}
                  <span className="mt-1 block text-xs font-normal leading-5 text-zinc-500">
                    {text.meetingForm.briefModeDescription}
                  </span>
                </span>
              </label>
              <ModelSelectField
                allowAuto
                disabled={status === "loading"}
                label={text.meetingForm.summaryModelLabel}
                onChange={onSummaryParticipantChange}
                participants={participants}
                placeholder={text.meetingForm.summaryModelAuto}
                text={text}
                value={summaryParticipantId}
              />
              {isEvidencePackEnabled && hasEvidenceWarnings ? (
                <p className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  {text.meetingForm.evidenceWarning}
                </p>
              ) : null}
            </form>
            {statusMessage ? (
              <StatusMessage message={statusMessage} status={status} />
            ) : null}
          </section>

          <MeetingHistoryPanel
            history={meetingHistory}
            locale={locale}
            onDelete={onDeleteHistoryMeeting}
            onOpen={onOpenHistoryMeeting}
            text={text}
          />
        </div>
      </main>
      <ModelChoiceDialog
        isOpen={isSearchDriverDialogOpen}
        onClose={onSearchDriverDialogClose}
        onConfirm={onSearchDriverDialogConfirm}
        onSelect={onSearchDriverParticipantChange}
        participants={participants}
        selectedParticipantId={searchDriverParticipantId}
        text={text}
        title={text.evidence.searchDriverDialogTitle}
      />
    </div>
  );
}
