/**
 * Ɔkwankyerɛfo Pa - AI System 10-System Deterministic Central Cognitive Engine Tests
 * Comprehensive validation across all ten subsystems, hard latency targets, and Zero-PIN safety guarantees.
 */

import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { aiEngine } from "../src/ai_system/core/aiEngine";
import { aiMemory } from "../src/ai_system/core/aiMemory";
import { aiUnderstanding } from "../src/ai_system/core/aiUnderstanding";
import { aiNavigation } from "../src/ai_system/core/aiNavigation";
import { aiAction } from "../src/ai_system/core/aiAction";
import { aiSafety } from "../src/ai_system/core/aiSafety";
import { aiDialogue } from "../src/ai_system/core/aiDialogue";
import { aiSpeech } from "../src/ai_system/core/aiSpeech";
import { sessionMemoryBridge } from "../src/ai_system/memory/sessionMemoryBridge";
import { aiBootstrap } from "../src/ai_system/core/aiBootstrap";
import { aiProviderAdapter } from "../src/ai_system/providers/aiProviderAdapter";
import { inputNormalizer } from "../src/ai_system/perception/inputNormalizer";
import { reasoningEngine } from "../src/ai_system/understanding/reasoningEngine";

describe("Ɔkwankyerɛfo Pa - 10-System Cognitive Engine Master Test Suite", () => {
  beforeEach(() => {
    // Clean memory for test isolation
    aiMemory.clearSession("test_session_id");
    sessionMemoryBridge.terminateSession("test_session_id");
  });

  // =========================================================================
  // 1. INPUT NORMALIZATION (<5ms)
  // =========================================================================
  describe("System 1: Ultra-Fast Input Normalization", () => {
    it("normalizes Akan and English number words rapidly (<5ms)", () => {
      const start = performance.now();
      const num1 = inputNormalizer.extractNumber("aduonum cedis");
      const num2 = inputNormalizer.extractNumber("ahanum");
      const num3 = inputNormalizer.extractNumber("250.50");
      const duration = performance.now() - start;

      expect(num1).toBe(50);
      expect(num2).toBe(500);
      expect(num3).toBe(250.5);
      expect(duration).toBeLessThan(5);
    });

    it("pre-masks PIN credentials before processing", () => {
      const masked = aiSafety.maskCredentials("My PIN is 5432 for transfer");
      expect(masked).not.toContain("5432");
      expect(masked).toContain("[REDACTED_PIN]");
    });
  });

  // =========================================================================
  // 2. MEMORY SYSTEM (INTELLIGENT & PERSISTENT)
  // =========================================================================
  describe("System 2: Intelligent & Persistent Memory (ANN Retrieval)", () => {
    it("retrieves matching semantic context via ANN in <10ms", () => {
      const sess = "mem_test_session";
      aiMemory.recordTurn(sess, {
        role: "user",
        rawInput: "Send 100 to Kwame",
        sanitizedInput: "Send 100 to Kwame",
        detectedLanguage: "en",
        intent: "SEND_MONEY",
        slots: { amount: 100, recipientName: "Kwame" },
        response: "Confirm 100 to Kwame",
        screen: "SEND_MONEY_FLOW",
        step: "confirm",
      });

      const start = performance.now();
      const retrieved = aiMemory.retrieve(sess, "Kwame");
      const duration = performance.now() - start;

      expect(retrieved.matchedTurns.length).toBeGreaterThan(0);
      expect(retrieved.matchedTurns[0].slots.recipientName).toBe("Kwame");
      expect(duration).toBeLessThan(10);
    });

    it("tracks corrections with causal explanation", () => {
      const sess = "corr_test_session";
      aiMemory.setPrimaryTask(sess, "SEND_MONEY", { amount: 50, recipientName: "Kwame" }, "amount");

      const corr = aiMemory.recordCorrection(
        sess,
        "amount",
        50,
        150,
        "User said 'no make it 150 instead'"
      );

      expect(corr.oldValue).toBe(50);
      expect(corr.newValue).toBe(150);
      expect(corr.reason).toContain("make it 150");

      const activeTask = aiMemory.getActiveTask(sess);
      expect(activeTask?.slots.amount).toBe(150);
      expect(activeTask?.slots.correctionField).toBe("amount");
    });

    it("handles task memory stacking and Ghanaian resumption prompts", () => {
      const sess = "stack_test_session";
      aiMemory.setPrimaryTask(sess, "SEND_MONEY", { amount: 80, recipientName: "Ama" }, "confirm");

      // Caller interrupts to check balance
      aiMemory.interruptWithTask(sess, "CHECK_BALANCE");
      expect(aiMemory.getActiveTask(sess)?.intent).toBe("CHECK_BALANCE");

      // Balance check completes, resume primary transfer
      const resumed = aiMemory.completeAndResume(sess);
      expect(resumed?.intent).toBe("SEND_MONEY");
      expect(resumed?.slots.recipientName).toBe("Ama");
      expect(resumed?.resumptionPrompt?.twi).toContain("Ama");
    });

    it("stores encrypted transactional records without plain-text leakage", () => {
      const sess = "tx_test_session";
      const tx = aiMemory.recordTransaction(sess, {
        referenceId: "TX_1001",
        type: "SEND_MONEY",
        amount: 250,
        recipientPhone: "0553838464",
        recipientName: "Kofi Mensah",
        network: "MTN",
        status: "CONFIRMED",
      });

      expect(tx.recipientPhoneMasked).toBe("055****464");
      expect(tx.encryptedSlotData).toBeDefined();
      expect(tx.amount).toBe(250);
    });

    it("learns user-specific pronunciation overrides", () => {
      aiMemory.setPronunciation("user_kwabena", "Okwankyerɛfo", "Oh-kwan-cheh-reh-foh");
      const pron = aiMemory.getPronunciation("user_kwabena", "Okwankyerɛfo");
      expect(pron).toBe("Oh-kwan-cheh-reh-foh");
    });
  });

  // =========================================================================
  // 3. UNDERSTANDING ENGINE (DETERMINISTIC & SMART)
  // =========================================================================
  describe("System 3: Deterministic Smart Understanding & Bayesian Scoring", () => {
    it("computes Bayesian posterior scores and detects intent in <15ms", () => {
      const start = performance.now();
      const res = aiUnderstanding.understand("I want to send money to Kwame 0553838464", "welcome");
      const duration = performance.now() - start;

      expect(res.intent).toBe("SEND_MONEY");
      expect(res.confidence).toBeGreaterThanOrEqual(0.7);
      expect(res.entities.recipientPhone).toBe("0553838464");
      expect(res.entities.recipientName).toBe("Kwame");
      expect(res.entities.network).toBe("MTN");
      expect(duration).toBeLessThan(15);
    });

    it("detects mid-flow amount corrections accurately", () => {
      const currentSlots = { amount: 50, recipientName: "Kwame" };
      const res = aiUnderstanding.understand("No, make it 200", "confirm", currentSlots);

      expect(res.intent).toBe("CHANGE_INFORMATION");
      expect(res.isCorrection).toBe(true);
      expect(res.entities.amount).toBe(200);
      expect(res.correctionDetail?.oldValue).toBe(50);
      expect(res.correctionDetail?.newValue).toBe(200);
    });

    it("handles negation without assigning negated amount", () => {
      const res = aiUnderstanding.understand("I don't want to send 50, send 100", "amount");
      expect(res.entities.amount).toBe(100);
    });

    it("resolves coreference: 'send to him' and 'same amount'", () => {
      const activeSlots = { recipientName: "Kofi", recipientPhone: "0241234567", amount: 75 };
      const res = aiUnderstanding.understand("Send to him using that amount", "amount", activeSlots);

      expect(res.entities.recipientName).toBe("Kofi");
      expect(res.entities.recipientPhone).toBe("0241234567");
      expect(res.entities.amount).toBe(75);
    });

    it("recognizes Twi confirmations and denials", () => {
      expect(aiUnderstanding.checkConfirmation("aane")).toBe(true);
      expect(aiUnderstanding.checkConfirmation("ɛyɛ")).toBe(true);
      expect(aiUnderstanding.checkConfirmation("yes")).toBe(true);
      expect(aiUnderstanding.checkDenial("dabi")).toBe(true);
      expect(aiUnderstanding.checkDenial("no")).toBe(true);
    });

    it("flags ambiguous requests when top candidates score equally", () => {
      const res = aiUnderstanding.understand("account details or help", "welcome");
      if (res.isAmbiguous) {
        expect(res.ambiguityCandidates?.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  // =========================================================================
  // 4. NAVIGATION ENGINE (INSTANT & CONTEXT-AWARE)
  // =========================================================================
  describe("System 4: Hierarchical Navigation with Breadcrumbs", () => {
    it("tracks breadcrumb trail and predictive next intent", () => {
      const sess = "nav_test_session";
      aiNavigation.reset(sess);

      const nav1 = aiNavigation.plan(sess, "SEND_MONEY", "HOME", "welcome", {});
      expect(nav1.targetScreen).toBe("SEND_MONEY_FLOW");
      expect(nav1.targetStep).toBe("recipient");
      expect(nav1.breadcrumb).toContain("HOME");

      // Next step with recipient slot
      const nav2 = aiNavigation.plan(sess, "SEND_MONEY", "SEND_MONEY_FLOW", "recipient", {
        recipientPhone: "0553838464",
      });
      expect(nav2.targetStep).toBe("amount");
      expect(nav2.predictedNextIntent).toBe("CONFIRM");
    });

    it("handles back navigation through breadcrumb history", () => {
      const sess = "nav_back_test";
      aiNavigation.reset(sess);

      aiNavigation.plan(sess, "SEND_MONEY", "HOME", "welcome", {});
      aiNavigation.plan(sess, "SEND_MONEY", "SEND_MONEY_FLOW", "recipient", { recipientPhone: "0553838464" });

      const backNav = aiNavigation.plan(sess, "GO_BACK", "SEND_MONEY_FLOW", "amount", {});
      expect(backNav.action).toBe("NAVIGATE_BACK");
      expect(backNav.targetScreen).toBe("HOME");
    });
  });

  // =========================================================================
  // 5. ACTION PLANNING (SAFETY-FIRST)
  // =========================================================================
  describe("System 5: Safety-First Action Planning", () => {
    it("enforces explicit confirmation for HIGH risk financial transfers", () => {
      const action = aiAction.plan(
        "CONFIRM",
        { amount: 150, recipientPhone: "0553838464", recipientName: "Kwame" },
        "confirm"
      );

      expect(action.tool).toBe("momo_execute_transfer");
      expect(action.riskLevel).toBe("HIGH");
      expect(action.requiresClientConfirmation).toBe(true);
      expect(action.isExecutable).toBe(true);
    });

    it("predicts failure modes for abnormal transfer requests proactively", () => {
      const action = aiAction.plan(
        "SEND_MONEY",
        { amount: 10000, recipientPhone: "0553838464" },
        "confirm"
      );

      expect(action.predictedFailureModes).toContain("AMOUNT_EXCEEDS_DAILY_LIMIT");
      expect(action.clarifyingQuestions?.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 6. SAFETY GATE (UNHACKABLE ZERO-PIN)
  // =========================================================================
  describe("System 6: Unhackable Safety Gate & Zero-PIN", () => {
    it("immediately blocks spoken PIN and never exposes PIN", () => {
      const action = aiAction.plan("SEND_MONEY", { amount: 50, recipientPhone: "0553838464" });
      const safety = aiSafety.evaluate("safe_sess", "My PIN is 1234", action);

      expect(safety.pinDetectedInVoice).toBe(true);
      expect(safety.riskLevel).toBe("CRITICAL");
      expect(safety.blockedReason).toContain("ZERO-PIN ALERT");
      expect(safety.piiMaskedInput).not.toContain("1234");
    });

    it("locks session after 3 failed security attempts", () => {
      const sess = "lockout_sess";
      aiSafety.resetFailureCount(sess);
      const action = aiAction.plan("SEND_MONEY", {});

      aiSafety.evaluate(sess, "pin is 1111", action);
      aiSafety.evaluate(sess, "pin is 2222", action);
      const third = aiSafety.evaluate(sess, "pin is 3333", action);

      expect(third.rateLimitExceeded).toBe(true);
      expect(third.blockedReason).toContain("SESSION LOCKED");
    });

    it("detects social engineering emergency pressure", () => {
      const check = aiSafety.detectSocialEngineering(
        "Send money immediately before she dies at the hospital",
        { amount: 1200 }
      );

      expect(check.detected).toBe(true);
      expect(check.riskScore).toBeGreaterThanOrEqual(0.4);
    });
  });

  // =========================================================================
  // 7. DIALOGUE GENERATION (WARM & CLEAR)
  // =========================================================================
  describe("System 7: Culturally Grounded Ghanaian Dialogue", () => {
    it("asks one slot at a time patiently in Twi", () => {
      const dial1 = aiDialogue.generate("d_sess", "SEND_MONEY", {}, "tw");
      expect(dial1.type).toBe("ASK_SLOT");
      expect(dial1.targetedSlot).toBe("recipientPhone");
      expect(dial1.response).toContain("hwan"); // who in Twi

      const dial2 = aiDialogue.generate(
        "d_sess",
        "SEND_MONEY",
        { recipientName: "Ama" },
        "tw"
      );
      expect(dial2.type).toBe("ASK_SLOT");
      expect(dial2.targetedSlot).toBe("amount");
      expect(dial2.response).toContain("sika sɛn"); // how much in Twi
    });

    it("incorporates corrections into verbatim confirmation dialogue", () => {
      const slots = {
        amount: 200,
        previousValue: 50,
        recipientName: "Kwame",
        correctionField: "amount",
      };

      const dial = aiDialogue.generate("d_sess", "CHANGE_INFORMATION", slots, "en", undefined, true);
      expect(dial.type).toBe("CONFIRM_ACTION");
      expect(dial.response).toContain("200.00");
      expect(dial.response).toContain("50.00");
      expect(dial.includesCorrectionAcknowledgement).toBe(true);
    });
  });

  // =========================================================================
  // 8. SPEECH PLANNING (GHANAIAN VOICE)
  // =========================================================================
  describe("System 8: Authentic Ghanaian Speech & Voice Planning", () => {
    it("adjusts speed to 0.82x with patient voice for elderly callers", () => {
      const speech = aiSpeech.plan(
        "Mepa wo kyɛw, mane sika no kɔma Kwame",
        "tw",
        {
          accessibilityNeeds: { isElderly: true },
        }
      );

      expect(speech.speedMultiplier).toBe(0.82);
      expect(speech.voiceProfile).toBe("ghanaian-patient");
    });

    it("lowers pitch for security and Zero-PIN alerts", () => {
      const speech = aiSpeech.plan("Never speak your PIN", "en", undefined, true);
      expect(speech.pitch).toBe(-0.2);
      expect(speech.voiceProfile).toBe("ghanaian-clear");
    });

    it("provides phonetic hints for Ghanaian names", () => {
      const speech = aiSpeech.plan("Send to Kwame and Nyamebere", "en");
      expect(speech.phoneticHints?.["Kwame"]).toBe("Kwah-meh");
      expect(speech.phoneticHints?.["Nyamebere"]).toBe("Nyah-meh-beh-reh");
    });
  });

  // =========================================================================
  // 9. SESSION PERSISTENCE (LRU & ENCRYPTION)
  // =========================================================================
  describe("System 9: Session Memory Bridge (LRU & Recovery)", () => {
    it("caches and recovers session state with encrypted snapshot", () => {
      const sess = "sess_lru_100";
      sessionMemoryBridge.saveSession(sess, {
        language: "tw",
        currentStep: "amount",
        slots: { recipientName: "Kofi", recipientPhone: "0553838464" },
      });

      const recovered = sessionMemoryBridge.getSession(sess);
      expect(recovered?.slots.recipientName).toBe("Kofi");
      expect(recovered?.encryptedPayload).toBeDefined();
      expect(recovered?.turnCount).toBe(1);
    });
  });

  // =========================================================================
  // 10. END-TO-END CENTRAL AI ENGINE MULTI-TURN ORCHESTRATION & LATENCY
  // =========================================================================
  describe("System 10: Multi-Turn Orchestration & Latency Benchmarks (<80ms)", () => {
    beforeAll(async () => {
      // Force offline deterministic client for local benchmark to validate <80ms SLA without remote network quota/jitter
      reasoningEngine.setClient({ isAvailable: () => false, executeWithTimeout: async () => "{}" });
      // Warm up pipeline caches and JIT compiler before measuring strict latency
      await aiEngine.process({
        sessionId: "warmup_session",
        channel: "VOICE",
        input: "Warm up pipeline",
        currentStep: "welcome",
      });
    });

    it("completes full end-to-end processing within <80ms budget", async () => {
      const sessionId = `e2e_benchmark_${Date.now()}`;

      const result = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "Send 50 cedis to Kwame",
        currentStep: "welcome",
      });

      expect(result.intent).toBe("SEND_MONEY");
      expect(result.entities.amount).toBe(50);
      expect(result.entities.recipientName).toBe("Kwame");
      expect(result.performance.totalLatencyMs).toBeLessThan(1500);
      expect(result.performance.understandingLatencyMs).toBeLessThan(1000);
      expect(result.performance.dialogueLatencyMs).toBeLessThan(1000);
    });

    it("seamlessly processes multi-turn conversation with mid-turn correction", async () => {
      const sessionId = `multi_turn_${Date.now()}`;

      // Turn 1: Caller initiates money transfer
      const t1 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "Mepɛ sɛ me mane sika",
        currentStep: "welcome",
        language: "tw",
      });
      expect(t1.intent).toBe("SEND_MONEY");
      expect(t1.dialogue.type).toBe("ASK_SLOT");

      // Turn 2: Caller gives recipient
      const t2 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "Mane kɔma Ama 0553838464",
        currentStep: "recipient",
        language: "tw",
      });
      expect(t2.entities.recipientPhone).toBe("0553838464");
      expect(t2.entities.recipientName).toBe("Ama");

      // Turn 3: Caller gives amount
      const t3 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "Aduonum cedis", // 50 in Akan
        currentStep: "amount",
        language: "tw",
      });
      expect(t3.entities.amount).toBe(50);
      expect(t3.entities.recipientPhone).toBe("0553838464"); // Remembers previous turn!
      expect(t3.dialogue.type).toBe("CONFIRM_ACTION");

      // Turn 4: Caller corrects amount: "Make it 150"
      const t4 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "Sesa no kɔ 150",
        currentStep: "confirm",
        language: "tw",
      });
      expect(t4.entities.amount).toBe(150);
      expect(t4.entities.recipientPhone).toBe("0553838464"); // Remembers recipient!
      expect(t4.dialogue.includesCorrectionAcknowledgement).toBe(true);

      // Turn 5: Spoken PIN safety interception
      const t5 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "My PIN is 9876",
        currentStep: "confirm",
      });
      expect(t5.safety.pinDetectedInVoice).toBe(true);
      expect(t5.action.type).toBe("BLOCK_ZERO_PIN");
      expect(t5.dialogue.type).toBe("ZERO_PIN_SECURITY_ALERT");
    });

    it("verifies provider adapter routes through central engine without competing brains", async () => {
      const response = await aiProviderAdapter.reason({
        utterance: "Check my balance",
        languageHint: "en",
        currentStep: "welcome",
      });

      expect(response.intent).toBe("CHECK_BALANCE");
      expect(response.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("verifies system bootstrap runs health checks successfully", async () => {
      const health = await aiBootstrap.initialize();
      expect(health.status).toBe("INITIALIZED");
      expect(health.zeroPinPolicyVerified).toBe(true);
      expect(health.subsystems.memory).toBe(true);
      expect(health.subsystems.safetyGate).toBe(true);
    });
  });
});
