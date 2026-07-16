import type { MeetingSummary } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import { normalizeDecisionBrief } from "@/lib/meeting/decision-brief";

type DecisionBriefPanelProps = {
  summary: MeetingSummary;
  text: UiText;
};

export function DecisionBriefPanel({ summary, text }: DecisionBriefPanelProps) {
  const brief = normalizeDecisionBrief(summary);
  const copy = text.decisionBrief;

  return (
    <section className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-sm">
      <div className="border-b border-emerald-100 bg-emerald-50/80 px-5 py-4 md:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-emerald-950">{copy.title}</h2>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-emerald-800">
              {copy.status[brief.status]}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
              {copy.confidence[brief.confidence]}
            </span>
          </div>
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-[0.16em] text-emerald-700">
          {copy.recommendation}
        </p>
        <p className="mt-2 text-xl font-semibold leading-8 text-zinc-950 md:text-2xl md:leading-9">
          {brief.recommendation}
        </p>
      </div>

      <div className="grid gap-px bg-zinc-200 md:grid-cols-2">
        <BriefList title={copy.rationale} items={brief.rationale} empty={copy.noItems} />
        <BriefList title={copy.conditions} items={brief.conditions} empty={copy.noItems} />
        <BriefList title={copy.risks} items={brief.risks} empty={copy.noItems} />
        <BriefList title={copy.evidenceGaps} items={brief.evidenceGaps} empty={copy.noItems} />
        <BriefList
          title={copy.reversalConditions}
          items={brief.reversalConditions}
          empty={copy.noItems}
        />
        <section className="bg-white p-5 md:p-6">
          <h3 className="text-sm font-semibold text-zinc-950">{copy.nextAction}</h3>
          <p className="mt-3 text-sm leading-6 text-zinc-700">{brief.nextAction}</p>
        </section>
      </div>
    </section>
  );
}

function BriefList({
  empty,
  items,
  title,
}: {
  empty: string;
  items: string[];
  title: string;
}) {
  return (
    <section className="bg-white p-5 md:p-6">
      <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-700">
          {items.map((item) => (
            <li className="border-l-2 border-emerald-200 pl-3" key={item}>
              {item}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
