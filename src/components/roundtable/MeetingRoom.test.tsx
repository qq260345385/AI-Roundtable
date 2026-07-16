import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { getUiText } from "@/lib/i18n/ui-text";
import type { MeetingResult, ModelParticipant } from "@/lib/types";
import { MeetingRoom } from "./MeetingRoom";

const participants: ModelParticipant[] = [
  {
    id: "alpha",
    name: "Alpha",
    provider: "AlphaAI",
    model: "alpha-large",
    status: "available",
    statusLabel: "Connected",
  },
];

const completedMeeting: MeetingResult = {
  topic: "是否上线新流程",
  phases: [
    {
      id: "independent",
      title: "独立观点",
      description: "分别判断。",
      turns: [],
    },
  ],
  summary: {
    consensus: ["先试点。"],
    differences: ["试点范围尚有分歧。"],
    minorityViews: [],
    risks: ["执行成本。"],
    nextSteps: ["指定负责人。"],
    decisionBrief: {
      recommendation: "先进行一个可逆的两周试点。",
      status: "tentative",
      rationale: ["能快速验证关键假设"],
      conditions: ["明确负责人"],
      risks: ["样本不足"],
      confidence: "medium",
      evidenceGaps: ["长期数据不足"],
      reversalConditions: ["关键指标下降"],
      nextAction: "今天指定负责人。",
    },
  },
};

function renderRoom(
  meeting: MeetingResult,
  options: { activeStageId: string; isCompleted: boolean; isLive: boolean },
) {
  return renderToStaticMarkup(
    <MeetingRoom
      activeStageId={options.activeStageId}
      copyMessage=""
      isCompleted={options.isCompleted}
      isLive={options.isLive}
      meeting={meeting}
      onBackToSetup={() => undefined}
      onCopyMarkdown={() => undefined}
      onStageChange={() => undefined}
      onStopMeeting={() => undefined}
      participantStatuses={{}}
      participants={participants}
      statusMessage=""
      statusType={options.isLive ? "loading" : "success"}
      text={getUiText("zh")}
    />,
  );
}

describe("MeetingRoom", () => {
  test("shows the completed decision before collapsed traceability and removes the sidebar", () => {
    const html = renderRoom(completedMeeting, {
      activeStageId: "summary",
      isCompleted: true,
      isLive: false,
    });

    expect(html).toContain("先进行一个可逆的两周试点。");
    expect(html).toContain("详细过程与依据");
    expect(html.indexOf("先进行一个可逆的两周试点。")).toBeLessThan(
      html.indexOf("详细过程与依据"),
    );
    expect(html).not.toContain("Alpha Large");
    expect(html).not.toContain("lg:grid-cols-[310px_1fr]");
  });

  test("does not expose a recommendation before the meeting is completed", () => {
    const html = renderRoom(completedMeeting, {
      activeStageId: "summary",
      isCompleted: false,
      isLive: true,
    });

    expect(html).not.toContain("先进行一个可逆的两周试点。");
    expect(html).not.toContain("决策简报");
  });

  test("restores the participant sidebar on discussion stages", () => {
    const html = renderRoom(completedMeeting, {
      activeStageId: "independent",
      isCompleted: true,
      isLive: false,
    });

    expect(html).toContain("参会议员");
    expect(html).toContain("lg:grid-cols-[310px_1fr]");
  });

  test("keeps live stop controls and the sticky participant list", () => {
    const html = renderRoom(completedMeeting, {
      activeStageId: "independent",
      isCompleted: false,
      isLive: true,
    });

    expect(html).toContain("终止会议");
    expect(html).not.toContain("返回编辑");
    expect(html).toContain("lg:sticky");
    expect(html).toContain("Alpha Large");
  });

  test("keeps the compact consensus, differences, and next-step stage", () => {
    const html = renderRoom(completedMeeting, {
      activeStageId: "summary",
      isCompleted: false,
      isLive: true,
    });

    expect(html).toContain("共识");
    expect(html).toContain("分歧");
    expect(html).toContain("下一步");
    expect(html).not.toContain("详细过程与依据");
  });

  test("keeps legacy completed meetings usable when a decision brief is absent", () => {
    const meeting: MeetingResult = {
      ...completedMeeting,
      summary: { ...completedMeeting.summary, decisionBrief: undefined },
    };
    const html = renderRoom(meeting, {
      activeStageId: "summary",
      isCompleted: true,
      isLive: false,
    });

    expect(html).toContain("详细过程与依据");
    expect(html).not.toContain("决策简报");
    expect(html).not.toContain("Alpha Large");
  });
});
