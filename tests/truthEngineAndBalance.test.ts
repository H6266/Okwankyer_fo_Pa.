import { describe, it, expect } from "vitest";
import { truthEngine, TruthEngineError } from "../src/ai_system/core/truthEngine";
import { capabilityEngine } from "../src/ai_system/core/capabilityEngine";
import { aiDialogue } from "../src/ai_system/core/aiDialogue";
import { TransactionDraft } from "../src/ai_system/core/aiTypes";

describe("TruthEngine & Capability Invariant Enforcement", () => {
  it("INVARIANT_012: assertKnown fails closed on undefined, empty, or non-positive values", () => {
    expect(() => truthEngine.assertKnown("recipientPhone", null)).toThrowError(/TRUTH_ENGINE_VIOLATION/);
    expect(() => truthEngine.assertKnown("recipientPhone", "")).toThrowError(/INVARIANT_012/);
    expect(() => truthEngine.assertKnown("amount", -5)).toThrowError(/INVARIANT_012/);
    expect(() => truthEngine.assertKnown("amount", 0)).toThrowError(/INVARIANT_012/);
    expect(() => truthEngine.assertKnown("amount", 50)).not.toThrow();
  });

  it("INVARIANT_004: assertUserConfirmed rejects unconfirmed or null drafts", () => {
    expect(() => truthEngine.assertUserConfirmed(null)).toThrowError(/INVARIANT_004/);

    const unconfirmedDraft: TransactionDraft = {
      draftId: "DRAFT_1",
      type: "TRANSFER",
      amount: 100,
      currency: "GHS",
      recipientPhone: "0541234567",
      recipientName: "Kofi",
      confirmationState: "CONFIRMATION_REQUESTED",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    };

    expect(() => truthEngine.assertUserConfirmed(unconfirmedDraft)).toThrowError(/INVARIANT_004/);

    unconfirmedDraft.confirmationState = "CONFIRMED";
    expect(() => truthEngine.assertUserConfirmed(unconfirmedDraft)).not.toThrow();
  });

  it("INVARIANT_005: assertNotExpired rejects drafts past expiresAt timestamp", () => {
    const expiredDraft: TransactionDraft = {
      draftId: "DRAFT_EXPIRED",
      type: "TRANSFER",
      amount: 50,
      currency: "GHS",
      recipientPhone: "0551122334",
      recipientName: "Ama",
      confirmationState: "CONFIRMED",
      createdAt: Date.now() - 150000,
      expiresAt: Date.now() - 10000, // expired 10s ago
    };

    expect(() => truthEngine.assertNotExpired(expiredDraft)).toThrowError(/INVARIANT_005/);
  });

  it("INVARIANT_006: assertNoMaterialChanges detects altered amount or recipient after confirmation", () => {
    const draft: TransactionDraft = {
      draftId: "DRAFT_CONFIRMED",
      type: "TRANSFER",
      amount: 50,
      currency: "GHS",
      recipientPhone: "0551122334",
      recipientName: "Ama",
      confirmationState: "CONFIRMED",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60000,
    };

    // Caller secretly attempts to execute for 150 instead of 50
    expect(() => truthEngine.assertNoMaterialChanges(draft, { amount: 150 })).toThrowError(/INVARIANT_006/);

    // Caller secretly changes recipient phone
    expect(() => truthEngine.assertNoMaterialChanges(draft, { recipientPhone: "0249988776" })).toThrowError(/INVARIANT_006/);

    // Identical parameters are permitted
    expect(() => truthEngine.assertNoMaterialChanges(draft, { amount: 50, recipientPhone: "0551122334" })).not.toThrow();
  });

  it("INVARIANT_010: assertProviderConfirmed rejects pending (202) or failed provider responses", () => {
    expect(() => truthEngine.assertProviderConfirmed({ status: "PENDING" })).toThrowError(/INVARIANT_010/);
    expect(() => truthEngine.assertProviderConfirmed({ status: "FAILED", reason: "Insufficient balance" })).toThrowError(/INVARIANT_010/);
    expect(() => truthEngine.assertProviderConfirmed({ status: "COMPLETED" })).not.toThrow();
  });

  it("INVARIANT_014: Balance inquiry returns BALANCE_NOT_AVAILABLE_VIA_API and instructs USSD *170#", () => {
    const cap = capabilityEngine.checkBalanceCapability();
    expect(cap.allowed).toBe(false);
    expect(cap.status).toBe("BALANCE_NOT_AVAILABLE_VIA_API");
    expect(cap.recommendedUssd).toBe("*170#");

    // Dialogue engine must NEVER speak fake 250.00 GHS
    const dialogueResult = aiDialogue.generate("sess_1", "CHECK_BALANCE", {}, "en");
    expect(dialogueResult.response).not.toContain("250.00");
    expect(dialogueResult.response).toContain("*170#");

    const twiDialogueResult = aiDialogue.generate("sess_2", "CHECK_BALANCE", {}, "tw");
    expect(twiDialogueResult.response).not.toContain("250.00");
    expect(twiDialogueResult.response).toContain("*170#");
  });
});
