import type { UiText } from "../i18n/ui-text";
import type { ModelParticipant } from "../types";
import type {
  CapabilitySupportStatus,
  EvidenceAttachmentCapabilities,
} from "../search/evidence-pack";

const DEFAULT_CAPABILITIES: EvidenceAttachmentCapabilities = {
  nativeEvidenceAttachments: false,
  nativeEvidenceAttachmentsStatus: "unknown",
  documentRecognition: false,
  documentRecognitionStatus: "unknown",
  imageRecognition: false,
  imageRecognitionStatus: "unknown",
  source: "default",
};

export function inferModelCapabilities(
  _providerName: string,
  _modelName: string,
  configuredCapabilities?: EvidenceAttachmentCapabilities,
): EvidenceAttachmentCapabilities {
  if (configuredCapabilities) {
    return configuredCapabilities;
  }

  return DEFAULT_CAPABILITIES;
}

export function getUnsupportedCapabilityNotes(
  participant: ModelParticipant,
  text: UiText,
): string[] {
  const notes: string[] = [];
  const documentStatus = getCapabilityStatus(
    participant.capabilities,
    "documentRecognition",
    "documentRecognitionStatus",
  );
  const imageStatus = getCapabilityStatus(
    participant.capabilities,
    "imageRecognition",
    "imageRecognitionStatus",
  );
  const lacksDocumentRecognition = documentStatus === "unsupported";
  const lacksImageRecognition = imageStatus === "unsupported";
  const unknownDocumentRecognition = documentStatus === "unknown";
  const unknownImageRecognition = imageStatus === "unknown";

  if (lacksDocumentRecognition && lacksImageRecognition) {
    return [
      text.participants.capabilityWarnings.noDocumentOrImageRecognition,
    ];
  }

  if (unknownDocumentRecognition && unknownImageRecognition) {
    return [
      text.participants.capabilityWarnings.unknownDocumentOrImageRecognition,
    ];
  }

  if (lacksDocumentRecognition) {
    notes.push(text.participants.capabilityWarnings.noDocumentRecognition);
  }

  if (lacksImageRecognition) {
    notes.push(text.participants.capabilityWarnings.noImageRecognition);
  }

  if (unknownDocumentRecognition) {
    notes.push(text.participants.capabilityWarnings.unknownDocumentRecognition);
  }

  if (unknownImageRecognition) {
    notes.push(text.participants.capabilityWarnings.unknownImageRecognition);
  }

  return notes;
}

function getCapabilityStatus(
  capabilities: EvidenceAttachmentCapabilities | undefined,
  booleanKey: "documentRecognition" | "imageRecognition",
  statusKey: "documentRecognitionStatus" | "imageRecognitionStatus",
): CapabilitySupportStatus {
  if (!capabilities) {
    return "unknown";
  }

  if (capabilities[statusKey]) {
    return capabilities[statusKey];
  }

  return capabilities[booleanKey] ? "supported" : "unsupported";
}
