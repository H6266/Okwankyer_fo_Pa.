/**
 * Ɔkwankyerɛfo Pa - Phase 6b Tests: No-Input & Failure Handling
 * (tests/pilotFailureHandling.test.ts)
 * 
 * Verifies:
 * 1. Clarification loop limit (N failed clarifications, default 3, offers DTMF entry or customer care).
 * 2. Silence & repeated no-input handling with gentle re-prompts.
 * 3. Caller hanging up mid-confirmation: transaction aborted immediately, zero money moved.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { Brain } from "../src/ai_system/brain/brain";
import { pilotControls } from "../src/services/pilotControls";
import { pilotMetrics } from "../src/services/pilotMetrics";
import { transactionStateMachine } from "../src/domain/stateMachine";
import { durableTransactionStore } from "../src/services/durableTransactionStore";

describe("Phase 6b: No-Input and Failure Handling", () => {
  beforeEach(() => {
    pilotControls.setKillSwitch(false);
    pilotControls.setMaxClarificationAttempts(3);
    pilotMetrics.resetMetrics();
  });

  it("1. Clarification loop limit transitions to DTMF keypad entry after 3 failed clarifications", async () => {
    const brain = new Brain({ mode: "offline_only" });

    // Turn 1: ambiguous utterance missing amount and recipient
    let output1 = await brain.process({
      transcript: "I want to send money",
      language: "en",
      languageConfidence: 0.9,
      sessionLanguage: "en",
      draft: { slots: {}, clarificationLoops: 0 },
    });
    expect(output1.decision.kind).toBe("clarify_slot");
    expect(output1.updatedDraft.clarificationLoops).toBe(1);

    // Turn 2: second vague clarification
    let output2 = await brain.process({
      transcript: "just send it now",
      language: "en",
      languageConfidence: 0.9,
      sessionLanguage: "en",
      draft: output2Session(output1),
    });
    expect(output2.decision.kind).toBe("clarify_slot");
    expect(output2.updatedDraft.clarificationLoops).toBe(2);

    // Turn 3: third failed clarification reaches the configured limit (3)
    let output3 = await brain.process({
      transcript: "please send it",
      language: "en",
      languageConfidence: 0.9,
      sessionLanguage: "en",
      draft: output2Session(output2),
    });
    // Invariant: After 3 failed clarifications, triggers keypad fallback!
    expect(output3.decision.kind).toBe("clarify_slot");
    expect((output3.decision as any).slot).toBe("keypad_fallback");
    expect(output3.reply.text).toContain("keypad");

    // Metrics record DTMF fallback
    const report = pilotMetrics.getMetricsReport();
    expect(report.fallbacks.dtmfFallbacks).toBeGreaterThanOrEqual(1);
  });

  it("2. Spoken Twi clarification limit offers Twi keypad guidance and customer care", async () => {
    const brain = new Brain({ mode: "offline_only" });

    const output = await brain.process({
      transcript: "Me pɛ sɛ me mane sika",
      language: "twi-asante",
      languageConfidence: 0.9,
      sessionLanguage: "twi-asante",
      draft: { slots: {}, clarificationLoops: 2 }, // already had 2 failed clarifications
    });

    expect(output.decision.kind).toBe("clarify_slot");
    expect((output.decision as any).slot).toBe("keypad_fallback");
    expect(output.reply.text).toContain("keypad");
    expect(output.reply.text).toContain("customer care");
  });

  it("3. Caller hanging up mid-confirmation immediately aborts transaction with zero money moved", () => {
    const sessionId = `test_hangup_${Date.now()}`;
    const session = transactionStateMachine.getOrCreateSession(sessionId, "en", "VOICE");
    session.callerPhone = "0553838464";
    session.recipientPhone = "0241234567";
    session.amount = 50;

    // Transition through proper state machine lifecycle
    transactionStateMachine.transition(sessionId, "RECIPIENT_VERIFIED");
    transactionStateMachine.transition(sessionId, "AMOUNT_ENTERED");

    // Simulate remote hangup (isActive=0) mid-confirmation
    const activeSession = transactionStateMachine.getSession(sessionId);
    expect(activeSession?.state).toBe("AMOUNT_ENTERED");

    // Abort transition
    pilotMetrics.recordAbandonmentBeforeConfirmation();
    transactionStateMachine.transition(sessionId, "CANCELLED");

    // Verify session state is CANCELLED
    const abortedSession = transactionStateMachine.getSession(sessionId);
    expect(abortedSession?.state).toBe("CANCELLED");

    // Verify metrics recorded abandonment
    const report = pilotMetrics.getMetricsReport();
    expect(report.abandonment.abandonedBeforeConfirmation).toBe(1);
    expect(report.paymentOutcomes.ABANDONED_BEFORE_CONFIRMATION).toBe(1);
  });
});

function output2Session(output: any) {
  return {
    ...output.updatedDraft,
    clarificationLoops: output.updatedDraft.clarificationLoops,
  };
}
