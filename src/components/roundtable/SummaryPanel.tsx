import type { MeetingSummary } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import { getThirdStageSummarySections } from "@/lib/meeting/summary-presentation";

type SummaryPanelProps = {
  summary: MeetingSummary;
  text: UiText;
  topic: string;
};

export function SummaryPanel({ summary, text, topic }: SummaryPanelProps) {
  void topic;
  const thirdStageSections = getThirdStageSummarySections(summary);
  const sections = [
    {
      title: text.meetingBoard.consensus,
      items: thirdStageSections.consensus,
    },
    {
      title: text.meetingBoard.differences,
      items: thirdStageSections.differences,
    },
    {
      title: text.meetingBoard.nextSteps,
      items: thirdStageSections.nextSteps,
    },
  ];

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/80 p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-950">
        {text.meetingBoard.summaryTitle}
      </h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <SummaryList
            title={section.title}
            items={section.items}
            key={section.title}
          />
        ))}
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
    <div className="rounded-lg border border-amber-100 bg-white/55 p-4">
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
