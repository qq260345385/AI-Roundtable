import type { UiText } from "@/lib/i18n/ui-text";
import { buildMeetingRecapViewModel } from "@/lib/meeting/meeting-recap";
import type { MeetingResult } from "@/lib/types";

type MeetingRecapPanelProps = {
  meeting: MeetingResult;
  text: UiText;
};

export function MeetingRecapPanel({ meeting, text }: MeetingRecapPanelProps) {
  const recap = buildMeetingRecapViewModel(meeting);
  const copy = text.meetingBoard;

  return (
    <div className="space-y-5">
      <section className="surface-panel p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-950">
              {copy.recapTitle}
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              {copy.recapDescription}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {recap.timeline.map((item, index) => (
            <article
              className="rounded-lg border border-zinc-100 bg-white/85 p-4"
              key={item.id}
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {index + 1}
              </p>
              <h3 className="mt-2 font-semibold text-zinc-950">
                {item.id === "summary" ? copy.recapSummaryStageTitle : item.title}
              </h3>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                {item.id === "summary"
                  ? copy.recapSummaryDescription
                  : item.description}
              </p>
              <p className="mt-3 text-sm font-medium text-zinc-800">
                {item.turnCount} {copy.recapTurnUnit}
              </p>
              {item.participantNames.length > 0 ? (
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {copy.recapParticipants}
                  {item.participantNames.join(", ")}
                </p>
              ) : null}
              <p className="mt-3 border-l-2 border-emerald-200 pl-3 text-sm leading-6 text-zinc-700">
                {item.excerpt
                  ? `${copy.recapExcerpt}${item.excerpt}`
                  : copy.recapEmptyStage}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-panel p-5">
        <h2 className="text-lg font-semibold text-zinc-950">
          {copy.modelComparisonTitle}
        </h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600">
          {copy.modelComparisonDescription}
        </p>
        {recap.hasLowEvidenceGuard ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <h3 className="font-semibold text-amber-950">
              {copy.evidenceGuardTitle}
            </h3>
            <p className="mt-1">{copy.evidenceGuardDescription}</p>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {recap.modelRows.length > 0 ? (
            recap.modelRows.map((row) => (
              <article
                className="rounded-lg border border-zinc-100 bg-white/85 p-4"
                key={row.key}
              >
                <div>
                  <h3 className="font-semibold text-zinc-950">
                    {row.speakerName}
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    {row.provider} / {row.model}
                  </p>
                </div>
                <RecapExcerpt
                  label={copy.independentViewLabel}
                  text={row.independentExcerpt}
                  emptyText={copy.emptyExcerpt}
                />
                <RecapExcerpt
                  label={copy.responseViewLabel}
                  status={getResponseStatusLabel(row.responseStatus, copy)}
                  text={row.responseExcerpt}
                  emptyText={row.failureMessage ?? copy.noResponseLabel}
                />
              </article>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
              {copy.recapEmptyStage}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function RecapExcerpt({
  emptyText,
  label,
  status,
  text,
}: {
  emptyText: string;
  label: string;
  status?: string;
  text?: string;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-zinc-900">{label}</p>
        {status ? (
          <span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-600">
            {status}
          </span>
        ) : null}
      </div>
      <p className="mt-2 border-l-2 border-emerald-200 pl-3 text-sm leading-6 text-zinc-700">
        {text ?? emptyText}
      </p>
    </div>
  );
}

function getResponseStatusLabel(
  status: "responded" | "no_response" | "failed_response",
  copy: UiText["meetingBoard"],
): string | undefined {
  if (status === "failed_response") {
    return copy.failedResponseLabel;
  }

  if (status === "no_response") {
    return copy.noResponseLabel;
  }

  return undefined;
}
