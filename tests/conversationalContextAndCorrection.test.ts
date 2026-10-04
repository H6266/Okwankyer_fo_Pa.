import { describe, it, expect } from "vitest";
import { contextualReasoningEngine } from "../src/ai_system/understanding/contextualReasoningEngine";
import { TaskState } from "../src/ai_system/core/aiTypes";

describe("Conversational Intelligence & Multi-Turn Context Tracking (Section 6)", () => {
  it("tracks slot revisions, coreference, interruptions, and task resumption accurately", () => {
    // Turn 1: "Send 50 to Ama"
    let turn1 = contextualReasoningEngine.analyzeTurn({
      utterance: "Send 50 to Ama",
      currentSlots: {},
    });
    expect(turn1.intent).toBe("SEND_MONEY");
    expect(turn1.updatedSlots.amount).toBe(50);
    expect(turn1.updatedSlots.recipientName).toBe("Ama");

    // Turn 2: "Actually make that 100"
    let turn2 = contextualReasoningEngine.analyzeTurn({
      utterance: "Actually make that 100",
      currentSlots: turn1.updatedSlots,
    });
    expect(turn2.isCorrection).toBe(true);
    expect(turn2.updatedSlots.amount).toBe(100);
    expect(turn2.updatedSlots.recipientName).toBe("Ama");

    // Turn 3: "Not Ama. Send it to Kofi"
    let turn3 = contextualReasoningEngine.analyzeTurn({
      utterance: "Not Ama. Send it to Kofi",
      currentSlots: turn2.updatedSlots,
    });
    expect(turn3.isCorrection).toBe(true);
    expect(turn3.updatedSlots.recipientName).toBe("Kofi");
    expect(turn3.updatedSlots.amount).toBe(100); // Preserves amount

    // Turn 4: "Same amount"
    let turn4 = contextualReasoningEngine.analyzeTurn({
      utterance: "Same amount",
      currentSlots: turn3.updatedSlots,
    });
    expect(turn4.updatedSlots.amount).toBe(100);
    expect(turn4.updatedSlots.recipientName).toBe("Kofi");

    // Turn 5: "No, make it 80"
    let turn5 = contextualReasoningEngine.analyzeTurn({
      utterance: "No, make it 80",
      currentSlots: turn4.updatedSlots,
    });
    expect(turn5.isCorrection).toBe(true);
    expect(turn5.updatedSlots.amount).toBe(80);
    expect(turn5.updatedSlots.recipientName).toBe("Kofi");

    // Turn 6: "Wait, check my balance first"
    const activeTransferTask: TaskState = {
      taskId: "task_transfer_1",
      intent: "SEND_MONEY",
      currentStep: "confirm",
      slots: { ...turn5.updatedSlots },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      resumptionPrompt: {
        en: "Would you like to resume sending 80 GHS to Kofi?",
        twi: "Wobɛpɛ sɛ yɛtoa so mane sika 80 kɔma Kofi?",
      },
    };

    let turn6 = contextualReasoningEngine.analyzeTurn({
      utterance: "Wait, check my balance first",
      currentSlots: turn5.updatedSlots,
      activeTask: activeTransferTask,
    });
    expect(turn6.intent).toBe("CHECK_BALANCE");
    expect(turn6.isTaskInterruption).toBe(true);

    // Turn 7: "Okay, continue"
    let turn7 = contextualReasoningEngine.analyzeTurn({
      utterance: "Okay, continue",
      currentSlots: turn5.updatedSlots,
      interruptedTask: activeTransferTask,
    });
    expect(turn7.isTaskResumption).toBe(true);
    expect(turn7.updatedSlots.amount).toBe(80);
    expect(turn7.updatedSlots.recipientName).toBe("Kofi");
  });
});
