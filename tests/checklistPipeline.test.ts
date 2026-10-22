import { describe, it, expect } from "vitest";
import {
  ChecklistStageManager,
  KeypadBufferManager,
  ConversationTakeoverDetector,
  SequentialResourceQueue,
  TelcoKycReferenceService,
} from "../src/domain/checklistPipeline";
import { TransactionSession } from "../src/domain/stateMachine";

describe("9-Stage Checklist Pipeline & Concurrency Manager", () => {
  it("blocks transaction initiation when checklist stages 1 through 7 are incomplete", () => {
    const incompleteSession: TransactionSession = {
      sessionId: "test_check_1",
      idempotencyKey: "idemp_1",
      source: "KEYPAD",
      language: "en",
      network: "MTN",
      recipientPhone: "0553838464",
      recipientName: null, // missing KYC verification
      isRecipientVerified: false,
      amount: 50,
      state: "INITIATED",
      referenceId: "OKP-100",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      serviceSelected: true,
      pinGatePassed: false,
    };

    const verification = ChecklistStageManager.verifySession(incompleteSession);
    expect(verification.isReadyForInitiation).toBe(false);
    expect(verification.currentStage).toBe("STAGE_6_REFERENCE_KYC");
    expect(verification.missingStages).toContain("STAGE_6_REFERENCE_KYC");
    expect(verification.missingStages).toContain("STAGE_7_PIN_GATE");

    expect(() => ChecklistStageManager.assertCanInitiate(incompleteSession)).toThrow(
      /Cannot initiate transaction/
    );
  });

  it("permits transaction initiation once all 7 prerequisites are fully satisfied", () => {
    const readySession: TransactionSession = {
      sessionId: "test_check_2",
      idempotencyKey: "idemp_2",
      source: "VOICE",
      language: "twi",
      network: "MTN",
      recipientPhone: "0553838464",
      recipientName: "Kwame Nyamebere",
      isRecipientVerified: true,
      amount: 50,
      state: "PIN_PENDING",
      referenceId: "OKP-200",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      retryCount: 0,
      serviceSelected: true,
      pinGatePassed: true,
      transactionInitiated: false,
      stateReported: false,
    };

    const verification = ChecklistStageManager.verifySession(readySession);
    expect(verification.isReadyForInitiation).toBe(true);
    expect(verification.stages.STAGE_1_LANGUAGE.completed).toBe(true);
    expect(verification.stages.STAGE_2_SERVICE.completed).toBe(true);
    expect(verification.stages.STAGE_3_NETWORKS.completed).toBe(true);
    expect(verification.stages.STAGE_4_RECIPIENT.completed).toBe(true);
    expect(verification.stages.STAGE_5_AMOUNT.completed).toBe(true);
    expect(verification.stages.STAGE_6_REFERENCE_KYC.completed).toBe(true);
    expect(verification.stages.STAGE_7_PIN_GATE.completed).toBe(true);
  });

  describe("Keypad Buffer Manager", () => {
    it("buffers phone number digits until '#' is pressed", () => {
      const sessId = "phone_buffer_test";
      KeypadBufferManager.clearBuffer(sessId);

      // Digits entered one by one
      "0553838464".split("").forEach((d) => {
        const res = KeypadBufferManager.appendDigit(sessId, d, "phone_number");
        expect(res.isComplete).toBe(false);
      });

      expect(KeypadBufferManager.getBuffer(sessId)).toBe("0553838464");

      // Press '#' to submit
      const finalRes = KeypadBufferManager.appendDigit(sessId, "#", "phone_number");
      expect(finalRes.isComplete).toBe(true);
      expect(finalRes.submittedValue).toBe("0553838464");
      expect(KeypadBufferManager.getBuffer(sessId)).toBe("");
    });

    it("buffers PIN digits until '#' is pressed", () => {
      const sessId = "pin_buffer_test";
      KeypadBufferManager.clearBuffer(sessId);

      "2838".split("").forEach((d) => {
        const res = KeypadBufferManager.appendDigit(sessId, d, "pin");
        expect(res.isComplete).toBe(false);
      });

      const finalRes = KeypadBufferManager.appendDigit(sessId, "#", "pin");
      expect(finalRes.isComplete).toBe(true);
      expect(finalRes.submittedValue).toBe("2838");
    });

    it("detects key mismatch for single-digit menu options and produces the exact prompt", () => {
      const sessId = "mismatch_test";
      // Suppose accepted digits are ['1', '2', '9', '0'], user presses '5'
      const res = KeypadBufferManager.appendDigit(sessId, "5", "single_digit", ["1", "2", "9", "0"]);
      expect(res.isComplete).toBe(true);
      expect(res.isValidParameter).toBe(false);
      expect(res.mismatchFeedback?.en).toBe(
        "The answer you gave doesn't tally, I will mention the audio again please choose the answer again."
      );
      expect(res.mismatchFeedback?.twi).toBe(
        "Mmuaeɛ a wode maa no nnyɛ pɛpɛɛpɛ, mɛbɔ nne no bio mesrɛ wo paw mmuaeɛ no bio."
      );
    });
  });

  describe("Conversation Takeover Detector", () => {
    it("distinguishes pure keypad entries from natural conversational speech", () => {
      expect(ConversationTakeoverDetector.isConversationalInput("1", "service-select")).toBe(false);
      expect(ConversationTakeoverDetector.isConversationalInput("0553838464#", "enter-recipient")).toBe(false);
      expect(ConversationTakeoverDetector.isConversationalInput("50#", "enter-amount")).toBe(false);

      expect(ConversationTakeoverDetector.isConversationalInput("i don't want this", "service-select")).toBe(true);
      expect(ConversationTakeoverDetector.isConversationalInput("send 50 cedis to Kwame", "enter-recipient")).toBe(true);
      expect(ConversationTakeoverDetector.isConversationalInput("Mepɛ sɛ mesoma sika", "voice-menu")).toBe(true);
    });
  });

  describe("Sequential Resource Queue", () => {
    it("executes tasks sequentially without resource concurrency", async () => {
      const queue = new SequentialResourceQueue("TestQueue");
      const executionOrder: number[] = [];

      const p1 = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 20));
        executionOrder.push(1);
        return 1;
      });

      const p2 = queue.enqueue(async () => {
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push(2);
        return 2;
      });

      const p3 = queue.enqueue(async () => {
        executionOrder.push(3);
        return 3;
      });

      const results = await Promise.all([p1, p2, p3]);
      expect(results).toEqual([1, 2, 3]);
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe("Telco KYC Reference Service", () => {
    it("generates structured bilingual reference readback", async () => {
      const kyc = await TelcoKycReferenceService.verifyAndBuildReference("0553838464", 50, "MTN");
      expect(kyc.verified).toBe(true);
      expect(kyc.recipientName).toBeTruthy();
      expect(kyc.spokenReadback.en).toContain("50 Cedis");
      expect(kyc.spokenReadback.en).toContain("0553838464");
      expect(kyc.spokenReadback.en).toContain("Press 1 to confirm, or 2 to change");
      expect(kyc.spokenReadback.twi).toContain("Mia 1 sɛ wopene so, anaa 2 sɛ wopɛ sɛ wosakra");
    });
  });
});
