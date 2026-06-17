import type { MeetingPhase } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";

type TranscriptPanelProps = {
  phases: MeetingPhase[];
  text: UiText;
};

export function TranscriptPanel({ phases, text }: TranscriptPanelProps) {
  return (
    <section className="surface-panel p-5">
      <h2 className="text-lg font-semibold text-zinc-950">
        {text.meetingBoard.transcriptTitle}
      </h2>
      <div className="mt-4 space-y-5">
        {phases.map((phase) => (
          <section className="surface-card p-4" key={phase.id}>
            <h3 className="font-medium text-zinc-950">{phase.title}</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              {phase.description}
            </p>

            <div className="mt-4 space-y-3">
              {phase.turns.map((turn, index) => (
                <article
                  className="rounded-lg border border-zinc-100 border-l-4 border-l-emerald-600 bg-white/85 p-4 transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-sm"
                  key={turn.id}
                >
                  <p className="text-sm font-medium text-emerald-700">
                    {text.meetingBoard.speech} {index + 1} · {turn.speakerName}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {turn.provider} / {turn.model}
                  </p>
                  <p className="mt-3 leading-7 text-zinc-800">
                    {turn.content}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
