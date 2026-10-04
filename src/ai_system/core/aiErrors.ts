/**
 * Ɔkwankyerɛfo Pa - Standardized Error Taxonomy (aiErrors.ts)
 * Enforces Section 128:
 * AI_MODEL_UNAVAILABLE, AI_MODEL_INVALID_OUTPUT, AI_LOW_CONFIDENCE,
 * AI_AMBIGUOUS, CAPABILITY_UNAVAILABLE, PROVIDER_UNAVAILABLE,
 * PROVIDER_PENDING, PROVIDER_FAILED, FINANCIAL_TRUTH_UNKNOWN,
 * AUTHORIZATION_REQUIRED, PIN_DETECTED, DUPLICATE_TRANSACTION,
 * INVALID_TRANSACTION_STATE, DATA_LICENSE_BLOCKED, MODEL_NOT_VERIFIED
 */

export type StandardAiErrorCode =
  | "AI_MODEL_UNAVAILABLE"
  | "AI_MODEL_INVALID_OUTPUT"
  | "AI_LOW_CONFIDENCE"
  | "AI_AMBIGUOUS"
  | "CAPABILITY_UNAVAILABLE"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_PENDING"
  | "PROVIDER_FAILED"
  | "FINANCIAL_TRUTH_UNKNOWN"
  | "AUTHORIZATION_REQUIRED"
  | "PIN_DETECTED"
  | "DUPLICATE_TRANSACTION"
  | "INVALID_TRANSACTION_STATE"
  | "DATA_LICENSE_BLOCKED"
  | "MODEL_NOT_VERIFIED"
  | "AI_SYSTEM_ERROR"
  | "SECURITY_GATE_VIOLATION";

export class AiSystemError extends Error {
  public readonly code: StandardAiErrorCode | string;
  public readonly isRecoverable: boolean;

  constructor(message: string, code: StandardAiErrorCode | string = "AI_SYSTEM_ERROR", isRecoverable: boolean = true) {
    super(message);
    this.name = "AiSystemError";
    this.code = code;
    this.isRecoverable = isRecoverable;
  }
}

export class SecurityGateError extends AiSystemError {
  constructor(message: string, code: StandardAiErrorCode = "SECURITY_GATE_VIOLATION") {
    super(message, code, false);
    this.name = "SecurityGateError";
  }
}

export class AmbiguityError extends AiSystemError {
  public readonly options: string[];

  constructor(message: string, options: string[]) {
    super(message, "AI_AMBIGUOUS", true);
    this.name = "AmbiguityError";
    this.options = options;
  }
}

export class ModelUnavailableError extends AiSystemError {
  constructor(message: string = "AI model reasoning service unavailable") {
    super(message, "AI_MODEL_UNAVAILABLE", true);
    this.name = "ModelUnavailableError";
  }
}

export class ModelInvalidOutputError extends AiSystemError {
  constructor(message: string = "AI model returned invalid or unparseable output") {
    super(message, "AI_MODEL_INVALID_OUTPUT", true);
    this.name = "ModelInvalidOutputError";
  }
}

export class LowConfidenceError extends AiSystemError {
  public readonly confidence: number;
  constructor(confidence: number, message: string = "Inference confidence below minimum operating threshold") {
    super(message, "AI_LOW_CONFIDENCE", true);
    this.name = "LowConfidenceError";
    this.confidence = confidence;
  }
}

export class CapabilityUnavailableError extends AiSystemError {
  public readonly capability: string;
  constructor(capability: string, message?: string) {
    super(message || `Capability '${capability}' is not available in the current environment`, "CAPABILITY_UNAVAILABLE", true);
    this.name = "CapabilityUnavailableError";
    this.capability = capability;
  }
}

export class ProviderUnavailableError extends AiSystemError {
  constructor(provider: string, message?: string) {
    super(message || `Financial or telephony provider '${provider}' is currently offline`, "PROVIDER_UNAVAILABLE", true);
    this.name = "ProviderUnavailableError";
  }
}

export class ProviderPendingError extends AiSystemError {
  public readonly reference: string;
  constructor(reference: string, message: string = "Provider transaction is currently PENDING customer approval") {
    super(message, "PROVIDER_PENDING", true);
    this.name = "ProviderPendingError";
    this.reference = reference;
  }
}

export class FinancialTruthUnknownError extends AiSystemError {
  constructor(message: string = "Financial truth cannot be verified without authoritative provider confirmation") {
    super(message, "FINANCIAL_TRUTH_UNKNOWN", false);
    this.name = "FinancialTruthUnknownError";
  }
}

export class PinDetectedError extends SecurityGateError {
  constructor(message: string = "Voice PIN disclosure intercepted. Handset keypad entry required.") {
    super(message, "PIN_DETECTED");
    this.name = "PinDetectedError";
  }
}

export class DuplicateTransactionError extends AiSystemError {
  public readonly idempotencyKey: string;
  constructor(idempotencyKey: string, message: string = "Duplicate transaction attempt detected via idempotency key") {
    super(message, "DUPLICATE_TRANSACTION", false);
    this.name = "DuplicateTransactionError";
    this.idempotencyKey = idempotencyKey;
  }
}

export class InvalidTransactionStateError extends AiSystemError {
  constructor(message: string = "Illegal financial transaction state transition") {
    super(message, "INVALID_TRANSACTION_STATE", false);
    this.name = "InvalidTransactionStateError";
  }
}

export class DataLicenseBlockedError extends SecurityGateError {
  public readonly datasetId: string;
  public readonly license: string;
  constructor(datasetId: string, license: string, message?: string) {
    super(message || `Dataset '${datasetId}' license '${license}' is barred from commercial production training weights`, "DATA_LICENSE_BLOCKED");
    this.name = "DataLicenseBlockedError";
    this.datasetId = datasetId;
    this.license = license;
  }
}

export class ModelNotVerifiedError extends AiSystemError {
  constructor(modelId: string, message?: string) {
    super(message || `Model '${modelId}' has not passed local verification criteria and cannot be used in production`, "MODEL_NOT_VERIFIED", false);
    this.name = "ModelNotVerifiedError";
  }
}

