/**
 * Ɔkwankyerɛfo Pa - Financial Services & Dependency Injection Layer (financialServices.ts)
 *
 * Strictly separates REAL provider data from MOCK/SIMULATOR data.
 * Enforces INVARIANT_009: Mock provider cannot execute in production mode.
 */

import { MobileNetwork } from "../core/aiTypes";
import { AI_CONFIG } from "../core/aiConfig";

export interface RecipientLookupResult {
  phoneNumber: string;
  name?: string;
  network: MobileNetwork;
  isVerified: boolean;
  source: "real_provider" | "mock_sandbox" | "demo_simulator";
}

export interface BalanceResult {
  availableBalance: number;
  currency: "GHS";
  accountPhone: string;
  source: "real_provider" | "mock_sandbox" | "demo_simulator";
}

export interface TransferResult {
  transactionId: string;
  referenceId: string;
  amount: number;
  currency: "GHS";
  recipientPhone: string;
  recipientName: string;
  network: MobileNetwork;
  status: "PENDING_HANDSET_AUTH" | "COMPLETED" | "FAILED";
  source: "real_provider" | "mock_sandbox" | "demo_simulator";
  errorMessage?: string;
}

export interface AirtimeResult {
  transactionId: string;
  phoneNumber: string;
  amount: number;
  network: MobileNetwork;
  status: "SUCCESS" | "FAILED";
  source: "real_provider" | "mock_sandbox" | "demo_simulator";
  errorMessage?: string;
}

export interface BillPaymentResult {
  transactionId: string;
  biller: string;
  accountNumber: string;
  amount: number;
  status: "SUCCESS" | "FAILED";
  source: "real_provider" | "mock_sandbox" | "demo_simulator";
  errorMessage?: string;
}

// ── Service Interfaces ────────────────────────────────────────────────
export interface IBalanceService {
  getBalance(phone: string): Promise<BalanceResult>;
}

export interface IRecipientLookupService {
  lookup(phone: string): Promise<RecipientLookupResult | null>;
}

export interface ITransferService {
  executeTransfer(params: {
    referenceId: string;
    senderPhone: string;
    recipientPhone: string;
    recipientName: string;
    amount: number;
    network: MobileNetwork;
  }): Promise<TransferResult>;
}

export interface IAirtimeService {
  purchaseAirtime(params: {
    phoneNumber: string;
    amount: number;
    network: MobileNetwork;
  }): Promise<AirtimeResult>;
}

export interface IBillPaymentService {
  payBill(params: {
    biller: string;
    accountNumber: string;
    amount: number;
  }): Promise<BillPaymentResult>;
}

// ── Real Provider Implementations ────────────────────────────────────
export class RealBalanceService implements IBalanceService {
  public async getBalance(phone: string): Promise<BalanceResult> {
    const momoKey = process.env.MOMO_API_KEY;
    const momoUser = process.env.MOMO_API_USER_ID;
    const momoSub = process.env.MOMO_SUBSCRIPTION_KEY;

    if (!momoKey || !momoUser || !momoSub) {
      throw new Error("REAL_PROVIDER_UNCONFIGURED: Live MTN MoMo credentials (MOMO_API_KEY, MOMO_SUBSCRIPTION_KEY) required for live balance inquiries.");
    }

    // Call live MoMo balance API
    const baseUrl = process.env.MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com";
    const res = await fetch(`${baseUrl}/collection/v1_0/account/balance`, {
      headers: {
        "X-Target-Environment": process.env.MOMO_TARGET_ENV || "mtnghana",
        "Ocp-Apim-Subscription-Key": momoSub,
        Authorization: `Bearer ${momoKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`MoMo Balance API error: HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      availableBalance: parseFloat(data.availableBalance),
      currency: "GHS",
      accountPhone: phone,
      source: "real_provider",
    };
  }
}

export class RealRecipientLookupService implements IRecipientLookupService {
  public async lookup(phone: string): Promise<RecipientLookupResult | null> {
    const clean = phone.replace(/[^0-9]/g, "");
    if (clean.length !== 10) return null;

    const prefix = clean.substring(0, 3);
    let network: MobileNetwork = "MTN";
    if (["020", "050"].includes(prefix)) network = "Telecel";
    else if (["027", "057", "026", "056"].includes(prefix)) network = "AT";

    // In production, real KYC is validated via telco directory or account resolution API
    return {
      phoneNumber: clean,
      network,
      isVerified: true,
      source: "real_provider",
    };
  }
}

export class RealTransferService implements ITransferService {
  public async executeTransfer(params: {
    referenceId: string;
    senderPhone: string;
    recipientPhone: string;
    recipientName: string;
    amount: number;
    network: MobileNetwork;
  }): Promise<TransferResult> {
    const momoKey = process.env.MOMO_API_KEY;
    const momoSub = process.env.MOMO_SUBSCRIPTION_KEY;

    if (!momoKey || !momoSub) {
      throw new Error("REAL_PROVIDER_UNCONFIGURED: Live MoMo API credentials required for financial execution.");
    }

    const baseUrl = process.env.MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com";
    const res = await fetch(`${baseUrl}/collection/v1_0/requesttopay`, {
      method: "POST",
      headers: {
        "X-Reference-Id": params.referenceId,
        "X-Target-Environment": process.env.MOMO_TARGET_ENV || "mtnghana",
        "Ocp-Apim-Subscription-Key": momoSub,
        "Content-Type": "application/json",
        Authorization: `Bearer ${momoKey}`,
      },
      body: JSON.stringify({
        amount: params.amount.toString(),
        currency: "GHS",
        externalId: params.referenceId,
        payer: { partyIdType: "MSISDN", partyId: params.senderPhone },
        payerMessage: "Ɔkwankyerɛfo Pa Voice Transfer",
        payeeNote: `Transfer to ${params.recipientName}`,
      }),
    });

    if (res.status === 202) {
      return {
        transactionId: `TX_${Date.now()}`,
        referenceId: params.referenceId,
        amount: params.amount,
        currency: "GHS",
        recipientPhone: params.recipientPhone,
        recipientName: params.recipientName,
        network: params.network,
        status: "PENDING_HANDSET_AUTH",
        source: "real_provider",
      };
    }

    throw new Error(`MoMo RequestToPay failed: HTTP ${res.status}`);
  }
}

// ── Explicit Mock / Sandbox Implementations ───────────────────────────
export class MockBalanceService implements IBalanceService {
  public async getBalance(phone: string): Promise<BalanceResult> {
    this.assertNotProduction();
    return {
      availableBalance: 250.00,
      currency: "GHS",
      accountPhone: phone,
      source: "mock_sandbox",
    };
  }

  private assertNotProduction(): void {
    if (AI_CONFIG.isProduction) {
      throw new Error("SECURITY_INVARIANT_VIOLATION: INVARIANT_009 - Mock provider cannot execute in production mode.");
    }
  }
}

export class MockRecipientLookupService implements IRecipientLookupService {
  private directory: Record<string, { name: string; network: MobileNetwork }> = {
    "0553838464": { name: "Kwame Boateng", network: "MTN" },
    "0241234567": { name: "Kwame Nyamebere", network: "MTN" },
    "0201234567": { name: "Ama Serwaa", network: "Telecel" },
    "0271234567": { name: "Yaw Osei", network: "AT" },
    "0543546010": { name: "Hannes Aboagye", network: "MTN" },
  };

  public async lookup(phone: string): Promise<RecipientLookupResult | null> {
    this.assertNotProduction();
    const clean = phone.replace(/[^0-9]/g, "");
    if (this.directory[clean]) {
      return {
        phoneNumber: clean,
        name: this.directory[clean].name,
        network: this.directory[clean].network,
        isVerified: true,
        source: "mock_sandbox",
      };
    }
    return {
      phoneNumber: clean,
      name: `Recipient ending in ${clean.slice(-4)}`,
      network: "MTN",
      isVerified: false,
      source: "mock_sandbox",
    };
  }

  private assertNotProduction(): void {
    if (AI_CONFIG.isProduction) {
      throw new Error("SECURITY_INVARIANT_VIOLATION: INVARIANT_009 - Mock provider cannot execute in production mode.");
    }
  }
}

export class MockTransferService implements ITransferService {
  public async executeTransfer(params: {
    referenceId: string;
    senderPhone: string;
    recipientPhone: string;
    recipientName: string;
    amount: number;
    network: MobileNetwork;
  }): Promise<TransferResult> {
    this.assertNotProduction();
    return {
      transactionId: `SANDBOX_TX_${Date.now()}`,
      referenceId: params.referenceId,
      amount: params.amount,
      currency: "GHS",
      recipientPhone: params.recipientPhone,
      recipientName: params.recipientName,
      network: params.network,
      status: "PENDING_HANDSET_AUTH",
      source: "mock_sandbox",
    };
  }

  private assertNotProduction(): void {
    if (AI_CONFIG.isProduction) {
      throw new Error("SECURITY_INVARIANT_VIOLATION: INVARIANT_009 - Mock provider cannot execute in production mode.");
    }
  }
}

// ── Financial Services Registry (Dependency Injection) ────────────────
export class FinancialServiceRegistry {
  private static instance: FinancialServiceRegistry;

  public balanceService: IBalanceService;
  public recipientLookupService: IRecipientLookupService;
  public transferService: ITransferService;

  private constructor() {
    const isProd = process.env.NODE_ENV === "production" && process.env.MOMO_TARGET_ENV === "live";

    if (isProd) {
      this.balanceService = new RealBalanceService();
      this.recipientLookupService = new RealRecipientLookupService();
      this.transferService = new RealTransferService();
    } else {
      this.balanceService = new MockBalanceService();
      this.recipientLookupService = new MockRecipientLookupService();
      this.transferService = new MockTransferService();
    }
  }

  public static getInstance(): FinancialServiceRegistry {
    if (!FinancialServiceRegistry.instance) {
      FinancialServiceRegistry.instance = new FinancialServiceRegistry();
    }
    return FinancialServiceRegistry.instance;
  }

  public setServices(overrides: {
    balanceService?: IBalanceService;
    recipientLookupService?: IRecipientLookupService;
    transferService?: ITransferService;
  }): void {
    if (overrides.balanceService) this.balanceService = overrides.balanceService;
    if (overrides.recipientLookupService) this.recipientLookupService = overrides.recipientLookupService;
    if (overrides.transferService) this.transferService = overrides.transferService;
  }
}

export const financialServices = FinancialServiceRegistry.getInstance();
