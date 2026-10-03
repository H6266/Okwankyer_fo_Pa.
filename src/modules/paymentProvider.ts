/**
 * Payment Provider Abstraction Layer for Ghana Digital Financial Services
 * Supports MTN MoMo (Active), Telecel Cash (Roadmap Stub), AT Money (Roadmap Stub)
 */

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

// ── In-Memory Sandbox Ledger Storage ─────────────────────────────────
export interface LedgerEntry {
  id: string;
  referenceId: string;
  type: "COLLECTION" | "DISBURSEMENT";
  provider: "MTN" | "Telecel" | "AT";
  phoneNumber: string;
  recipientName?: string;
  amount: number;
  currency: "GHS";
  status: "SUCCESSFUL" | "PENDING" | "FAILED";
  zeroPinVerified: boolean;
  createdAt: string;
}

export const sandboxLedger: LedgerEntry[] = [
  {
    id: "tx-1",
    referenceId: "OKP-847291",
    type: "COLLECTION",
    provider: "MTN",
    phoneNumber: "0553838464",
    recipientName: "Kwame Nyamebere",
    amount: 500.0,
    currency: "GHS",
    status: "SUCCESSFUL",
    zeroPinVerified: true,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    id: "tx-2",
    referenceId: "OKP-392104",
    type: "COLLECTION",
    provider: "MTN",
    phoneNumber: "0241234567",
    recipientName: "Kwame Nyameba",
    amount: 50.0,
    currency: "GHS",
    status: "SUCCESSFUL",
    zeroPinVerified: true,
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: "tx-3",
    referenceId: "OKP-109283",
    type: "DISBURSEMENT",
    provider: "MTN",
    phoneNumber: "0543546010",
    recipientName: "Hannes Aboagye",
    amount: 120.0,
    currency: "GHS",
    status: "SUCCESSFUL",
    zeroPinVerified: true,
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
  },
  {
    id: "tx-4",
    referenceId: "OKP-552910",
    type: "COLLECTION",
    provider: "MTN",
    phoneNumber: "0244123456",
    recipientName: "Kwame Mensah",
    amount: 75.5,
    currency: "GHS",
    status: "SUCCESSFUL",
    zeroPinVerified: true,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

// ── MTN Implementation ───────────────────────────────────────────────
export class MtnPaymentProvider implements PaymentProvider {
  readonly id = "MTN";
  readonly name = "MTN Mobile Money (Ghana)";
  readonly isImplemented = true;

  async lookupKyc(phone: string): Promise<KycRecord> {
    const clean = phone.replace(/[^0-9]/g, "");
    if (clean.endsWith("8464") || clean === "0553838464") {
      return { phoneNumber: clean, name: "Kwame Nyamebere", network: "MTN", verified: true, tier: "Tier 2" };
    }
    if (clean === "0241234567") {
      return { phoneNumber: clean, name: "Kwame Nyameba", network: "MTN", verified: true, tier: "Tier 1" };
    }
    if (clean === "0543546010") {
      return { phoneNumber: clean, name: "Hannes Aboagye", network: "MTN", verified: true, tier: "Tier 3" };
    }
    const last4 = clean.slice(-4).split("").join(" ");
    return { phoneNumber: clean, name: `Subscriber ending in ${last4}`, network: "MTN", verified: true, tier: "Standard" };
  }

  async requestToPay(params: RequestToPayParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }> {
    const ref = params.referenceId || `OKP-${Math.floor(100000 + Math.random() * 900000)}`;
    const kyc = await this.lookupKyc(params.payerPhone);
    sandboxLedger.unshift({
      id: `tx-${Date.now()}`,
      referenceId: ref,
      type: "COLLECTION",
      provider: "MTN",
      phoneNumber: params.payerPhone,
      recipientName: kyc.name,
      amount: params.amount,
      currency: "GHS",
      status: "SUCCESSFUL",
      zeroPinVerified: true,
      createdAt: new Date().toISOString(),
    });
    return { referenceId: ref, status: "SUCCESSFUL" };
  }

  async transfer(params: TransferParams): Promise<{ referenceId: string; status: "PENDING" | "SUCCESSFUL" }> {
    const ref = params.referenceId || `OKP-${Math.floor(100000 + Math.random() * 900000)}`;
    const kyc = await this.lookupKyc(params.recipientPhone);
    sandboxLedger.unshift({
      id: `tx-${Date.now()}`,
      referenceId: ref,
      type: "DISBURSEMENT",
      provider: "MTN",
      phoneNumber: params.recipientPhone,
      recipientName: kyc.name,
      amount: params.amount,
      currency: "GHS",
      status: "SUCCESSFUL",
      zeroPinVerified: true,
      createdAt: new Date().toISOString(),
    });
    return { referenceId: ref, status: "SUCCESSFUL" };
  }

  async getStatus(referenceId: string): Promise<TransactionStatusResult> {
    const entry = sandboxLedger.find((l) => l.referenceId === referenceId);
    if (!entry) {
      return {
        referenceId,
        amount: 0,
        currency: "GHS",
        status: "FAILED",
        reason: "Reference not found in ledger",
        timestamp: new Date().toISOString(),
      };
    }
    return {
      referenceId: entry.referenceId,
      externalId: `FIN-${entry.referenceId}`,
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
      financialTransactionId: `FTX-${Math.floor(10000000 + Math.random() * 90000000)}`,
      payerPhone: entry.phoneNumber,
      recipientPhone: entry.phoneNumber,
      timestamp: entry.createdAt,
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
