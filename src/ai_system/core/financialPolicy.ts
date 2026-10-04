/**
 * Ɔkwankyerɛfo Pa - Financial Policy Engine
 *
 * Single deterministic policy source for high-risk financial actions.
 * This file intentionally contains no network/provider code.
 *
 * Guarantees:
 * - No implicit network defaults for financial execution.
 * - Explicit amount, phone, currency and confirmation validation.
 * - Confirmation fingerprinting so material changes invalidate authorization.
 * - Provider completion requires authoritative provider transaction evidence.
 * - No PIN/secret fields may enter a financial execution request.
 */

import crypto from "crypto";
import type { MobileNetwork, TransactionDraft } from "./aiTypes";

export const FINANCIAL_LIMITS = {
  MIN_AMOUNT_GHS: 1,
  MAX_AMOUNT_GHS: 5000,
  CONFIRMATION_TTL_MS: 2 * 60 * 1000,
} as const;

export type FinancialOperation =
  | "TRANSFER"
  | "AIRTIME"
  | "DATA"
  | "BILL_PAYMENT"
  | "CASH_OUT";

export interface FinancialExecutionInput {
  operation: FinancialOperation;
  sessionId: string;
  senderPhone?: string;
  recipientPhone?: string;
  amount?: number;
  currency?: "GHS" | string;
  network?: MobileNetwork | string | null;
  recipientName?: string | null;
  biller?: string | null;
  accountNumber?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
}

export interface FinancialPolicyResult {
  allowed: boolean;
  reason?: string;
  normalized?: {
    amount: number;
    currency: "GHS";
    network?: MobileNetwork;
    senderPhone?: string;
    recipientPhone?: string;
    recipientName?: string;
    biller?: string;
    accountNumber?: string;
  };
}

function normalizePhone(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const digits = value.replace(/\D/g, "");

  if (digits.length === 10 && /^0\d{9}$/.test(digits)) {
    return digits;
  }

  if (digits.length === 12 && digits.startsWith("233")) {
    return `0${digits.slice(3)}`;
  }

  return undefined;
}

function normalizeAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return Number(parsed.toFixed(2));
    }
  }

  return undefined;
}

function normalizeNetwork(value: unknown): MobileNetwork | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const normalized = String(value).trim().toLowerCase();

  if (normalized === "mtn") {
    return "MTN";
  }

  if (normalized === "telecel" || normalized === "vodafone") {
    return "Telecel";
  }

  if (
    normalized === "at" ||
    normalized === "airteltigo" ||
    normalized === "airtel-tigo"
  ) {
    return "AT";
  }

  if (normalized === "g-money" || normalized === "gmoney") {
    return "G-Money";
  }

  return undefined;
}

function containsSecretKey(
  object: Record<string, unknown>
): string | undefined {
  for (const key of Object.keys(object)) {
    const lower = key.toLowerCase();

    if (
      lower.includes("pin") ||
      lower.includes("password") ||
      lower.includes("passcode") ||
      lower.includes("secret")
    ) {
      return key;
    }
  }

  return undefined;
}

export class FinancialPolicyEngine {
  public validateExecution(
    input: FinancialExecutionInput
  ): FinancialPolicyResult {
    const secretKey = containsSecretKey(
      input as unknown as Record<string, unknown>
    );

    if (secretKey) {
      return {
        allowed: false,
        reason: `SECURITY_VIOLATION: credential field '${secretKey}' cannot enter financial execution.`,
      };
    }

    const amount = normalizeAmount(input.amount);

    if (amount === undefined) {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: transaction amount is required and must be numeric.",
      };
    }

    if (
      amount < FINANCIAL_LIMITS.MIN_AMOUNT_GHS ||
      amount > FINANCIAL_LIMITS.MAX_AMOUNT_GHS
    ) {
      return {
        allowed: false,
        reason:
          `FINANCIAL_POLICY: amount must be between GHS ` +
          `${FINANCIAL_LIMITS.MIN_AMOUNT_GHS.toFixed(2)} and ` +
          `${FINANCIAL_LIMITS.MAX_AMOUNT_GHS.toFixed(2)}.`,
      };
    }

    if ((input.currency || "GHS").toUpperCase() !== "GHS") {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: only GHS is supported by the current Ghana MoMo execution policy.",
      };
    }

    const senderPhone = normalizePhone(input.senderPhone);

    if (
      ["TRANSFER", "AIRTIME", "DATA", "CASH_OUT"].includes(input.operation) &&
      !senderPhone
    ) {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: a valid sender/caller Ghanaian mobile number is required.",
      };
    }

    const recipientPhone = normalizePhone(input.recipientPhone);

    if (input.operation === "TRANSFER" && !recipientPhone) {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: a valid recipient Ghanaian mobile number is required.",
      };
    }

    const network = normalizeNetwork(input.network);

    if (input.operation === "TRANSFER" && !network) {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: mobile network must be explicitly verified before execution.",
      };
    }

    if (input.operation === "BILL_PAYMENT") {
      if (!input.biller?.trim()) {
        return {
          allowed: false,
          reason: "FINANCIAL_POLICY: biller is required.",
        };
      }

      if (!input.accountNumber?.trim()) {
        return {
          allowed: false,
          reason:
            "FINANCIAL_POLICY: bill account/reference number is required.",
        };
      }
    }

    return {
      allowed: true,
      normalized: {
        amount,
        currency: "GHS",
        network,
        senderPhone,
        recipientPhone,
        recipientName: input.recipientName?.trim() || undefined,
        biller: input.biller?.trim() || undefined,
        accountNumber: input.accountNumber?.trim() || undefined,
      },
    };
  }

  public fingerprint(input: FinancialExecutionInput): string {
    const stable = {
      operation: input.operation,
      sessionId: input.sessionId,
      senderPhone: normalizePhone(input.senderPhone) || null,
      recipientPhone: normalizePhone(input.recipientPhone) || null,
      amount: normalizeAmount(input.amount) ?? null,
      currency: (input.currency || "GHS").toUpperCase(),
      network: normalizeNetwork(input.network) || null,
      recipientName: input.recipientName?.trim() || null,
      biller: input.biller?.trim() || null,
      accountNumber: input.accountNumber?.trim() || null,
      referenceId: input.referenceId || null,
    };

    return crypto
      .createHash("sha256")
      .update(JSON.stringify(stable))
      .digest("hex");
  }

  public fingerprintDraft(draft: TransactionDraft): string {
    return this.fingerprint({
      operation: (draft.type ||
        draft.operation ||
        "TRANSFER") as FinancialOperation,
      sessionId: draft.sessionId || "",
      recipientPhone: draft.recipientPhone || undefined,
      recipientName: draft.recipientName || undefined,
      amount: draft.amount || undefined,
      currency: draft.currency,
      network: draft.network,
      referenceId: draft.draftId,
    });
  }

  public assertConfirmedDraft(
    draft: TransactionDraft | null | undefined,
    request: FinancialExecutionInput
  ): { allowed: boolean; reason?: string } {
    if (!draft) {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: confirmed transaction draft is required.",
      };
    }

    if (draft.confirmationState !== "CONFIRMED") {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: transaction is not in CONFIRMED state.",
      };
    }

    if (Date.now() > draft.expiresAt) {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: transaction confirmation has expired.",
      };
    }

    const requestInput: FinancialExecutionInput = {
      ...request,
      referenceId: draft.draftId,
    };

    const policy = this.validateExecution(requestInput);

    if (!policy.allowed) {
      return {
        allowed: false,
        reason: policy.reason,
      };
    }

    const normalizedDraft = {
      recipientPhone: normalizePhone(draft.recipientPhone) || null,
      amount: normalizeAmount(draft.amount) ?? null,
      network: normalizeNetwork(draft.network) || null,
      recipientName: draft.recipientName?.trim() || null,
    };

    const normalizedRequest = {
      recipientPhone: normalizePhone(request.recipientPhone) || null,
      amount: normalizeAmount(request.amount) ?? null,
      network: normalizeNetwork(request.network) || null,
      recipientName: request.recipientName?.trim() || null,
    };

    if (
      JSON.stringify(normalizedDraft) !==
      JSON.stringify(normalizedRequest)
    ) {
      return {
        allowed: false,
        reason:
          "FINANCIAL_POLICY: material financial parameters differ from the confirmed draft; re-confirmation is required.",
      };
    }

    return {
      allowed: true,
    };
  }

  public isAuthoritativeCompletion(result: {
    status?: string;
    source?: string;
    transactionId?: string;
    financialTransactionId?: string;
  }): boolean {
    const status = String(result.status || "").toUpperCase();

    if (
      status !== "COMPLETED" &&
      status !== "SUCCESSFUL"
    ) {
      return false;
    }

    if (result.source !== "real_provider") {
      return false;
    }

    if (
      !result.transactionId &&
      !result.financialTransactionId
    ) {
      return false;
    }

    return true;
  }
}

export const financialPolicy = new FinancialPolicyEngine();
