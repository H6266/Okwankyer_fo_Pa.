import { describe, it, expect } from "vitest";
import { aiEngine } from "../src/ai_system/core/aiEngine";
import { languageDetector } from "../src/ai_system/perception/languageDetector";
import { inputNormalizer } from "../src/ai_system/perception/inputNormalizer";
import { intentEngine } from "../src/ai_system/understanding/intentEngine";
import { entityEngine } from "../src/ai_system/understanding/entityEngine";
import { correctionEngine } from "../src/ai_system/understanding/correctionEngine";
import { confidenceEngine } from "../src/ai_system/understanding/confidenceEngine";
import { routeResolver } from "../src/ai_system/navigation/routeResolver";
import { actionPlanner } from "../src/ai_system/actions/actionPlanner";
import { transactionGuard } from "../src/ai_system/safety/transactionGuard";
import { pronunciationEngine } from "../src/ai_system/speech/pronunciation/pronunciationEngine";
import { speechNormalizer } from "../src/ai_system/speech/speechNormalizer";

describe("Ɔkwankyerɛfo Pa - AI System Master Test Suite", () => {
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

  // 5. Navigation & Route Resolving
  describe("Navigation Engine", () => {
    it("resolves 'take me home' to HOME node", () => {
      expect(routeResolver.resolve("GO_HOME", "Take me home", "RECIPIENT_INPUT")).toBe("HOME");
    });

    it("resolves 'go back' from AMOUNT_INPUT to RECIPIENT_KYC", () => {
      expect(routeResolver.resolve("GO_BACK", "Go back", "AMOUNT_INPUT")).toBe("RECIPIENT_KYC");
    });
  });

  // 6. Action Safety & Zero-PIN Gate
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

  // 7. Pronunciation & Speech Normalization
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

  // 8. Multi-Turn End-to-End Central AI Engine Execution
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
    });
  });
});
