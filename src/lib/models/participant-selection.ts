import type { ModelParticipant } from "@/lib/types";

export function getParticipantsInSelectionOrder(
  participants: ModelParticipant[],
  selectedParticipantIds: string[],
): ModelParticipant[] {
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant]),
  );

  return selectedParticipantIds
    .map((participantId) => participantById.get(participantId))
    .filter((participant): participant is ModelParticipant => Boolean(participant));
}

export function swapSelectedParticipantSeats(
  selectedParticipantIds: string[],
  draggedParticipantId: string,
  targetParticipantId: string,
): string[] {
  const draggedIndex = selectedParticipantIds.indexOf(draggedParticipantId);
  const targetIndex = selectedParticipantIds.indexOf(targetParticipantId);

  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return selectedParticipantIds;
  }

  const nextParticipantIds = [...selectedParticipantIds];
  nextParticipantIds[draggedIndex] = targetParticipantId;
  nextParticipantIds[targetIndex] = draggedParticipantId;

  return nextParticipantIds;
}
