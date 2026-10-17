/**
 * Ɔkwankyerɛfo Pa - Centralized MoMo Service Types
 * 
 * Standardized data models for the Unified Financial Transaction Engine across:
 * - Web Dashboard
 * - IVR / DTMF Telephony
 * - AI Natural Language Voice
 */

export type TransactionState =
  | "CREATED"
  | "VALIDATING_RECIPIENT"
  | "RECIPIENT_VALIDATED"
  | "READY_FOR_CONFIRMATION"
  | "CONFIRMED"
  | "SUBMITTED"
  | "PENDING"
  | "SUCCESSFUL"
  | "VALIDATION_FAILED"
  | "CONFIRMATION_CANCELLED"
  | "SUBMISSION_FAILED"
  | "FAILED"
  | "TIMEOUT"
  | "UNKNOWN";

export type TransactionOperation =
  | "SEND_MONEY"
  | "AIRTIME"
  | "DATA_BUNDLE"
  | "BILL_PAYMENT"
  | "CASH_OUT";

export type TransactionChannel = "WEB" | "IVR" | "AI_VOICE";

export type TargetEnvironment = "sandbox" | "production";

export type ProviderExecutionMode =
  | "REAL"
  | "SANDBOX"
  | "MOCKED"
  | "FAILED"
  | "SANDBOX_LIMITATION"
  | "NOT_CONFIGURED";

/**
 * Normalized Recipient Lookup Result from MTN Basic User Info & Active Check
 */
export interface RecipientLookupResult {
  phone: string;
  name: string;
  accountActive: boolean;
  provider: "MTN";
  environment: TargetEnvironment;
  source: "MTN_MOMO_API" | "FIXTURE_FALLBACK" | "UNRESOLVED";
  rawUserInfo?: {
    sub?: string;
    given_name?: string;
    family_name?: string;
    gender?: string;
    locale?: string;
  };
  warning?: string;
  error?: string;
}

/**
 * Centralized Internal Transaction Object
 * Independent of provider-specific payloads.
 */
export interface InternalTransaction {
  transactionId: string;
  operation: TransactionOperation;
  amount: {
    value: number;
    currency: "GHS";
  };
  recipient: {
    phone: string;
    name: string;
    accountActive: boolean;
  };
  channel: TransactionChannel;
  environment: TargetEnvironment;
  status: TransactionState;
  confirmation: {
    required: boolean;
    confirmed: boolean;
  };
  provider: {
    name: "MTN";
    referenceId: string | null;
    financialTransactionId: string | null;
    mode: ProviderExecutionMode;
    rawStatus?: string;
    currency?: string; // Settled currency (e.g., EUR in sandbox, GHS in production)
    currencyNotice?: string;
    statusCode?: number;
    rawResponse?: any;
  };
  metadata?: {
    payerPhone?: string;
    payerName?: string;
    payerMessage?: string;
    payeeNote?: string;
    sessionId?: string;
    spokenPrompt?: string;
    spokenReceipt?: string;
    failureReason?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Account Balance Representation
 */
export interface MoMoBalance {
  availableBalance: number;
  currency: string;
  formatted: string;
  mode: ProviderExecutionMode;
  product: "collection" | "disbursement";
  timestamp: string;
}

/**
 * Create Transaction Options
 */
export interface CreateTransactionOptions {
  operation?: TransactionOperation;
  recipientPhone: string;
  amount: number;
  channel?: TransactionChannel;
  payerPhone?: string;
  payerName?: string;
  payerMessage?: string;
  payeeNote?: string;
  sessionId?: string;
}
