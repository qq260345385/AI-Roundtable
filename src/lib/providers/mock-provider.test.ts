import { describe, expect, test } from "vitest";
import { demoMeetingRequest } from "../mock-data";
import type { MeetingTurn } from "../types";
import { mockProvider } from "./mock-provider";

describe("mockProvider", () => {
  test("generates clearly different independent views for each mock model", async () => {
    const views: string[] = [];

    for (const participant of demoMeetingRequest.participants) {
      const view = await mockProvider.generateIndependentView(
        participant,
        demoMeetingRequest.topic,
      );
      views.push(view);
    }

    expect(views).toHaveLength(4);
    expect(views[0]).toContain("结构");
    expect(views[1]).toContain("边界");
    expect(views[2]).toContain("场景");
    expect(views[3]).toContain("落地");
    expect(new Set(views).size).toBe(4);
  });

  test("generates free responses based on previous independent views", async () => {
    const participant = demoMeetingRequest.participants[0];
    const previousTurns: MeetingTurn[] = [
      {
        id: "independent-claude",
        phaseId: "independent",
        speakerName: "Claude Mock",
        provider: "Anthropic",
        model: "claude-mock",
        content: "Claude Mock 关注概念边界。",
      },
      {
        id: "independent-gemini",
        phaseId: "independent",
        speakerName: "Gemini Mock",
        provider: "Google",
        model: "gemini-mock",
        content: "Gemini Mock 关注使用场景。",
      },
    ];

    const response = await mockProvider.generateResponse(
      participant,
      demoMeetingRequest.topic,
      previousTurns,
    );

    expect(response).toContain("1号");
    expect(response).toContain("2号");
    expect(response).not.toContain("Claude Mock");
    expect(response).not.toContain("Gemini Mock");
    expect(response).toContain("部分同意");
  });

  test("summarizes consensus, differences, minority views, risks, and next steps", async () => {
    const summary = await mockProvider.generateSummary(
      demoMeetingRequest.topic,
      [],
    );

    expect(summary.consensus.length).toBeGreaterThan(0);
    expect(summary.differences.length).toBeGreaterThan(0);
    expect(summary.minorityViews.length).toBeGreaterThan(0);
    expect(summary.risks.length).toBeGreaterThan(0);
    expect(summary.nextSteps.length).toBeGreaterThan(0);
  });
});
