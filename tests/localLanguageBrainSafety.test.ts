import { describe, expect, it } from "vitest";
import { localLanguageBrain } from "../src/ai_system/providers/LocalLanguageBrain";

describe("local language understanding safety", () => {
  it("does not invent a recipient or default a missing network", async () => {
    const result = await localLanguageBrain.understand({
      text: "send 30 to 0551234567",
    });

    expect(result.entities.recipientPhone).toBe("0551234567");
    expect(result.entities.network).toBeUndefined();
    expect(result.requestedAction.arguments.network).toBeUndefined();
    expect(result.requestedAction.arguments.recipientName).toBeUndefined();
  });

  it("never proposes execution solely from a confirmation utterance", async () => {
    const unbound = await localLanguageBrain.understand({ text: "yes" });
    expect(unbound.intent).toBe("CONFIRM");
    expect(unbound.requestedAction.tool).toBeNull();

    expect(unbound.requestedAction.type).toBe("UNBOUND_CONFIRMATION");
  });

  it("clears the previous phone when the caller changes the recipient", async () => {
    const corrected = await localLanguageBrain.understand({
      text: "Not Ama. Send it to Kofi",
      previousSlots: {
        amount: 30,
        recipientName: "Ama",
        recipientPhone: "0551234567",
        network: "MTN",
      },
    });

    expect(corrected.entities.recipientName).toBe("Kofi");
    expect(corrected.entities.recipientPhone).toBeUndefined();
    expect(corrected.correction?.isCorrection).toBe(true);
    expect(corrected.requestedAction.type).not.toBe("PREPARE_TRANSFER");
  });
});
