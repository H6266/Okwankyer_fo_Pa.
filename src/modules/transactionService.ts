/**
 * Ɔkwankyerɛfo Pa - Deterministic Transaction Validation & Execution Service
 * 
 * Strict Architectural Seam:
 * The AI model produces structured conversational intent.
 * This service sits deterministically between the AI output and the payment execution layer.
 * 
 * Flow:
 * Caller Spoke -> AI Reasoning -> Structured Intent -> TransactionService.validate()
 * -> TransactionOrchestrator -> MTN MoMo Service -> MTN Open API
 */

import {
  transactionOrchestrator,
  TransactionRequest,
  TransactionResult,
  AccountBalance,
} from "./transactionOrchestrator";
import {
  networkDetectionService,
  PhoneValidationResult,
} from "./networkDetectionService";
import { secureAuthGate } from "./secureAuth";

export interface TransactionValidationContext {
  sessionId: string;
  callerNumber?: string;
  source: "VOICE" | "KEYPAD";
  amount: number | null;
  recipientPhone: string | null;
  recipientName: string | null;
  network?: string | null;
  confirmedByUser: boolean;
  status: string;
  idempotencyKey?: string;
}

export interface ValidationDecision {
  isAllowed: boolean;
  code:
    | "APPROVED"
    | "MISSING_CONFIRMATION"
    | "INVALID_AMOUNT"
    | "AMOUNT_LIMIT_EXCEEDED"
    | "INVALID_PHONE"
    | "UNSUPPORTED_NETWORK"
    | "INVALID_STATE"
    | "UNAUTHENTICATED";
  reasonEn: string;
  reasonTwi: string;
  phoneDetails?: PhoneValidationResult;
}

export class TransactionService {
  public readonly MIN_AMOUNT_GHS = 0.5;
  public readonly MAX_AMOUNT_GHS = 5000.0;

  /**
   * Deterministically validates whether a financial action is allowed to proceed to payment gateways.
   * Enforces security, amount bounds, telephone validation, MTN restriction, and explicit confirmation.
   */
  public validateSendMoney(context: TransactionValidationContext): ValidationDecision {
    // 1. Session & State Validation
    if (!context.sessionId) {
      return {
        isAllowed: false,
        code: "UNAUTHENTICATED",
        reasonEn: "No valid active telephone session found.",
        reasonTwi: "Yɛanhu session a ɛfata mfa nyɛ dwumadi yi.",
      };
    }

    // 2. Amount Validation
    if (!context.amount || typeof context.amount !== "number" || isNaN(context.amount) || context.amount <= 0) {
      return {
        isAllowed: false,
        code: "INVALID_AMOUNT",
        reasonEn: "The amount must be a positive number of Ghana cedis.",
        reasonTwi: "Sika no dodoɔ nnyɛ pɛ. Me pa wo kyɛw bɔ sika dodoɔ a ɛteɛ.",
      };
    }

    if (context.amount < this.MIN_AMOUNT_GHS) {
      return {
        isAllowed: false,
        code: "INVALID_AMOUNT",
        reasonEn: `The minimum transfer amount is GH₵${this.MIN_AMOUNT_GHS}.`,
        reasonTwi: `Sika kakraa a wobɛtumi amane ne GH₵${this.MIN_AMOUNT_GHS}.`,
      };
    }

    if (context.amount > this.MAX_AMOUNT_GHS) {
      return {
        isAllowed: false,
        code: "AMOUNT_LIMIT_EXCEEDED",
        reasonEn: `The maximum transfer limit per transaction is GH₵${this.MAX_AMOUNT_GHS}.`,
        reasonTwi: `Sika pii a wobɛtumi amane prɛko ne GH₵${this.MAX_AMOUNT_GHS}.`,
      };
    }

    // 3. Recipient Phone Validation & Deterministic Network Check
    if (!context.recipientPhone) {
      return {
        isAllowed: false,
        code: "INVALID_PHONE",
        reasonEn: "A recipient phone number is required.",
        reasonTwi: "Me pa wo kyɛw, ɛsɛ sɛ wobɔ telefon nɔma a worepɛ amane sika no kɔ so.",
      };
    }

    const phoneValidation = networkDetectionService.validatePhoneNumber(context.recipientPhone);
    if (!phoneValidation.isValid || !phoneValidation.normalizedNumber) {
      return {
        isAllowed: false,
        code: "INVALID_PHONE",
        reasonEn: phoneValidation.userExplanationEn || "Invalid 10-digit mobile number.",
        reasonTwi: phoneValidation.userExplanationTwi || "Saa nɔma no nyɛ Ghana telefon nɔma a ɛteɛ.",
        phoneDetails: phoneValidation,
      };
    }

    // 4. MTN-Only Enforcement
    if (!phoneValidation.isMtn) {
      return {
        isAllowed: false,
        code: "UNSUPPORTED_NETWORK",
        reasonEn: "I can currently send money only to MTN Mobile Money numbers. This number belongs to another network.",
        reasonTwi: "Seisei mebetumi amane sika akɔ MTN Mobile Money nko ara. Saa nɔma yi yɛ network foforɔ.",
        phoneDetails: phoneValidation,
      };
    }

    // 5. Explicit Confirmation Requirement
    if (!context.confirmedByUser) {
      return {
        isAllowed: false,
        code: "MISSING_CONFIRMATION",
        reasonEn: "Explicit caller confirmation is required before executing payment.",
        reasonTwi: "Ɛsɛ sɛ wopene so ansa na yɛamane sika no.",
      };
    }

    return {
      isAllowed: true,
      code: "APPROVED",
      reasonEn: "Transaction validated and approved for payment execution.",
      reasonTwi: "Dwumadi no yɛ pɛ na yɛapene so.",
      phoneDetails: phoneValidation,
    };
  }

  /**
   * Securely executes SEND_MONEY via TransactionOrchestrator and MTN MoMo API.
   * Throws an error if deterministic validation fails.
   */
  public async executeSendMoney(context: TransactionValidationContext): Promise<TransactionResult> {
    const decision = this.validateSendMoney(context);
    if (!decision.isAllowed) {
      throw new Error(`Transaction Security Block: ${decision.reasonEn}`);
    }

    const recipientPhone = decision.phoneDetails?.normalizedNumber || context.recipientPhone!;
    const recipientName = context.recipientName || "Recipient";

    const request: TransactionRequest = {
      source: context.source,
      network: "MTN",
      recipient_phone: recipientPhone,
      recipient_name: recipientName,
      amount: context.amount!,
      currency: "GHS",
      sessionId: context.sessionId,
      idempotencyKey: context.idempotencyKey,
    };

    console.log(`[TransactionService] Dispatching validated transfer to TransactionOrchestrator (Amount: GH₵${context.amount}, To: ${recipientPhone})`);
    return await transactionOrchestrator.executeSendMoney(request);
  }

  /**
   * Retrieves account balance for caller
   */
  public async getBalance(network: string = "MTN"): Promise<AccountBalance> {
    return await transactionOrchestrator.getAccountBalance(network);
  }
}

export const transactionService = new TransactionService();
