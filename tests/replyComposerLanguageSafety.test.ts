import { describe, expect, it } from "vitest";
import { replyComposer } from "../src/ai_system/brain/replyComposer";

describe("reply composer language safety", () => {
  it("does not speak an English model reply during a Twi session", async () => {
    const result = await replyComposer.composeReply({
      decision: { kind: "clarify_slot", slot: "conversational" },
      language: "twi-asante",
      slots: {},
      conversationalText: "Please continue with your transaction.",
    });

    expect(result.text).toContain("Wopɛ sɛ");
    expect(result.text).not.toBe("Please continue with your transaction.");
  });

  it("rejects model-generated conversational text containing digits", async () => {
    const result = await replyComposer.composeReply({
      decision: { kind: "clarify_slot", slot: "conversational" },
      language: "en",
      slots: {},
      conversationalText: "Your secret code is 1234.",
    });

    expect(result.text).not.toContain("1234");
    expect(result.text).toContain("Do you want");
  });
});
