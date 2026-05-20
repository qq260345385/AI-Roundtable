import { describe, expect, test } from "vitest";
import {
  getUnsupportedCapabilityNotes,
  inferModelCapabilities,
} from "./model-capabilities";
import { getUiText } from "../i18n/ui-text";
import type { ModelParticipant } from "../types";

const baseParticipant: ModelParticipant = {
  id: "model-1",
  name: "Model 1",
  provider: "Provider",
  model: "model-1",
  status: "available",
  statusLabel: "已连接",
};

describe("getUnsupportedCapabilityNotes", () => {
  test("returns a compact unknown warning when both capabilities are not declared", () => {
    const notes = getUnsupportedCapabilityNotes(baseParticipant, getUiText("zh"));

    expect(notes).toEqual(["文档/图片能力未声明"]);
  });

  test("omits warnings for supported capabilities", () => {
    const notes = getUnsupportedCapabilityNotes(
      {
        ...baseParticipant,
        capabilities: {
          nativeEvidenceAttachments: true,
          documentRecognition: true,
          imageRecognition: true,
        },
      },
      getUiText("zh"),
    );

    expect(notes).toEqual([]);
  });

  test("returns English labels", () => {
    const notes = getUnsupportedCapabilityNotes(baseParticipant, getUiText("en"));

    expect(notes).toEqual(["document/image capability not declared"]);
  });

  test("only warns about images when a model supports documents but not images", () => {
    const notes = getUnsupportedCapabilityNotes(
      {
        ...baseParticipant,
        capabilities: {
          nativeEvidenceAttachments: false,
          documentRecognition: true,
          imageRecognition: false,
        },
      },
      getUiText("zh"),
    );

    expect(notes).toEqual(["不支持图片识别"]);
  });

  test("does not infer provider capabilities from model names by default", () => {
    expect(inferModelCapabilities("DeepSeek", "deepseek-v4-flash")).toEqual({
      nativeEvidenceAttachments: false,
      nativeEvidenceAttachmentsStatus: "unknown",
      documentRecognition: false,
      documentRecognitionStatus: "unknown",
      imageRecognition: false,
      imageRecognitionStatus: "unknown",
      source: "default",
    });
  });

  test("uses configured provider capabilities instead of model-name whitelists", () => {
    expect(
      inferModelCapabilities("DeepSeek", "deepseek-v4-flash", {
        nativeEvidenceAttachments: false,
        nativeEvidenceAttachmentsStatus: "unsupported",
        documentRecognition: true,
        documentRecognitionStatus: "supported",
        imageRecognition: false,
        imageRecognitionStatus: "unsupported",
        source: "env",
      }),
    ).toEqual({
      nativeEvidenceAttachments: false,
      nativeEvidenceAttachmentsStatus: "unsupported",
      documentRecognition: true,
      documentRecognitionStatus: "supported",
      imageRecognition: false,
      imageRecognitionStatus: "unsupported",
      source: "env",
    });
  });
});
