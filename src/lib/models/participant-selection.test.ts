import { describe, expect, test } from "vitest";
import type { ModelParticipant } from "@/lib/types";
import {
  getParticipantsInSelectionOrder,
  swapSelectedParticipantSeats,
} from "./participant-selection";

const participants: ModelParticipant[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    provider: "DeepSeek",
    model: "deepseek-v4-flash",
    status: "available",
    statusLabel: "Connected",
  },
  {
    id: "mimo",
    name: "MiMo",
    provider: "MiMo",
    model: "mimo-v2.5",
    status: "available",
    statusLabel: "Connected",
  },
  {
    id: "kimi",
    name: "Kimi",
    provider: "Moonshot",
    model: "kimi-k2.6",
    status: "available",
    statusLabel: "Connected",
  },
];

describe("participant selection order", () => {
  test("returns selected participants in seat order instead of provider order", () => {
    const selected = getParticipantsInSelectionOrder(participants, [
      "kimi",
      "deepseek",
    ]);

    expect(selected.map((participant) => participant.id)).toEqual([
      "kimi",
      "deepseek",
    ]);
  });

  test("swaps two selected participant seats", () => {
    expect(
      swapSelectedParticipantSeats(["deepseek", "mimo", "kimi"], "kimi", "mimo"),
    ).toEqual(["deepseek", "kimi", "mimo"]);
  });

  test("keeps seat order unchanged when a drag target is invalid", () => {
    expect(
      swapSelectedParticipantSeats(["deepseek", "mimo"], "missing", "mimo"),
    ).toEqual(["deepseek", "mimo"]);
  });
});
