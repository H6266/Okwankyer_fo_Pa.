import { describe, expect, it, vi } from "vitest";
import { groqClient } from "../src/services/groq/groqClient";
import { buildGroqBrainPrompt, isGroqBrainContract } from "../src/services/groq/groqReasoner";
import { ModelOutputContract } from "../src/ai_system/brain/types";

describe("Groq AI LPU configuration & reasoner", () => {
  it("defaults to Groq cloud API endpoint and fast llama-3.3-70b-versatile model", () => {
    vi.stubEnv("GROQ_BASE_URL", "");
    vi.stubEnv("GROQ_MODEL", "");
    vi.stubEnv("GROQ_API_KEY", "gsk_live_valid_test_key_1234567890abcdef");

    expect(groqClient.getBaseUrl()).toBe("https://api.groq.com/openai/v1");
    expect(groqClient.getModel()).toBe("llama-3.3-70b-versatile");
    expect(groqClient.getTimeoutMs()).toBe(3000);
    expect(groqClient.isAvailable()).toBe(true);
  });

  it("allows overriding model via GROQ_MODEL", () => {
    vi.stubEnv("GROQ_MODEL", "llama-3.1-8b-instant");
    expect(groqClient.getModel()).toBe("llama-3.1-8b-instant");
  });

  it("validates a compliant ModelOutputContract", () => {
    const contract: ModelOutputContract = {
      intent: {
        id: "momo.transfer",
        confidence: 0.94,
      },
      slots: {
        amount: 25,
        recipient: {
          phone: "0244123456",
          name: "Kwame Mensah",
        },
        network: "MTN",
        reference: "groceries",
      },
      signals: {
        correction: false,
        interruption: false,
        user_confirmed: false,
      },
      reply: {
        text_en: "Confirm transfer of 25 Cedis to Kwame Mensah on MTN.",
        target_language: "twi-asante",
        reply_kind: "confirm",
      },
    };

    expect(isGroqBrainContract(contract)).toBe(true);
  });

  it("rejects non-compliant contracts missing required fields or having extra properties", () => {
    expect(isGroqBrainContract({ intent: { id: "momo.transfer" } })).toBe(false);
    expect(isGroqBrainContract(null)).toBe(false);
    expect(isGroqBrainContract("invalid")).toBe(false);
  });

  it("grounds Groq in supported Ghanaian languages, masks draft PII, and leaves prompt selection to code", () => {
    const prompt = buildGroqBrainPrompt(
      "Send 50 cedis to [PHONE_MASKED]",
      {
        amount: 50,
        recipient: {
          phone: "0244123456",
          name: "Ama Serwaa",
        },
      },
      {
        targetLanguage: "twi-asante",
        intent: "momo.transfer",
        currentStep: "enter-amount",
      }
    );

    expect(prompt).toContain('"target_language": "twi-asante"');
    expect(prompt).toContain('"phone": null');
    expect(prompt).toContain('[RECIPIENT_NAME_PRESENT]');
    expect(prompt).not.toContain("0244123456");
  });
});
