/**
 * Ɔkwankyerɛfo Pa - Payment Reconciliation Service (paymentReconciliation.ts)
 * 
 * Scans for and reconciles transactions and saga payments stuck in PENDING status.
 * Invariant: If a payment stays PENDING beyond timeout (default 5 minutes),
 * triggers reconciliation check and alerts ops team.
 */

import { durableTransactionStore } from "./durableTransactionStore";
import { auditLogger } from "./auditLogger";
import { mtnMomoService } from "../modules/mtnMomoService";
import { momoProvider } from "../integrations/momo/momoProvider";

export interface ReconciledPaymentResult {
  sessionId: string;
  sagaId?: string;
  referenceId: string;
  previousState: string;
  resolvedState: "COMPLETED" | "FAILED" | "EXPIRED" | "RECONCILIATION_REQUIRED";
  ageMinutes: number;
  notes: string;
}

export interface ReconciliationReport {
  timestamp: string;
  totalPendingScanned: number;
  reconciledCount: number;
  flaggedCount: number;
  results: ReconciledPaymentResult[];
}

export class PaymentReconciliationService {
  private static instance: PaymentReconciliationService;
  private readonly DEFAULT_PENDING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  public static getInstance(): PaymentReconciliationService {
    if (!PaymentReconciliationService.instance) {
      PaymentReconciliationService.instance = new PaymentReconciliationService();
    }
    return PaymentReconciliationService.instance;
  }

  /**
   * Scans sessions and sagas for stuck PENDING states and reconciles them.
   */
  public async reconcilePendingPayments(
    pendingTimeoutMs: number = this.DEFAULT_PENDING_TIMEOUT_MS
  ): Promise<ReconciliationReport> {
    const now = Date.now();
    const results: ReconciledPaymentResult[] = [];
    const sessions = durableTransactionStore.getAllSessions();
    const sagas = durableTransactionStore.getAllSagas();

    // 1. Reconcile Sessions in PIN_PENDING
    for (const session of sessions) {
      if (session.state === "PIN_PENDING") {
        const ageMs = now - (session.updatedAt || session.createdAt || now);
        if (ageMs >= pendingTimeoutMs) {
          const ageMinutes = Math.round(ageMs / 60000);
          const ref = session.referenceId || session.sessionId;

          let resolvedState: ReconciledPaymentResult["resolvedState"] = "RECONCILIATION_REQUIRED";
          let notes = `Payment remained PIN_PENDING for ${ageMinutes}m exceeding ${Math.round(pendingTimeoutMs / 60000)}m SLA.`;

          try {
            // Check provider status if reference available
            if (session.referenceId) {
              const statusCheck = await momoProvider.getTransactionStatus(session.referenceId);
              if (statusCheck && (statusCheck as any).status === "SUCCESSFUL") {
                resolvedState = "COMPLETED";
                session.state = "COMPLETED";
                session.updatedAt = now;
                durableTransactionStore.saveSession(session);
                notes = "Reconciled with MoMo provider as SUCCESSFUL.";
              } else if (statusCheck && (statusCheck as any).status === "FAILED") {
                resolvedState = "FAILED";
                session.state = "FAILED";
                session.updatedAt = now;
                durableTransactionStore.saveSession(session);
                notes = "Reconciled with MoMo provider as FAILED.";
              }
            }
          } catch {
            // Provider query timed out or failed
          }

          if (resolvedState === "RECONCILIATION_REQUIRED") {
            // Mark session as expired to prevent endless dangling
            session.state = "FAILED";
            session.updatedAt = now;
            durableTransactionStore.saveSession(session);
            resolvedState = "EXPIRED";
            notes = `Session expired after ${ageMinutes}m without USSD confirmation. Guarded fail-closed.`;

            auditLogger.log(
              "error",
              "RECONCILIATION_REQUIRED",
              `ALERT: Transaction ${ref} pending beyond ${ageMinutes} minutes. Marked EXPIRED. Call ops immediately.`
            );
          }

          results.push({
            sessionId: session.sessionId,
            referenceId: ref,
            previousState: "PIN_PENDING",
            resolvedState,
            ageMinutes,
            notes,
          });
        }
      }
    }

    // 2. Reconcile Sagas in PENDING
    for (const saga of sagas) {
      if (saga.state === "REQUEST_TO_PAY_SENT" || saga.state === "WAITING_FOR_CUSTOMER_AUTHORIZATION") {
        const ageMs = now - (saga.updatedAt || saga.createdAt || now);
        if (ageMs >= pendingTimeoutMs) {
          const ageMinutes = Math.round(ageMs / 60000);
          saga.state = "COLLECTION_TIMEOUT";
          saga.updatedAt = now;
          durableTransactionStore.saveSaga(saga);

          results.push({
            sessionId: saga.sagaId,
            sagaId: saga.sagaId,
            referenceId: saga.idempotencyKey,
            previousState: "PENDING",
            resolvedState: "EXPIRED",
            ageMinutes,
            notes: `Saga expired after ${ageMinutes}m without completion. Marked FAILED.`,
          });
        }
      }
    }

    const reconciledCount = results.filter((r) => r.resolvedState !== "RECONCILIATION_REQUIRED").length;
    const flaggedCount = results.filter((r) => r.resolvedState === "RECONCILIATION_REQUIRED").length;

    return {
      timestamp: new Date().toISOString(),
      totalPendingScanned: results.length,
      reconciledCount,
      flaggedCount,
      results,
    };
  }

  public getPendingTransactionsCount(): number {
    const sessions = durableTransactionStore.getAllSessions();
    return sessions.filter((s) => s.state === "PIN_PENDING").length;
  }
}

export const paymentReconciliation = PaymentReconciliationService.getInstance();
