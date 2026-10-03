/**
 * Ɔkwankyerɛfo Pa - Service Orchestrator & Mock Transaction Pipeline
 * 
 * ARCHITECTURAL SEAM:
 * Both Voice Input and Keypad Input converge on this single pipeline.
 * Neither path may bypass this orchestrator.
 * 
 */

import { mtnMomoService, MoMoTransactionRecord } from "./mtnMomoService";

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
    mode: "LIVE_API" | "SANDBOX_API" | "EMULATOR";
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

class ServiceOrchestrator {
  // In-memory idempotency cache to prevent accidental double-billing
  private processedTransactions = new Map<string, TransactionResult>();

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

    // Idempotency check: hash of session + phone + amount
    const idempotencyKey =
      request.idempotencyKey ||
      `${request.sessionId || "global"}_${recipient_phone}_${amount}`;

    if (this.processedTransactions.has(idempotencyKey)) {
      const cached = this.processedTransactions.get(idempotencyKey)!;
      console.log(`[ServiceOrchestrator] Idempotent replay detected for ${idempotencyKey}`);
      return cached;
    }

    // Validation
    if (!recipient_phone || !recipient_name || !amount || amount <= 0) {
      throw new Error("Invalid transaction request: amount and recipient are required.");
    }

    // Create real-time dynamic timestamp
    const timestamp = new Date().toISOString();
    const reference = this.generateReference();
    const timeFormatted = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    // MTN MoMo is the financial authority.
    // Never announce success until MoMo reports SUCCESSFUL.
    if (network && network !== "MTN") {
      throw new Error(`Network ${network} is not yet integrated with the MoMo transaction gateway.`);
    }

    const momoTx = await mtnMomoService.transfer({
      amount,
      payeePhone: recipient_phone,
      payeeName: recipient_name,
      payerMessage: `Transfer of GHS ${amount} to ${recipient_name}`,
      payeeNote: `Ɔkwankyerɛfo Pa Voice MoMo Transfer to ${recipient_phone}`,
      externalId: reference,
    });

    const momoStatus = momoTx.status;

    const resultStatus: TransactionResult["status"] =
      momoStatus === "SUCCESSFUL"
        ? "SUCCESS"
        : ["FAILED", "REJECTED", "TIMEOUT"].includes(momoStatus)
          ? "FAILED"
          : "PENDING";

    const last4 = recipient_phone.slice(-4).split("").join(" ");

    const spokenStatus =
      resultStatus === "SUCCESS"
        ? `You have successfully sent ${amount} Ghana Cedis to ${recipient_name}, phone number ending in ${last4}. `
        : resultStatus === "PENDING"
          ? `Your transfer of ${amount} Ghana Cedis to ${recipient_name} is still being processed. I will not announce it as successful until MTN confirms the final result. `
          : `Your transfer of ${amount} Ghana Cedis to ${recipient_name} was not completed. `;

    const spokenReceipt =
      spokenStatus +
      `Transaction reference is ${reference.split("").join(" ")}. Would you like to do anything else today?`;

    const result: TransactionResult = {
      status: resultStatus,
      reference,
      amount,
      currency: "GHS",
      recipient_name,
      recipient_phone,
      network: network || "MTN",
      timestamp,
      message:
        resultStatus === "SUCCESS"
          ? `Transaction ${reference} completed via ${source}.`
          : resultStatus === "PENDING"
            ? `Transaction ${reference} is processing via ${source}.`
            : `Transaction ${reference} failed via ${source}.`,
      spokenReceipt,
      momoDetails: {
        referenceId: momoTx.referenceId,
        mode: momoTx.mode,
        status: momoTx.status,
        financialTransactionId: momoTx.financialTransactionId,
      },
    };

    // Store in idempotency cache
    this.processedTransactions.set(idempotencyKey, result);

    console.log(
      `[ServiceOrchestrator] Transaction executed: ${reference} - GH₵${amount} to ${recipient_name} via ${source}`
    );

    return result;
  }

  /**
   * Retrieves the authoritative MTN MoMo account balance.
   */
  public async getAccountBalance(network: string = "MTN"): Promise<AccountBalance> {
    if (network !== "MTN") {
      throw new Error(`Network ${network} is not yet integrated with the MoMo balance gateway.`);
    }

    const balance = await mtnMomoService.getAccountBalance("disbursement");

    return {
      currency: balance.currency,
      balance: balance.availableBalance,
      formatted: balance.formatted,
      network,
    };
  }


}

export const transactionOrchestrator = new ServiceOrchestrator();
