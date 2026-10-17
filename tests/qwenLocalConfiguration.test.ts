import { afterEach, describe, expect, it, vi } from "vitest";
import { qwenClient } from "../src/services/qwen/qwenClient";
import { buildQwenBrainPrompt, isQwenBrainContract } from "../src/services/qwen/qwenReasoner";

describe("local Qwen configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses Ollama defaults and needs no API key in local mode", () => {
    vi.stubEnv("QWEN_MODE", "local");
    vi.stubEnv("QWEN_BASE_URL", "");
    vi.stubEnv("QWEN_MODEL", "");
    vi.stubEnv("QWEN_API_KEY", "");
    vi.stubEnv("DASHSCOPE_API_KEY", "");

    expect(qwenClient.isLocalMode()).toBe(true);
    expect(qwenClient.getBaseUrl()).toBe("http://127.0.0.1:11434/v1");
    expect(qwenClient.getModel()).toBe("qwen3:1.7b");
    expect(qwenClient.getApiKey()).toBe("ollama");
    expect(qwenClient.getTimeoutMs()).toBe(20000);
  });

  it("detects a loopback OpenAI-compatible endpoint as local", () => {
    vi.stubEnv("QWEN_MODE", "");
    vi.stubEnv("QWEN_BASE_URL", "http://localhost:11434/v1");
    vi.stubEnv("QWEN_API_KEY", "");
    vi.stubEnv("DASHSCOPE_API_KEY", "");

    expect(qwenClient.isLocalMode()).toBe(true);
    expect(qwenClient.getModel()).toBe("qwen3:1.7b");
  });

  it("preserves cloud defaults when local mode is not selected", () => {
    vi.stubEnv("QWEN_MODE", "");
    vi.stubEnv("QWEN_BASE_URL", "");
    vi.stubEnv("QWEN_MODEL", "");
    vi.stubEnv("QWEN_API_KEY", "");
    vi.stubEnv("DASHSCOPE_API_KEY", "");

    expect(qwenClient.isLocalMode()).toBe(false);
    expect(qwenClient.getBaseUrl()).toBe("https://dashscope-intl.aliyuncs.com/compatible-mode/v1");
    expect(qwenClient.getModel()).toBe("qwen-plus");
    expect(qwenClient.getApiKey()).toBeUndefined();
  });

  it("accepts only the brain contract and rejects model-selected audio fields", () => {
    const contract = {
      intent: { id: "momo.transfer", confidence: 0.9 },
      slots: { amount: 50, recipient: { phone: "0244123456", name: "Ama" } },
      signals: { correction: false, interruption: false, user_confirmed: false },
      reply: { text_en: "Please confirm the recipient.", target_language: "en", reply_kind: "clarify_slot" },
    };
    expect(isQwenBrainContract(contract)).toBe(true);
    expect(isQwenBrainContract({
      ...contract,
      reply: { ...contract.reply, prompt_id: "arbitrary-recording.mp3" },
    })).toBe(false);
    expect(isQwenBrainContract({
      ...contract,
      reply: { ...contract.reply, reply_kind: "clarify_slot" },
      audioUrl: "/audio/unapproved.mp3",
    })).toBe(false);
  });

  it("grounds Qwen in supported Ghanaian languages, masks draft PII, and leaves prompt selection to code", () => {
    const prompt = buildQwenBrainPrompt(
      "Mane sika ma Ama [PHONE_MASKED]",
      {
        amount: 25,
        recipient: { phone: "0241234567", name: "Ama" },
      },
      {
        targetLanguage: "twi-asante",
        intent: "momo.transfer",
        currentStep: "enter-amount",
        transactionState: "RECIPIENT_VERIFIED",
        recipientVerified: true,
      }
    );

    expect(prompt).toContain("Asante Twi");
    expect(prompt).toContain("Akuapem Twi");
    expect(prompt).toContain("Twi-English:");
    expect(prompt).toContain("Caller reply language is twi-asante");
    expect(prompt).toContain("Authoritative transaction state: RECIPIENT_VERIFIED");
    expect(prompt).toContain("Expected workflow stage: AMOUNT_PROMPT");
    expect(prompt).toContain("OP28");
    expect(prompt).toContain("ENTER_RECIPIENT:OP16 -> RECIPIENT_VERIFY:OP19");
    expect(prompt).toContain("State order is INITIATED -> RECIPIENT_VERIFIED -> AMOUNT_ENTERED");
    expect(prompt).toContain("means momo.cash_out, not momo.transfer");
    expect(prompt).toContain("means momo.check_balance");
    expect(prompt).toContain("networks: MTN, Telecel");
    expect(prompt).toContain("The application owns validation, state transitions, and next-step selection.");
    expect(prompt).not.toContain("0241234567");
    expect(prompt).not.toContain('"name":"Ama"');
    expect(prompt).toContain('"name":"[RECIPIENT_NAME_PRESENT]"');
  });
});
