import { describe, it, expect } from "vitest";
import { aiEngine } from "../src/ai_system/core/aiEngine";
import { languageDetector } from "../src/ai_system/perception/languageDetector";
import { inputNormalizer } from "../src/ai_system/perception/inputNormalizer";
import { intentEngine } from "../src/ai_system/understanding/intentEngine";
import { entityEngine } from "../src/ai_system/understanding/entityEngine";
import { correctionEngine } from "../src/ai_system/understanding/correctionEngine";
import { coreferenceResolver } from "../src/ai_system/understanding/coreferenceResolver";
import { negationEngine } from "../src/ai_system/understanding/negationEngine";
import { confidenceEngine } from "../src/ai_system/understanding/confidenceEngine";
import { routeResolver } from "../src/ai_system/navigation/routeResolver";
import { actionPlanner } from "../src/ai_system/actions/actionPlanner";
import { transactionGuard } from "../src/ai_system/safety/transactionGuard";
import { pronunciationEngine } from "../src/ai_system/speech/pronunciation/pronunciationEngine";
import { speechNormalizer } from "../src/ai_system/speech/speechNormalizer";
import { taskMemory } from "../src/ai_system/memory/taskMemory";
import { preferenceMemory } from "../src/ai_system/memory/preferenceMemory";
import { pronunciationMemory } from "../src/ai_system/memory/pronunciationMemory";
import { memoryPolicy } from "../src/ai_system/memory/memoryPolicy";
import { interruptionEngine } from "../src/ai_system/speech/interruptionEngine";
import { diagnosticsEngine } from "../src/ai_system/observability/diagnosticsEngine";

describe("Ɔkwankyerɛfo Pa - AI System Master Cognitive Test Suite", () => {
  // 1. Language Detection & Code-Switching
  describe("Perception & Language Detection", () => {
    it("detects English correctly", () => {
      expect(languageDetector.detect("I want to send money to Kwame")).toBe("en");
    });

    it("detects Akan / Twi correctly", () => {
      expect(languageDetector.detect("Mepɛ sɛ me mane sika")).toBe("tw");
    });

    it("detects Ghanaian Code-Switching correctly", () => {
      expect(languageDetector.detect("Me pɛ sɛ me send 100 kɔma Ama")).toBe("en-ak");
    });

    it("normalizes spoken Akan and English numbers", () => {
      expect(inputNormalizer.extractNumber("Send aduonum cedis")).toBe(50);
      expect(inputNormalizer.extractNumber("Mane ahanum kɔma Kwame")).toBe(500);
      expect(inputNormalizer.extractNumber("Send 200 cedis")).toBe(200);
    });
  });

  // 2. Intent Recognition
  describe("Intent Recognition Engine", () => {
    it("classifies 'Send money' as SEND_MONEY", () => {
      const match = intentEngine.classify("Send money");
      expect(match.intent).toBe("SEND_MONEY");
      expect(match.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("classifies 'Check my balance' as CHECK_BALANCE", () => {
      const match = intentEngine.classify("Check my balance");
      expect(match.intent).toBe("CHECK_BALANCE");
    });

    it("classifies Akan 'Me pɛ sɛ me check balance' as CHECK_BALANCE", () => {
      const match = intentEngine.classify("Me pɛ sɛ me check balance");
      expect(match.intent).toBe("CHECK_BALANCE");
    });

    it("classifies 'Take me home' as GO_HOME", () => {
      const match = intentEngine.classify("Take me home");
      expect(match.intent).toBe("GO_HOME");
    });

    it("classifies 'Go back' as GO_BACK", () => {
      const match = intentEngine.classify("Go back");
      expect(match.intent).toBe("GO_BACK");
    });

    it("classifies 'Repeat that' as REPEAT", () => {
      const match = intentEngine.classify("Repeat that");
      expect(match.intent).toBe("REPEAT");
    });

    it("classifies 'Cancel' as CANCEL", () => {
      const match = intentEngine.classify("Cancel");
      expect(match.intent).toBe("CANCEL");
    });

    it("classifies 'Yes' and 'Aane' as CONFIRM", () => {
      expect(intentEngine.classify("Yes").intent).toBe("CONFIRM");
      expect(intentEngine.classify("aane").intent).toBe("CONFIRM");
    });
  });

  // 3. Entity Extraction
  describe("Entity Understanding Engine", () => {
    it("extracts amount and recipient from 'Send 100 cedis to Kwame'", () => {
      const slots = entityEngine.extract("Send 100 cedis to Kwame");
      expect(slots.amount).toBe(100);
      expect(slots.currency).toBe("GHS");
      expect(slots.recipientName).toBe("Kwame");
    });

    it("extracts recipient phone and amount from 'Send 50 ma Kwame 0553838464'", () => {
      const slots = entityEngine.extract("Send 50 ma Kwame 0553838464");
      expect(slots.amount).toBe(50);
      expect(slots.recipientPhone).toBe("0553838464");
    });
  });

  // 4. Correction Intelligence
  describe("Correction Intelligence", () => {
    it("modifies only amount when user says 'Make it 200'", () => {
      const initialSlots = { amount: 100, recipientName: "Kwame", recipientPhone: "0553838464" };
      const correction = correctionEngine.applyCorrection("Make it 200", initialSlots);

      expect(correction.isCorrection).toBe(true);
      expect(correction.fieldModified).toBe("amount");
      expect(correction.updatedSlots.amount).toBe(200);
      expect(correction.updatedSlots.recipientName).toBe("Kwame");
    });

    it("modifies only recipient when user says 'No, I said Ama'", () => {
      const initialSlots = { amount: 100, recipientName: "Kwame" };
      const correction = correctionEngine.applyCorrection("Actually, send it to Ama", initialSlots);

      expect(correction.isCorrection).toBe(true);
      expect(correction.fieldModified).toBe("recipientName");
      expect(correction.updatedSlots.recipientName).toBe("Ama");
      expect(correction.updatedSlots.amount).toBe(100);
    });
  });

  // 5. Coreference & Reference Resolution
  describe("Coreference Resolution Engine", () => {
    it("resolves 'Send to him' using active recipient context", () => {
      const currentSlots = { recipientName: "Kwame", recipientPhone: "0553838464" };
      const res = coreferenceResolver.resolve("Send to him", currentSlots);

      expect(res.hasReference).toBe(true);
      expect(res.referenceType).toBe("SAME_RECIPIENT");
      expect(res.resolvedSlots.recipientName).toBe("Kwame");
    });

    it("resolves 'Same amount' using previous transaction context", () => {
      const prev = [{ recipientPhone: "0553838464", recipientName: "Kwame", amount: 150 }];
      const res = coreferenceResolver.resolve("Use the same amount", {}, prev);

      expect(res.hasReference).toBe(true);
      expect(res.referenceType).toBe("SAME_AMOUNT");
      expect(res.resolvedSlots.amount).toBe(150);
    });
  });

  // 6. Negation Intelligence
  describe("Negation Engine", () => {
    it("classifies pure cancellation vs corrective negation vs pause", () => {
      expect(negationEngine.assess("Cancel the transaction").type).toBe("PURE_CANCELLATION");
      expect(negationEngine.assess("No, I said 200").type).toBe("CORRECTIVE_NEGATION");
      expect(negationEngine.assess("Wait, don't do that yet").type).toBe("PAUSE_REQUEST");
    });
  });

  // 7. Navigation & Route Resolving
  describe("Navigation Engine", () => {
    it("resolves 'take me home' to HOME node", () => {
      expect(routeResolver.resolve("GO_HOME", "Take me home", "RECIPIENT_INPUT")).toBe("HOME");
    });

    it("resolves 'go back' from AMOUNT_INPUT to RECIPIENT_KYC", () => {
      expect(routeResolver.resolve("GO_BACK", "Go back", "AMOUNT_INPUT")).toBe("RECIPIENT_KYC");
    });
  });

  // 8. Action Safety & Zero-PIN Gate
  describe("Safety & Risk Engine", () => {
    it("flags spoken PIN attempts and prevents PIN storage", () => {
      const action = actionPlanner.plan("SEND_MONEY", { amount: 50, recipientPhone: "0553838464" });
      const safety = transactionGuard.evaluate("My PIN is 1234", action);

      expect(safety.pinDetectedInVoice).toBe(true);
      expect(safety.blockedReason).toContain("ZERO-PIN ALERT");
    });

    it("classifies financial execution as HIGH risk requiring confirmation", () => {
      const action = actionPlanner.plan("CONFIRM", { amount: 50, recipientPhone: "0553838464" }, "confirm");
      expect(action.riskLevel).toBe("HIGH");
      expect(action.requiresClientConfirmation).toBe(true);
    });
  });

  // 9. Cognitive Memory System
  describe("Cognitive Memory Layer", () => {
    it("enforces Zero-PIN policy by rejecting credential storage", () => {
      const check1 = memoryPolicy.isPermissible("pin", "1234");
      const check2 = memoryPolicy.isPermissible("momo_pin", "5678");
      const check3 = memoryPolicy.isPermissible("preferredLanguage", "tw");

      expect(check1.allowed).toBe(false);
      expect(check2.allowed).toBe(false);
      expect(check3.allowed).toBe(true);
    });

    it("handles task memory stacking and resumption for interrupted tasks", () => {
      const sessId = "sess_task_test";
      taskMemory.setPrimaryTask(sessId, "SEND_MONEY", { amount: 50, recipientName: "Kwame" }, "amount");
      taskMemory.interruptWithTask(sessId, "CHECK_BALANCE");

      expect(taskMemory.getActiveTask(sessId)?.intent).toBe("CHECK_BALANCE");

      const resumed = taskMemory.completeAndResume(sessId);
      expect(resumed?.intent).toBe("SEND_MONEY");
      expect(resumed?.slots.amount).toBe(50);
      expect(resumed?.resumptionPrompt?.en).toContain("Kwame");
    });

    it("stores and resolves user pronunciation preferences with live correction", () => {
      pronunciationMemory.setPronunciation({
        userId: "user_123",
        displayName: "Nhyira",
        preferredSpokenName: "N-hye-rah",
        pronunciationPreference: "Gentle Akan rising tone",
        language: "ak",
        updatedAt: Date.now(),
      });

      expect(pronunciationMemory.getPronunciation("user_123")?.preferredSpokenName).toBe("N-hye-rah");

      // Caller corrects pronunciation
      pronunciationMemory.correctPronunciation("user_123", "N-ye-rah");
      expect(pronunciationMemory.getPronunciation("user_123")?.preferredSpokenName).toBe("N-ye-rah");
    });

    it("resolves memory contradictions by prioritizing explicit user statements", () => {
      preferenceMemory.setPreference("user_kofi", "preferredLanguage", "en", "INFERRED");
      expect(preferenceMemory.getPreference("user_kofi", "preferredLanguage")).toBe("en");

      // User explicitly overrides to Twi
      preferenceMemory.setPreference("user_kofi", "preferredLanguage", "tw", "USER_EXPLICIT");
      expect(preferenceMemory.getPreference("user_kofi", "preferredLanguage")).toBe("tw");
    });
  });

  // 10. Interruption & Diagnostics
  describe("Interruption & Self-Diagnostics", () => {
    it("registers and cancels active speech on caller barge-in", () => {
      const sess = "sess_bargein_test";
      interruptionEngine.registerSpeechPlayback(sess, "Please enter the amount you want to send");
      const event = interruptionEngine.handleBargeIn(sess, "Wait, make it 200");

      expect(event).not.toBeNull();
      expect(event?.newSpokenInput).toBe("Wait, make it 200");
    });

    it("runs diagnostic health check with verified safety guarantees", () => {
      const report = diagnosticsEngine.runDiagnostic();
      expect(report.status).toBe("HEALTHY");
      expect(report.safetyGuarantees.zeroPinEnforced).toBe(true);
      expect(report.resources.approvedToolCount).toBeGreaterThan(10);
    });
  });

  // 11. Pronunciation & Speech Normalization
  describe("Pronunciation & Speech Subsystem", () => {
    it("formats phone numbers with natural cadence pauses", () => {
      const normalized = speechNormalizer.normalizeForSpeech("0553838464", "en");
      expect(normalized).toBe("0 5 5, 3 8 3, 8 4 6 4");
    });

    it("prepares phonetic hints for Ghanaian names like Kwame and Nyamebere", () => {
      const { hints } = pronunciationEngine.prepareTextForTts("Send to Kwame Nyamebere");
      expect(hints["Kwame"]).toBe("Kwah-meh");
      expect(hints["Nyamebere"]).toBe("Nyah-meh-beh-reh");
    });
  });

  // 12. Multi-Turn End-to-End Central AI Engine Execution
  describe("Central aiEngine.process() Multi-Turn Flow", () => {
    it("handles multi-turn conversation without restarting state", async () => {
      const sessionId = `test_sess_${Date.now()}`;

      // Turn 1: "I want to send money"
      const turn1 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "I want to send money",
        currentStep: "welcome",
      });

      expect(turn1.intent).toBe("SEND_MONEY");
      expect(turn1.dialogue.type).toBe("ASK_SLOT");

      // Turn 2: "Kwame 0553838464"
      const turn2 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "Kwame 0553838464",
        currentStep: "recipient",
      });

      expect(turn2.entities.recipientPhone).toBe("0553838464");

      // Turn 3: "100 cedis"
      const turn3 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "100 cedis",
        currentStep: "amount",
      });

      expect(turn3.entities.amount).toBe(100);
      expect(turn3.entities.recipientPhone).toBe("0553838464"); // Remembers recipient!
      expect(turn3.dialogue.type).toBe("CONFIRM_ACTION");

      // Turn 4: Natural correction: "Make it 200"
      const turn4 = await aiEngine.process({
        sessionId,
        channel: "VOICE",
        input: "Actually make it 200",
        currentStep: "confirm",
      });

      expect(turn4.entities.amount).toBe(200);
      expect(turn4.entities.recipientPhone).toBe("0553838464"); // Still remembers recipient!
    }, 15000);
  });
});
