/**
 * Ɔkwankyerɛfo Pa - Financial Services & Dependency Injection Layer (financialServices.ts)
 *
 * Strictly separates REAL provider data from MOCK/SIMULATOR data.
 * Enforces INVARIANT_009: Mock provider cannot execute in production mode.
 * Enforces INVARIANT_010: Failed tool execution cannot be reported as success.
 * Enforces realistic Ghanaian subscriber verification:
 * A valid prefix does NOT imply identity is verified.
 */

import { MobileNetwork, VerificationStatus, TransactionStatus } from "../core/aiTypes";
import { AI_CONFIG } from "../core/aiConfig";

export interface RecipientLookupResult {
  phoneNumber: string;
  name?: string;
  network: MobileNetwork;
  verificationStatus: VerificationStatus;
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
  status: TransactionStatus;
  source: "real_provider" | "mock_sandbox" | "demo_simulator";
  errorMessage?: string;
}

export interface AirtimeResult {
  transactionId: string;
  phoneNumber: string;
  amount: number;
  network: MobileNetwork;
  status: "COMPLETED" | "PENDING" | "FAILED";
  source: "real_provider" | "mock_sandbox" | "demo_simulator";
  errorMessage?: string;
}

export interface BillPaymentResult {
  transactionId: string;
  biller: string;
  accountNumber: string;
  amount: number;
  status: "COMPLETED" | "PENDING" | "FAILED";
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
      throw new Error("REAL_PROVIDER_UNCONFIGURED: Live MTN MoMo credentials required for live balance inquiries.");
    }

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

    // Strict invariant: Having a valid Ghanaian prefix only proves NETWORK_INFERRED, NOT identity verified!
    return {
      phoneNumber: clean,
      network,
      verificationStatus: "NETWORK_INFERRED",
      isVerified: false,
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
    // Real Disbursement / Transfer API (P2P Payout)
    const res = await fetch(`${baseUrl}/disbursement/v1_0/transfer`, {
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
        payee: { partyIdType: "MSISDN", partyId: params.recipientPhone },
        payerMessage: "Ɔkwankyerɛfo Pa Voice Transfer",
        payeeNote: `Transfer from ${params.senderPhone}`,
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
        status: "PENDING",
        source: "real_provider",
      };
    }

    if (res.status === 200 || res.status === 201) {
      return {
        transactionId: `TX_${Date.now()}`,
        referenceId: params.referenceId,
        amount: params.amount,
        currency: "GHS",
        recipientPhone: params.recipientPhone,
        recipientName: params.recipientName,
        network: params.network,
        status: "COMPLETED",
        source: "real_provider",
      };
    }

    throw new Error(`MoMo Transfer failed: HTTP ${res.status}`);
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
    if (clean.length !== 10) return null;

    if (this.directory[clean]) {
      return {
        phoneNumber: clean,
        name: this.directory[clean].name,
        network: this.directory[clean].network,
        verificationStatus: "IDENTITY_VERIFIED",
        isVerified: true,
        source: "mock_sandbox",
      };
    }

    const prefix = clean.substring(0, 3);
    let network: MobileNetwork = "MTN";
    if (["020", "050"].includes(prefix)) network = "Telecel";
    else if (["027", "057", "026", "056"].includes(prefix)) network = "AT";

    return {
      phoneNumber: clean,
      name: `Recipient ending in ${clean.slice(-4)}`,
      network,
      verificationStatus: "NETWORK_INFERRED",
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
      status: "PENDING",
      source: "mock_sandbox",
    };
  }

  private assertNotProduction(): void {
    if (AI_CONFIG.isProduction) {
      throw new Error("SECURITY_INVARIANT_VIOLATION: INVARIANT_009 - Mock provider cannot execute in production mode.");
    }
  }
}

export class MockAirtimeService implements IAirtimeService {
  public async purchaseAirtime(params: {
    phoneNumber: string;
    amount: number;
    network: MobileNetwork;
  }): Promise<AirtimeResult> {
    if (AI_CONFIG.isProduction) {
      throw new Error("SECURITY_INVARIANT_VIOLATION: INVARIANT_009 - Mock provider cannot execute in production mode.");
    }
    return {
      transactionId: `AIRTIME_TX_${Date.now()}`,
      phoneNumber: params.phoneNumber,
      amount: params.amount,
      network: params.network,
      status: "COMPLETED",
      source: "mock_sandbox",
    };
  }
}

export class MockBillPaymentService implements IBillPaymentService {
  public async payBill(params: {
    biller: string;
    accountNumber: string;
    amount: number;
  }): Promise<BillPaymentResult> {
    if (AI_CONFIG.isProduction) {
      throw new Error("SECURITY_INVARIANT_VIOLATION: INVARIANT_009 - Mock provider cannot execute in production mode.");
    }
    return {
      transactionId: `BILL_TX_${Date.now()}`,
      biller: params.biller,
      accountNumber: params.accountNumber,
      amount: params.amount,
      status: "COMPLETED",
      source: "mock_sandbox",
    };
  }
}

// ── Financial Services Registry (Dependency Injection) ────────────────
export class FinancialServiceRegistry {
  private static instance: FinancialServiceRegistry;

  public balanceService: IBalanceService;
  public recipientLookupService: IRecipientLookupService;
  public transferService: ITransferService;
  public airtimeService: IAirtimeService;
  public billPaymentService: IBillPaymentService;

  private constructor() {
    const isProd = process.env.NODE_ENV === "production" && process.env.MOMO_TARGET_ENV === "live";

    if (isProd) {
      this.balanceService = new RealBalanceService();
      this.recipientLookupService = new RealRecipientLookupService();
      this.transferService = new RealTransferService();
      this.airtimeService = new MockAirtimeService();
      this.billPaymentService = new MockBillPaymentService();
    } else {
      this.balanceService = new MockBalanceService();
      this.recipientLookupService = new MockRecipientLookupService();
      this.transferService = new MockTransferService();
      this.airtimeService = new MockAirtimeService();
      this.billPaymentService = new MockBillPaymentService();
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
    airtimeService?: IAirtimeService;
    billPaymentService?: IBillPaymentService;
  }): void {
    if (overrides.balanceService) this.balanceService = overrides.balanceService;
    if (overrides.recipientLookupService) this.recipientLookupService = overrides.recipientLookupService;
    if (overrides.transferService) this.transferService = overrides.transferService;
    if (overrides.airtimeService) this.airtimeService = overrides.airtimeService;
    if (overrides.billPaymentService) this.billPaymentService = overrides.billPaymentService;
  }
}

export const financialServices = FinancialServiceRegistry.getInstance();
