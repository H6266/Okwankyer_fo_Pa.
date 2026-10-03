/**
 * Ɔkwankyerɛfo Pa - Service Orchestrator & MTN MoMo Transaction Pipeline
 * 
 * ARCHITECTURAL SEAM:
 * Both Voice Input and Keypad Input converge on this single pipeline.
 * Neither path may bypass this orchestrator.
 * 
 * Functions orchestrated:
 * - executeSendMoney: Transfer funds to another MoMo user
 * - buyAirtime: Purchase telecom airtime
 * - buyData: Purchase internet data bundle
 * - payBill: Pay utility and merchant bills
 * - cashOut: Allow and authorize cash out withdrawals
 * - getAccountBalance: Single source of truth wallet balance inquiry
 */

import { mtnMomoService, MoMoTransactionRecord } from "./mtnMomoService";

export interface TransactionRequest {
  source: "VOICE" | "KEYPAD" | "API";
  network: "MTN" | "Telecel" | "AT" | string;
  recipient_phone: string;
  recipient_name: string;
  amount: number;
  currency?: "GHS" | string;
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
  type?: string;
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
  mode?: "LIVE_API" | "SANDBOX_API" | "EMULATOR";
}

class ServiceOrchestrator {
  // In-memory idempotency cache to prevent accidental double-billing
  private processedTransactions = new Map<string, TransactionResult>();

  /**
   * Generates a unique, dynamic telecom transaction reference (e.g. OKP-847291)
   */
  public generateReference(): string {
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `OKP-${randomDigits}`;
  }

  /**
   * 1. SEND MONEY (Disbursement / Transfer to Recipient)
   */
  public async executeSendMoney(request: TransactionRequest): Promise<TransactionResult> {
    const { network, recipient_phone, recipient_name, amount, source } = request;

    const idempotencyKey =
      request.idempotencyKey ||
      `${request.sessionId || "global"}_${recipient_phone}_${amount}`;

    if (this.processedTransactions.has(idempotencyKey)) {
      const cached = this.processedTransactions.get(idempotencyKey)!;
      console.log(`[ServiceOrchestrator] Idempotent replay detected for ${idempotencyKey}`);
      return cached;
    }

    if (!recipient_phone || !recipient_name || !amount || amount <= 0) {
      throw new Error("Invalid transaction request: amount and recipient are required.");
    }

    const timestamp = new Date().toISOString();
    const reference = this.generateReference();
    const timeFormatted = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    if (network && network !== "MTN" && !["MTN", "Telecel", "AT"].includes(network)) {
      throw new Error("Invalid network specified.");
    }

    // Use Transfer (disbursement) path for Send Money
    const momoTx = await mtnMomoService.transfer({
      amount,
      payeePhone: recipient_phone,
      payeeName: recipient_name,
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
      type: "DISBURSEMENT_TRANSFER",
    };

    this.processedTransactions.set(idempotencyKey, result);
    return result;
  }

  /**
   * 2. BUY AIRTIME
   */
  public async buyAirtime(params: {
    phone: string;
    amount: number;
    network?: string;
    source?: "VOICE" | "KEYPAD" | "API";
  }): Promise<TransactionResult> {
    const { phone, amount, network = "MTN", source = "API" } = params;
    if (!phone || !amount || amount <= 0) {
      throw new Error("Invalid airtime request: phone and valid amount are required.");
    }

    const reference = this.generateReference();
    const momoTx = await mtnMomoService.buyAirtime({
      phone,
      amount,
      network,
      externalId: reference,
    });

    const status: TransactionResult["status"] =
      momoTx.status === "SUCCESSFUL" ? "SUCCESS" : momoTx.status === "PENDING" ? "PENDING" : "FAILED";

    const last4 = phone.slice(-4).split("").join(" ");
    const spokenReceipt = `Your airtime purchase of ${amount} Ghana Cedis for ${phone}, ending in ${last4}, was successful. Transaction reference is ${reference.split("").join(" ")}.`;

    return {
      status,
      reference,
      amount,
      currency: momoTx.currency,
      recipient_name: `${network} Airtime`,
      recipient_phone: phone,
      network,
      timestamp: momoTx.createdAt,
      message: `Airtime of GH₵ ${amount} sent to ${phone} via ${source}.`,
      spokenReceipt,
      type: "AIRTIME",
      momoDetails: {
        referenceId: momoTx.referenceId,
        mode: momoTx.mode,
        status: momoTx.status,
        financialTransactionId: momoTx.financialTransactionId,
      },
    };
  }

  /**
   * 3. BUY DATA BUNDLE
   */
  public async buyData(params: {
    phone: string;
    bundle: string;
    amount?: number;
    network?: string;
    source?: "VOICE" | "KEYPAD" | "API";
  }): Promise<TransactionResult> {
    const { phone, bundle, network = "MTN", source = "API" } = params;
    if (!phone || !bundle) {
      throw new Error("Invalid data bundle request: phone and bundle type are required.");
    }

    // Default bundle costs if not provided
    const defaultAmounts: Record<string, number> = {
      "1GB": 12.0,
      "2.5GB": 25.0,
      "5GB": 45.0,
      "10GB": 80.0,
    };
    const finalAmount = params.amount && params.amount > 0 ? params.amount : (defaultAmounts[bundle] || 15.0);

    const reference = this.generateReference();
    const momoTx = await mtnMomoService.buyData({
      phone,
      bundle,
      amount: finalAmount,
      network,
      externalId: reference,
    });

    const status: TransactionResult["status"] =
      momoTx.status === "SUCCESSFUL" ? "SUCCESS" : momoTx.status === "PENDING" ? "PENDING" : "FAILED";

    const spokenReceipt = `Your ${bundle} data bundle purchase of ${finalAmount} Ghana Cedis for ${phone} was successful. Transaction reference is ${reference.split("").join(" ")}.`;

    return {
      status,
      reference,
      amount: finalAmount,
      currency: momoTx.currency,
      recipient_name: `${network} Data (${bundle})`,
      recipient_phone: phone,
      network,
      timestamp: momoTx.createdAt,
      message: `Data bundle ${bundle} activated for ${phone} via ${source}.`,
      spokenReceipt,
      type: "DATA_BUNDLE",
      momoDetails: {
        referenceId: momoTx.referenceId,
        mode: momoTx.mode,
        status: momoTx.status,
        financialTransactionId: momoTx.financialTransactionId,
      },
    };
  }

  /**
   * 4. PAY BILLS
   */
  public async payBill(params: {
    biller: string;
    accountNumber: string;
    amount: number;
    source?: "VOICE" | "KEYPAD" | "API";
  }): Promise<TransactionResult> {
    const { biller, accountNumber, amount, source = "API" } = params;
    if (!biller || !accountNumber || !amount || amount <= 0) {
      throw new Error("Invalid bill payment: biller, account number, and amount are required.");
    }

    const reference = this.generateReference();
    const momoTx = await mtnMomoService.payBill({
      biller,
      accountNumber,
      amount,
      externalId: reference,
    });

    const status: TransactionResult["status"] =
      momoTx.status === "SUCCESSFUL" ? "SUCCESS" : momoTx.status === "PENDING" ? "PENDING" : "FAILED";

    const spokenReceipt = `Your bill payment of ${amount} Ghana Cedis to ${biller} for account ${accountNumber} was successful. Transaction reference is ${reference.split("").join(" ")}.`;

    return {
      status,
      reference,
      amount,
      currency: momoTx.currency,
      recipient_name: `${biller} Settlement`,
      recipient_phone: accountNumber,
      network: "MTN",
      timestamp: momoTx.createdAt,
      message: `Bill of GH₵ ${amount} paid to ${biller} (Account: ${accountNumber}) via ${source}.`,
      spokenReceipt,
      type: "BILL_PAYMENT",
      momoDetails: {
        referenceId: momoTx.referenceId,
        mode: momoTx.mode,
        status: momoTx.status,
        financialTransactionId: momoTx.financialTransactionId,
      },
    };
  }

  /**
   * 5. CASH OUT
   */
  public async cashOut(params: {
    amount: number;
    phone?: string;
    source?: "VOICE" | "KEYPAD" | "API";
  }): Promise<TransactionResult> {
    const { amount, phone = "0553838464", source = "API" } = params;
    if (!amount || amount <= 0) {
      throw new Error("Invalid cash out request: valid amount is required.");
    }

    const reference = this.generateReference();
    const momoTx = await mtnMomoService.cashOut({
      amount,
      phone,
      externalId: reference,
    });

    const status: TransactionResult["status"] =
      momoTx.status === "SUCCESSFUL" ? "SUCCESS" : momoTx.status === "PENDING" ? "PENDING" : "FAILED";

    const spokenReceipt = `Your cash out authorization of ${amount} Ghana Cedis was successful. Please collect your cash from the agent. Reference is ${reference.split("").join(" ")}.`;

    return {
      status,
      reference,
      amount,
      currency: momoTx.currency,
      recipient_name: "Cash Out Agent",
      recipient_phone: phone,
      network: "MTN",
      timestamp: momoTx.createdAt,
      message: `Cash out of GH₵ ${amount} authorized via ${source}.`,
      spokenReceipt,
      type: "CASH_OUT",
      momoDetails: {
        referenceId: momoTx.referenceId,
        mode: momoTx.mode,
        status: momoTx.status,
        financialTransactionId: momoTx.financialTransactionId,
      },
    };
  }

  /**
   * 6. GET SINGLE-SOURCE ACCOUNT BALANCE
   */
  public async getAccountBalance(network: string = "MTN"): Promise<AccountBalance> {
    if (network !== "MTN" && !["MTN", "Telecel", "AT"].includes(network)) {
      throw new Error("Only supported telecom balances can be queried.");
    }

    const balance = await mtnMomoService.getBalance();
    return {
      currency: balance.currency,
      balance: balance.availableBalance,
      formatted: balance.formatted,
      network,
      mode: balance.mode,
    };
  }
}

export const transactionOrchestrator = new ServiceOrchestrator();
export default transactionOrchestrator;
