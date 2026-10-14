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

export interface GatewayEvidence {
  timestamp: string;
  host: string;
  roundTripMs: number;
  endpoint: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
  };
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
  payerPhone?: string;
  recipientPhone?: string;
  requestedCurrency?: string;
  requestedAmount?: number;
  payerMessage?: string;
  financialTransactionId?: string;
  mode: MoMoMode;
  createdAt: string;
  updatedAt: string;
  reason?: string;
  rawPayload?: any;
  gatewayEvidence?: GatewayEvidence;
}

export type SagaState =
  | "DRAFT"
  | "RECIPIENT_VERIFIED"
  | "AMOUNT_VERIFIED"
  | "CONFIRMATION_REQUESTED"
  | "CONFIRMED"
  | "REQUEST_TO_PAY_SENT"
  | "WAITING_FOR_CUSTOMER_AUTHORIZATION"
  | "COLLECTION_CONFIRMED"
  | "DISBURSEMENT_INITIATED"
  | "DISBURSEMENT_CONFIRMED"
  | "COMPLETED"
  | "COLLECTION_FAILED"
  | "CUSTOMER_DECLINED"
  | "COLLECTION_TIMEOUT"
  | "DISBURSEMENT_FAILED"
  | "DISBURSEMENT_TIMEOUT"
  | "RECONCILIATION_REQUIRED";

export interface SagaTransaction {
  sagaId: string;
  idempotencyKey: string;
  senderPhone: string;
  recipientPhone: string;
  recipientName: string;
  amount: number;
  network: "MTN" | "Telecel" | "AT";
  state: SagaState;
  createdAt: number;
  updatedAt: number;
  collectionReference?: string;
  disbursementReference?: string;
  providerFinancialTransactionId?: string;
  failureReason?: string;
  authReceipt?: string;
}

export interface RequestToPayParams {
  amount: number;
  payerPhone: string;
  payerName?: string;
  payerMessage?: string;
  payeeNote?: string;
  externalId?: string;
  currency?: string;
}

export interface TransferParams {
  amount: number;
  payeePhone: string;
  payeeName?: string;
  payerMessage?: string;
  payeeNote?: string;
  externalId?: string;
  currency?: string;
}

export interface MoMoBalanceResult {
  availableBalance: number;
  currency: string;
  formatted: string;
  mode: MoMoMode;
  gatewayEvidence?: GatewayEvidence;
  rawPayload?: any;
}

export interface MoMoAccountHolderResult {
  isActive: boolean;
  msisdn: string;
  name?: string;
  mode: MoMoMode;
  gatewayEvidence?: GatewayEvidence;
  rawPayload?: any;
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

export interface TransactionResult {
  status: "SUCCESS" | "FAILED" | "PENDING" | "NOT_CONFIGURED" | "NOT_IMPLEMENTED" | "REQUIRES_VAS_AGGREGATOR" | "REQUIRES_BILLER_AGGREGATOR";
  reference: string;
  operationType: "SEND_MONEY" | "AIRTIME" | "DATA_BUNDLE" | "BILL_PAYMENT" | "CASH_OUT";
  amount: number;
  currency: string;
  requestedCurrency: string;
  executionCurrency: string;
  currencyNotice?: string;
  recipient_name: string;
  recipient_phone: string;
  network: string;
  timestamp: string;
  message: string;
  spokenReceipt?: string;
  authorizationModel: string;
  momoDetails?: {
    referenceId: string;
    mode: "LIVE_API" | "SANDBOX_API" | "MOCKED" | "UNCONFIGURED";
    status: string;
    financialTransactionId?: string;
  };
  rawPayload?: any;
  gatewayEvidence?: any;
}

