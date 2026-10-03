/**
 * Ɔkwankyerɛfo Pa - Service Orchestrator & MTN MoMo Transaction Pipeline
 * 
 * ARCHITECTURAL SEAM:
 * Both Voice Input and Keypad Input converge on this single pipeline.
 * Neither path may bypass this orchestrator.
 * 
 */

import { mtnMomoService, MoMoTransactionRecord } from "./mtnMomoService";
import { durableTransactionStore, DurableTransactionStore } from "../services/durableTransactionStore";

export interface TransactionRequest {
  source: "VOICE" | "KEYPAD";
  network: "MTN" | "Telecel" | "AT";
  recipient_phone: string;
  recipient_name: string;
  amount: number;
  currency?: "GHS";
  sessionId?: string;
  idempotencyKey?: string;
  payer_phone?: string;
  payer_name?: string;
}

export interface TransactionResult {
  status: "SUCCESS" | "FAILED" | "PENDING";
  reference: string;
  amount: number;
  currency: string;
  recipient_name: string;
  recipient_phone: string;
  network: string;
  timestamp: string;
  message: string;
  spokenReceipt: string;
  momoDetails?: {
    referenceId: string;
    mode: "LIVE_API" | "SANDBOX_API";
    status: string;
    financialTransactionId?: string;
  };
}

export interface AccountBalance {
  currency: string;
  balance: number;
  formatted: string;
  network: string;
}

export class ServiceOrchestrator {
  private store: DurableTransactionStore;

  constructor(customStore?: DurableTransactionStore) {
    this.store = customStore || durableTransactionStore;
  }

  /**
   * Generates a unique, dynamic telecom transaction reference (e.g. OKP-847291)
   */
  private generateReference(): string {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `OKP-${randomDigits}`;
  }

  /**
   * Executes SEND_MONEY transaction
   * Converged execution point for both voice and keypad
   */
  public async executeSendMoney(request: TransactionRequest): Promise<TransactionResult> {
    const { network, recipient_phone, recipient_name, amount, source } = request;

    // Strict Payer Validation: Payer cannot be undefined, empty, or fallback to recipient!
    if (!request.payer_phone || !request.payer_phone.trim()) {
      throw new Error("Missing payer phone number. Transaction aborted: Payer phone must be verified from telephony caller ID.");
    }
    const payerPhone = request.payer_phone.trim();

    // Strict Recipient and Amount Validation
    if (!recipient_phone || !recipient_name || !amount || amount <= 0) {
      throw new Error("Invalid transaction request: verified recipient and valid positive amount are strictly required.");
    }

    // Velocity & Limits Check
    const velocityCheck = this.store.checkVelocityLimits(payerPhone, recipient_phone, amount);
    if (!velocityCheck.allowed) {
      throw new Error(`Transaction rejected by safety policy: ${velocityCheck.reason}`);
    }

    // Idempotency check: hash of session + phone + amount
    const idempotencyKey =
      request.idempotencyKey ||
      `${request.sessionId || "global"}_${recipient_phone}_${amount}`;

    const cached = this.store.getIdempotencyResult(idempotencyKey);
    if (cached) {
      console.log(`[ServiceOrchestrator] Idempotent replay detected for ${idempotencyKey}`);
      return cached;
    }

    // Record velocity attempt before outbound dispatch
    this.store.recordVelocityAttempt(payerPhone, recipient_phone, amount);

    // Create real-time dynamic timestamp
    const timestamp = new Date().toISOString();
    const reference = this.generateReference();
    const timeFormatted = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (network && network !== "MTN") {
      throw new Error("Only MTN MoMo transactions are currently connected.");
    }

    const momoTx = await mtnMomoService.requestToPay({
      amount,
      payerPhone,
      payerName: request.payer_name || "Verified Subscriber",
      payerMessage: `Transfer of GH₵${amount} to ${recipient_name}`,
      payeeNote: `Ɔkwankyerɛfo Pa Voice MoMo Transfer to ${recipient_phone}`,
      externalId: reference,
    });
    const momoDetails: TransactionResult["momoDetails"] = {
      referenceId: momoTx.referenceId,
      mode: momoTx.mode,
      status: momoTx.status,
      financialTransactionId: momoTx.financialTransactionId,
    };
    const status: TransactionResult["status"] =
      momoTx.status === "SUCCESSFUL"
        ? "SUCCESS"
        : momoTx.status === "PENDING"
          ? "PENDING"
          : "FAILED";
    const last4 = recipient_phone.slice(-4).split("").join(" ");
    const spokenReceipt = status === "PENDING"
      ? `MTN has accepted your MoMo request to send ${amount} Ghana Cedis to ${recipient_name}, phone number ending in ${last4}. Please approve the request on your handset. Your transaction reference is ${reference.split("").join(" ")}.`
      : status === "SUCCESS"
        ? `Your MTN MoMo transfer of ${amount} Ghana Cedis to ${recipient_name}, phone number ending in ${last4}, was successful. Completed at ${timeFormatted}. Your transaction reference is ${reference.split("").join(" ")}.`
        : `Your MTN MoMo transfer of ${amount} Ghana Cedis to ${recipient_name} was not completed. Please contact support with transaction reference ${reference.split("").join(" ")}.`;

    const result: TransactionResult = {
      status,
      reference,
      amount,
      currency: momoTx.currency,
      recipient_name,
      recipient_phone,
      network: network || "MTN",
      timestamp,
      message: status === "PENDING"
        ? `Transaction ${reference} was accepted by MTN and is pending confirmation.`
        : status === "SUCCESS"
          ? `Transaction ${reference} completed via ${source}.`
          : `Transaction ${reference} was not completed by MTN.`,
      spokenReceipt,
      momoDetails,
    };

    // Store in durable idempotency cache
    this.store.saveIdempotencyResult(idempotencyKey, result);

    console.log(
      `[ServiceOrchestrator] MTN transaction ${reference}: ${status} - ${amount} ${momoTx.currency} to ${recipient_name} via ${source}`
    );

    return result;
  }

  public async getAccountBalance(network: string = "MTN"): Promise<AccountBalance> {
    if (network !== "MTN") {
      throw new Error("Only MTN MoMo balance is currently connected.");
    }

    const balance = await mtnMomoService.getAccountBalance("collection");
    return {
      currency: balance.currency,
      balance: balance.availableBalance,
      formatted: balance.formatted,
      network: "MTN",
    };
  }
}

export const transactionOrchestrator = new ServiceOrchestrator();
