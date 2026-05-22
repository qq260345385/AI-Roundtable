import type {
  ModelParticipant,
  ParticipantStatus,
  RoundtableMode,
} from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
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
    <section className="border border-zinc-200 bg-white p-5">
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
          <span className="shrink-0 text-xs text-zinc-500">
            {text.participants.selected} {selectedParticipantIds.length}/
            {participants.length}
          </span>
        ) : null}
      </div>
      <div className="mt-4 space-y-3">
        {participants.length === 0 ? (
          <p className="border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
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
      className={`border p-4 transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-sm ${
        isSelected
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-zinc-200 bg-zinc-50 hover:bg-white"
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
              {participant.model}
              {capabilityNotes.length > 0 ? (
                <span className="ml-1 whitespace-nowrap text-xs font-normal leading-5 text-amber-700">
                  （{capabilityNotes.join("、")}）
                </span>
              ) : null}
            </span>
          </span>
        </label>
        <span
          className={`shrink-0 border px-2 py-1 text-xs ${getStatusClassName(participant.status)}`}
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
