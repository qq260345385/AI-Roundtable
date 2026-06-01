import type { MeetingResult, ModelParticipant } from "@/lib/types";

export const MEETING_HISTORY_LIMIT = 10;
export const MEETING_HISTORY_STORAGE_KEY = "ai-roundtable-meeting-history";

export type MeetingHistoryRecord = {
  createdAt: string;
  id: string;
  meeting: MeetingResult;
  participantNames: string[];
  participants: ModelParticipant[];
  topic: string;
};

type CreateMeetingHistoryRecordOptions = {
  createdAt?: string;
  id?: string;
  meeting: MeetingResult;
  participants: ModelParticipant[];
};

export function createMeetingHistoryRecord({
  createdAt = new Date().toISOString(),
  id = createMeetingHistoryId(),
  meeting,
  participants,
}: CreateMeetingHistoryRecordOptions): MeetingHistoryRecord {
  return {
    createdAt,
    id,
    meeting,
    participantNames: participants.map((participant) => participant.name),
    participants,
    topic: meeting.topic,
  };
}

export function addMeetingHistoryRecord(
  records: MeetingHistoryRecord[],
  record: MeetingHistoryRecord,
  limit = MEETING_HISTORY_LIMIT,
): MeetingHistoryRecord[] {
  return [
    record,
    ...records.filter((item) => item.id !== record.id),
  ].slice(0, limit);
}

export function deleteMeetingHistoryRecord(
  records: MeetingHistoryRecord[],
  recordId: string,
): MeetingHistoryRecord[] {
  return records.filter((record) => record.id !== recordId);
}

export function parseMeetingHistory(value: string | null): MeetingHistoryRecord[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isMeetingHistoryRecord);
  } catch {
    return [];
  }
}

export function serializeMeetingHistory(records: MeetingHistoryRecord[]): string {
  return JSON.stringify(records.slice(0, MEETING_HISTORY_LIMIT));
}

function createMeetingHistoryId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  return `meeting-${Date.now()}-${random}`;
}

function isMeetingHistoryRecord(value: unknown): value is MeetingHistoryRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<MeetingHistoryRecord>;

  return (
    typeof record.id === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.topic === "string" &&
    Array.isArray(record.participantNames) &&
    Array.isArray(record.participants) &&
    Boolean(record.meeting) &&
    typeof record.meeting === "object"
  );
}
