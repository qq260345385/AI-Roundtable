import type {
  ModelParticipant,
  ParticipantStatus,
  RoundtableMode,
} from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import { formatModelDisplayName } from "@/lib/models/model-display-name";
import { getUnsupportedCapabilityNotes } from "@/lib/providers/model-capabilities";

type ParticipantListProps = {
  disabled: boolean;
  isLoading: boolean;
  mode: RoundtableMode | null;
  onSelectionChange: (selectedIds: string[]) => void;
  participants: ModelParticipant[];
  selectedParticipantIds: string[];
  text: UiText;
};

export function ParticipantList({
  disabled,
  isLoading,
  mode,
  onSelectionChange,
  participants,
  selectedParticipantIds,
  text,
}: ParticipantListProps) {
  function toggleParticipant(participantId: string) {
    if (selectedParticipantIds.includes(participantId)) {
      onSelectionChange(
        selectedParticipantIds.filter((item) => item !== participantId),
      );
      return;
    }

    onSelectionChange([...selectedParticipantIds, participantId]);
  }

  return (
    <section className="surface-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            {text.participants.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            {text.participants.description}
          </p>
        </div>
        {participants.length > 0 ? (
          <span className="shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
            {text.participants.selected} {selectedParticipantIds.length}/
            {participants.length}
          </span>
        ) : null}
      </div>
      <div className="mt-4 max-h-[19.5rem] space-y-3 overflow-y-auto overscroll-contain pr-1 scroll-smooth snap-y snap-proximity [scrollbar-color:#a7f3d0_transparent] [scrollbar-width:thin]">
        {participants.length === 0 ? (
          <p className="surface-card border-dashed p-4 text-sm leading-6 text-zinc-600">
            {getEmptyText(isLoading, mode, text)}
          </p>
        ) : null}
        {participants.map((participant) => (
          <ParticipantCard
            disabled={disabled}
            isSelected={selectedParticipantIds.includes(participant.id)}
            key={participant.id}
            onToggle={() => toggleParticipant(participant.id)}
            participant={participant}
            text={text}
          />
        ))}
      </div>
    </section>
  );
}

type ParticipantCardProps = {
  disabled: boolean;
  isSelected: boolean;
  onToggle: () => void;
  participant: ModelParticipant;
  text: UiText;
};

function ParticipantCard({
  disabled,
  isSelected,
  onToggle,
  participant,
  text,
}: ParticipantCardProps) {
  const capabilityNotes = getUnsupportedCapabilityNotes(participant, text);

  return (
    <article
      className={`min-h-[6rem] snap-start rounded-lg border p-4 transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-sm ${
        isSelected
          ? "border-emerald-300 bg-emerald-50/70 shadow-[0_10px_24px_rgba(4,120,87,0.08)]"
          : "border-zinc-200 bg-white/70 hover:bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <label className="flex min-w-0 flex-1 items-start gap-3">
          <input
            checked={isSelected}
            className="mt-1 h-4 w-4 accent-emerald-700 hover:cursor-pointer disabled:cursor-not-allowed"
            disabled={disabled}
            onChange={onToggle}
            type="checkbox"
          />
          <span className="min-w-0">
            <span className="block break-words font-medium text-zinc-950">
              {formatModelDisplayName(participant.model)}
              {capabilityNotes.length > 0 ? (
                <span className="ml-1 whitespace-nowrap text-xs font-normal leading-5 text-amber-700">
                  （{capabilityNotes.join("、")}）
                </span>
              ) : null}
            </span>
          </span>
        </label>
        <span
          className={`shrink-0 rounded-full border px-2 py-1 text-xs ${getStatusClassName(participant.status)}`}
        >
          {getStatusLabel(participant, text)}
        </span>
      </div>
    </article>
  );
}

function getEmptyText(
  isLoading: boolean,
  mode: RoundtableMode | null,
  text: UiText,
): string {
  if (isLoading || mode === null) {
    return text.participants.loading;
  }

  if (mode === "real") {
    return text.participants.realEmpty;
  }

  return text.participants.empty;
}

function getStatusLabel(participant: ModelParticipant, text: UiText) {
  return text.participants.status[participant.status] || participant.statusLabel;
}

function getStatusClassName(status: ParticipantStatus): string {
  if (status === "mock") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  if (status === "configured_unverified") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  if (status === "available") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}
