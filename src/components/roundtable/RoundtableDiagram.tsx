import type { ModelParticipant } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import { formatModelDisplayName } from "@/lib/models/model-display-name";

type RoundtableDiagramProps = {
  participants: ModelParticipant[];
  text: UiText;
};

export function RoundtableDiagram({ participants, text }: RoundtableDiagramProps) {
  return (
    <section className="border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-950">
        {text.diagram.title}
      </h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {participants.map((participant, index) => (
          <div
            className="flex min-h-28 flex-col justify-between border border-zinc-200 bg-stone-50 p-4 transition-[border-color,box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-sm"
            key={participant.id}
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
        ))}
      </div>
    </section>
  );
}
