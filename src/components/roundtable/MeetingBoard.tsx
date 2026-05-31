import type { MeetingResult } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
import type { ReactNode } from "react";
import { formatFailureForDisplay } from "@/lib/meeting/failure-format";
import { SummaryPanel } from "./SummaryPanel";
import { TranscriptPanel } from "./TranscriptPanel";

type MeetingBoardProps = {
  meeting: MeetingResult;
  text: UiText;
};

export function MeetingBoard({ meeting, text }: MeetingBoardProps) {
  return (
    <div className="space-y-5">
      {meeting.isTimeSensitive && meeting.factCheckNotice ? (
        <FactHygienePanel notice={meeting.factCheckNotice} text={text} />
      ) : null}
      {meeting.evidencePack?.evidenceStatus ? (
        <EvidenceStatusPanel meeting={meeting} text={text} />
      ) : null}
      {meeting.searchSummary?.enabled ? (
        <WebSearchProcessPanel meeting={meeting} text={text} />
      ) : null}
      {meeting.evidencePack?.delivery ? (
        <EvidenceDeliveryPanel meeting={meeting} text={text} />
      ) : null}
      {meeting.evidencePack?.enabled && meeting.citationCheck ? (
        <CitationCheckPanel meeting={meeting} text={text} />
      ) : null}
      {meeting.hasPartialFailures && meeting.failures ? (
        <ProviderFailurePanel failures={meeting.failures} text={text} />
      ) : null}
      <TranscriptPanel phases={meeting.phases} text={text} />
      <SummaryPanel summary={meeting.summary} text={text} topic={meeting.topic} />
    </div>
  );
}

type WebSearchProcessPanelProps = {
  meeting: MeetingResult;
  text: UiText;
};

export function WebSearchProcessPanel({
  meeting,
  text,
}: WebSearchProcessPanelProps) {
  const searchSummary = meeting.searchSummary;

  if (!searchSummary?.enabled) {
    return null;
  }

  const labels = text.meetingBoard.searchProcess;
  const copy = getSearchStatusCopy(meeting, labels);

  return (
    <section className="border border-sky-100 bg-sky-50/45 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-sky-950">
            {labels.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-sky-900">{copy.status}</p>
          <p className="mt-1 text-sm leading-6 text-sky-800">{copy.summary}</p>
          {copy.note ? (
            <p className="mt-1 text-sm leading-6 text-amber-800">
              {copy.note}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-3 border border-sky-100 bg-white/70 text-center text-xs text-sky-900 md:min-w-72">
          <Metric label={labels.reliableMetric} value={copy.reliableCount} />
          <Metric label={labels.generalMetric} value={copy.generalCount} />
          <Metric label={labels.weakerMetric} value={copy.weakerCount} />
        </div>
      </div>

      {meeting.debugSearchProcess ? (
        <DeveloperSearchDetails meeting={meeting} text={text} />
      ) : null}
    </section>
  );
}

function DeveloperSearchDetails({
  meeting,
  text,
}: WebSearchProcessPanelProps) {
  const process = meeting.debugSearchProcess;

  if (!process) {
    return null;
  }

  const labels = text.meetingBoard.searchProcess;
  const reliabilitySummary = Object.entries(
    process.qualityOverview.byReliability,
  )
    .filter(([, count]) => count > 0)
    .map(([quality, count]) => `${quality}: ${count}`)
    .join(" / ");
  const filteredReasonSummary =
    process.filteredReasons.length > 0
      ? process.filteredReasons
          .map(
            (item) =>
              `${
                labels.reasonLabels[
                  item.reason as keyof typeof labels.reasonLabels
                ] ?? item.reason
              } (${item.reason}): ${item.count}`,
          )
          .join(" / ")
      : labels.noFiltered;

  return (
    <details className="mt-4 border border-sky-100 bg-white/75 p-3 text-sm leading-6 text-zinc-700">
      <summary className="cursor-pointer font-medium text-sky-950">
        Developer search details
      </summary>
      <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
        <ProcessBlock title={labels.intentTitle}>
          {process.searchIntents.length > 0 ? (
            <ul className="space-y-2">
              {process.searchIntents.map((intent, recordIndex) => (
                <li key={intent.participantId}>
                  <details
                    open={recordIndex === 0 || process.searchIntents.length <= 3}
                  >
                    <summary className="cursor-pointer font-medium text-sky-950">
                      {intent.participantName}
                      <span className="font-normal text-zinc-500">
                        {" "}
                        / {intent.provider}
                      </span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {intent.intents.map((searchIntent, index) => (
                        <div
                          className="border-l-2 border-sky-200 bg-sky-50/50 px-3 py-2"
                          key={`${intent.participantId}-${index}`}
                        >
                          <p className="font-medium text-zinc-800">
                            {searchIntent.question}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600">
                            freshness: {searchIntent.freshness} / source:{" "}
                            {searchIntent.sourcePreference}
                          </p>
                          {searchIntent.mustInclude.length > 0 ? (
                            <p className="mt-1 text-xs text-zinc-600">
                              must: {searchIntent.mustInclude.join(", ")}
                            </p>
                          ) : null}
                          {searchIntent.shouldInclude.length > 0 ? (
                            <p className="mt-1 text-xs text-zinc-600">
                              should: {searchIntent.shouldInclude.join(", ")}
                            </p>
                          ) : null}
                          {searchIntent.exclude.length > 0 ? (
                            <p className="mt-1 text-xs text-zinc-600">
                              exclude: {searchIntent.exclude.join(", ")}
                            </p>
                          ) : null}
                          {searchIntent.rationale ? (
                            <p className="mt-1 text-zinc-700">
                              {searchIntent.rationale}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p>{labels.empty}</p>
          )}
        </ProcessBlock>

        <ProcessBlock title={labels.queryTitle}>
          {process.executedQueries.length > 0 ? (
            <div className="space-y-2">
              <p>{process.executedQueries.join(" / ")}</p>
              {process.queryPlans.length > 0 ? (
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-sky-900">
                    Query generation
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {process.queryPlans.map((plan) => (
                      <li
                        className="border-l-2 border-sky-200 pl-3"
                        key={plan.query}
                      >
                        <p className="font-medium text-zinc-800">
                          {plan.query}
                        </p>
                        <p className="text-xs text-zinc-600">
                          {plan.reason}
                        </p>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : (
            <p>{labels.empty}</p>
          )}
        </ProcessBlock>

        <ProcessBlock title={labels.qualityTitle}>
          <p>{reliabilitySummary || labels.empty}</p>
          {process.qualityOverview.lowEvidenceCount > 0 ? (
            <p className="mt-1 text-amber-800">
              {labels.lowEvidenceCount}: {process.qualityOverview.lowEvidenceCount}
            </p>
          ) : null}
        </ProcessBlock>

        <ProcessBlock title={labels.filteredTitle}>
          <p>{filteredReasonSummary}</p>
          {process.intentDecisions.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-sky-900">
                Merged / dropped search intents
              </summary>
              <ul className="mt-2 space-y-1">
                {process.intentDecisions
                  .filter((decision) => decision.action !== "used")
                  .map((decision, index) => (
                    <li
                      className="border-l-2 border-sky-200 pl-3"
                      key={`${decision.question}-${index}`}
                    >
                      <span className="font-medium">{decision.action}</span>
                      <span className="text-zinc-500">
                        {" "}
                        / {decision.reason}
                      </span>
                      <p>{decision.question}</p>
                      {decision.mergedInto ? (
                        <p className="text-xs text-zinc-600">
                          merged into: {decision.mergedInto}
                        </p>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </details>
          ) : null}
        </ProcessBlock>

        <ProcessBlock title="Raw searchProcess">
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-5">
            {JSON.stringify(process, null, 2)}
          </pre>
        </ProcessBlock>
      </div>
    </details>
  );
}

type SearchProcessLabels = UiText["meetingBoard"]["searchProcess"];

function getSearchStatusCopy(
  meeting: MeetingResult,
  labels: SearchProcessLabels,
) {
  const searchSummary = meeting.searchSummary;

  if (!searchSummary) {
    return {
      generalCount: 0,
      reliableCount: 0,
      status: "",
      summary: "",
      weakerCount: 0,
      note: "",
    };
  }

  if (searchSummary.status === "failed") {
    const noteParts = [
      getSearchFailureDisplay(searchSummary.userMessage, labels),
      searchSummary.hasRealtimeWarning
        ? labels.realtimeClaimsNeedVerification
        : "",
    ].filter(Boolean);

    return {
      reliableCount: searchSummary.strongCount,
      generalCount: searchSummary.mediumCount,
      weakerCount: searchSummary.weakCount,
      status: labels.failedStatus,
      summary: formatSearchEvidenceSummary(searchSummary, labels),
      note: noteParts.join(" "),
    };
  }

  return {
    reliableCount: searchSummary.strongCount,
    generalCount: searchSummary.mediumCount,
    weakerCount: searchSummary.weakCount,
    status: labels.completedStatus,
    summary: formatSearchEvidenceSummary(searchSummary, labels),
    note: searchSummary.hasRealtimeWarning ? labels.manualVerificationNote : "",
  };
}

function formatSearchEvidenceSummary(
  searchSummary: NonNullable<MeetingResult["searchSummary"]>,
  labels: SearchProcessLabels,
) {
  if (searchSummary.totalReferences <= 0) {
    return labels.noEvidenceSummary;
  }

  const evidenceItemLabel =
    searchSummary.totalReferences === 1
      ? labels.evidenceItemSingular
      : labels.evidenceItemPlural;

  return `${labels.referencedEvidenceStart} ${searchSummary.totalReferences} ${evidenceItemLabel}${labels.summaryColon}${searchSummary.strongCount} ${labels.reliableSummaryLabel}${labels.summarySeparator}${searchSummary.mediumCount} ${labels.generalSummaryLabel}${labels.summarySeparator}${searchSummary.weakCount} ${labels.weakerSummaryLabel}${labels.sentencePeriod}`;
}

function getSearchFailureDisplay(
  userMessage: string,
  labels: SearchProcessLabels,
) {
  const failureMatch = userMessage.match(/Failure type:\s*(.+?)(?:\.|$)/i);

  if (!failureMatch?.[1]) {
    return "";
  }

  return `${labels.failureReasonPrefix}${failureMatch[1].trim()}${labels.sentencePeriod}`;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 border-r border-sky-100 px-3 py-2 last:border-r-0">
      <p className="text-lg font-semibold text-sky-950">{value}</p>
      <p className="mt-1 whitespace-nowrap">{label}</p>
    </div>
  );
}

function ProcessBlock({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="border border-sky-100 bg-white/75 p-3 text-sm leading-6 text-zinc-700">
      <h3 className="font-medium text-sky-950">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  );
}

type EvidenceStatusPanelProps = {
  meeting: MeetingResult;
  text: UiText;
};

function EvidenceStatusPanel({ meeting, text }: EvidenceStatusPanelProps) {
  const status = meeting.evidencePack?.evidenceStatus;

  if (!status) {
    return null;
  }

  const isLowEvidence = status === "low" || status === "none";

  return (
    <section
      className={`border p-5 ${
        isLowEvidence
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50"
      }`}
    >
      <h2
        className={`text-lg font-semibold ${
          isLowEvidence ? "text-amber-950" : "text-emerald-950"
        }`}
      >
        {text.meetingBoard.evidenceStatusTitle}
      </h2>
      <p
        className={`mt-1 text-sm leading-6 ${
          isLowEvidence ? "text-amber-900" : "text-emerald-900"
        }`}
      >
        {text.meetingBoard.evidenceStatus[status]}
      </p>
    </section>
  );
}

type EvidenceDeliveryPanelProps = {
  meeting: MeetingResult;
  text: UiText;
};

function EvidenceDeliveryPanel({ meeting, text }: EvidenceDeliveryPanelProps) {
  const delivery = meeting.evidencePack?.delivery;

  if (!delivery) {
    return null;
  }

  const modeLabel =
    delivery.effectiveMode === "native_file"
      ? text.evidence.deliveryNative
      : text.evidence.deliveryTextPack;
  const isFallback =
    delivery.requestedStrategy !== "text_pack" &&
    delivery.effectiveMode === "text_pack";

  return (
    <section
      className={`border p-5 ${
        isFallback
          ? "border-amber-200 bg-amber-50"
          : "border-emerald-200 bg-emerald-50"
      }`}
    >
      <h2
        className={`text-lg font-semibold ${
          isFallback ? "text-amber-950" : "text-emerald-950"
        }`}
      >
        {text.evidence.deliveryTitle}
      </h2>
      <p
        className={`mt-1 text-sm leading-6 ${
          isFallback ? "text-amber-900" : "text-emerald-900"
        }`}
      >
        {modeLabel}。{delivery.reason}
      </p>
    </section>
  );
}

type CitationCheckPanelProps = {
  meeting: MeetingResult;
  text: UiText;
};

function CitationCheckPanel({ meeting, text }: CitationCheckPanelProps) {
  const citationCheck = meeting.citationCheck;

  if (!citationCheck) {
    return null;
  }

  if (citationCheck.hasInvalidCitations) {
    return (
      <section className="border border-amber-300 bg-amber-50 p-5">
        <h2 className="text-lg font-semibold text-amber-950">
          {text.meetingBoard.citationTitle}
        </h2>
        <p className="mt-1 text-sm leading-6 text-amber-900">
          {text.meetingBoard.citationInvalid}
          {citationCheck.invalidCitationIds.join("、")}
        </p>
      </section>
    );
  }

  return (
    <section className="border border-emerald-200 bg-emerald-50 p-5">
      <h2 className="text-lg font-semibold text-emerald-950">
        {text.meetingBoard.citationTitle}
      </h2>
      <p className="mt-1 text-sm leading-6 text-emerald-900">
        {text.meetingBoard.citationPassed}
      </p>
    </section>
  );
}

type FactHygienePanelProps = {
  notice: string;
  text: UiText;
};

function FactHygienePanel({ notice, text }: FactHygienePanelProps) {
  return (
    <section className="border border-amber-200 bg-amber-50 p-5">
      <h2 className="text-lg font-semibold text-amber-950">
        {text.meetingBoard.factTitle}
      </h2>
      <p className="mt-1 text-sm leading-6 text-amber-900">{notice}</p>
    </section>
  );
}

type ProviderFailurePanelProps = {
  failures: MeetingResult["failures"];
  text: UiText;
};

function ProviderFailurePanel({ failures, text }: ProviderFailurePanelProps) {
  if (!failures || failures.length === 0) {
    return null;
  }

  return (
    <section className="border border-red-200 bg-red-50 p-5">
      <h2 className="text-lg font-semibold text-red-900">
        {text.meetingBoard.failureTitle}
      </h2>
      <p className="mt-1 text-sm leading-6 text-red-800">
        {text.meetingBoard.failureDescription}
      </p>
      <div className="mt-3 space-y-2 text-sm leading-6 text-red-800">
        {failures.map((failure) => {
          const formattedFailure = formatFailureForDisplay(failure);

          return (
            <article
              className="border-l-2 border-red-300 bg-white/70 px-3 py-2"
              key={`${failure.stage}-${failure.providerId}`}
            >
              <p>
                <span className="font-medium">
                  {formattedFailure.providerName} / {formattedFailure.model} /{" "}
                  {formattedFailure.stageLabel}：
                </span>
                {formattedFailure.message}
              </p>
              <p className="mt-1 text-xs text-red-700">
                {text.meetingBoard.suggestion}
                {formattedFailure.suggestion}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
