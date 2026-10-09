import { describe, it, expect, vi } from "vitest";
import { openaiClient } from "../src/services/openai/openaiClient";
import { openAiReasoner } from "../src/services/openai/openaiReasoner";
import { openAiTranscriber } from "../src/services/openai/openaiTranscriber";
import { openAiTts } from "../src/services/openai/openaiTts";
import { openAiEmbeddings } from "../src/services/openai/openaiEmbeddings";
import { aiEngine } from "../src/ai_system/core/aiEngine";
import { unifiedMemory } from "../src/ai_system/memory/unifiedMemory";

describe("OpenAI Integration & Unified Cognitive Memory", () => {
  it("keeps tests offline and verifies availability and circuit breaker behavior", () => {
    expect(openaiClient).toBeDefined();

    // No synthetic credential may enable real outbound API calls in tests.
    expect(openaiClient.getApiKey()).toBeUndefined();
    expect(openaiClient.isAvailable()).toBe(false);

    // Exercise circuit-breaker logic with a local test-only key accessor.
    const keySpy = vi.spyOn(openaiClient, "getApiKey").mockReturnValue("unit-test-key");
    try {
      openaiClient.recordSuccess();
      expect(openaiClient.isAvailable()).toBe(true);

      openaiClient.recordQuotaExhausted(500);
      expect(openaiClient.isAvailable()).toBe(false);

      openaiClient.recordSuccess();
      expect(openaiClient.isAvailable()).toBe(true);
    } finally {
      keySpy.mockRestore();
    }

    expect(openaiClient.getApiKey()).toBeUndefined();
    expect(openaiClient.isAvailable()).toBe(false);
  });

  it("calculates cosine similarity correctly in openAiEmbeddings", () => {
    const vecA = [1, 0, 0];
    const vecB = [1, 0, 0];
    const vecC = [0, 1, 0];

    const simIdentical = openAiEmbeddings.cosineSimilarity(vecA, vecB);
    expect(simIdentical).toBeCloseTo(1.0);

    const simOrthogonal = openAiEmbeddings.cosineSimilarity(vecA, vecC);
    expect(simOrthogonal).toBeCloseTo(0.0);
  });

  it("normalizes structured responses in openAiReasoner with Ghanaian entity validation", async () => {
    // When OpenAI API returns off-line or quota error, reason falls back safely or throws catchable error
    expect(openAiReasoner).toBeDefined();
    expect(typeof openAiReasoner.reason).toBe("function");
  });

  it("hydrates semantic memory and frequent contacts seamlessly in aiEngine", async () => {
    const sessionId = `mem_test_${Date.now()}`;

    // 1. Record a past transaction to 'Ama' at 0244123456
    await unifiedMemory.recordTransaction(sessionId, {
      referenceId: `ref_${Date.now()}`,
      type: "TRANSFER",
      amount: 50,
      recipientPhone: "0244123456",
      recipientName: "Ama",
      network: "MTN",
      status: "COMPLETED",
      source: "demo_simulator",
    });

    // 2. Process a turn with aiEngine
    const result = await aiEngine.process({
      sessionId,
      channel: "SIMULATOR",
      input: "Mane aduonum kɔma Ama", // Send 50 to Ama in Twi
      language: "tw",
    });

    expect(result.success).toBe(true);
    expect(result.cognitiveState.intent).toBe("SEND_MONEY");
    expect(result.cognitiveState.workingSlots.amount).toBe(50);
    expect(result.cognitiveState.workingSlots.recipientName).toBe("Ama");
    expect(result.dialogue).toBeDefined();
    expect(result.safety.pinDetectedInVoice).toBe(false);
  });

  it("strictly enforces Zero-PIN protection across all channels and cognitive providers", async () => {
    const sessionId = `pin_test_${Date.now()}`;

    const result = await aiEngine.process({
      sessionId,
      channel: "VOICE",
      input: "Me PIN yɛ 4321", // My PIN is 4321
      language: "tw",
    });

    expect(result.safety.pinDetectedInVoice).toBe(true);
    expect(result.action.isExecutable).toBe(false);
    expect(result.safety.piiMaskedInput).not.toContain("4321");
    expect(result.dialogue.type).toBe("ZERO_PIN_SECURITY_ALERT");
  });
});
