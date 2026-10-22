/**
 * Ɔkwankyerɛfo Pa - Telecel Cash (Ghana) Type Definitions
 * 
 * Strict typings for Telecel Cash (formerly Vodafone Cash Ghana)
 * Collections (USSD Push / Voucher), Disbursements (B2C),
 * KYC account verification, balance inquiries, and webhooks.
 */

export type TelecelTargetEnvironment = "sandbox" | "production";
export type TelecelMode = "LIVE_API" | "SANDBOX_API" | "SANDBOX_SIMULATOR";
export type TelecelTransactionStatus = "PENDING" | "SUCCESSFUL" | "FAILED" | "REJECTED" | "TIMEOUT";

export interface TelecelCredentials {
  apiKey?: string;
  clientId?: string;
  clientSecret?: string;
  merchantId?: string;
  subscriptionKey?: string;
}

export interface TelecelConfig {
  baseUrl: string;
  targetEnv: TelecelTargetEnvironment;
  currency: string;
  credentials: TelecelCredentials;
  callbackUrl?: string;
}

export interface TelecelGatewayEvidence {
  timestamp: string;
  endpoint: string;
  method: string;
  requestHeaders?: Record<string, string>;
  requestBody?: any;
  responseStatus: number;
  responseStatusText: string;
  responseBody?: any;
  roundTripMs?: number;
}

export interface TelecelTransactionRecord {
  id: string;
  referenceId: string;
  externalId: string;
  type: "COLLECTION_REQUEST_TO_PAY" | "DISBURSEMENT_TRANSFER" | "VOUCHER_COLLECTION";
  status: TelecelTransactionStatus;
  amount: number;
  currency: string;
  msisdn: string;
  recipientName?: string;
  payerPhone?: string;
  payerMessage?: string;
  voucherCode?: string;
  financialTransactionId?: string;
  mode: TelecelMode;
  createdAt: string;
  updatedAt: string;
  reason?: string;
  gatewayEvidence?: TelecelGatewayEvidence;
  rawPayload?: any;
}

export interface TelecelRequestToPayParams {
  amount: number;
  payerPhone: string;
  payerName?: string;
  payerMessage?: string;
  payeeNote?: string;
  voucherCode?: string;
  externalId?: string;
  currency?: string;
}

export interface TelecelTransferParams {
  amount: number;
  payeePhone: string;
  payeeName?: string;
  payerMessage?: string;
  payeeNote?: string;
  externalId?: string;
  currency?: string;
}

export interface TelecelKycResult {
  phoneNumber: string;
  msisdn: string;
  name: string;
  network: "Telecel";
  verified: boolean;
  tier?: string;
  mode: TelecelMode;
  gatewayEvidence?: TelecelGatewayEvidence;
}

export interface TelecelBalanceResult {
  success?: boolean;
  availableBalance: number;
  currency: string;
  formatted: string;
  mode: TelecelMode;
  gatewayEvidence?: TelecelGatewayEvidence;
}

export interface TelecelDiagnostics {
  gateway?: string;
  configured: boolean;
  activeMode: "LIVE_PRODUCTION" | "SANDBOX_API" | "SANDBOX_SIMULATOR" | "NOT_CONFIGURED";
  targetEnvironment: TelecelTargetEnvironment;
  baseUrl: string;
  currency: string;
  credentials: {
    configured?: boolean;
    apiKeyConfigured: boolean;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    merchantIdConfigured: boolean;
    subscriptionKeyConfigured: boolean;
    maskedKey: string;
    maskedMerchantId: string;
  };
  stats: {
    totalTransactions: number;
    history: TelecelTransactionRecord[];
  };
  setupChecklist: Array<{
    step: number;
    name: string;
    status: "READY" | "PENDING" | "OPTIONAL";
    requirement: string;
    envVar: string;
  }>;
}
