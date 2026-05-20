import type { MeetingSummary } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";

type SummaryPanelProps = {
  summary: MeetingSummary;
  text: UiText;
};

export function SummaryPanel({ summary, text }: SummaryPanelProps) {
  return (
    <section className="border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-lg font-semibold text-zinc-950">
        {text.meetingBoard.summaryTitle}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SummaryList
          title={text.meetingBoard.confirmableFacts}
          items={summary.confirmableFacts ?? summary.consensus}
        />
        <SummaryList
          title={text.meetingBoard.initialHypotheses}
          items={summary.initialHypotheses ?? []}
        />
        <SummaryList
          title={text.meetingBoard.communityViews}
          items={summary.communityViews ?? []}
        />
        <SummaryList
          title={text.meetingBoard.insufficientlyConfirmed}
          items={summary.insufficientlyConfirmed ?? []}
        />
        {!summary.confirmableFacts ? (
          <>
            <SummaryList title={text.meetingBoard.differences} items={summary.differences} />
            <SummaryList title={text.meetingBoard.minorityViews} items={summary.minorityViews} />
          </>
        ) : null}
        <SummaryList title={text.meetingBoard.risks} items={summary.risks} />
      </div>
      <div className="mt-4">
        <SummaryList title={text.meetingBoard.nextSteps} items={summary.nextSteps} />
      </div>
    </section>
  );
}

type SummaryListProps = {
  title: string;
  items: string[];
};

function SummaryList({ title, items }: SummaryListProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div>
      <h3 className="font-medium text-zinc-950">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-zinc-700">
        {items.map((item) => (
          <li
            className="border-l-2 border-amber-300 pl-3 transition-[border-color,transform] duration-150 ease-out hover:translate-x-0.5 hover:border-amber-500"
            key={item}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
