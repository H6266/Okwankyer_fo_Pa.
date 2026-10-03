/**
 * Ɔkwankyerɛfo Pa - Transaction Memory & Lifecycle Controller
 * Controlled transient state for transactions. Zero-PIN enforced.
 */

import { TelcoNetwork } from "../core/aiTypes";

export interface ActiveTransactionContext {
  sessionId: string;
  transactionType: "SEND_MONEY" | "PAY_BILL" | "BUY_AIRTIME" | "CASH_OUT";
  network: TelcoNetwork | null;
  recipientPhone: string | null;
  recipientName: string | null;
  amount: number | null;
  currency: "GHS";
  isConfirmed: boolean;
  status: "INITIATED" | "AWAITING_AUTH" | "COMPLETED" | "CANCELLED" | "FAILED";
  referenceId?: string;
  startedAt: number;
}

export class TransactionMemory {
  private activeTransactions = new Map<string, ActiveTransactionContext>();

  public startTransaction(
    sessionId: string,
    type: "SEND_MONEY" | "PAY_BILL" | "BUY_AIRTIME" | "CASH_OUT"
  ): ActiveTransactionContext {
    const tx: ActiveTransactionContext = {
      sessionId,
      transactionType: type,
      network: null,
      recipientPhone: null,
      recipientName: null,
      amount: null,
      currency: "GHS",
      isConfirmed: false,
      status: "INITIATED",
      startedAt: Date.now(),
    };
    this.activeTransactions.set(sessionId, tx);
    return tx;
  }

  public getTransaction(sessionId: string): ActiveTransactionContext | undefined {
    return this.activeTransactions.get(sessionId);
  }

  public updateTransaction(
    sessionId: string,
    patch: Partial<ActiveTransactionContext>
  ): ActiveTransactionContext | undefined {
    const tx = this.activeTransactions.get(sessionId);
    if (!tx) return undefined;

    // Strict guard against injection of credentials
    const cleanPatch = { ...patch };
    delete (cleanPatch as any).pin;
    delete (cleanPatch as any).momoPin;
    delete (cleanPatch as any).password;
    delete (cleanPatch as any).secret;

    const updated = { ...tx, ...cleanPatch };
    this.activeTransactions.set(sessionId, updated);
    return updated;
  }

  /**
   * Clears transaction memory upon completion or cancellation.
   */
  public finalize(sessionId: string): void {
    this.activeTransactions.delete(sessionId);
  }
}

export const transactionMemory = new TransactionMemory();
