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
  test("shows the model id as the visible participant label without display-name prefixes", () => {
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

    expect(html).toContain("deepseek-v4-flash");
    expect(html).not.toContain("DeepSeek Flash deepseek-v4-flash");
    expect(html).not.toContain(">DeepSeek Flash<");
    expect(html).not.toContain("model:");
    expect(html).not.toContain("model：");
  });
});
