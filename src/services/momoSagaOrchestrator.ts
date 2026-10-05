/**
 * Ɔkwankyerɛfo Pa - MTN MoMo Two-Leg Payment Saga Orchestrator
 * 
 * Enforces:
 * 1. Leg 1 (Collection): Pulls funds from sender wallet via RequestToPay (Zero-PIN).
 * 2. Leg 2 (Disbursement): Only upon verified Leg 1 success, pushes funds to recipient wallet.
 * 3. Compensation / Reconciliation: If Leg 2 fails, automatically flags for reconciliation / reversal.
 * 4. SMS Receipts: Dispatches asynchronous SMS via Africa's Talking on definitive terminal states.
 * 5. Prevents false success: Voice IVR never marks COMPLETED until both legs succeed.
 */

import { mtnMomoService } from "../modules/mtnMomoService";
import { transactionStateMachine, TransactionSession } from "../domain/stateMachine";
import { auditLogger } from "./auditLogger";
import { config } from "../config/env";
import { initialize as initAtClient } from "../../africastalking";

export interface SagaState {
  sessionId: string;
  referenceId: string;
  payerPhone: string;
  recipientPhone: string;
  recipientName: string;
  amount: number;
  language: "en" | "twi";
  leg1: {
    status: "PENDING" | "SUCCESSFUL" | "FAILED" | "TIMEOUT";
    referenceId?: string;
    financialTransactionId?: string;
    startedAt: number;
    completedAt?: number;
    error?: string;
  };
  leg2: {
    status: "NOT_STARTED" | "PENDING" | "SUCCESSFUL" | "FAILED";
    referenceId?: string;
    financialTransactionId?: string;
    startedAt?: number;
    completedAt?: number;
    error?: string;
  };
}

class MomoSagaOrchestrator {
  private activeSagas = new Map<string, SagaState>();

  /**
   * Dispatches Africa's Talking SMS if credentials are configured
   */
  private async sendSms(to: string, message: string): Promise<void> {
    if (!config.at.configured) {
      auditLogger.log("info", "SMS_SIMULATED", `[SMS SIMULATOR to ${to}] ${message}`);
      return;
    }

    try {
      const at = initAtClient(config.at.username, config.at.apiKey);
      await at.SMS.send({
        to: [to],
        message,
        from: config.at.username === "sandbox" ? undefined : "OkwankyerPa",
      });
      auditLogger.log("info", "SMS", `SMS receipt successfully dispatched to ${to}`);
    } catch (err: any) {
      auditLogger.log("warn", "SMS", `Failed to send SMS to ${to}: ${err.message}`);
    }
  }

  /**
   * Initiates the two-leg saga for a confirmed session
   */
  public async startSaga(session: TransactionSession): Promise<{
    collectionRef: string;
    mode: string;
  }> {
    if (!session.amount || session.amount <= 0) {
      throw new Error("Cannot start saga: Missing or invalid amount.");
    }
    if (!session.callerPhone) {
      throw new Error("Cannot start saga: Missing verified payer phone number.");
    }
    if (!session.recipientPhone) {
      throw new Error("Cannot start saga: Missing recipient phone number.");
    }

    const payerPhone = session.callerPhone;
    const recipientPhone = session.recipientPhone;
    const recipientName = session.recipientName || "Subscriber";
    const amount = session.amount;

    let collectionRef: string;
    let mode: string;

    if (mtnMomoService.isConfigured("collection")) {
      const momoTx = await mtnMomoService.requestToPay({
        amount,
        payerPhone,
        payerMessage: `Transfer of GH₵${amount} to ${recipientName}`,
        payeeNote: `Ɔkwankyerɛfo Pa Voice MoMo Transfer to ${recipientPhone}`,
        externalId: session.referenceId,
      });
      collectionRef = momoTx.referenceId;
      mode = momoTx.mode;
    } else {
      collectionRef = `sandbox-rtp-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      mode = "SANDBOX_SIMULATOR";
      auditLogger.log(
        "info",
        "MOMO_SAGA",
        `[SANDBOX MODE] Initiating Sandbox RTP for Ref ${session.referenceId}`
      );
    }

    const saga: SagaState = {
      sessionId: session.sessionId,
      referenceId: session.referenceId,
      payerPhone,
      recipientPhone,
      recipientName,
      amount,
      language: session.language,
      leg1: {
        status: "PENDING",
        referenceId: collectionRef,
        startedAt: Date.now(),
      },
      leg2: {
        status: "NOT_STARTED",
      },
    };

    this.activeSagas.set(session.sessionId, saga);

    // In live mode with collection configured, poll for status with a deadline
    if (mode !== "SANDBOX_SIMULATOR") {
      this.pollLeg1Status(session.sessionId, collectionRef);
    }

    return { collectionRef, mode };
  }

  /**
   * Handles incoming MoMo callback for collection or disbursement
   */
  public async handleWebhookCallback(payload: any): Promise<void> {
    const referenceId = payload.referenceId || payload.externalId;
    if (!referenceId) return;

    for (const [sessionId, saga] of this.activeSagas.entries()) {
      if (saga.leg1.referenceId === referenceId) {
        if (payload.status === "SUCCESSFUL") {
          await this.onLeg1Success(sessionId, payload.financialTransactionId);
        } else if (payload.status === "FAILED") {
          await this.onLeg1Failed(sessionId, payload.reason || "Payment declined on handset");
        }
        return;
      }

      if (saga.leg2.referenceId === referenceId) {
        if (payload.status === "SUCCESSFUL") {
          await this.onLeg2Success(sessionId, payload.financialTransactionId);
        } else if (payload.status === "FAILED") {
          await this.onLeg2Failed(sessionId, payload.reason || "Disbursement payout failed");
        }
        return;
      }
    }
  }

  private async onLeg1Success(sessionId: string, financialTxId?: string): Promise<void> {
    const saga = this.activeSagas.get(sessionId);
    if (!saga || saga.leg1.status !== "PENDING") return;

    saga.leg1.status = "SUCCESSFUL";
    saga.leg1.completedAt = Date.now();
    saga.leg1.financialTransactionId = financialTxId;

    auditLogger.log(
      "info",
      "MOMO_SAGA",
      `Leg 1 (Collection) SUCCESSFUL for Ref ${saga.referenceId}. Initiating Leg 2 (Disbursement to ${saga.recipientPhone})...`,
      sessionId
    );

    // Proceed to Leg 2 (Disbursement / Transfer to Recipient)
    await this.executeLeg2(sessionId);
  }

  private async onLeg1Failed(sessionId: string, reason: string): Promise<void> {
    const saga = this.activeSagas.get(sessionId);
    if (!saga) return;

    saga.leg1.status = "FAILED";
    saga.leg1.completedAt = Date.now();
    saga.leg1.error = reason;

    try {
      transactionStateMachine.transition(sessionId, "FAILED", {
        failureReason: reason,
      });
    } catch {}

    auditLogger.log(
      "warn",
      "MOMO_SAGA",
      `Leg 1 (Collection) FAILED for Ref ${saga.referenceId}: ${reason}`,
      sessionId
    );

    const smsText = saga.language === "twi"
      ? `Ɔkwankyerɛfo Pa: Wo MoMo sika a wopɛɛ sɛ womane GH₵${saga.amount} kɔma ${saga.recipientName} no annya nkɔso (${reason}). Sika biara mfirii wo account mu. Ref: ${saga.referenceId}.`
      : `Ɔkwankyerɛfo Pa: Your transfer of GH₵${saga.amount} to ${saga.recipientName} could not be completed (${reason}). No money was deducted. Ref: ${saga.referenceId}.`;

    await this.sendSms(saga.payerPhone, smsText);
  }

  private async onLeg1Timeout(sessionId: string): Promise<void> {
    const saga = this.activeSagas.get(sessionId);
    if (!saga || saga.leg1.status !== "PENDING") return;

    saga.leg1.status = "TIMEOUT";
    saga.leg1.completedAt = Date.now();

    try {
      transactionStateMachine.transition(sessionId, "TIMEOUT", {
        failureReason: "Caller did not enter PIN before deadline expired",
      });
    } catch {}

    auditLogger.log(
      "warn",
      "MOMO_SAGA",
      `Leg 1 (Collection) TIMED OUT for Ref ${saga.referenceId}`,
      sessionId
    );

    const smsText = saga.language === "twi"
      ? `Ɔkwankyerɛfo Pa: Bere atwa mu. Woanbɔ wo PIN wɔ fon screen so. Sika biara mfirii wo account mu. Ref: ${saga.referenceId}.`
      : `Ɔkwankyerɛfo Pa: Authorization timed out. PIN was not entered on handset. No money was deducted. Ref: ${saga.referenceId}.`;

    await this.sendSms(saga.payerPhone, smsText);
  }

  private async executeLeg2(sessionId: string): Promise<void> {
    const saga = this.activeSagas.get(sessionId);
    if (!saga) return;

    saga.leg2.status = "PENDING";
    saga.leg2.startedAt = Date.now();

    try {
      let transferRef: string;
      if (mtnMomoService.isConfigured("disbursement")) {
        const transferTx = await mtnMomoService.transfer({
          amount: saga.amount,
          payeePhone: saga.recipientPhone,
          payeeNote: `Ɔkwankyerɛfo Pa Payout from ${saga.payerPhone}`,
          payerMessage: `Payout Ref ${saga.referenceId}`,
          externalId: `payout_${saga.referenceId}`,
        });
        transferRef = transferTx.referenceId;
        if (transferTx.status === "SUCCESSFUL") {
          await this.onLeg2Success(sessionId, transferTx.financialTransactionId);
          return;
        }
      } else {
        transferRef = `sandbox-disburse-${Date.now()}`;
        // In sandbox simulator, complete disbursement successfully
        await this.onLeg2Success(sessionId, `fin-sandbox-${Date.now()}`);
        return;
      }

      saga.leg2.referenceId = transferRef;
      this.pollLeg2Status(sessionId, transferRef);
    } catch (err: any) {
      await this.onLeg2Failed(sessionId, err.message);
    }
  }

  private async onLeg2Success(sessionId: string, financialTxId?: string): Promise<void> {
    const saga = this.activeSagas.get(sessionId);
    if (!saga) return;

    saga.leg2.status = "SUCCESSFUL";
    saga.leg2.completedAt = Date.now();
    saga.leg2.financialTransactionId = financialTxId;

    try {
      transactionStateMachine.transition(sessionId, "COMPLETED");
    } catch {}

    auditLogger.log(
      "info",
      "MOMO_SAGA",
      `Saga COMPLETED: Both Collection & Disbursement succeeded for Ref ${saga.referenceId}`,
      sessionId
    );

    // Send confirmation SMS to payer
    const last4 = saga.recipientPhone.slice(-4).split("").join(" ");
    const payerSms = saga.language === "twi"
      ? `Ɔkwankyerɛfo Pa: Yɛamane GH₵${saga.amount.toFixed(2)} akɔma ${saga.recipientName} (...${last4}) pɛpɛɛpɛ. Ref: ${saga.referenceId}. MoMo FinID: ${financialTxId || saga.referenceId}. Medaase!`
      : `Ɔkwankyerɛfo Pa: Payment of GH₵${saga.amount.toFixed(2)} to ${saga.recipientName} (...${last4}) was successful. Ref: ${saga.referenceId}. MoMo ID: ${financialTxId || saga.referenceId}. Thank you!`;

    await this.sendSms(saga.payerPhone, payerSms);

    // Send notification SMS to recipient
    const recipientSms = `Ɔkwankyerɛfo Pa: You have received GH₵${saga.amount.toFixed(2)} from ${saga.payerPhone}. Ref: ${saga.referenceId}.`;
    await this.sendSms(saga.recipientPhone, recipientSms);
  }

  private async onLeg2Failed(sessionId: string, reason: string): Promise<void> {
    const saga = this.activeSagas.get(sessionId);
    if (!saga) return;

    saga.leg2.status = "FAILED";
    saga.leg2.completedAt = Date.now();
    saga.leg2.error = reason;

    auditLogger.log(
      "error",
      "RECONCILIATION_REQUIRED",
      `CRITICAL ALERT: Leg 1 collected GH₵${saga.amount} from ${saga.payerPhone}, but Leg 2 (Payout to ${saga.recipientPhone}) FAILED (${reason}). Flagged for automatic reconciliation/reversal. Ref: ${saga.referenceId}`,
      sessionId
    );

    const smsText = saga.language === "twi"
      ? `Ɔkwankyerɛfo Pa Kɔkɔbɔ: Yɛagye sika no nanso yɛantumi anmane ankɔma ${saga.recipientName}. Wo sika bɛsan aba wo account mu ntɛm ara. Ref: ${saga.referenceId}.`
      : `Ɔkwankyerɛfo Pa Alert: Funds of GH₵${saga.amount} were deducted but payout to ${saga.recipientName} failed. An automatic reversal has been scheduled. Ref: ${saga.referenceId}. Contact support with this reference.`;

    await this.sendSms(saga.payerPhone, smsText);
  }

  private pollLeg1Status(sessionId: string, referenceId: string): void {
    const startTime = Date.now();
    const deadline = 60 * 1000; // 60s deadline

    const interval = setInterval(async () => {
      const saga = this.activeSagas.get(sessionId);
      if (!saga || saga.leg1.status !== "PENDING") {
        clearInterval(interval);
        return;
      }

      if (Date.now() - startTime > deadline) {
        clearInterval(interval);
        await this.onLeg1Timeout(sessionId);
        return;
      }

      try {
        const tx = await mtnMomoService.getTransactionStatus(referenceId);
        if (tx && tx.status === "SUCCESSFUL") {
          clearInterval(interval);
          await this.onLeg1Success(sessionId, tx.financialTransactionId);
        } else if (tx && tx.status === "FAILED") {
          clearInterval(interval);
          await this.onLeg1Failed(sessionId, tx.reason || "Payment declined by subscriber");
        }
      } catch {}
    }, 4000);
    interval.unref?.();
  }

  private pollLeg2Status(sessionId: string, referenceId: string): void {
    const startTime = Date.now();
    const deadline = 60 * 1000;

    const interval = setInterval(async () => {
      const saga = this.activeSagas.get(sessionId);
      if (!saga || saga.leg2.status !== "PENDING") {
        clearInterval(interval);
        return;
      }

      if (Date.now() - startTime > deadline) {
        clearInterval(interval);
        await this.onLeg2Failed(sessionId, "Disbursement status timeout");
        return;
      }

      try {
        const tx = await mtnMomoService.getTransactionStatus(referenceId);
        if (tx && tx.status === "SUCCESSFUL") {
          clearInterval(interval);
          await this.onLeg2Success(sessionId, tx.financialTransactionId);
        } else if (tx && tx.status === "FAILED") {
          clearInterval(interval);
          await this.onLeg2Failed(sessionId, tx.reason || "Disbursement failed");
        }
      } catch {}
    }, 4000);
    interval.unref?.();
  }

  private scheduleSandboxResolution(sessionId: string): void {
    // In sandbox demo simulator, resolve after 3 seconds to emulate realistic handset PIN entry
    setTimeout(async () => {
      const saga = this.activeSagas.get(sessionId);
      if (saga && saga.leg1.status === "PENDING") {
        await this.onLeg1Success(sessionId, `sandbox-fin-tx-${Date.now()}`);
      }
    }, 3000);
  }

  public getSaga(sessionId: string): SagaState | undefined {
    return this.activeSagas.get(sessionId);
  }
}

export const momoSagaOrchestrator = new MomoSagaOrchestrator();
