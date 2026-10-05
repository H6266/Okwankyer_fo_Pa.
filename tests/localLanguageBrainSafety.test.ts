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
});
