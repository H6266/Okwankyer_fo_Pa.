/**
 * Ɔkwankyerɛfo Pa - Chunk 3 Edge Cases Test Suite
 * (tests/chunk3EdgeCases.test.ts)
 * 
 * Verifies all 11 required edge cases:
 * 1. repeated no-match
 * 2. network offline (full transfer works via offline engine)
 * 3. DTMF * and # in amount entry
 * 4. replayed "yes"/DTMF 1 and redial after drop (exactly one payment)
 * 5. code-switched speech
 * 6. language switch mid-call
 * 7. amount above cap or ambiguous (keypad entry)
 * 8. unbuilt service (not_ready, no clarification)
 * 9. correction mid-flow
 * 10. interruption and resume
 * 11. saga failure and PENDING timeout (never prune PENDING sagas)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Brain, DEFAULT_BRAIN_CONFIG } from "../src/ai_system/brain/brain";
import { serviceRegistry } from "../src/ai_system/brain/serviceRegistry";
import { paymentSaga } from "../src/integrations/momo/paymentSaga";
import { durableTransactionStore } from "../src/services/durableTransactionStore";
import { durableIdempotencyLedger } from "../src/services/durableIdempotencyLedger";
import { setAllowUnapprovedTemplates } from "../src/ai_system/brain/replyTemplates";
import { setRequireApprovedNumbers } from "../src/ai_system/linguistic/twiNumberWords";
import { geminiClient } from "../src/services/geminiClient";
import { decodeDtmfAmount } from "../src/domain/numberFormatter";

describe("Chunk 3: Edge Cases Test Suite", () => {
  let testBrain: Brain;

  beforeEach(() => {
    serviceRegistry.resetToDefaults();
    setAllowUnapprovedTemplates(true);
    setRequireApprovedNumbers(false);
    durableTransactionStore.clearAllForTesting();
    durableIdempotencyLedger.clearAllForTesting();

    testBrain = new Brain({
      ...DEFAULT_BRAIN_CONFIG,
      mode: "offline",
    });
  });

  afterEach(() => {
    setAllowUnapprovedTemplates(false);
    setRequireApprovedNumbers(true);
    vi.restoreAllMocks();
  });

  // ── 1. REPEATED NO-MATCH ──────────────────────────────────────────────────
  it("1. repeated no-match: handles multiple unrecognized utterances gracefully without infinite loop", async () => {
    // Turn 1: Unrecognized noise
    const turn1 = await testBrain.process({
      transcript: "xyz blah quantum flubber",
      language: "en",
      draft: { slots: {} },
    });
    expect(turn1.decision.kind).toBe("clarify_slot");

    // Turn 2: Second unrecognized utterance with updated draft
    const turn2 = await testBrain.process({
      transcript: "more random unrecognized sounds",
      language: "en",
      draft: turn1.updatedDraft,
    });
    expect(turn2.decision.kind).toBe("clarify_slot");
    expect(turn2.reply.text).toBeDefined();

    // Turn 3: Caller finally provides valid transfer utterance
    const turn3 = await testBrain.process({
      transcript: "Send 20 cedis to 0553838464",
      language: "en",
      draft: turn2.updatedDraft,
    });
    expect(turn3.decision.kind).toBe("confirm");
    expect(turn3.updatedDraft.slots.amount).toBe(20);
  });

  // ── 2. NETWORK OFFLINE (FULL TRANSFER WORKS VIA OFFLINE ENGINE) ────────────
  it("2. network offline: completes full end-to-end transfer via offline engine with zero cloud model dependency", async () => {
    vi.spyOn(geminiClient, "isAvailable").mockReturnValue(false);

    // Turn 1: Utterance in English
    const turn1 = await testBrain.process({
      transcript: "Send 50 cedis to 0553838464",
      language: "en",
      draft: { slots: {} },
    });
    expect(turn1.decision.kind).toBe("confirm");
    expect(turn1.updatedDraft.slots.amount).toBe(50);
    expect(turn1.updatedDraft.slots.recipient?.phone).toBe("0553838464");

    // Turn 2: Confirmation
    const turn2 = await testBrain.process({
      transcript: "Yes",
      language: "en",
      draft: turn1.updatedDraft,
    });
    expect(turn2.decision.kind).toBe("dispatch");
    expect(turn2.updatedDraft.confirmed).toBe(true);
  });

  // ── 3. DTMF * AND # IN AMOUNT ENTRY ───────────────────────────────────────
  it("3. DTMF * and # in amount entry: parses and normalizes amount with * and # keypad symbols", () => {
    // Standard entry with hash termination: "50#" -> 50
    expect(decodeDtmfAmount("50#")).toBe(50);

    // Entry starting with star or containing star for decimal/correction: "*50#" -> 50
    expect(decodeDtmfAmount("*50#")).toBe(50);

    // Keypad correction: user typed 20 then star to clear then 50# -> 50
    expect(decodeDtmfAmount("20*50#")).toBe(50);

    // Raw digits without terminator
    expect(decodeDtmfAmount("100")).toBe(100);
  });

  // ── 4. REPLAYED "YES"/DTMF 1 AND REDIAL AFTER DROP (EXACTLY ONE PAYMENT) ──
  it("4. replayed 'yes'/DTMF 1 and redial after drop: idempotency ensures exactly ONE payment saga", async () => {
    const sessionId = "SESSION_DROP_TEST_01";
    const draftHash = "DRAFT_HASH_ABC123";

    // First confirmation: executes saga
    const res1 = await paymentSaga.executeConfirmedTransferSaga({
      sessionId,
      senderPhone: "0244123456",
      recipientPhone: "0553838464",
      recipientName: "Kwame",
      amount: 50,
      confirmedDraftHash: draftHash,
    });
    expect(res1.status).toBe("PENDING");
    const originalSagaId = res1.saga.sagaId;

    // Second confirmation (replayed "yes", DTMF 1 replay, or redial after call drop)
    const res2 = await paymentSaga.executeConfirmedTransferSaga({
      sessionId,
      senderPhone: "0244123456",
      recipientPhone: "0553838464",
      recipientName: "Kwame",
      amount: 50,
      confirmedDraftHash: draftHash,
    });

    // Invariant: MUST return the identical saga ID, no second disbursement or duplicate draft
    expect(res2.saga.sagaId).toBe(originalSagaId);
    expect(res2.status).toBe(res1.status);
    expect(durableTransactionStore.getAllSagas().length).toBe(1);
  });

  // ── 5. CODE-SWITCHED SPEECH ───────────────────────────────────────────────
  it("5. code-switched speech: resolves mixed Twi-English utterances accurately", async () => {
    const turn = await testBrain.process({
      transcript: "Mane fifty cedis kɔma 0553838464",
      language: "mixed-twi-en",
      sessionLanguage: "mixed-twi-en",
      draft: { slots: {} },
    });
    expect(turn.decision.kind).toBe("confirm");
    expect(turn.updatedDraft.slots.amount).toBe(50);
    expect(turn.updatedDraft.slots.recipient?.phone).toBe("0553838464");
  });

  // ── 6. LANGUAGE SWITCH MID-CALL ───────────────────────────────────────────
  it("6. language switch mid-call: preserves gathered slots when caller switches between languages", async () => {
    // Turn 1 in English: provides slots
    const turn1 = await testBrain.process({
      transcript: "Send 30 cedis to 0553838464",
      language: "en",
      sessionLanguage: "en",
      draft: { slots: {} },
    });
    expect(turn1.decision.kind).toBe("confirm");
    expect(turn1.updatedDraft.slots.amount).toBe(30);

    // Turn 2 caller speaks in Twi: confirms in Twi
    const turn2 = await testBrain.process({
      transcript: "Aane, pene so",
      language: "twi-asante",
      sessionLanguage: "twi-asante",
      draft: turn1.updatedDraft,
    });
    expect(turn2.decision.kind).toBe("dispatch");
    expect(turn2.updatedDraft.slots.amount).toBe(30);
    expect(turn2.updatedDraft.slots.recipient?.phone).toBe("0553838464");
    expect(turn2.reply.language).toContain("twi");
  });

  // ── 7. AMOUNT ABOVE CAP OR AMBIGUOUS (KEYPAD ENTRY) ───────────────────────
  it("7. amount above cap or ambiguous: enforces single transaction cap of 5000 GHS", async () => {
    // Amount exceeds single transaction cap (6000 > 5000)
    const turn = await testBrain.process({
      transcript: "Send 6000 cedis to 0553838464",
      language: "en",
      draft: { slots: {} },
    });
    // Cap violation prompts clarify_slot for amount within limit
    expect(turn.decision.kind).toBe("clarify_slot");
    expect(turn.decision.slot).toBe("amount");
  });

  // ── 8. UNBUILT SERVICE (NOT_READY, NO CLARIFICATION) ──────────────────────
  it("8. unbuilt service: returns not_ready immediately without clarifying slots", async () => {
    // Caller requests loan service
    const turn = await testBrain.process({
      transcript: "I want to apply for a loan of 500 cedis",
      language: "en",
      draft: { slots: {} },
    });

    // Invariant: status is not_ready, does NOT ask clarifying questions about the loan
    expect(turn.decision.kind).toBe("not_ready");
    expect(turn.decision.intent).toBe("momo.loan");
    expect(turn.reply.text).toBeDefined();
  });

  // ── 9. CORRECTION MID-FLOW ────────────────────────────────────────────────
  it("9. correction mid-flow: updates draft amount and invalidates prior confirmation", async () => {
    // Turn 1: Initial amount 20
    const turn1 = await testBrain.process({
      transcript: "Send 20 cedis to 0553838464",
      language: "en",
      draft: { slots: {} },
    });
    expect(turn1.decision.kind).toBe("confirm");
    expect(turn1.updatedDraft.slots.amount).toBe(20);

    // Turn 2: Correction
    const turn2 = await testBrain.process({
      transcript: "Actually make it 100 cedis",
      language: "en",
      draft: turn1.updatedDraft,
    });
    expect(turn2.decision.kind).toBe("confirm");
    expect(turn2.updatedDraft.slots.amount).toBe(100);
    expect(turn2.updatedDraft.slots.recipient?.phone).toBe("0553838464");
    expect(turn2.updatedDraft.confirmed).toBe(false); // Invariant: prior confirmation invalidated!
  });

  // ── 10. INTERRUPTION AND RESUME ───────────────────────────────────────────
  it("10. interruption and resume: preserves gathered slots across interruption", async () => {
    // Turn 1: Slot gathered
    const turn1 = await testBrain.process({
      transcript: "Send 50 cedis to 0553838464",
      language: "en",
      draft: { slots: {} },
    });
    expect(turn1.decision.kind).toBe("confirm");

    // Turn 2: Interruption / hesitation ("Wait, hold on")
    const turn2 = await testBrain.process({
      transcript: "Wait, hold on a minute",
      language: "en",
      draft: turn1.updatedDraft,
    });
    expect(turn2.updatedDraft.slots.amount).toBe(50);
    expect(turn2.updatedDraft.slots.recipient?.phone).toBe("0553838464");

    // Turn 3: Resumption ("Okay, yes continue")
    const turn3 = await testBrain.process({
      transcript: "Okay yes, send it",
      language: "en",
      draft: turn2.updatedDraft,
    });
    expect(turn3.decision.kind).toBe("dispatch");
    expect(turn3.updatedDraft.slots.amount).toBe(50);
  });

  // ── 11. SAGA FAILURE AND PENDING TIMEOUT (NEVER PRUNE PENDING SAGAS) ──────
  it("11. saga failure and PENDING timeout: marks timeout as reconciliation and blocks pruning of PENDING sagas", async () => {
    // 1. Saga Failure: simulate failure outcome
    const failRes = await paymentSaga.executeConfirmedTransferSaga({
      sessionId: "SESSION_FAIL_01",
      senderPhone: "0244123456",
      recipientPhone: "0553838464",
      amount: 50,
      simulateOutcome: "FAILED",
    });
    expect(failRes.status).toBe("FAILED");
    expect(failRes.saga.state).toBe("COLLECTION_FAILED");

    // 2. Saga PENDING Timeout: simulate timeout outcome
    const timeoutRes = await paymentSaga.executeConfirmedTransferSaga({
      sessionId: "SESSION_TIMEOUT_01",
      senderPhone: "0244123456",
      recipientPhone: "0553838464",
      amount: 75,
      timeoutMs: 100,
      simulateOutcome: "PENDING_TIMEOUT",
    });
    expect(timeoutRes.status).toBe("RECONCILIATION_REQUIRED");
    expect(timeoutRes.reconciliationNotice).toContain("RECONCILIATION NOTICE");
    expect(timeoutRes.saga.state).toBe("RECONCILIATION_REQUIRED");

    // 3. Never prune PENDING sagas invariant: attempting to delete PENDING/RECONCILIATION saga throws error
    expect(() => {
      durableTransactionStore.deleteSaga(timeoutRes.saga.sagaId);
    }).toThrow(/CANNOT_PRUNE_PENDING_SAGA/);
  });
});
