import type {
  EvidenceAttachmentCapabilities,
  EvidencePack,
  SearchIntent,
  SearchProcess,
  SearchSummary,
} from "./search/evidence-pack";
import type { CitationCheckResult } from "./search/evidence-citations";

export type ParticipantStatus =
  | "mock"
  | "available"
  | "detected"
  | "unconfigured"
  | "model_not_found"
  | "configured_unverified";
export type RoundtableMode = "mock" | "real";

export type MeetingPromptOptions = {
  isBriefMode?: boolean;
  signal?: AbortSignal;
};

export type ModelParticipant = {
  id: string;
  name: string;
  provider: string;
  model: string;
  status: ParticipantStatus;
  statusLabel: string;
  detectedModels?: string[];
  capabilities?: EvidenceAttachmentCapabilities;
};

export type UnavailableProvider = {
  id: string;
  name: string;
  provider: string;
  reason: string;
  status: ParticipantStatus;
  statusLabel: string;
  detectedModels?: string[];
};

export type MeetingRequest = {
  topic: string;
  participants: ModelParticipant[];
  evidencePack?: EvidencePack;
  isBriefMode?: boolean;
  signal?: AbortSignal;
};

export type MeetingTurn = {
  id: string;
  phaseId: string;
  speakerName: string;
  provider: string;
  model: string;
  content: string;
};

export type MeetingPhase = {
  id: string;
  title: string;
  description: string;
  turns: MeetingTurn[];
};

export type MeetingSummary = {
  consensus: string[];
  differences: string[];
  minorityViews: string[];
  confirmableFacts?: string[];
  initialHypotheses?: string[];
  communityViews?: string[];
  insufficientlyConfirmed?: string[];
  risks: string[];
  nextSteps: string[];
};

export type MeetingProviderFailure = {
  providerId: string;
  providerName: string;
  model: string;
  stage: "independent" | "response" | "summary";
  message: string;
};

export type MeetingResult = {
  topic: string;
  phases: MeetingPhase[];
  summary: MeetingSummary;
  evidencePack?: EvidencePack;
  searchSummary?: SearchSummary;
  debugSearchProcess?: SearchProcess;
  citationCheck?: CitationCheckResult;
  failures?: MeetingProviderFailure[];
  hasPartialFailures?: boolean;
  isBriefMode?: boolean;
  isTimeSensitive?: boolean;
  factCheckNotice?: string;
};

export type LiveMeetingEvent =
  | {
      type: "meeting_started";
      topic: string;
      participants: ModelParticipant[];
      isBriefMode: boolean;
      isTimeSensitive: boolean;
      factCheckNotice?: string;
      evidencePack?: EvidencePack;
      searchSummary?: SearchSummary;
      debugSearchProcess?: SearchProcess;
    }
  | {
      type: "phase_started";
      phaseId: "independent" | "response" | "summary";
      title: string;
      description: string;
    }
  | {
      type: "participant_started";
      phaseId: "independent" | "response" | "summary";
      participantId: string;
      participantName: string;
    }
  | {
      type: "turn";
      turn: MeetingTurn;
    }
  | {
      type: "failure";
      failure: MeetingProviderFailure;
    }
  | {
      type: "summary";
      summary: MeetingSummary;
    }
  | {
      type: "meeting_completed";
      meeting: MeetingResult;
    }
  | {
      type: "error";
      error: string;
      status: number;
    };

export type LiveParticipantStatus =
  | "waiting"
  | "speaking"
  | "completed"
  | "failed";

export type LiveParticipantStatuses = Record<string, LiveParticipantStatus>;

export type ModelProvider = {
  name: string;
  generateSearchIntents?(
    participant: ModelParticipant,
    topic: string,
    options?: MeetingPromptOptions,
  ): Promise<SearchIntent[]>;
  generateSearchQueries?(
    participant: ModelParticipant,
    topic: string,
    options?: MeetingPromptOptions,
  ): Promise<string[]>;
  generateIndependentView(
    participant: ModelParticipant,
    topic: string,
    evidencePack?: EvidencePack,
    options?: MeetingPromptOptions,
  ): Promise<string>;
  generateResponse(
    participant: ModelParticipant,
    topic: string,
    previousTurns: MeetingTurn[],
    evidencePack?: EvidencePack,
    options?: MeetingPromptOptions,
  ): Promise<string>;
  generateSummary(
    topic: string,
    turns: MeetingTurn[],
    evidencePack?: EvidencePack,
    options?: MeetingPromptOptions,
  ): Promise<MeetingSummary>;
  generateSummaryForParticipant?(
    participant: ModelParticipant,
    topic: string,
    turns: MeetingTurn[],
    evidencePack?: EvidencePack,
    options?: MeetingPromptOptions,
  ): Promise<MeetingSummary>;
};

export type ModelsApiResponse = {
  mode: RoundtableMode;
  models: ModelParticipant[];
  unavailableProviders: UnavailableProvider[];
  error?: string;
};

export type MeetingApiResponse = {
  mode: RoundtableMode;
  meeting: MeetingResult;
  error?: string;
};
