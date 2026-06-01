import { useEffect, useState } from "react";
import type { ModelParticipant } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import { formatModelDisplayName } from "@/lib/models/model-display-name";

type RoundtableDiagramProps = {
  onSeatSwap?: (draggedParticipantId: string, targetParticipantId: string) => void;
  participants: ModelParticipant[];
  text: UiText;
};

type DragState = {
  clientX: number;
  clientY: number;
  height: number;
  offsetX: number;
  offsetY: number;
  overParticipantId?: string;
  participantId: string;
  pointerId: number;
  width: number;
};

export function RoundtableDiagram({
  onSeatSwap,
  participants,
  text,
}: RoundtableDiagramProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const canReorder = Boolean(onSeatSwap) && participants.length > 1;
  const draggedParticipant = dragState
    ? participants.find((participant) => participant.id === dragState.participantId)
    : undefined;
  const draggedIndex = draggedParticipant
    ? participants.findIndex((participant) => participant.id === draggedParticipant.id)
    : -1;

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const activeDragState = dragState;

    function getDropTargetId(clientX: number, clientY: number) {
      const element = document.elementFromPoint(clientX, clientY);
      const seat = element?.closest<HTMLElement>("[data-seat-participant-id]");
      const participantId = seat?.dataset.seatParticipantId;

      if (!participantId || participantId === activeDragState.participantId) {
        return undefined;
      }

      return participants.some((participant) => participant.id === participantId)
        ? participantId
        : undefined;
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== activeDragState.pointerId) {
        return;
      }

      const overParticipantId = getDropTargetId(event.clientX, event.clientY);
      setDragState((current) =>
        current
          ? {
              ...current,
              clientX: event.clientX,
              clientY: event.clientY,
              overParticipantId,
            }
          : current,
      );
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.pointerId !== activeDragState.pointerId) {
        return;
      }

      const overParticipantId =
        getDropTargetId(event.clientX, event.clientY) ??
        activeDragState.overParticipantId;
      setDragState(null);

      if (overParticipantId) {
        onSeatSwap?.(activeDragState.participantId, overParticipantId);
      }
    }

    function handlePointerCancel(event: PointerEvent) {
      if (event.pointerId === activeDragState.pointerId) {
        setDragState(null);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [dragState, onSeatSwap, participants]);

  return (
    <section className="border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-950">
        {text.diagram.title}
      </h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {participants.map((participant, index) => {
          const isDragging = dragState?.participantId === participant.id;
          const isDropTarget = dragState?.overParticipantId === participant.id;

          return (
            <div
              className={`min-h-28 select-none touch-none border bg-stone-50 p-4 transition-[border-color,box-shadow,transform,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-sm ${
                canReorder ? "cursor-grab active:cursor-grabbing" : ""
              } ${
                isDragging
                  ? "border-dashed border-amber-200 bg-amber-50/40"
                  : "border-zinc-200"
              } ${
                isDropTarget
                  ? "border-amber-300 bg-amber-50 shadow-sm ring-2 ring-amber-200"
                  : ""
              }`}
              data-seat-participant-id={participant.id}
              key={participant.id}
              onPointerDown={(event) => {
                if (!canReorder) {
                  return;
                }

                if (event.button !== 0) {
                  return;
                }

                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setDragState({
                  clientX: event.clientX,
                  clientY: event.clientY,
                  height: rect.height,
                  offsetX: event.clientX - rect.left,
                  offsetY: event.clientY - rect.top,
                  participantId: participant.id,
                  pointerId: event.pointerId,
                  width: rect.width,
                });
              }}
              title={canReorder ? text.diagram.seat : undefined}
            >
              <SeatCardContent
                className={isDragging ? "opacity-0" : undefined}
                index={index}
                participant={participant}
                text={text}
              />
            </div>
          );
        })}
      </div>
      {dragState && draggedParticipant && draggedIndex >= 0 ? (
        <div
          className="pointer-events-none fixed z-50 border border-amber-300 bg-white p-4 opacity-95 shadow-2xl ring-2 ring-amber-200"
          style={{
            height: dragState.height,
            left: dragState.clientX - dragState.offsetX,
            top: dragState.clientY - dragState.offsetY,
            width: dragState.width,
          }}
        >
          <SeatCardContent
            index={draggedIndex}
            participant={draggedParticipant}
            text={text}
          />
        </div>
      ) : null}
    </section>
  );
}

type SeatCardContentProps = {
  className?: string;
  index: number;
  participant: ModelParticipant;
  text: UiText;
};

function SeatCardContent({
  className,
  index,
  participant,
  text,
}: SeatCardContentProps) {
  return (
    <div className={`flex h-full min-h-20 flex-col justify-between ${className ?? ""}`}>
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
}
