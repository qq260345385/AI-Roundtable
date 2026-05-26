import type { LiveMeetingEvent, MeetingResult } from "../types";
import type { CitationCheckResult } from "./evidence-citations";
import type {
  EvidencePack,
  EvidenceQuality,
  SearchFailureReason,
  SearchProcess,
  SearchSummary,
} from "./evidence-pack";

export function prepareMeetingForClient(
  meeting: MeetingResult,
  env: NodeJS.ProcessEnv = process.env,
): MeetingResult {
  const debugSearchProcess = getDebugSearchProcess(meeting.evidencePack, env);
  const safeMeeting = { ...meeting };

  delete safeMeeting.debugSearchProcess;

  return {
    ...safeMeeting,
    evidencePack: sanitizeEvidencePackForClient(meeting.evidencePack),
    ...(meeting.citationCheck
      ? { citationCheck: sanitizeCitationCheckForClient(meeting.citationCheck) }
      : {}),
    searchSummary: createSearchSummary(
      meeting.evidencePack,
      meeting.isTimeSensitive === true,
    ),
    ...(debugSearchProcess ? { debugSearchProcess } : {}),
  };
}

export function prepareLiveMeetingEventForClient(
  event: LiveMeetingEvent,
  env: NodeJS.ProcessEnv = process.env,
): LiveMeetingEvent {
  if (event.type === "meeting_started") {
    const debugSearchProcess = getDebugSearchProcess(event.evidencePack, env);
    const safeEvent = { ...event };

    delete safeEvent.debugSearchProcess;

    return {
      ...safeEvent,
      evidencePack: sanitizeEvidencePackForClient(event.evidencePack),
      searchSummary: createSearchSummary(
        event.evidencePack,
        event.isTimeSensitive,
      ),
      ...(debugSearchProcess ? { debugSearchProcess } : {}),
    };
  }

  if (event.type === "meeting_completed") {
    return {
      ...event,
      meeting: prepareMeetingForClient(event.meeting, env),
    };
  }

  return event;
}

export function isSearchDebugResponseEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.NODE_ENV !== "production" && env.SEARCH_DEBUG_ENABLED !== "false";
}

export function createSearchSummary(
  evidencePack: EvidencePack | undefined,
  isTimeSensitive = false,
): SearchSummary {
  const process = evidencePack?.searchProcess;
  const items = evidencePack?.enabled ? evidencePack.items : [];
  const strongCount = items.filter(
    (item) => item.quality?.reliability === "high",
  ).length;
  const mediumCount = items.filter(
    (item) => item.quality?.reliability === "medium",
  ).length;
  const weakCount = items.filter(
    (item) => item.quality?.reliability === "low",
  ).length;
  const evidenceMode = process?.evidenceMode ?? "not_used";
  const status = getSearchSummaryStatus(evidenceMode);
  const hasRealtimeWarning =
    isTimeSensitive ||
    evidencePack?.evidenceStatus === "low" ||
    evidencePack?.evidenceStatus === "none" ||
    evidenceMode === "low_evidence" ||
    evidenceMode === "search_failed" ||
    evidenceMode === "no_reliable_sources" ||
    evidenceMode === "realtime_unverified";

  return {
    enabled: Boolean(process),
    status,
    evidenceMode,
    totalReferences: items.length,
    strongCount,
    mediumCount,
    weakCount,
    hasRealtimeWarning,
    userMessage: createSearchUserMessage({
      failureReason: process?.failureReason,
      hasRealtimeWarning,
      mediumCount,
      status,
      strongCount,
      totalReferences: items.length,
      weakCount,
    }),
  };
}

export function sanitizeEvidencePackForClient(
  evidencePack: EvidencePack | undefined,
): EvidencePack | undefined {
  if (!evidencePack) {
    return undefined;
  }

  const safe = { ...evidencePack };

  delete safe.searchProcess;
  delete safe.searchQueries;

  return {
    ...safe,
    items: evidencePack.items.map((item) => {
      const safeItem = { ...item };

      delete safeItem.sourceQueries;

      return {
        ...safeItem,
        ...(item.quality
          ? { quality: sanitizeEvidenceQualityForClient(item.quality) }
          : {}),
      };
    }),
  };
}

function getDebugSearchProcess(
  evidencePack: EvidencePack | undefined,
  env: NodeJS.ProcessEnv,
): SearchProcess | undefined {
  if (!isSearchDebugResponseEnabled(env)) {
    return undefined;
  }

  return evidencePack?.searchProcess;
}

function getSearchSummaryStatus(
  evidenceMode: string,
): SearchSummary["status"] {
  if (evidenceMode === "not_used") {
    return "not_used";
  }

  if (evidenceMode === "search_failed") {
    return "failed";
  }

  if (
    evidenceMode === "low_evidence" ||
    evidenceMode === "no_reliable_sources" ||
    evidenceMode === "realtime_unverified"
  ) {
    return "low_evidence";
  }

  return "completed";
}

function createSearchUserMessage(input: {
  failureReason?: SearchFailureReason;
  hasRealtimeWarning: boolean;
  mediumCount: number;
  status: SearchSummary["status"];
  strongCount: number;
  totalReferences: number;
  weakCount: number;
}) {
  if (input.status === "not_used") {
    return "Web search was not used for this round.";
  }

  if (input.status === "failed") {
    return `Web search failed. This round mainly uses model knowledge and reasoning. Failure type: ${formatSearchFailureReason(input.failureReason)}.`;
  }

  const evidenceWord = input.totalReferences === 1 ? "item" : "items";
  const verificationNote = input.hasRealtimeWarning
    ? " Some real-time information may still need manual verification."
    : "";

  return `Web search completed. System referenced ${input.totalReferences} evidence ${evidenceWord}: ${input.strongCount} reliable, ${input.mediumCount} general, ${input.weakCount} weaker.${verificationNote}`;
}

function formatSearchFailureReason(reason: SearchFailureReason | undefined) {
  return {
    missing_api_key: "Missing API key",
    invalid_request: "Invalid search request",
    unauthorized: "Authentication failed",
    rate_limited: "Rate limited",
    network_error: "Network error",
    invalid_response: "Invalid search response",
    unknown_error: "Unknown error",
  }[reason ?? "unknown_error"];
}

function sanitizeEvidenceQualityForClient(
  quality: EvidenceQuality,
): EvidenceQuality {
  return {
    warnings: quality.warnings,
    textLength: quality.textLength,
    wasTruncated: quality.wasTruncated,
    sourceType: quality.sourceType,
    reliability: quality.reliability,
    score: quality.score,
    ...(quality.snippetOnly ? { snippetOnly: true } : {}),
    ...(typeof quality.topicRelevanceScore === "number"
      ? { topicRelevanceScore: quality.topicRelevanceScore }
      : {}),
    ...(quality.relevanceReason
      ? { relevanceReason: quality.relevanceReason }
      : {}),
    ...(quality.matchedQuestionAspects
      ? { matchedQuestionAspects: quality.matchedQuestionAspects }
      : {}),
    ...(quality.coverageDimension
      ? { coverageDimension: quality.coverageDimension }
      : {}),
    ...(quality.topicType ? { topicType: quality.topicType } : {}),
  };
}

function sanitizeCitationCheckForClient(
  citationCheck: CitationCheckResult,
): CitationCheckResult {
  return {
    validCitationIds: citationCheck.validCitationIds,
    usedCitationIds: citationCheck.usedCitationIds,
    missingCitationIds: citationCheck.missingCitationIds,
    invalidCitationIds: citationCheck.invalidCitationIds,
    hasInvalidCitations: citationCheck.hasInvalidCitations,
  };
}
