import type { MeetingSummary } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import { getSummaryPresentationStyle } from "@/lib/meeting/summary-presentation";

type SummaryPanelProps = {
  summary: MeetingSummary;
  text: UiText;
  topic: string;
};

export function SummaryPanel({ summary, text, topic }: SummaryPanelProps) {
  const style = getSummaryPresentationStyle(topic);
  const sections =
    style === "stance-oriented"
      ? [
          {
            title: text.meetingBoard.stanceSummary.mainStances,
            items: summary.confirmableFacts ?? summary.consensus,
          },
          {
            title: text.meetingBoard.stanceSummary.coreReasons,
            items: summary.initialHypotheses ?? [],
          },
          {
            title: text.meetingBoard.stanceSummary.mainDifferences,
            items:
              summary.insufficientlyConfirmed &&
              summary.insufficientlyConfirmed.length > 0
                ? summary.insufficientlyConfirmed
                : summary.differences,
          },
          {
            title: text.meetingBoard.stanceSummary.discussionLimits,
            items: summary.risks,
          },
          {
            title: text.meetingBoard.stanceSummary.continueDiscussion,
            items: summary.nextSteps,
          },
        ]
      : [
          {
            title: text.meetingBoard.confirmableFacts,
            items: summary.confirmableFacts ?? summary.consensus,
          },
          {
            title: text.meetingBoard.initialHypotheses,
            items: summary.initialHypotheses ?? [],
          },
          {
            title: text.meetingBoard.communityViews,
            items: summary.communityViews ?? [],
          },
          {
            title: text.meetingBoard.insufficientlyConfirmed,
            items: summary.insufficientlyConfirmed ?? [],
          },
          {
            title: text.meetingBoard.differences,
            items: summary.confirmableFacts ? [] : summary.differences,
          },
          {
            title: text.meetingBoard.risks,
            items: summary.risks,
          },
          {
            title: text.meetingBoard.nextSteps,
            items: summary.nextSteps,
          },
        ];

  return (
    <section className="border border-amber-200 bg-amber-50 p-5">
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
