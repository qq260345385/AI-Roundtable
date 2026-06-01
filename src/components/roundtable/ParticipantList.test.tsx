import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { getUiText } from "@/lib/i18n/ui-text";
import type { ModelParticipant } from "@/lib/types";
import { ParticipantList } from "./ParticipantList";

const participant: ModelParticipant = {
  id: "deepseek-v4-flash",
  name: "DeepSeek Flash",
  provider: "DeepSeek",
  model: "deepseek-v4-flash",
  status: "available",
  statusLabel: "Connected",
};

describe("ParticipantList", () => {
  test("shows a formatted model name without display-name prefixes", () => {
    const html = renderToStaticMarkup(
      <ParticipantList
        disabled={false}
        isLoading={false}
        mode="real"
        onSelectionChange={vi.fn()}
        participants={[participant]}
        selectedParticipantIds={[participant.id]}
        text={getUiText("en")}
      />,
    );

    expect(html).toContain("DeepSeek V4 Flash");
    expect(html).not.toContain("deepseek-v4-flash");
    expect(html).not.toContain("DeepSeek Flash deepseek-v4-flash");
    expect(html).not.toContain(">DeepSeek Flash<");
    expect(html).not.toContain("model:");
    expect(html).not.toContain("model：");
  });

  test("renders model cards inside a smooth capped scroll window", () => {
    const participants = Array.from({ length: 5 }, (_, index) => ({
      ...participant,
      id: `model-${index + 1}`,
      model: `model-${index + 1}`,
    }));

    const html = renderToStaticMarkup(
      <ParticipantList
        disabled={false}
        isLoading={false}
        mode="real"
        onSelectionChange={vi.fn()}
        participants={participants}
        selectedParticipantIds={participants.map((item) => item.id)}
        text={getUiText("en")}
      />,
    );

    expect(html).toContain("max-h-[19.5rem]");
    expect(html).toContain("overflow-y-auto");
    expect(html).toContain("scroll-smooth");
    expect(html).toContain("snap-y");
    expect(html).toContain("min-h-[6rem]");
    expect(html).toContain("snap-start");
  });
});
