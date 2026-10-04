/**
 * Ɔkwankyerɛfo Pa - Centralized MoMo Transaction Service
 * 
 * Responsibilities:
 * - Create internal transaction object independent of MTN payloads
 * - Manage transitions through the standardized state lifecycle
 * - Execute via MTN MoMo API (RequestToPay or Transfer)
 * - Track provider references and financial transaction IDs
 * - Expose uniform interface to Web Dashboard, IVR Telephony, and AI Voice
 */

import crypto from "crypto";
import {
  InternalTransaction,
  CreateTransactionOptions,
  TransactionState,
  RecipientLookupResult,
} from "./momoTypes";
import { momoAccountService, MoMoAccountService } from "./momoAccountService";
import { momoAuthService, MoMoAuthService } from "./momoAuthService";
import { momoStatusService, MoMoStatusService } from "./momoStatusService";
import { momoCallbackService } from "./momoCallbackService";
import { cleanAscii, formatMsisdn } from "./config";

export class MoMoTransactionService {
  private transactions: Map<string, InternalTransaction> = new Map();
  private referenceToTxId: Map<string, string> = new Map();
  private listeners: Set<(tx: InternalTransaction) => void> = new Set();

  constructor(
    private readonly accountService: MoMoAccountService = momoAccountService,
    private readonly authService: MoMoAuthService = momoAuthService,
    private readonly statusService: MoMoStatusService = momoStatusService
  ) {
    // Listen for incoming webhook callbacks and update state
    momoCallbackService.onTransactionUpdate((ref, status, financialTxId, rawPayload) => {
      this.handleProviderStatusUpdate(ref, status, financialTxId, rawPayload);
    });
  }

  public onTransactionChange(listener: (tx: InternalTransaction) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(tx: InternalTransaction): void {
    for (const listener of this.listeners) {
      try {
        listener(tx);
      } catch (err: any) {
        console.error("[MoMoTransactionService] Listener notice:", err.message);
      }
    }
  }

  /**
   * Generates a unique internal transaction ID (e.g., TX-682941)
   */
  private generateInternalId(): string {
    const hex = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `TX-${hex}`;
  }

  /**
   * 1. CREATE TRANSACTION
   * Initial step: creates independent internal transaction object
   */
  public createTransaction(options: CreateTransactionOptions): InternalTransaction {
    const transactionId = this.generateInternalId();
    const timestamp = new Date().toISOString();
    const { targetEnv } = this.authService.getEnvironment();

    const tx: InternalTransaction = {
      transactionId,
      operation: options.operation || "SEND_MONEY",
      amount: {
        value: options.amount,
        currency: "GHS",
      },
      recipient: {
        phone: options.recipientPhone,
        name: "",
        accountActive: false,
      },
      channel: options.channel || "WEB",
      environment: targetEnv,
      status: "CREATED",
      confirmation: {
        required: true,
        confirmed: false,
      },
      provider: {
        name: "MTN",
        referenceId: null,
        financialTransactionId: null,
        mode: targetEnv === "production" ? "REAL" : "SANDBOX",
      },
      metadata: {
        payerPhone: options.payerPhone,
        payerName: options.payerName,
        payerMessage: options.payerMessage,
        payeeNote: options.payeeNote,
        sessionId: options.sessionId,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.transactions.set(transactionId, tx);
    this.notify(tx);
    return tx;
  }

  /**
   * 2. VALIDATE RECIPIENT
   * Queries MTN Basic User Info & Active Check, updates state
   */
  public async validateRecipient(transactionId: string, phoneOverride?: string): Promise<InternalTransaction> {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found.`);
    }

    const phone = phoneOverride || tx.recipient.phone;
    this.updateState(tx, "VALIDATING_RECIPIENT");

    try {
      const lookup: RecipientLookupResult = await this.accountService.lookupRecipient(phone);

      tx.recipient = {
        phone: lookup.phone,
        name: lookup.name,
        accountActive: lookup.accountActive,
      };

      if (!lookup.accountActive) {
        tx.metadata = { ...tx.metadata, failureReason: "Recipient MTN account is not active." };
        this.updateState(tx, "VALIDATION_FAILED");
        return tx;
      }

      this.updateState(tx, "RECIPIENT_VALIDATED");
      this.updateState(tx, "READY_FOR_CONFIRMATION");

      // Spoken prompt helper for IVR and AI
      tx.metadata = {
        ...tx.metadata,
        spokenPrompt: `Account found: ${lookup.name}. You are sending GH₵${tx.amount.value} to ${lookup.name} on ${lookup.phone}. Do you want to continue?`,
      };

      return tx;
    } catch (err: any) {
      tx.metadata = { ...tx.metadata, failureReason: err.message };
      this.updateState(tx, "VALIDATION_FAILED");
      return tx;
    }
  }

  /**
   * 3. CONFIRM TRANSACTION
   * User confirms or cancels the transaction preview
   */
  public confirmTransaction(transactionId: string, confirmed: boolean): InternalTransaction {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found.`);
    }

    tx.confirmation.confirmed = confirmed;

    if (confirmed) {
      this.updateState(tx, "CONFIRMED");
    } else {
      this.updateState(tx, "CONFIRMATION_CANCELLED");
    }

    return tx;
  }

  /**
   * 4. SUBMIT TRANSACTION TO MTN
   * Executes via MTN MoMo API (RequestToPay for collection or Transfer for disbursement)
   */
  public async submitTransaction(
    transactionId: string,
    options?: {
      mode?: "COLLECTION_REQUEST_TO_PAY" | "DISBURSEMENT_TRANSFER";
      payerPhone?: string;
    }
  ): Promise<InternalTransaction> {
    const tx = this.transactions.get(transactionId);
    if (!tx) {
      throw new Error(`Transaction ${transactionId} not found.`);
    }

    if (tx.status !== "CONFIRMED" && tx.status !== "READY_FOR_CONFIRMATION") {
      throw new Error(`Cannot submit transaction in status '${tx.status}'. Transaction must be confirmed.`);
    }

    this.updateState(tx, "SUBMITTED");

    const { targetEnv, baseUrl, currency } = this.authService.getEnvironment();
    const mode = options?.mode || (tx.metadata?.payerPhone ? "COLLECTION_REQUEST_TO_PAY" : "DISBURSEMENT_TRANSFER");
    const mtnReferenceId = crypto.randomUUID();
    const externalId = tx.transactionId;

    this.referenceToTxId.set(mtnReferenceId, tx.transactionId);
    tx.provider.referenceId = mtnReferenceId;
    tx.provider.mode = targetEnv === "production" ? "REAL" : "SANDBOX";

    // MTN Sandbox settles in EUR by default; live operates in GHS
    const settlementCurrency = targetEnv === "production" ? "GHS" : "EUR";
    tx.provider.currency = settlementCurrency;
    if (settlementCurrency !== "GHS") {
      tx.provider.currencyNotice = `MTN Sandbox settles in ${settlementCurrency}. Production operates in GHS.`;
    }

    const payerPhone = options?.payerPhone || tx.metadata?.payerPhone;
    if (!payerPhone) {
      tx.status = "FAILED";
      tx.metadata = {
        ...tx.metadata,
        failureReason: "SECURITY_INVARIANT_VIOLATION: INVARIANT_012 - Payer phone number is required and cannot be defaulted. Fails closed.",
      };
      tx.updatedAt = new Date().toISOString();
      return tx;
    }
    const recipientPhone = tx.recipient.phone;

    try {
      if (mode === "DISBURSEMENT_TRANSFER") {
        // Direct platform disbursement to recipient mobile wallet
        const token = await this.authService.getAccessToken("disbursement");
        const url = `${baseUrl}/disbursement/v1_0/transfer`;

        const disbKey = this.authService.getSubscriptionKey("disbursement");
        const startTime = Date.now();
        const headers: Record<string, string> = {
          "Authorization": `Bearer ${token}`,
          "X-Reference-Id": mtnReferenceId,
          "X-Target-Environment": targetEnv,
          "Ocp-Apim-Subscription-Key": disbKey,
          "Content-Type": "application/json",
          "User-Agent": "curl/7.88.1",
          "Accept": "application/json",
        };
        const reqBody = {
          amount: tx.amount.value.toFixed(1),
          currency: settlementCurrency,
          externalId,
          payee: {
            partyIdType: "MSISDN",
            partyId: formatMsisdn(recipientPhone),
          },
          payerMessage: cleanAscii(tx.metadata?.payerMessage || `Transfer of GHS ${tx.amount.value}`),
          payeeNote: cleanAscii(tx.metadata?.payeeNote || "MoMo Transfer"),
        };

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(reqBody),
        });

        const roundTripMs = Date.now() - startTime;
        const resHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => { resHeaders[k] = v; });

        tx.provider.statusCode = res.status;

        if (res.status === 202) {
          this.updateState(tx, "PENDING");
          // Start background status polling
          this.statusService.startPolling(mtnReferenceId, "disbursement", (provResult) => {
            this.handleProviderStatusUpdate(
              mtnReferenceId,
              provResult.status,
              provResult.financialTransactionId || undefined,
              provResult.rawResponse
            );
          });
        } else {
          const errText = await res.text();
          tx.metadata = { ...tx.metadata, failureReason: `MTN Transfer rejected (${res.status}): ${errText}` };
          this.updateState(tx, "SUBMISSION_FAILED");
        }
      } else {
        // Collection RequestToPay: sends USSD push to payer handset
        const token = await this.authService.getAccessToken("collection");
        const url = `${baseUrl}/collection/v1_0/requesttopay`;
        const collKey = this.authService.getSubscriptionKey("collection");

        const headers: Record<string, string> = {
          "Authorization": `Bearer ${token}`,
          "X-Reference-Id": mtnReferenceId,
          "X-Target-Environment": targetEnv,
          "Ocp-Apim-Subscription-Key": collKey,
          "Content-Type": "application/json",
          "User-Agent": "curl/7.88.1",
          "Accept": "application/json",
        };
        const reqBody = {
          amount: tx.amount.value.toFixed(1),
          currency: settlementCurrency,
          externalId,
          payer: {
            partyIdType: "MSISDN",
            partyId: formatMsisdn(payerPhone),
          },
          payerMessage: cleanAscii(tx.metadata?.payerMessage || `Payment of GHS ${tx.amount.value}`),
          payeeNote: cleanAscii(tx.metadata?.payeeNote || "MoMo Payment"),
        };

        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(reqBody),
        });

        tx.provider.statusCode = res.status;

        if (res.status === 202) {
          this.updateState(tx, "PENDING");
          // Start background status polling
          this.statusService.startPolling(mtnReferenceId, "collection", (provResult) => {
            this.handleProviderStatusUpdate(
              mtnReferenceId,
              provResult.status,
              provResult.financialTransactionId || undefined,
              provResult.rawResponse
            );
          });
        } else {
          const errText = await res.text();
          tx.metadata = { ...tx.metadata, failureReason: `MTN RequestToPay rejected (${res.status}): ${errText}` };
          this.updateState(tx, "SUBMISSION_FAILED");
        }
      }
    } catch (err: any) {
      tx.metadata = { ...tx.metadata, failureReason: err.message };
      this.updateState(tx, "SUBMISSION_FAILED");
    }

    return tx;
  }

  /**
   * Internal status transition helper
   */
  private updateState(tx: InternalTransaction, newState: TransactionState): void {
    tx.status = newState;
    tx.updatedAt = new Date().toISOString();
    this.notify(tx);
  }

  /**
   * Handles status updates from status polling or webhooks
   */
  public handleProviderStatusUpdate(
    referenceId: string,
    rawStatus: string,
    financialTxId?: string,
    rawResponse?: any
  ): InternalTransaction | null {
    const txId = this.referenceToTxId.get(referenceId) || referenceId;
    const tx = this.transactions.get(txId);
    if (!tx) return null;

    tx.provider.rawStatus = rawStatus;
    if (financialTxId) {
      tx.provider.financialTransactionId = financialTxId;
    }
    if (rawResponse) {
      tx.provider.rawResponse = rawResponse;
    }

    const upper = rawStatus.toUpperCase();
    if (upper === "SUCCESSFUL" || upper === "SUCCESS") {
      this.updateState(tx, "SUCCESSFUL");
    } else if (upper === "FAILED" || upper === "REJECTED") {
      this.updateState(tx, "FAILED");
    } else if (upper === "TIMEOUT") {
      this.updateState(tx, "TIMEOUT");
    }

    return tx;
  }

  /**
   * Queries internal transaction by internal ID or MTN reference ID
   */
  public getTransaction(id: string): InternalTransaction | null {
    const direct = this.transactions.get(id);
    if (direct) return direct;
    const mapped = this.referenceToTxId.get(id);
    if (mapped) return this.transactions.get(mapped) || null;
    return null;
  }

  /**
   * Returns all transactions in reverse chronological order
   */
  public getAllTransactions(): InternalTransaction[] {
    return Array.from(this.transactions.values()).reverse();
  }
}

export const momoTransactionService = new MoMoTransactionService();
