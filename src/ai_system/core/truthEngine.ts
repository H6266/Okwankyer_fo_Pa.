/**
 * Ɔkwankyerɛfo Pa - Deterministic Truth Engine (truthEngine.ts)
 * 
 * Enforces ontological integrity across all AI dialogue and execution paths.
 * Prevents hallucinations, fabricated balances, stale confirmations, and
 * premature declarations of completion.
 */

import { SECURITY_INVARIANTS, TransactionDraft } from "./aiTypes";
import { capabilityEngine, CapabilityCheckResult } from "./capabilityEngine";

export class TruthEngineError extends Error {
  public invariantCode: string;
  constructor(invariantCode: string, message: string) {
    super(`TRUTH_ENGINE_VIOLATION [${invariantCode}]: ${message}`);
    this.name = "TruthEngineError";
    this.invariantCode = invariantCode;
  }
}

export class TruthEngine {
  /**
   * Asserts that a critical slot or parameter is genuinely known (not null, undefined, or empty).
   * Fails closed if the slot is missing.
   */
  public assertKnown(key: string, value: any, label: string = key): void {
    if (value === null || value === undefined || value === "") {
      throw new TruthEngineError(
        "INVARIANT_012",
        `Material parameter '${label}' is unknown. Cannot assume or substitute fictional value.`
      );
    }
    if (typeof value === "number" && (isNaN(value) || value <= 0)) {
      throw new TruthEngineError(
        "INVARIANT_012",
        `Material parameter '${label}' is non-positive or invalid number (${value}).`
      );
    }
  }

  /**
   * Asserts that user has provided explicit, non-assumed confirmation for this specific draft.
   */
  public assertUserConfirmed(draft: TransactionDraft | null | undefined): void {
    if (!draft) {
      throw new TruthEngineError("INVARIANT_004", "No active transaction draft exists to authorize.");
    }
    if (draft.confirmationState !== "CONFIRMED") {
      throw new TruthEngineError(
        "INVARIANT_004",
        `Draft is in state '${draft.confirmationState}'. Explicit caller confirmation is required before execution.`
      );
    }
  }

  /**
   * Asserts that confirmation draft has not expired past its time-to-live.
   */
  public assertNotExpired(draft: TransactionDraft | null | undefined, now: number = Date.now()): void {
    if (!draft) {
      throw new TruthEngineError("INVARIANT_005", "Cannot verify expiration of null draft.");
    }
    if (now > draft.expiresAt) {
      throw new TruthEngineError(
        "INVARIANT_005",
        `Transaction confirmation expired at ${draft.expiresAt} (current: ${now}). Re-confirmation required.`
      );
    }
  }

  /**
   * Asserts that no material transaction fields (amount, recipient phone, network)
   * were modified after the user confirmed.
   */
  public assertNoMaterialChanges(
    draft: TransactionDraft,
    currentSlots: Record<string, any>
  ): void {
    if (currentSlots.amount !== undefined && currentSlots.amount !== null) {
      if (Number(currentSlots.amount) !== Number(draft.amount)) {
        throw new TruthEngineError(
          "INVARIANT_006",
          `Material alteration detected: draft amount (${draft.amount}) differs from current request (${currentSlots.amount}). Confirmation revoked.`
        );
      }
    }

    if (currentSlots.recipientPhone) {
      const cleanDraftPhone = (draft.recipientPhone || "").replace(/[^0-9]/g, "");
      const cleanSlotPhone = String(currentSlots.recipientPhone).replace(/[^0-9]/g, "");
      if (cleanDraftPhone && cleanSlotPhone && cleanDraftPhone !== cleanSlotPhone) {
        throw new TruthEngineError(
          "INVARIANT_006",
          `Material alteration detected: draft recipient phone (${draft.recipientPhone}) differs from current request (${currentSlots.recipientPhone}). Confirmation revoked.`
        );
      }
    }
  }

  /**
   * Asserts that a financial transaction is authorized and ready for execution.
   */
  public assertExecutionAllowed(
    draft: TransactionDraft,
    currentSlots: Record<string, any>,
    now: number = Date.now()
  ): void {
    this.assertKnown("amount", draft.amount, "Transaction Amount");
    this.assertKnown("recipientPhone", draft.recipientPhone, "Recipient Phone");
    this.assertUserConfirmed(draft);
    this.assertNotExpired(draft, now);
    this.assertNoMaterialChanges(draft, currentSlots);
  }

  /**
   * Asserts that a provider result is genuinely confirmed and completed before speaking success.
   */
  public assertProviderConfirmed(providerResult: any): void {
    if (!providerResult) {
      throw new TruthEngineError("INVARIANT_010", "Provider result is empty or null.");
    }
    const status = String(providerResult.status || "").toUpperCase();
    if (status !== "SUCCESSFUL" && status !== "COMPLETED") {
      throw new TruthEngineError(
        "INVARIANT_010",
        `Cannot declare financial success. Provider status is '${status}', not COMPLETED.`
      );
    }
  }

  /**
   * Asserts that any balance spoken to a user is authoritatively verified.
   * If balance is not available via API, throws or returns the correct capability result.
   */
  public evaluateBalanceInquiry(phone?: string): CapabilityCheckResult {
    return capabilityEngine.checkBalanceCapability(phone);
  }
}

export const truthEngine = new TruthEngine();
