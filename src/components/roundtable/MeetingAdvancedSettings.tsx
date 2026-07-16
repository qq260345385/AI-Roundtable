"use client";

import type { DocumentInputStrategy } from "@/lib/search/evidence-pack";
import type {
  ModelParticipant,
  SearchIntensity,
  SearchRegion,
} from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import type { EvidenceDraft, MeetingStatus } from "@/app/home-types";
import {
  EvidencePackEditor,
  FactHygieneNotice,
  ModelSelectField,
  SearchTogglePill,
} from "./MeetingSetupPanels";

type MeetingAdvancedSettingsProps = {
  documentInputStrategy: DocumentInputStrategy;
  evidenceDrafts: EvidenceDraft[];
  evidenceImportMessage: string;
  hasEvidenceWarnings: boolean;
  isBriefMode: boolean;
  isEvidenceImporting: boolean;
  isEvidencePackEnabled: boolean;
  isWebSearchEnabled: boolean;
  isWebSearchToggleDisabled: boolean;
  participants: ModelParticipant[];
  searchDriverParticipantId: string;
  searchIntensity: SearchIntensity;
  searchRegion: SearchRegion;
  selectedParticipants: ModelParticipant[];
  shouldShowFactNotice: boolean;
  status: MeetingStatus;
  summaryParticipantId: string;
  text: UiText;
  onBriefModeChange: (enabled: boolean) => void;
  onDocumentInputStrategyChange: (strategy: DocumentInputStrategy) => void;
  onEvidenceEnabledChange: (enabled: boolean) => void;
  onEvidenceFilesImport: (files: FileList | null) => void;
  onEvidenceRemoveDraft: (index: number) => void;
  onSearchDriverParticipantChange: (participantId: string) => void;
  onSearchIntensityChange: (intensity: SearchIntensity) => void;
  onSearchRegionChange: (region: SearchRegion) => void;
  onSummaryParticipantChange: (participantId: string) => void;
  onWebSearchToggle: () => void;
};

export function MeetingAdvancedSettings({
  documentInputStrategy,
  evidenceDrafts,
  evidenceImportMessage,
  hasEvidenceWarnings,
  isBriefMode,
  isEvidenceImporting,
  isEvidencePackEnabled,
  isWebSearchEnabled,
  isWebSearchToggleDisabled,
  participants,
  searchDriverParticipantId,
  searchIntensity,
  searchRegion,
  selectedParticipants,
  shouldShowFactNotice,
  status,
  summaryParticipantId,
  text,
  onBriefModeChange,
  onDocumentInputStrategyChange,
  onEvidenceEnabledChange,
  onEvidenceFilesImport,
  onEvidenceRemoveDraft,
  onSearchDriverParticipantChange,
  onSearchIntensityChange,
  onSearchRegionChange,
  onSummaryParticipantChange,
  onWebSearchToggle,
}: MeetingAdvancedSettingsProps) {
  const disabled = status === "loading";

  return (
    <details className="surface-panel group p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
        <span>{text.meetingForm.advancedSettings}</span>
        <span className="text-sm font-normal text-zinc-500 transition-transform group-open:rotate-180">
          ↓
        </span>
      </summary>
      <div className="mt-5 space-y-4 border-t border-zinc-200 pt-5">
        <div className="surface-card flex flex-col gap-4 p-4">
          <SearchTogglePill
            active={isWebSearchEnabled}
            disabled={isWebSearchToggleDisabled}
            label={text.evidence.webSearchToggle}
            onClick={onWebSearchToggle}
            title={text.evidence.webSearchDescription}
          />
          {shouldShowFactNotice ? <FactHygieneNotice text={text} /> : null}
          {isWebSearchEnabled ? (
            <ModelSelectField
              disabled={disabled}
              label={text.evidence.searchDriverModelLabel}
              onChange={onSearchDriverParticipantChange}
              participants={participants}
              placeholder={text.evidence.searchDriverModelPlaceholder}
              text={text}
              value={searchDriverParticipantId}
            />
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="surface-card block p-4 text-sm font-medium text-zinc-800">
            <span>{text.settings.searchRegion}</span>
            <select
              className="focus-ring mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              disabled={disabled}
              onChange={(event) => onSearchRegionChange(event.target.value as SearchRegion)}
              value={searchRegion}
            >
              {Object.entries(text.settings.searchRegionOptions).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="surface-card block p-4 text-sm font-medium text-zinc-800">
            <span>{text.settings.searchIntensity}</span>
            <select
              className="focus-ring mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              disabled={disabled}
              onChange={(event) => onSearchIntensityChange(event.target.value as SearchIntensity)}
              value={searchIntensity}
            >
              <option value="standard">{text.settings.searchIntensityOptions.standard}</option>
              <option value="deep">{text.settings.searchIntensityOptions.deep}</option>
            </select>
          </label>
        </div>

        <EvidencePackEditor
          disabled={disabled}
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
        <label className="surface-card flex items-start gap-2 p-4 text-sm font-medium text-zinc-800">
          <input
            checked={isBriefMode}
            className="mt-1 h-4 w-4 accent-emerald-700"
            disabled={disabled}
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
          disabled={disabled}
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
      </div>
    </details>
  );
}
