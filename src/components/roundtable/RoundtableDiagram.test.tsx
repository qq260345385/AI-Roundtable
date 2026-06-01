import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { getUiText } from "@/lib/i18n/ui-text";
import type { ModelParticipant } from "@/lib/types";
import { RoundtableDiagram } from "./RoundtableDiagram";

const participant: ModelParticipant = {
  id: "deepseek-v4-flash",
  name: "DeepSeek Flash deepseek-v4-flash",
  provider: "DeepSeek",
  model: "deepseek-v4-flash",
  status: "available",
  statusLabel: "Connected",
};

describe("RoundtableDiagram", () => {
  test("shows a formatted model name in seat cards", () => {
    const html = renderToStaticMarkup(
      <RoundtableDiagram participants={[participant]} text={getUiText("en")} />,
    );

    expect(html).toContain(">DeepSeek V4 Flash<");
    expect(html).not.toContain(">deepseek-v4-flash<");
    expect(html).not.toContain("DeepSeek Flash deepseek-v4-flash");
  });

  test("uses pointer-driven seat cards when reordering is enabled", () => {
    const html = renderToStaticMarkup(
      <RoundtableDiagram
        onSeatSwap={() => undefined}
        participants={[
          participant,
          { ...participant, id: "mimo", model: "mimo-v2.5" },
        ]}
        text={getUiText("en")}
      />,
    );

    expect(html).not.toContain('draggable="true"');
    expect(html).toContain("data-seat-participant-id");
    expect(html).toContain("cursor-grab");
    expect(html).toContain("touch-none");
    expect(html).toContain("select-none");
  });
});
