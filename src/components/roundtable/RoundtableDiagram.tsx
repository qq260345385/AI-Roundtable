import type { ModelParticipant } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import { formatModelDisplayName } from "@/lib/models/model-display-name";

type RoundtableDiagramProps = {
  onSeatSwap?: (draggedParticipantId: string, targetParticipantId: string) => void;
  participants: ModelParticipant[];
  text: UiText;
};

export function RoundtableDiagram({
  onSeatSwap,
  participants,
  text,
}: RoundtableDiagramProps) {
  return (
    <section className="border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-950">
        {text.diagram.title}
      </h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {participants.map((participant, index) => {
          const canReorder = Boolean(onSeatSwap) && participants.length > 1;

          return (
            <div
              className={`flex min-h-28 flex-col justify-between border border-zinc-200 bg-stone-50 p-4 transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-sm ${
                canReorder ? "cursor-grab active:cursor-grabbing" : ""
              }`}
              draggable={canReorder}
              key={participant.id}
              onDragOver={(event) => {
                if (!canReorder) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragStart={(event) => {
                if (!canReorder) {
                  return;
                }

                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", participant.id);
              }}
              onDrop={(event) => {
                if (!canReorder) {
                  return;
                }

                event.preventDefault();
                const draggedParticipantId =
                  event.dataTransfer.getData("text/plain");

                if (draggedParticipantId) {
                  onSeatSwap?.(draggedParticipantId, participant.id);
                }
              }}
              title={canReorder ? text.diagram.seat : undefined}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-900">
                {index + 1}
              </span>
              <div>
                <p className="text-sm text-zinc-500">
                  {text.diagram.seat} {index + 1}
                </p>
                <p className="mt-1 font-medium text-zinc-950">
                  {formatModelDisplayName(participant.model)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
