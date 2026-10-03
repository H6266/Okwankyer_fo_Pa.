/**
 * Payment Provider Abstraction Layer for Ghana Digital Financial Services
 * Uses the MTN MoMo API for active transactions; other networks remain roadmap stubs.
 */

import { mtnMomoService } from "./mtnMomoService";
import type { MoMoEngine } from "../integrations/momo/momoEngine";

export interface KycRecord {
  phoneNumber: string;
  name: string;
  network: "MTN" | "Telecel" | "AT" | "G-Money";
  verified: boolean;
  tier?: string;
}

export interface RequestToPayParams {
  amount: number;
  currency: "GHS";
  payerPhone: string;
  payerMessage: string;
  payeeNote: string;
  referenceId?: string;
}

export interface TransferParams {
  amount: number;
  currency: "GHS";
  recipientPhone: string;
  payerMessage: string;
  payeeNote: string;
  referenceId?: string;
}

export interface TransactionStatusResult {
  referenceId: string;
  externalId?: string;
  amount: number;
  currency: string;
  status: "SUCCESSFUL" | "PENDING" | "FAILED";
  reason?: string;
  financialTransactionId?: string;
  payerPhone?: string;
  recipientPhone?: string;
  timestamp: string;
}

export interface PaymentProvider {
  readonly id: "MTN" | "Telecel" | "AT";
  readonly name: string;
  readonly isImplemented: boolean;

  lookupKyc(phone: string): Promise<KycRecord>;
  requestToPay(params: RequestToPayParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }>;
  transfer(params: TransferParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }>;
  getStatus(referenceId: string): Promise<TransactionStatusResult>;
}

// ── MTN Implementation ───────────────────────────────────────────────
export class MtnPaymentProvider implements PaymentProvider {
  readonly id = "MTN";
  readonly name = "MTN Mobile Money (Ghana)";
  readonly isImplemented = true;

  constructor(private readonly momoService: MoMoEngine = mtnMomoService) {}

  async lookupKyc(phone: string): Promise<KycRecord> {
    const holder = await this.momoService.validateAccountHolder(phone);
    const last4 = holder.msisdn.slice(-4).split("").join(" ");
    return {
      phoneNumber: holder.msisdn,
      name: holder.name || `Subscriber ending in ${last4}`,
      network: "MTN",
      verified: holder.isActive,
    };
  }

  async requestToPay(params: RequestToPayParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }> {
    const transaction = await this.momoService.requestToPay({
      amount: params.amount,
      payerPhone: params.payerPhone,
      payerMessage: params.payerMessage,
      payeeNote: params.payeeNote,
      externalId: params.referenceId,
    });
    return {
      referenceId: transaction.referenceId,
      status: transaction.status === "SUCCESSFUL" ? "SUCCESSFUL" : "PENDING",
    };
  }

  async transfer(params: TransferParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }> {
    const transaction = await this.momoService.transfer({
      amount: params.amount,
      payeePhone: params.recipientPhone,
      payerMessage: params.payerMessage,
      payeeNote: params.payeeNote,
      externalId: params.referenceId,
    });
    return {
      referenceId: transaction.referenceId,
      status: transaction.status === "SUCCESSFUL" ? "SUCCESSFUL" : "PENDING",
    };
  }

  async getStatus(referenceId: string): Promise<TransactionStatusResult> {
    const transaction = await this.momoService.getTransactionStatus(referenceId);
    if (!transaction) {
      throw new Error(`MTN MoMo transaction ${referenceId} was not found.`);
    }

    return {
      referenceId: transaction.referenceId,
      externalId: transaction.externalId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status === "SUCCESSFUL"
        ? "SUCCESSFUL"
        : transaction.status === "PENDING"
          ? "PENDING"
          : "FAILED",
      financialTransactionId: transaction.financialTransactionId,
      payerPhone: transaction.msisdn,
      recipientPhone: transaction.msisdn,
      timestamp: transaction.updatedAt,
    };
  }
}

// ── Telecel Cash Stub (Roadmap) ──────────────────────────────────────
export class TelecelPaymentProvider implements PaymentProvider {
  readonly id = "Telecel";
  readonly name = "Telecel Cash (Ghana)";
  readonly isImplemented = false;

  async lookupKyc(_phone: string): Promise<KycRecord> {
    throw new Error("Telecel Cash adapter is on the roadmap and not yet implemented.");
  }
  async requestToPay(_params: RequestToPayParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }> {
    throw new Error("Telecel Cash adapter is on the roadmap and not yet implemented.");
  }
  async transfer(_params: TransferParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }> {
    throw new Error("Telecel Cash adapter is on the roadmap and not yet implemented.");
  }
  async getStatus(_referenceId: string): Promise<TransactionStatusResult> {
    throw new Error("Telecel Cash adapter is on the roadmap and not yet implemented.");
  }
}

// ── AT Money Stub (Roadmap) ──────────────────────────────────────────
export class AtMoneyPaymentProvider implements PaymentProvider {
  readonly id = "AT";
  readonly name = "AT Money (AirtelTigo Ghana)";
  readonly isImplemented = false;

  async lookupKyc(_phone: string): Promise<KycRecord> {
    throw new Error("AT Money adapter is on the roadmap and not yet implemented.");
  }
  async requestToPay(_params: RequestToPayParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }> {
    throw new Error("AT Money adapter is on the roadmap and not yet implemented.");
  }
  async transfer(_params: TransferParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }> {
    throw new Error("AT Money adapter is on the roadmap and not yet implemented.");
  }
  async getStatus(_referenceId: string): Promise<TransactionStatusResult> {
    throw new Error("AT Money adapter is on the roadmap and not yet implemented.");
  }
}

// Provider Factory Registry
export const paymentProviders: Record<string, PaymentProvider> = {
  MTN: new MtnPaymentProvider(),
  Telecel: new TelecelPaymentProvider(),
  AT: new AtMoneyPaymentProvider(),
};
