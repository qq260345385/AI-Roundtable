import type { MeetingRequest } from "./types";

export const demoMeetingRequest: MeetingRequest = {
  topic: "AI Roundtable 应该如何体现不同大模型之间的真实讨论差异？",
  participants: [
    {
      id: "gpt-mock",
      name: "GPT Mock",
      provider: "OpenAI",
      model: "gpt-mock",
      status: "mock",
      statusLabel: "Mock / 无需 API",
      capabilities: {
        nativeEvidenceAttachments: false,
        documentRecognition: false,
        imageRecognition: false,
      },
    },
    {
      id: "claude-mock",
      name: "Claude Mock",
      provider: "Anthropic",
      model: "claude-mock",
      status: "mock",
      statusLabel: "Mock / 无需 API",
      capabilities: {
        nativeEvidenceAttachments: false,
        documentRecognition: false,
        imageRecognition: false,
      },
    },
    {
      id: "gemini-mock",
      name: "Gemini Mock",
      provider: "Google",
      model: "gemini-mock",
      status: "mock",
      statusLabel: "Mock / 无需 API",
      capabilities: {
        nativeEvidenceAttachments: false,
        documentRecognition: false,
        imageRecognition: false,
      },
    },
    {
      id: "deepseek-mock",
      name: "DeepSeek Mock",
      provider: "DeepSeek",
      model: "deepseek-mock",
      status: "mock",
      statusLabel: "Mock / 无需 API",
      capabilities: {
        nativeEvidenceAttachments: false,
        documentRecognition: false,
        imageRecognition: false,
      },
    },
  ],
};
