import type { MeetingResult } from "@/lib/types";
import type { UiText } from "@/lib/i18n/ui-text";
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
      <SummaryPanel summary={meeting.summary} text={text} />
    </div>
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
