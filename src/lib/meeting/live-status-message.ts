import type { UiText } from "../i18n/ui-text";
import type { LiveMeetingEvent } from "../types";

export function getLiveMeetingStatusMessage(
  event: LiveMeetingEvent,
  text: UiText,
): string | undefined {
  if (event.type !== "meeting_started") {
    return undefined;
  }

  if (!event.searchSummary?.enabled) {
    return undefined;
  }

  if (event.searchSummary.status === "failed") {
    return text.evidence.webSearchFailed;
  }

  return text.evidence.webSearchCompleted;
}
