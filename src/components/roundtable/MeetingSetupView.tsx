"use client";

import type { FormEvent } from "react";
import { MeetingHeader } from "@/components/roundtable/MeetingHeader";
import { MeetingAdvancedSettings } from "@/components/roundtable/MeetingAdvancedSettings";
import { ParticipantList } from "@/components/roundtable/ParticipantList";
import { RoundtableDiagram } from "@/components/roundtable/RoundtableDiagram";
import {
  MeetingHistoryPanel,
  ModelChoiceDialog,
  ProviderModeNotice,
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

      <main className="relative mx-auto max-w-[880px] space-y-5 px-5 py-6">
        <form className="space-y-5" onSubmit={onStartMeeting}>
          <section className="surface-panel p-5 md:p-6">
            <h2 className="text-xl font-semibold text-zinc-950">
              {text.meetingForm.title}
            </h2>
            <div className="mt-4 rounded-xl border border-zinc-200 bg-white/90 p-4 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-emerald-300 focus-within:shadow-[0_14px_36px_rgba(4,120,87,0.12)]">
              <textarea
                className="min-h-36 w-full resize-y border-0 bg-transparent p-0 text-base leading-7 text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:text-zinc-500"
                disabled={status === "loading"}
                onChange={(event) => onQuestionChange(event.target.value)}
                placeholder={text.meetingForm.placeholder}
                value={question}
              />
              <div className="mt-4 flex justify-end border-t border-zinc-100 pt-4">
                <button
                  className="control-button border border-emerald-700 bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:cursor-pointer hover:bg-emerald-800 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-300"
                  disabled={isStartDisabled}
                  type="submit"
                >
                  {startButtonText}
                </button>
              </div>
            </div>
          </section>

          <section className="surface-panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-950">
                  {text.meetingForm.selectedModels}
                </h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedParticipants.map((participant) => (
                    <span
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900"
                      key={participant.id}
                    >
                      {participant.name}
                    </span>
                  ))}
                </div>
              </div>
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-500">
                {selectedParticipants.length}
              </span>
            </div>
            <details className="group mt-4 border-t border-zinc-200 pt-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-emerald-800 [&::-webkit-details-marker]:hidden">
                {text.meetingForm.modelSelection} · {text.meetingForm.editModels}
              </summary>
              <div className="mt-4 space-y-4">
                <ParticipantList
                  disabled={status === "loading"}
                  isLoading={modelLoadStatus === "loading"}
                  mode={mode}
                  onSelectionChange={onSelectedParticipantIdsChange}
                  participants={participants}
                  selectedParticipantIds={selectedParticipantIds}
                  text={text}
                />
                <RoundtableDiagram
                  onSeatSwap={status === "loading" ? undefined : onSelectedParticipantSeatSwap}
                  participants={selectedParticipants}
                  text={text}
                />
              </div>
            </details>
          </section>

          <MeetingAdvancedSettings
            documentInputStrategy={documentInputStrategy}
            evidenceDrafts={evidenceDrafts}
            evidenceImportMessage={evidenceImportMessage}
            hasEvidenceWarnings={hasEvidenceWarnings}
            isBriefMode={isBriefMode}
            isEvidenceImporting={isEvidenceImporting}
            isEvidencePackEnabled={isEvidencePackEnabled}
            isWebSearchEnabled={isWebSearchEnabled}
            isWebSearchToggleDisabled={isWebSearchToggleDisabled}
            onBriefModeChange={onBriefModeChange}
            onDocumentInputStrategyChange={onDocumentInputStrategyChange}
            onEvidenceEnabledChange={onEvidenceEnabledChange}
            onEvidenceFilesImport={onEvidenceFilesImport}
            onEvidenceRemoveDraft={onEvidenceRemoveDraft}
            onSearchDriverParticipantChange={onSearchDriverParticipantChange}
            onSearchIntensityChange={onSearchIntensityChange}
            onSearchRegionChange={onSearchRegionChange}
            onSummaryParticipantChange={onSummaryParticipantChange}
            onWebSearchToggle={onWebSearchToggle}
            participants={participants}
            searchDriverParticipantId={searchDriverParticipantId}
            searchIntensity={searchIntensity}
            searchRegion={searchRegion}
            selectedParticipants={selectedParticipants}
            shouldShowFactNotice={shouldShowFactNotice}
            status={status}
            summaryParticipantId={summaryParticipantId}
            text={text}
          />
        </form>

        <ProviderModeNotice
          modelLoadStatus={modelLoadStatus}
          mode={mode}
          participantCount={participants.length}
          text={text}
        />
        <UnavailableProviderList providers={unavailableProviders} text={text} />
        {statusMessage ? (
          <StatusMessage message={statusMessage} status={status} />
        ) : null}
        <MeetingHistoryPanel
          history={meetingHistory}
          locale={locale}
          onDelete={onDeleteHistoryMeeting}
          onOpen={onOpenHistoryMeeting}
          text={text}
        />
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
