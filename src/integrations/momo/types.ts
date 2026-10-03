/**
 * Ɔkwankyerɛfo Pa - MTN Mobile Money (MoMo) Type Definitions
 * 
 * Strict typings for MTN MoMo Open API collections, disbursements,
 * KYC, balances, webhooks, and sandbox provisioning.
 */

export type MoMoTargetEnvironment = "sandbox" | "production" | "live";
export type MoMoProductType = "collection" | "disbursement";
export type MoMoMode = "LIVE_API" | "SANDBOX_API";
export type MoMoTransactionStatus = "PENDING" | "SUCCESSFUL" | "FAILED" | "REJECTED" | "TIMEOUT";

export interface MoMoProductCredentials {
  subscriptionKey?: string;
  apiUserId?: string;
  apiKey?: string;
}

export interface MoMoConfig {
  baseUrl: string;
  targetEnv: "sandbox" | "production";
  currency: string;
  collection: MoMoProductCredentials;
  disbursement: MoMoProductCredentials;
  callbackHost?: string;
}

export interface MoMoTransactionRecord {
  id: string; // Internal ID or external reference
  referenceId: string; // UUID v4 used with MTN MoMo API (X-Reference-Id)
  externalId: string; // e.g. OKP-847291
  type: "COLLECTION_REQUEST_TO_PAY" | "DISBURSEMENT_TRANSFER";
  status: MoMoTransactionStatus;
  amount: number;
  currency: string;
  msisdn: string; // Ghanaian MSISDN e.g. 233553838464
  recipientName?: string;
  payerMessage?: string;
  financialTransactionId?: string;
  mode: MoMoMode;
  createdAt: string;
  updatedAt: string;
  reason?: string;
  rawPayload?: any;
}

export interface RequestToPayParams {
  amount: number;
  payerPhone: string;
  payerName?: string;
  payerMessage?: string;
  payeeNote?: string;
  externalId?: string;
}

export interface TransferParams {
  amount: number;
  payeePhone: string;
  payeeName?: string;
  payerMessage?: string;
  payeeNote?: string;
  externalId?: string;
}

export interface MoMoBalanceResult {
  availableBalance: number;
  currency: string;
  formatted: string;
  mode: MoMoMode;
}

export interface MoMoAccountHolderResult {
  isActive: boolean;
  msisdn: string;
  name?: string;
  mode: MoMoMode;
}

export interface MoMoKeyConfig {
  primary: string;
  secondary: string;
  activeKeyType: "primary" | "secondary" | "custom";
  activeKey: string;
  targetEnv: "sandbox" | "production";
  currency: string;
}

export interface RealAccountTestParams {
  phone: string;
  amount?: number;
  subscriberName?: string;
  keyChoice?: "primary" | "secondary" | "custom";
  customKey?: string;
  targetEnv?: "sandbox" | "production";
}

export interface RealAccountTestAuditStep {
  step: string;
  status: "SUCCESS" | "WARNING" | "INFO" | "ERROR";
  details: any;
}

export interface RealAccountTestResult {
  success: boolean;
  phone: string;
  msisdn: string;
  amount: number;
  currency: string;
  activeKey?: string;
  activeKeyType: "primary" | "secondary" | "custom";
  targetEnv: "sandbox" | "production";
  kyc: MoMoAccountHolderResult;
  transaction: MoMoTransactionRecord;
  auditSteps: RealAccountTestAuditStep[];
}

export interface MoMoDiagnostics {
  activeMode: "LIVE_PRODUCTION" | "SANDBOX_API" | "NOT_CONFIGURED";
  targetEnvironment: "sandbox" | "production";
  baseUrl: string;
  currency: string;
  credentials: {
    collection: {
      subscriptionKeyConfigured: boolean;
      apiUserIdConfigured: boolean;
      apiKeyConfigured: boolean;
      maskedKey: string;
    };
    disbursement: {
      subscriptionKeyConfigured: boolean;
      apiUserIdConfigured: boolean;
      apiKeyConfigured: boolean;
      maskedKey: string;
    };
  };
  stats: {
    totalTransactions: number;
    history: MoMoTransactionRecord[];
  };
  productionChecklist: Array<{
    step: number;
    name: string;
    status: string;
    requirement: string;
    envVar: string;
  }>;
}
